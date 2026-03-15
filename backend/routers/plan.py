import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from data.mall import MALL_CONTEXT
from db.session import get_db
from services.openrouter import call_openrouter
from services.tracking import ensure_tracking_context, safe_commit, save_message, save_plan_result

router = APIRouter(prefix="/api/plan", tags=["plan"])


class DayPlanRequest(BaseModel):
    scene: str
    people: int | None = 1
    duration_hours: int = 2
    budget: int | None = None
    arrival_time: str | None = None
    content_preferences: list[str] = Field(default_factory=list)
    user_id: str | None = None
    session_id: str | None = None


class DayPlanResponse(BaseModel):
    summary: str
    steps: list[str]
    tip: str
    suggestions: list[str] = Field(default_factory=list)
    action: str | None = "dining"
    action_label: str | None = "去看美食推荐"
    user_id: str | None = None
    session_id: str | None = None


class ExistingPlanPayload(BaseModel):
    summary: str
    steps: list[str]
    tip: str
    suggestions: list[str] = Field(default_factory=list)
    action: str | None = "dining"
    action_label: str | None = "去看美食推荐"


class EditPlanStepRequest(BaseModel):
    scene: str
    people: int | None = 1
    duration_hours: int = 2
    budget: int | None = None
    arrival_time: str | None = None
    selected_step_index: int
    instruction: str
    update_scope: str = "single"
    current_plan: ExistingPlanPayload
    user_id: str | None = None
    session_id: str | None = None


class EditPlanStepResponse(DayPlanResponse):
    assistant_note: str
    edited_step_index: int


def _start_time_label(hour: int) -> str:
    return f"{hour:02d}:00"


def _build_steps(scene: str, duration_hours: int, content_preferences: list[str] | None = None):
    now = datetime.now(timezone(timedelta(hours=8)))
    start = now.replace(minute=0, second=0, microsecond=0)
    prefs = content_preferences or []
    wants_event = "活动" in prefs
    wants_shopping = "购物" in prefs
    wants_food = "美食" in prefs

    if scene == "两个人约会":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 中庭看亚洲顶流女星官方快闪，边逛边拍照' if wants_event else '先从 L2 露台花园或 B2 蔦屋这种更有氛围感的点开始，慢慢进入状态'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B1 或 L1 继续逛一圈更适合买手感单品和礼物的区域' if wants_shopping else '去 B1 喝杯咖啡或甜品，慢慢聊天'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {'晚一点去椿庐或绿茶吃饭，节奏更舒服' if wants_food or not wants_shopping else '最后留一段完整时间给两个人慢慢吃饭或补逛想看的店'}",
        ]
    if scene == "带小孩来玩":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 中庭看当前商场活动或装置打卡，控制停留时间不要太久' if wants_event else '先去 L2 娃娃屋或轻松互动点位，让小朋友先进入状态'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B1 或 B2 补一些适合家庭一起逛的购物和休息点' if wants_shopping else '去 L2 娃娃屋或轻松的互动点位继续消耗精力'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {'去客家围或绿茶用餐，方便休息' if wants_food or not wants_shopping else '最后安排一段轻松休息或补逛，让节奏别太赶'}",
        ]
    if scene == "朋友聚会":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先在 L1 中庭集合看亚洲顶流女星官方快闪，统一节奏' if wants_event else '先找一个大家都容易集合的点位开场，别一开始就分散'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B1 继续逛潮玩和零售区，边走边聊' if wants_shopping else '去 B1 继续逛潮玩和饮品店，边走边聊'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 4))).hour)} {'去探鱼或绿茶落座吃饭，适合多人聚会' if wants_food or not wants_shopping else '最后安排一段适合集体补逛和停留的时间，别把队伍拉散'}",
        ]
    if scene == "和家人":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 看商场当前正在进行的官方活动，再决定后面往哪层走' if wants_event else '先从 B2 或 L1 这种更容易进入的区域开始，减少长辈和小朋友的负担'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去安静一点的区域慢慢逛，如果想购物就顺手补几家更好逛的店' if wants_shopping else '去安静一点的区域慢慢逛，给长辈和小朋友都留出休息节奏'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 4))).hour)} {'最后安排一顿顺路用餐，选方便坐下聊天的餐厅收尾' if wants_food or not wants_shopping else '最后留一段顺路补逛和休息时间，让全家都能舒服收尾'}",
        ]

    return [
        f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 中庭看当前商场官方活动，抓住今天最值得看的内容' if wants_event or not prefs else '先去 B2 蔦屋或更适合当前节奏的区域慢慢开场'}",
        f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B2 蔦屋、B1 零售或适合购物的区域补一段逛街时间' if wants_shopping else '去 B2 蔦屋或 B1 轻松逛一圈，保持节奏'}",
        f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {'最后找一家顺路餐厅或咖啡店收尾' if wants_food or not wants_shopping else '最后留一点时间补逛想看的店，再轻松收尾'}",
    ]


def _build_fallback_plan(scene: str, duration_hours: int, content_preferences: list[str] | None = None) -> DayPlanResponse:
    steps = _build_steps(scene, duration_hours, content_preferences)
    prefs = content_preferences or []
    pref_text = f"这次会优先带上{'、'.join(prefs)}。" if prefs else ""

    if scene == "两个人约会":
        summary = f"这条路线更偏氛围感和节奏感，适合边逛边聊天，不会太赶。{pref_text}".strip()
        tip = "约会路线的关键不是点位多，而是留出聊天和拍照的时间。"
        suggestions = ["想要更安静一点", "预算 300 内怎么安排", "顺路吃什么更合适"]
    elif scene == "带小孩来玩":
        summary = f"这条路线优先考虑小朋友的体力和节奏，避免一直走路或排太满。{pref_text}".strip()
        tip = "带娃路线建议控制在 2-3 个主要点位，中间一定安排坐下吃饭。"
        suggestions = ["更适合几岁的小朋友", "有没有更省体力的路线", "吃饭推荐要有宝宝椅"]
    elif scene == "朋友聚会":
        summary = f"这条路线更适合朋友一起走，不容易有人掉队，也方便最后落到一顿饭。{pref_text}".strip()
        tip = "朋友聚会更适合先看活动再吃饭，大家更容易统一节奏。"
        suggestions = ["想再热闹一点", "有没有适合拍照的点", "预算 200/人怎么排"]
    elif scene == "和家人":
        summary = f"这条路线更偏舒服和稳妥，适合一家人一起逛，不会太赶，也能兼顾吃饭和休息。{pref_text}".strip()
        tip = "和家人来逛时，少一点跨楼层折返，多一点顺路停留，整体体验会更好。"
        suggestions = ["有长辈的话怎么排", "想找更安静一点的餐厅", "带小朋友和老人一起怎么安排"]
    else:
        summary = f"这是一条今天就能直接走的轻量路线，适合时间不多但想逛得值。{pref_text}".strip()
        tip = "如果你只有 2 小时，优先做 1 个重点活动 + 1 顿顺路的饭就够了。"
        suggestions = ["我只有 2 小时", "今天适合先吃还是先逛", "给我一个更轻松的版本"]

    return DayPlanResponse(
        summary=summary,
        steps=steps,
        tip=tip,
        suggestions=suggestions,
        action="dining",
        action_label="去看美食推荐",
    )


def _normalize_string_list(value: object, *, fallback: list[str], limit: int) -> list[str]:
    if not isinstance(value, list):
        return fallback
    items = [str(item).strip() for item in value if str(item).strip()]
    return items[:limit] or fallback


def _normalize_plan_response(data: dict, fallback: ExistingPlanPayload) -> DayPlanResponse:
    action = data.get("action")
    if action not in {"dining", "events", "parking"}:
        action = fallback.action

    action_label = str(data.get("action_label") or fallback.action_label or "").strip() or fallback.action_label

    return DayPlanResponse(
        summary=str(data.get("summary") or fallback.summary).strip(),
        steps=_normalize_string_list(data.get("steps"), fallback=fallback.steps, limit=5),
        tip=str(data.get("tip") or fallback.tip).strip(),
        suggestions=_normalize_string_list(data.get("suggestions"), fallback=fallback.suggestions, limit=3),
        action=action,
        action_label=action_label,
    )


def _extract_step_time_prefix(step: str) -> str:
    if " " in step:
        return step.split(" ", 1)[0]
    return ""


def _build_fallback_step_edit(req: EditPlanStepRequest) -> EditPlanStepResponse:
    steps = list(req.current_plan.steps)
    if not steps:
        fallback_plan = _build_fallback_plan(req.scene, req.duration_hours)
        return EditPlanStepResponse(
            assistant_note="我先按你的要求重新整理了一版更稳妥的路线。",
            edited_step_index=0,
            summary=fallback_plan.summary,
            steps=fallback_plan.steps,
            tip=fallback_plan.tip,
            suggestions=fallback_plan.suggestions,
            action=fallback_plan.action,
            action_label=fallback_plan.action_label,
        )

    idx = min(max(req.selected_step_index, 0), len(steps) - 1)
    prefix = _extract_step_time_prefix(steps[idx])
    time_prefix = f"{prefix} " if prefix else ""
    instruction = req.instruction

    allow_cascade = req.update_scope == "cascade"

    if any(keyword in instruction for keyword in ["便宜", "平价", "预算"]):
        steps[idx] = f"{time_prefix}把这一步改成去 B1 绿茶、1-7Bread 或霸王茶姬这类更好控制预算的点位，节奏更轻松"
        note = f"我先帮你把第 {idx + 1} 步改成更省预算的版本。"
    elif any(keyword in instruction for keyword in ["休息", "轻松", "别太赶", "慢一点"]):
        steps[idx] = f"{time_prefix}这一步改成去 B2 TSUTAYA BOOKSTORE 蔦屋书店或 Peet's Coffee 稍微放慢节奏，顺便休息一下"
        note = f"我把第 {idx + 1} 步调得更轻松了一点。"
    elif any(keyword in instruction for keyword in ["小孩", "亲子", "宝宝"]):
        steps[idx] = f"{time_prefix}把这一步改成去 L2 熊怡怡·娃娃屋或更适合小朋友停留的区域，减少来回走动"
        note = f"我把第 {idx + 1} 步换成了更适合小朋友的安排。"
    elif any(keyword in instruction for keyword in ["吃", "餐厅", "饭", "咖啡", "甜品"]):
        steps[idx] = f"{time_prefix}把这一步调整成顺路去绿茶、客家围、Peet's Coffee 或野人先生现做冰淇淋，按你的口味再选"
        note = f"我先把第 {idx + 1} 步换成更明确的餐饮休息点。"
    else:
        steps[idx] = f"{time_prefix}这一步已按你的要求换成更顺路、节奏更合适的安排"
        note = f"我先按你的指令调整了第 {idx + 1} 步。"

    if allow_cascade and idx + 1 < len(steps):
        next_prefix = _extract_step_time_prefix(steps[idx + 1])
        next_time_prefix = f"{next_prefix} " if next_prefix else ""
        steps[idx + 1] = f"{next_time_prefix}后面这一步也顺势调成更衔接刚才修改后的路线，减少来回折返"
        note = f"{note.rstrip('。')}，并顺手把后面一步也调顺了。"

    return EditPlanStepResponse(
        assistant_note=note,
        edited_step_index=idx,
        summary=req.current_plan.summary,
        steps=steps,
        tip=req.current_plan.tip,
        suggestions=["再把这一步提前一点", "顺便把后面也调顺", "换成更适合吃饭的点"],
        action=req.current_plan.action,
        action_label=req.current_plan.action_label,
    )


def _scene_route_guidance(scene: str, people: int, duration_hours: int) -> str:
    guidance: list[str] = [
        f"- 总时长只有 {duration_hours} 小时，路线不要排太满，优先保留 1-2 个重点内容。",
        "- 尽量按相邻楼层顺路走，避免 L3 -> B1 -> L2 这种来回折返。",
        "- 每一步都尽量写出明确楼层、店名或区域名，不要只写“逛一逛”“看看活动”。",
    ]

    if people >= 5:
        guidance.append("- 人数较多，优先安排容易集合、容易落座、有大桌或更宽松的点位与餐厅。")
    elif people == 1:
        guidance.append("- 一个人来时可以更灵活，适合安排安静、轻松、可随时停留的点位。")

    if scene == "两个人约会":
        guidance.append("- 约会路线要更重氛围感、拍照感和聊天留白，不要像打卡任务清单。")
    elif scene == "带小孩来玩":
        guidance.append("- 亲子路线要优先考虑体力和停留节奏，避免连续长距离走动。")
    elif scene == "朋友聚会":
        guidance.append("- 朋友聚会路线要考虑一起行动的便利性，先集合点再分配后续节奏。")
    elif scene == "和家人":
        guidance.append("- 家庭路线要兼顾长辈和小朋友，优先稳妥、少折返、方便坐下休息。")
    else:
        guidance.append("- 默认路线以轻松高效为主，适合第一次来或时间有限的人。")

    return "\n".join(guidance)


async def _generate_plan_with_model(req: DayPlanRequest) -> DayPlanResponse:
    now = datetime.now(timezone(timedelta(hours=8)))
    arrival_time = req.arrival_time or f"{now.hour:02d}:{now.minute:02d}"
    people = max(1, req.people or 1)
    fallback = _build_fallback_plan(req.scene, req.duration_hours, req.content_preferences)
    meal_time_hint = (
        "当前接近正餐时间，路线里优先自然插入一顿正餐。"
        if 11 <= now.hour < 14 or 17 <= now.hour < 20
        else "当前不一定是正餐时间，可以安排咖啡、甜品或轻食作为中途休息点。"
    )
    scene_guidance = _scene_route_guidance(req.scene, people, req.duration_hours)
    pref_text = "、".join(req.content_preferences) if req.content_preferences else "未特别指定"

    prompt = f"""你是中洲湾 C Future City 的路线规划助手 Cadence。

请根据下面的商场信息和用户条件，生成一条真实、顺路、可直接执行的中文商场路线。你的目标不是写好听的文案，而是给出用户今天真能照着走的安排。

商场信息：
{MALL_CONTEXT}

用户条件：
- 场景：{req.scene}
- 人数：{people}
- 可逛时长：{req.duration_hours} 小时
- 预算：{req.budget if req.budget is not None else "未指定"}
- 到场时间：{arrival_time}
- 希望路线包含：{pref_text}

路线生成规则：
{scene_guidance}
{meal_time_hint}
- 只能使用当前真实可用的信息，不要推荐尚未开放或已经结束的内容。
- 明确不要把 `teamLab Future Park` 当成当前可逛内容，因为它还未开放。
- 这里说的“活动”优先指商场官方正在举办或明确可参与的活动/快闪/展览，也就是用户在“今天看什么”里会看到的那类内容。
- 当前如果要安排活动节点，优先考虑 L1 中庭正在进行中的“亚洲顶流女星官方快闪”；不要把它当成已结束活动。
- 如果安排餐饮，优先引用真实餐厅或饮品店，例如：探魚、绿茶、椿庐、客家围、Peet's Coffee、霸王茶姬、KOI Thé、1-7Bread、野人先生现做冰淇淋。
- 如果安排购物/休闲点，可优先考虑真实点位，例如：TSUTAYA BOOKSTORE 蔦屋书店、POPMART泡泡玛特、熊怡怡·娃娃屋、寰映影城、L2 露台花园。
- 若预算明显较低，避免推荐高客单价正餐作为主路线核心；若预算较高，可以更自然安排椿庐等高端餐饮。
- 若时长 <= 2 小时，主步骤尽量控制在 3 条；若时长 >= 4 小时，可以给到 4-5 条。
- 如果用户明确希望包含“活动”，就至少安排 1 个活动/展览/快闪相关节点。
- 如果用户明确希望包含“购物”，就至少安排 1 个购物/零售/书店/潮玩相关节点。
- 如果用户明确希望包含“美食”，就至少安排 1 个餐厅/咖啡/甜品相关节点。

输出要求：
1. 只输出 JSON 对象，不要 markdown，不要解释。
2. JSON 结构必须是：
{{
  "summary": "一句话总结路线风格，20-40字",
  "steps": ["时间段 + 行为 + 楼层/店铺", "..." ],
  "tip": "一句实用提醒",
  "suggestions": ["建议追问1", "建议追问2", "建议追问3"],
  "action": "dining 或 events",
  "action_label": "按钮文案"
}}
3. `steps` 生成 3 到 5 条，时间从 {arrival_time} 往后排，每条都要像这样具体：`14:00-14:40 先去 B2 TSUTAYA BOOKSTORE 蔦屋书店逛一圈，慢慢进入状态`。
4. 场景、人数字段必须明显影响路线风格；不能给不同场景几乎一样的路线。
5. 只能引用商场信息里真实存在的楼层、店铺、餐厅、活动，不要编造不存在的地点。
6. `summary` 要说明这条路线为什么适合当前场景，不要只写空泛好听的话。
7. `tip` 要是一个真正有用的执行建议，比如“先吃再逛”或“先去低楼层减少折返”。
8. `suggestions` 要和当前路线强相关，像用户下一步真的会点的追问，不能太泛。
9. `action` 优先给 dining 或 events 其中一个；`action_label` 要是自然中文短句。
"""

    raw = await call_openrouter(
        [
            {"role": "system", "content": "你是一个严格返回 JSON 的商场行程规划助手。"},
            {"role": "user", "content": prompt},
        ],
        json_mode=True,
    )

    data = json.loads(raw)
    return _normalize_plan_response(
        data,
        ExistingPlanPayload(
            summary=fallback.summary,
            steps=fallback.steps,
            tip=fallback.tip,
            suggestions=fallback.suggestions,
            action=fallback.action,
            action_label=fallback.action_label,
        ),
    )


async def _edit_plan_step_with_model(req: EditPlanStepRequest) -> EditPlanStepResponse:
    people = max(1, req.people or 1)
    idx = min(max(req.selected_step_index, 0), max(len(req.current_plan.steps) - 1, 0))
    selected_step = req.current_plan.steps[idx] if req.current_plan.steps else ""
    current_plan_text = "\n".join(
        f"{i + 1}. {step}" for i, step in enumerate(req.current_plan.steps)
    ) or "（当前还没有可编辑的步骤）"

    prompt = f"""你是中洲湾 C Future City 的路线编辑助手 Cadence。

你的任务不是重写整条路线，而是在尽量保留原路线结构的前提下，按照用户要求修改其中一个指定节点。

商场信息：
{MALL_CONTEXT}

当前路线背景：
- 场景：{req.scene}
- 人数：{people}
- 总时长：{req.duration_hours} 小时
- 预算：{req.budget if req.budget is not None else "未指定"}
- 到场时间：{req.arrival_time or "未指定"}
- 修改范围：{"只改当前这一步" if req.update_scope == "single" else "允许联动后续路线"}

当前整条路线：
{current_plan_text}

用户当前点中的节点：
- 第 {idx + 1} 步
- 原内容：{selected_step}

用户修改指令：
{req.instruction}

编辑规则：
1. {"优先只修改第 " + str(idx + 1) + " 步，不要动其他步骤。" if req.update_scope == "single" else "优先修改第 " + str(idx + 1) + " 步，必要时允许顺手微调后续 1-2 步，让路线更顺。"}
2. 无论如何都不要把整条路线完全推翻。
3. 保持整条路线仍然真实可执行，继续只使用商场里真实存在的点位、餐厅和楼层。
4. 不要推荐未开放的 teamLab Future Park，也不要推荐已经结束的亚洲顶流女星快闪店。
5. 如果用户说“换便宜一点”“轻松一点”“更适合小朋友”“换成餐厅/咖啡”，要明确体现到改动后的那一步。

只输出 JSON，对象结构必须是：
{{
  "assistant_note": "一句话告诉用户你改了什么",
  "edited_step_index": {idx},
  "summary": "必要时微调后的路线总结",
  "steps": ["完整更新后的路线步骤1", "步骤2", "步骤3"],
  "tip": "更新后的执行提醒",
  "suggestions": ["和这次改动强相关的追问1", "追问2", "追问3"],
  "action": "dining 或 events",
  "action_label": "按钮文案"
}}

额外要求：
- `steps` 返回完整更新后的整条路线，不是只返回被改动的那一步。
- 非必要不要改动未选中的步骤文案。
- `assistant_note` 要明确说明是改了第几步、改成什么方向。
"""

    raw = await call_openrouter(
        [
            {"role": "system", "content": "你是一个严格返回 JSON 的商场路线局部编辑助手。"},
            {"role": "user", "content": prompt},
        ],
        json_mode=True,
    )

    data = json.loads(raw)
    normalized_plan = _normalize_plan_response(data, req.current_plan)

    edited_idx = data.get("edited_step_index")
    if not isinstance(edited_idx, int):
        edited_idx = idx
    edited_idx = min(max(edited_idx, 0), max(len(normalized_plan.steps) - 1, 0))

    assistant_note = str(data.get("assistant_note") or f"我已经按你的要求调整了第 {idx + 1} 步。").strip()

    return EditPlanStepResponse(
        assistant_note=assistant_note,
        edited_step_index=edited_idx,
        summary=normalized_plan.summary,
        steps=normalized_plan.steps,
        tip=normalized_plan.tip,
        suggestions=normalized_plan.suggestions,
        action=normalized_plan.action,
        action_label=normalized_plan.action_label,
    )


@router.post("/edit-step", response_model=EditPlanStepResponse)
async def edit_plan_step(req: EditPlanStepRequest, db: Session = Depends(get_db)):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
    )
    save_message(
        db,
        session_id=tracking.session_id,
        role="user",
        content=f"编辑路线第 {req.selected_step_index + 1} 步：{req.instruction}",
        intent="edit_day_plan",
        metadata={
            "scene": req.scene,
            "people": req.people,
            "duration_hours": req.duration_hours,
            "budget": req.budget,
            "arrival_time": req.arrival_time,
            "selected_step_index": req.selected_step_index,
            "update_scope": req.update_scope,
            "current_steps": req.current_plan.steps,
        },
    )

    source = "openrouter"
    try:
        response = await _edit_plan_step_with_model(req)
    except Exception:
        response = _build_fallback_step_edit(req)
        source = "fallback"

    response.user_id = tracking.user_id
    response.session_id = tracking.session_id
    save_message(
        db,
        session_id=tracking.session_id,
        role="assistant",
        content=response.assistant_note,
        intent="edit_day_plan",
        metadata={
            "source": source,
            "edited_step_index": response.edited_step_index,
            "update_scope": req.update_scope,
            "steps": response.steps,
            "tip": response.tip,
            "suggestions": response.suggestions,
        },
    )
    save_plan_result(
        db,
        session_id=tracking.session_id,
        user_id=tracking.user_id,
        request_payload={
            "scene": req.scene,
            "people": req.people,
            "duration_hours": req.duration_hours,
            "budget": req.budget,
            "arrival_time": req.arrival_time,
            "selected_step_index": req.selected_step_index,
            "instruction": req.instruction,
            "update_scope": req.update_scope,
        },
        summary=response.summary,
        steps=response.steps,
        tip=response.tip,
        suggestions=response.suggestions,
    )
    safe_commit(db)
    return response


@router.post("/day", response_model=DayPlanResponse)
async def generate_day_plan(req: DayPlanRequest, db: Session = Depends(get_db)):
    tracking = ensure_tracking_context(
        db,
        user_id=req.user_id,
        session_id=req.session_id,
    )
    save_message(
        db,
        session_id=tracking.session_id,
        role="user",
        content=f"规划路线：场景 {req.scene}，时长 {req.duration_hours} 小时",
        intent="day_plan",
        metadata={
            "scene": req.scene,
            "people": req.people,
            "duration_hours": req.duration_hours,
            "budget": req.budget,
            "arrival_time": req.arrival_time,
            "content_preferences": req.content_preferences,
        },
    )
    source = "openrouter"
    try:
        response = await _generate_plan_with_model(req)
    except Exception:
        response = _build_fallback_plan(req.scene, req.duration_hours, req.content_preferences)
        source = "fallback"

    response.user_id = tracking.user_id
    response.session_id = tracking.session_id
    save_message(
        db,
        session_id=tracking.session_id,
        role="assistant",
        content=response.summary,
        intent="day_plan",
        metadata={
            "source": source,
            "steps": response.steps,
            "tip": response.tip,
            "suggestions": response.suggestions,
        },
    )
    save_plan_result(
        db,
        session_id=tracking.session_id,
        user_id=tracking.user_id,
        request_payload={
            "scene": req.scene,
            "people": req.people,
            "duration_hours": req.duration_hours,
            "budget": req.budget,
            "arrival_time": req.arrival_time,
            "content_preferences": req.content_preferences,
        },
        summary=response.summary,
        steps=response.steps,
        tip=response.tip,
        suggestions=response.suggestions,
    )
    safe_commit(db)
    return response
