import json
import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.session import get_db
from services.openrouter import call_openrouter
from services.plan_context import ACTIVE_EVENT_STATUSES, build_plan_context, get_plan_snapshot
from services.tracking import ensure_tracking_context, safe_commit, save_message, save_plan_result
from services.user_context import build_user_context

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


PlanFeel = Literal["light", "balanced", "immersive"]


class PlanPayload(BaseModel):
    summary: str
    steps: list[str]
    tip: str
    suggestions: list[str] = Field(default_factory=list)
    action: str | None = "dining"
    action_label: str | None = "去看美食推荐"


class PlanVariantResponse(BaseModel):
    id: str
    feel: PlanFeel
    label: str
    subtitle: str
    fit_reason: str
    plan: PlanPayload


class DayPlanResponse(PlanPayload):
    user_id: str | None = None
    session_id: str | None = None


class DayPlanBundleResponse(BaseModel):
    summary: str
    default_variant_id: str
    feel_variants: list[PlanVariantResponse]
    user_id: str | None = None
    session_id: str | None = None


class ExistingPlanPayload(PlanPayload):
    pass


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


PLAN_FEEL_META: dict[PlanFeel, dict[str, str]] = {
    "light": {
        "id": "light",
        "label": "省力版",
        "subtitle": "少绕路，逛起来更轻松",
        "fit_reason": "更适合不想走太多、想把重点稳稳逛到的人。",
    },
    "balanced": {
        "id": "balanced",
        "label": "标准版",
        "subtitle": "吃逛玩兼顾，整体最稳",
        "fit_reason": "更适合第一次来、希望节奏和内容都比较均衡的人。",
    },
    "immersive": {
        "id": "immersive",
        "label": "高参与版",
        "subtitle": "安排更满，体验感更强",
        "fit_reason": "更适合想多看几个点、多一点互动和停留的人。",
    },
}


def _start_time_label(hour: int) -> str:
    return f"{hour:02d}:00"


def _extract_budget_value(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    return float(match.group(1))


def _candidate_name(candidate: dict) -> str:
    return str(candidate.get("name") or candidate.get("title") or "商场点位").strip()


def _candidate_location(candidate: dict) -> str:
    return str(candidate.get("location") or "商场内").strip() or "商场内"


def _candidate_text(candidate: dict) -> str:
    tags = candidate.get("tags", {})
    tag_text = " ".join(" ".join(values) for values in tags.values())
    return " ".join(
        [
            _candidate_name(candidate),
            str(candidate.get("venue_type") or ""),
            str(candidate.get("category") or ""),
            str(candidate.get("description") or ""),
            tag_text,
            " ".join(candidate.get("offers", [])),
        ]
    )


def _pick_best_candidate(candidates: list[dict], scorer, excluded: set[str] | None = None) -> dict | None:
    excluded = excluded or set()
    ranked: list[tuple[float, float, dict]] = []
    for candidate in candidates:
        if _candidate_name(candidate) in excluded:
            continue
        rating = float(candidate.get("rating") or 0)
        ranked.append((scorer(candidate), rating, candidate))

    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return ranked[0][2] if ranked else None


def _score_highlight(candidate: dict, scene: str, wants_shopping: bool) -> float:
    text = _candidate_text(candidate)
    venue_type = str(candidate.get("venue_type") or "")
    category = str(candidate.get("category") or "")
    score = 0.0

    if wants_shopping and any(keyword in text for keyword in ["书店", "潮玩", "盲盒", "手办", "零售", "购物"]):
        score += 4

    if scene == "两个人约会":
        if any(keyword in text for keyword in ["情侣", "艺术", "书店", "花园", "电影"]):
            score += 5
        if venue_type in {"bookstore", "cinema"}:
            score += 2
    elif scene == "带小孩来玩":
        if any(keyword in text for keyword in ["亲子", "娃娃", "游艺", "电影"]):
            score += 5
        if venue_type in {"arcade", "cinema"}:
            score += 3
    elif scene == "朋友聚会":
        if any(keyword in text for keyword in ["潮玩", "盲盒", "手办", "电影", "集合"]):
            score += 5
        if category in {"toys", "entertainment"}:
            score += 3
    elif scene == "和家人":
        if any(keyword in text for keyword in ["亲子", "书店", "电影", "休闲"]):
            score += 4
        if venue_type in {"bookstore", "cinema", "arcade"}:
            score += 2

    if _candidate_location(candidate).startswith(("B1", "B2", "L1", "L2")):
        score += 1
    return score


def _score_restaurant(candidate: dict, scene: str, budget: int | None) -> float:
    text = _candidate_text(candidate)
    budget_value = _extract_budget_value(str(candidate.get("budget_text") or ""))
    score = 0.0

    if scene == "两个人约会" and any(keyword in text for keyword in ["咖啡", "甜品", "chun", "茶"]):
        score += 4
    elif scene == "带小孩来玩" and any(keyword in text for keyword in ["茶", "面包", "客家", "餐厅"]):
        score += 4
    elif scene == "朋友聚会" and any(keyword in text for keyword in ["烤鱼", "餐厅", "寿司", "茶"]):
        score += 4
    elif scene == "和家人" and any(keyword in text for keyword in ["客家", "绿茶", "餐厅", "咖啡"]):
        score += 4

    if budget is not None and budget_value is not None:
        if budget <= 120:
            score += 5 if budget_value <= 60 else 2 if budget_value <= 100 else -2
        elif budget <= 220:
            score += 4 if budget_value <= 120 else 1
        else:
            score += 3 if budget_value >= 80 else 1

    if any(keyword in text for keyword in ["咖啡", "面包", "冰淇淋", "茶"]):
        score += 1
    return score


def _score_event(candidate: dict, scene: str) -> float:
    text = _candidate_text(candidate)
    score = 0.0
    if candidate.get("status") in ACTIVE_EVENT_STATUSES:
        score += 10
    if scene == "带小孩来玩" and any(keyword in text for keyword in ["互动", "展", "活动"]):
        score += 2
    if scene == "两个人约会" and any(keyword in text for keyword in ["快闪", "展", "艺术"]):
        score += 2
    return score


def _build_step_text(candidate: dict, sentence: str) -> str:
    location = _candidate_location(candidate)
    name = _candidate_name(candidate)
    if location == "商场内":
        return f"{name}{sentence}"
    return f"{location} {name}{sentence}"


def _build_plan_payload(
    *,
    summary: str,
    steps: list[str],
    tip: str,
    suggestions: list[str],
    action: str | None,
    action_label: str | None,
) -> PlanPayload:
    return PlanPayload(
        summary=summary,
        steps=steps,
        tip=tip,
        suggestions=suggestions,
        action=action,
        action_label=action_label,
    )


def _next_step_range(last_step: str) -> str | None:
    prefix = last_step.split(" ", 1)[0] if last_step else ""
    match = re.match(r"(\d{2}):(\d{2})-(\d{2}):(\d{2})", prefix)
    if not match:
        return None

    end_hour = int(match.group(3))
    end_minute = int(match.group(4))
    start_dt = datetime(2000, 1, 1, end_hour, end_minute)
    end_dt = start_dt + timedelta(minutes=40)
    return f"{start_dt:%H:%M}-{end_dt:%H:%M}"


def _build_immersive_extra_step(scene: str, content_preferences: list[str] | None, last_step: str) -> str | None:
    time_range = _next_step_range(last_step)
    if not time_range:
        return None

    prefs = content_preferences or []
    if "活动" in prefs:
        detail = "补一段去 L1 中庭或顺路展陈点继续参与互动，把今天最值得看的内容吃满"
    elif "购物" in prefs:
        detail = "补一段去 B1 或 B2 再逛一圈目标店，把想看的单品和零售点补完整"
    elif "美食" in prefs:
        detail = "最后再接一段咖啡或甜品停留，让节奏更完整也更有收尾感"
    elif scene == "两个人约会":
        detail = "补一段去更适合拍照和停留的点位，把聊天和氛围感再拉满一点"
    elif scene == "带小孩来玩":
        detail = "补一段轻互动或亲子停留点，让小朋友还能再玩一会儿再收尾"
    elif scene == "朋友聚会":
        detail = "补一段适合集体停留和拍照的点位，让整条路线更有参与感"
    elif scene == "和家人":
        detail = "补一段更舒服的顺路停留点，让一家人还有余裕慢慢逛"
    else:
        detail = "补一段顺路停留，把今天这趟安排得更完整一些"

    return f"{time_range} {detail}"


def _tune_steps_for_feel(
    steps: list[str],
    *,
    feel: PlanFeel,
    scene: str,
    duration_hours: int,
    content_preferences: list[str] | None,
) -> list[str]:
    if feel == "light":
        return steps[: min(3, len(steps))]

    if feel == "immersive":
        tuned = list(steps[:5])
        if duration_hours >= 3 and tuned:
            extra_step = _build_immersive_extra_step(scene, content_preferences, tuned[-1])
            if extra_step and extra_step not in tuned and len(tuned) < min(max(duration_hours + 1, 4), 5):
                tuned.append(extra_step)
        return tuned[:5]

    return steps[:5]


def _pick_scene_highlight(highlights: list[dict], scene: str, wants_shopping: bool, excluded: set[str]) -> dict | None:
    return _pick_best_candidate(
        highlights,
        lambda candidate: _score_highlight(candidate, scene, wants_shopping),
        excluded,
    )


def _pick_scene_restaurant(restaurants: list[dict], scene: str, budget: int | None, excluded: set[str]) -> dict | None:
    return _pick_best_candidate(
        restaurants,
        lambda candidate: _score_restaurant(candidate, scene, budget),
        excluded,
    )


def _pick_scene_event(events: list[dict], scene: str, excluded: set[str]) -> dict | None:
    active_events = [candidate for candidate in events if candidate.get("status") in ACTIVE_EVENT_STATUSES]
    return _pick_best_candidate(
        active_events,
        lambda candidate: _score_event(candidate, scene),
        excluded,
    )


def _build_static_steps(
    scene: str,
    duration_hours: int,
    content_preferences: list[str] | None = None,
    *,
    feel: PlanFeel = "balanced",
):
    now = datetime.now(timezone(timedelta(hours=8)))
    start = now.replace(minute=0, second=0, microsecond=0)
    prefs = content_preferences or []
    wants_event = "活动" in prefs
    wants_shopping = "购物" in prefs
    wants_food = "美食" in prefs

    if scene == "两个人约会":
        steps = [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 中庭看亚洲顶流女星官方快闪，边逛边拍照' if wants_event else '先从 L2 露台花园或 B2 蔦屋这种更有氛围感的点开始，慢慢进入状态'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B1 或 L1 继续逛一圈更适合买手感单品和礼物的区域' if wants_shopping else '去 B1 喝杯咖啡或甜品，慢慢聊天'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {'晚一点去椿庐或绿茶吃饭，节奏更舒服' if wants_food or not wants_shopping else '最后留一段完整时间给两个人慢慢吃饭或补逛想看的店'}",
        ]
        return _tune_steps_for_feel(steps, feel=feel, scene=scene, duration_hours=duration_hours, content_preferences=prefs)
    if scene == "带小孩来玩":
        steps = [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 中庭看当前商场活动或装置打卡，控制停留时间不要太久' if wants_event else '先去 L2 娃娃屋或轻松互动点位，让小朋友先进入状态'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B1 或 B2 补一些适合家庭一起逛的购物和休息点' if wants_shopping else '去 L2 娃娃屋或轻松的互动点位继续消耗精力'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {'去客家围或绿茶用餐，方便休息' if wants_food or not wants_shopping else '最后安排一段轻松休息或补逛，让节奏别太赶'}",
        ]
        return _tune_steps_for_feel(steps, feel=feel, scene=scene, duration_hours=duration_hours, content_preferences=prefs)
    if scene == "朋友聚会":
        steps = [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先在 L1 中庭集合看亚洲顶流女星官方快闪，统一节奏' if wants_event else '先找一个大家都容易集合的点位开场，别一开始就分散'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B1 继续逛潮玩和零售区，边走边聊' if wants_shopping else '去 B1 继续逛潮玩和饮品店，边走边聊'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 4))).hour)} {'去探鱼或绿茶落座吃饭，适合多人聚会' if wants_food or not wants_shopping else '最后安排一段适合集体补逛和停留的时间，别把队伍拉散'}",
        ]
        return _tune_steps_for_feel(steps, feel=feel, scene=scene, duration_hours=duration_hours, content_preferences=prefs)
    if scene == "和家人":
        steps = [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 看商场当前正在进行的官方活动，再决定后面往哪层走' if wants_event else '先从 B2 或 L1 这种更容易进入的区域开始，减少长辈和小朋友的负担'}",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去安静一点的区域慢慢逛，如果想购物就顺手补几家更好逛的店' if wants_shopping else '去安静一点的区域慢慢逛，给长辈和小朋友都留出休息节奏'}",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 4))).hour)} {'最后安排一顿顺路用餐，选方便坐下聊天的餐厅收尾' if wants_food or not wants_shopping else '最后留一段顺路补逛和休息时间，让全家都能舒服收尾'}",
        ]
        return _tune_steps_for_feel(steps, feel=feel, scene=scene, duration_hours=duration_hours, content_preferences=prefs)

    steps = [
        f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {'先去 L1 中庭看当前商场官方活动，抓住今天最值得看的内容' if wants_event or not prefs else '先去 B2 蔦屋或更适合当前节奏的区域慢慢开场'}",
        f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {'去 B2 蔦屋、B1 零售或适合购物的区域补一段逛街时间' if wants_shopping else '去 B2 蔦屋或 B1 轻松逛一圈，保持节奏'}",
        f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {'最后找一家顺路餐厅或咖啡店收尾' if wants_food or not wants_shopping else '最后留一点时间补逛想看的店，再轻松收尾'}",
    ]
    return _tune_steps_for_feel(steps, feel=feel, scene=scene, duration_hours=duration_hours, content_preferences=prefs)


def _build_db_fallback_steps(
    scene: str,
    duration_hours: int,
    content_preferences: list[str] | None,
    budget: int | None,
    db: Session | None,
    *,
    feel: PlanFeel = "balanced",
):
    if db is None:
        return None

    snapshot = get_plan_snapshot(db)
    if not snapshot:
        return None

    prefs = content_preferences or []
    wants_event = "活动" in prefs
    wants_shopping = "购物" in prefs
    wants_food = "美食" in prefs

    highlights = list(snapshot["highlights"])
    restaurants = list(snapshot["restaurants"])
    events = list(snapshot["events"])
    used_names: set[str] = set()

    event_stop = _pick_scene_event(events, scene, used_names) if wants_event else None
    if event_stop:
        used_names.add(_candidate_name(event_stop))

    first_highlight = _pick_scene_highlight(highlights, scene, wants_shopping, used_names)
    if first_highlight:
        used_names.add(_candidate_name(first_highlight))

    second_highlight = _pick_scene_highlight(highlights, scene, True, used_names)
    if second_highlight:
        used_names.add(_candidate_name(second_highlight))

    meal_stop = _pick_scene_restaurant(restaurants, scene, budget, used_names)
    if meal_stop:
        used_names.add(_candidate_name(meal_stop))

    if not first_highlight and not meal_stop and not event_stop:
        return None

    now = datetime.now(timezone(timedelta(hours=8)))
    start = now.replace(minute=0, second=0, microsecond=0)
    steps: list[str] = []

    first_stop = event_stop or first_highlight or second_highlight or meal_stop
    second_stop = first_highlight if first_stop != first_highlight else second_highlight
    third_stop = meal_stop if meal_stop != second_stop else second_highlight

    if first_stop:
        if first_stop is event_stop:
            content = _build_step_text(first_stop, "，先把今天当前能参加的活动看掉，后面更好顺路安排")
        elif scene == "两个人约会":
            content = _build_step_text(first_stop, "，先慢慢开场，留一点拍照和聊天的时间")
        elif scene == "带小孩来玩":
            content = _build_step_text(first_stop, "，先让小朋友进入状态，别一上来就走太赶")
        elif scene == "朋友聚会":
            content = _build_step_text(first_stop, "，先在这里集合开场，比较不容易走散")
        elif scene == "和家人":
            content = _build_step_text(first_stop, "，先从这个更稳妥的点位开始，减少一开始的折返")
        else:
            content = _build_step_text(first_stop, "，先把路线节奏稳下来")
        steps.append(f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} {content}")

    if second_stop:
        if wants_shopping:
            content = _build_step_text(second_stop, "，继续补一段逛店或休闲时间，路线更完整")
        else:
            content = _build_step_text(second_stop, "，中间在这里停留一下，整体节奏会更舒服")
        steps.append(
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} {content}"
        )

    if third_stop:
        if scene == "两个人约会":
            content = _build_step_text(third_stop, "，最后坐下来吃点东西，聊天节奏会更自然")
        elif scene == "带小孩来玩":
            content = _build_step_text(third_stop, "，最后在这里用餐休息，方便收尾")
        elif scene == "朋友聚会":
            content = _build_step_text(third_stop, "，最后在这里落座吃饭，方便大家继续聊天")
        elif scene == "和家人":
            content = _build_step_text(third_stop, "，最后安排顺路用餐，全家都会更舒服")
        else:
            content = _build_step_text(third_stop, "，最后在这里轻松收尾")
        steps.append(
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} {content}"
        )

    if duration_hours >= 4 and len(steps) < 4 and second_highlight and second_highlight != second_stop:
        steps.append(
            f"{_start_time_label((start + timedelta(hours=3)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 4))).hour)} "
            f"{_build_step_text(second_highlight, '，最后补一段顺路停留，不用把路线压得太满')}"
        )

    return {
        "steps": _tune_steps_for_feel(
            steps,
            feel=feel,
            scene=scene,
            duration_hours=duration_hours,
            content_preferences=content_preferences,
        ),
        "first_stop": first_stop,
        "meal_stop": meal_stop,
        "used_event": first_stop is event_stop and event_stop is not None,
    }


def _build_fallback_plan(
    scene: str,
    duration_hours: int,
    content_preferences: list[str] | None = None,
    *,
    budget: int | None = None,
    db: Session | None = None,
    feel: PlanFeel = "balanced",
) -> PlanPayload:
    db_fallback = _build_db_fallback_steps(scene, duration_hours, content_preferences, budget, db, feel=feel)
    steps = db_fallback["steps"] if db_fallback else _build_static_steps(
        scene,
        duration_hours,
        content_preferences,
        feel=feel,
    )
    prefs = content_preferences or []
    pref_text = f"这次会优先带上{'、'.join(prefs)}。" if prefs else ""
    first_stop_name = _candidate_name(db_fallback["first_stop"]) if db_fallback and db_fallback.get("first_stop") else ""
    meal_stop_name = _candidate_name(db_fallback["meal_stop"]) if db_fallback and db_fallback.get("meal_stop") else ""

    if db_fallback and first_stop_name:
        if scene == "两个人约会":
            summary = f"这条路线会先从{first_stop_name}开场，再顺到{meal_stop_name or '顺路餐饮'}收尾，整体更适合边逛边聊天。{pref_text}".strip()
            tip = "约会路线别排太满，先把氛围感点位和最后能坐下来的餐饮留出来。"
            suggestions = ["想再安静一点", "换成更适合拍照的点", "预算 300 内怎么排"]
        elif scene == "带小孩来玩":
            summary = f"这条路线先用{first_stop_name}带小朋友进入状态，再接到{meal_stop_name or '顺路餐饮'}休息收尾，整体更省体力。{pref_text}".strip()
            tip = "亲子路线建议把主要停留点控制在 2-3 个，中间尽量安排能坐下休息的餐饮。"
            suggestions = ["更适合几岁的小朋友", "有没有更省体力的路线", "换成更适合亲子吃饭的点"]
        elif scene == "朋友聚会":
            summary = f"这条路线先在{first_stop_name}开场，再接到{meal_stop_name or '顺路餐饮'}落座，整体更适合朋友一起走。{pref_text}".strip()
            tip = "朋友聚会优先保证集合点和最后能一起坐下的地方，路线会比单纯多点位更重要。"
            suggestions = ["想再热闹一点", "有没有适合集体拍照的点", "预算 200/人怎么排"]
        elif scene == "和家人":
            summary = f"这条路线会先从{first_stop_name}这种更稳妥的点位开始，再顺到{meal_stop_name or '顺路餐饮'}收尾，适合一家人一起走。{pref_text}".strip()
            tip = "和家人来时少一点跨楼层折返，多一点顺路停留，整体体验会更舒服。"
            suggestions = ["有长辈的话怎么排", "想找更安静一点的餐厅", "带小朋友和老人一起怎么安排"]
        else:
            summary = f"这条路线会先去{first_stop_name}，再顺到{meal_stop_name or '顺路餐饮'}收尾，适合今天直接照着走。{pref_text}".strip()
            tip = "如果时间有限，就优先保留 1 个重点停留点和 1 个顺路餐饮点。"
            suggestions = ["我只有 2 小时", "今天适合先吃还是先逛", "给我一个更轻松的版本"]
    elif scene == "两个人约会":
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

    if feel == "light":
        summary = f"{summary.rstrip('。')} 这版会更少折返、重点更集中。".strip()
        tip = "想逛得轻松一点时，先把最想看的 1-2 个点位走掉，中间尽量少换楼层。"
        suggestions = ["再省体力一点", "把吃饭提前", "只保留最值得去的点"]
    elif feel == "immersive":
        summary = f"{summary.rstrip('。')} 这版会多留几个停留点，整体参与感更强。".strip()
        tip = "高参与路线更适合预留弹性时间，看到感兴趣的点位可以多停 10-15 分钟。"
        suggestions = ["想再丰富一点", "帮我加一个拍照点", "最后想接甜品或咖啡"]

    return _build_plan_payload(
        summary=summary,
        steps=steps,
        tip=tip,
        suggestions=suggestions,
        action="events" if db_fallback and db_fallback.get("used_event") else "dining",
        action_label="去看更多活动" if db_fallback and db_fallback.get("used_event") else "去看美食推荐",
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


def _normalize_plan_payload(data: dict, fallback: PlanPayload) -> PlanPayload:
    action = data.get("action")
    if action not in {"dining", "events", "parking"}:
        action = fallback.action

    action_label = str(data.get("action_label") or fallback.action_label or "").strip() or fallback.action_label

    return _build_plan_payload(
        summary=str(data.get("summary") or fallback.summary).strip(),
        steps=_normalize_string_list(data.get("steps"), fallback=fallback.steps, limit=5),
        tip=str(data.get("tip") or fallback.tip).strip(),
        suggestions=_normalize_string_list(data.get("suggestions"), fallback=fallback.suggestions, limit=3),
        action=action,
        action_label=action_label,
    )


def _build_fallback_plan_variants(req: DayPlanRequest, db: Session | None = None) -> DayPlanBundleResponse:
    feel_variants: list[PlanVariantResponse] = []
    for feel in ("light", "balanced", "immersive"):
        meta = PLAN_FEEL_META[feel]
        plan = _build_fallback_plan(
            req.scene,
            req.duration_hours,
            req.content_preferences,
            budget=req.budget,
            db=db,
            feel=feel,
        )
        feel_variants.append(
            PlanVariantResponse(
                id=meta["id"],
                feel=feel,
                label=meta["label"],
                subtitle=meta["subtitle"],
                fit_reason=meta["fit_reason"],
                plan=plan,
            )
        )

    return DayPlanBundleResponse(
        summary="给你 3 条不同体感的路线，默认先看最稳妥的标准版。",
        default_variant_id="balanced",
        feel_variants=feel_variants,
    )


def _normalize_plan_bundle_response(data: dict, fallback: DayPlanBundleResponse) -> DayPlanBundleResponse:
    raw_variants = data.get("feel_variants")
    fallback_by_id = {variant.id: variant for variant in fallback.feel_variants}
    feel_variants: list[PlanVariantResponse] = []

    if isinstance(raw_variants, list):
        for feel in ("light", "balanced", "immersive"):
            matched = next(
                (
                    item for item in raw_variants
                    if isinstance(item, dict) and str(item.get("id") or item.get("feel") or "").strip() == feel
                ),
                None,
            )
            fallback_variant = fallback_by_id[feel]
            if not matched:
                feel_variants.append(fallback_variant)
                continue

            fit_reason = str(matched.get("fit_reason") or fallback_variant.fit_reason).strip() or fallback_variant.fit_reason
            plan_data = matched.get("plan")
            normalized_plan = _normalize_plan_payload(
                plan_data if isinstance(plan_data, dict) else {},
                fallback_variant.plan,
            )
            feel_variants.append(
                PlanVariantResponse(
                    id=fallback_variant.id,
                    feel=feel,
                    label=str(matched.get("label") or fallback_variant.label).strip() or fallback_variant.label,
                    subtitle=str(matched.get("subtitle") or fallback_variant.subtitle).strip() or fallback_variant.subtitle,
                    fit_reason=fit_reason,
                    plan=normalized_plan,
                )
            )

    if len(feel_variants) != 3:
        feel_variants = fallback.feel_variants

    default_variant_id = str(data.get("default_variant_id") or fallback.default_variant_id).strip() or fallback.default_variant_id
    if default_variant_id not in {variant.id for variant in feel_variants}:
        default_variant_id = fallback.default_variant_id

    return DayPlanBundleResponse(
        summary=str(data.get("summary") or fallback.summary).strip() or fallback.summary,
        default_variant_id=default_variant_id,
        feel_variants=feel_variants,
    )


def _extract_step_time_prefix(step: str) -> str:
    if " " in step:
        return step.split(" ", 1)[0]
    return ""


def _build_fallback_step_edit(req: EditPlanStepRequest, db: Session | None = None) -> EditPlanStepResponse:
    steps = list(req.current_plan.steps)
    if not steps:
        fallback_plan = _build_fallback_plan(
            req.scene,
            req.duration_hours,
            budget=req.budget,
            db=db,
        )
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
    snapshot = get_plan_snapshot(db) if db is not None else None
    highlights = list(snapshot["highlights"]) if snapshot else []
    restaurants = list(snapshot["restaurants"]) if snapshot else []
    budget_candidate = _pick_scene_restaurant(restaurants, req.scene, min(req.budget or 120, 120), set()) if restaurants else None
    relax_candidate = _pick_scene_highlight(highlights, req.scene, False, set()) if highlights else None
    kid_candidate = _pick_scene_highlight(highlights, "带小孩来玩", False, set()) if highlights else None
    food_candidate = _pick_scene_restaurant(restaurants, req.scene, req.budget, set()) if restaurants else None

    if any(keyword in instruction for keyword in ["便宜", "平价", "预算"]) and budget_candidate:
        steps[idx] = f"{time_prefix}把这一步改成去 {_build_step_text(budget_candidate, '，更好控制预算，整体节奏也更轻松')}"
        note = f"我先帮你把第 {idx + 1} 步改成更省预算的版本。"
    elif any(keyword in instruction for keyword in ["便宜", "平价", "预算"]):
        steps[idx] = f"{time_prefix}把这一步改成去 B1 绿茶、1-7Bread 或霸王茶姬这类更好控制预算的点位，节奏更轻松"
        note = f"我先帮你把第 {idx + 1} 步改成更省预算的版本。"
    elif any(keyword in instruction for keyword in ["休息", "轻松", "别太赶", "慢一点"]) and relax_candidate:
        steps[idx] = f"{time_prefix}这一步改成去 {_build_step_text(relax_candidate, '，稍微放慢节奏，顺便休息一下')}"
        note = f"我把第 {idx + 1} 步调得更轻松了一点。"
    elif any(keyword in instruction for keyword in ["休息", "轻松", "别太赶", "慢一点"]):
        steps[idx] = f"{time_prefix}这一步改成去 B2 TSUTAYA BOOKSTORE 蔦屋书店或 Peet's Coffee 稍微放慢节奏，顺便休息一下"
        note = f"我把第 {idx + 1} 步调得更轻松了一点。"
    elif any(keyword in instruction for keyword in ["小孩", "亲子", "宝宝"]) and kid_candidate:
        steps[idx] = f"{time_prefix}把这一步改成去 {_build_step_text(kid_candidate, '，更适合小朋友停留，也能减少来回走动')}"
        note = f"我把第 {idx + 1} 步换成了更适合小朋友的安排。"
    elif any(keyword in instruction for keyword in ["小孩", "亲子", "宝宝"]):
        steps[idx] = f"{time_prefix}把这一步改成去 L2 熊怡怡·娃娃屋或更适合小朋友停留的区域，减少来回走动"
        note = f"我把第 {idx + 1} 步换成了更适合小朋友的安排。"
    elif any(keyword in instruction for keyword in ["吃", "餐厅", "饭", "咖啡", "甜品"]) and food_candidate:
        steps[idx] = f"{time_prefix}把这一步调整成顺路去 {_build_step_text(food_candidate, '，按这次路线节奏更容易接上')}"
        note = f"我先把第 {idx + 1} 步换成更明确的餐饮休息点。"
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


def _scene_route_guidance(scene: str, people: int, duration_hours: int, feel: PlanFeel) -> str:
    guidance: list[str] = [
        f"- 总时长只有 {duration_hours} 小时，路线不要排太满，优先保留 1-2 个重点内容。",
        "- 尽量按相邻楼层顺路走，避免 L3 -> B1 -> L2 这种来回折返。",
        "- 每一步都尽量写出明确楼层、店名或区域名，不要只写“逛一逛”“看看活动”。",
    ]

    if feel == "light":
        guidance.extend([
            "- 这是省力版：优先减少跨楼层、减少点位数量、减少来回折返。",
            "- 餐饮或休息点可以更早出现，整体步骤建议 3 条左右。",
        ])
    elif feel == "immersive":
        guidance.extend([
            "- 这是高参与版：允许多 1 个停留点，整体体验要更满、更有参与感。",
            "- 在不绕路的前提下，可以加入更值得互动、拍照或探索的节点。",
        ])
    else:
        guidance.extend([
            "- 这是标准版：活动、购物、美食要相对平衡，作为大多数人的稳妥选择。",
            "- 整体以 3-4 条主步骤为宜，既不太赶也不太散。",
        ])

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


async def _generate_plan_with_model(
    req: DayPlanRequest,
    db: Session,
    *,
    user_id: str | None,
    session_id: str | None,
) -> DayPlanBundleResponse:
    now = datetime.now(timezone(timedelta(hours=8)))
    arrival_time = req.arrival_time or f"{now.hour:02d}:{now.minute:02d}"
    people = max(1, req.people or 1)
    fallback = _build_fallback_plan_variants(req, db)
    plan_context = build_plan_context(db)
    user_context = build_user_context(
        db,
        user_id=user_id,
        session_id=session_id,
    )
    user_context_block = user_context or "暂无可用用户历史。"
    meal_time_hint = (
        "当前接近正餐时间，路线里优先自然插入一顿正餐。"
        if 11 <= now.hour < 14 or 17 <= now.hour < 20
        else "当前不一定是正餐时间，可以安排咖啡、甜品或轻食作为中途休息点。"
    )
    pref_text = "、".join(req.content_preferences) if req.content_preferences else "未特别指定"
    feel_guidance = "\n\n".join(
        [
            f"{PLAN_FEEL_META[feel]['label']}：\n{_scene_route_guidance(req.scene, people, req.duration_hours, feel)}"
            for feel in ("light", "balanced", "immersive")
        ]
    )

    prompt = f"""你是中洲湾 C Future City 的路线规划助手 Cadence。

请根据下面的商场信息和用户条件，一次生成 3 条真实、顺路、可直接执行的中文商场路线。你的目标不是写好听的文案，而是给出用户今天真能照着走、而且体感明显不同的安排。

商场信息：
{plan_context}

用户历史上下文：
{user_context_block}

用户条件：
- 场景：{req.scene}
- 人数：{people}
- 可逛时长：{req.duration_hours} 小时
- 预算：{req.budget if req.budget is not None else "未指定"}
- 到场时间：{arrival_time}
- 希望路线包含：{pref_text}

路线生成规则：
{meal_time_hint}
- 你必须输出 3 个版本：省力版、标准版、高参与版。
- 这 3 个版本不能只是文案不同，必须在步骤数量、停留强度、转场节奏上有真实差异。
- 省力版要更少折返、更少点位、更早进入休息/餐饮或稳定停留点。
- 标准版要最均衡，适合作为默认推荐。
- 高参与版要更丰富，允许多 1 个停留点，互动/探索感更强，但仍然不能乱跳楼层。
- 三个版本都要继续满足当前场景、人数、预算和偏好要求。
- 以下是三种体感的详细约束：
{feel_guidance}
- 只能使用当前真实可用的信息，不要推荐尚未开放或已经结束的内容。
- 这里说的“活动”优先指商场官方正在举办或明确可参与的活动/快闪/展览，也就是用户在“今天看什么”里会看到的那类内容。
- 如果安排餐饮，优先引用真实餐厅或饮品店，例如：探魚、绿茶、椿庐、客家围、Peet's Coffee、霸王茶姬、KOI Thé、1-7Bread、野人先生现做冰淇淋。
- 如果安排购物/休闲点，可优先考虑真实点位，例如：TSUTAYA BOOKSTORE 蔦屋书店、POPMART泡泡玛特、熊怡怡·娃娃屋、寰映影城。
- 若预算明显较低，避免推荐高客单价正餐作为主路线核心；若预算较高，可以更自然安排椿庐等高端餐饮。
- 若时长 <= 2 小时，主步骤尽量控制在 3 条；若时长 >= 4 小时，可以给到 4-5 条。
- 如果用户明确希望包含“活动”，就至少安排 1 个活动/展览/快闪相关节点。
- 如果用户明确希望包含“购物”，就至少安排 1 个购物/零售/书店/潮玩相关节点。
- 如果用户明确希望包含“美食”，就至少安排 1 个餐厅/咖啡/甜品相关节点。
- 可以参考“用户历史上下文”做轻量个性化，但如果和本轮条件冲突，优先本轮条件，不要被旧偏好绑住。

输出要求：
1. 只输出 JSON 对象，不要 markdown，不要解释。
2. JSON 结构必须是：
{{
  "summary": "一句话说明这次为什么给用户三条体感路线",
  "default_variant_id": "balanced",
  "feel_variants": [
    {{
      "id": "light",
      "feel": "light",
      "label": "省力版",
      "subtitle": "少绕路，逛起来更轻松",
      "fit_reason": "一句话说明适合谁",
      "plan": {{
        "summary": "一句话总结路线风格，20-40字",
        "steps": ["时间段 + 行为 + 楼层/店铺", "..."],
        "tip": "一句实用提醒",
        "suggestions": ["建议追问1", "建议追问2", "建议追问3"],
        "action": "dining 或 events",
        "action_label": "按钮文案"
      }}
    }},
    {{
      "id": "balanced",
      "feel": "balanced",
      "label": "标准版",
      "subtitle": "吃逛玩兼顾，整体最稳",
      "fit_reason": "一句话说明适合谁",
      "plan": {{ "...同上..." }}
    }},
    {{
      "id": "immersive",
      "feel": "immersive",
      "label": "高参与版",
      "subtitle": "安排更满，体验感更强",
      "fit_reason": "一句话说明适合谁",
      "plan": {{ "...同上..." }}
    }}
  ]
}}
3. 每个 `plan.steps` 生成 3 到 5 条，时间从 {arrival_time} 往后排，每条都要像这样具体：`14:00-14:40 先去 B2 TSUTAYA BOOKSTORE 蔦屋书店逛一圈，慢慢进入状态`。
4. 场景、人数字段必须明显影响路线风格；不能给不同场景几乎一样的路线。
5. 只能引用商场信息里真实存在的楼层、店铺、餐厅、活动，不要编造不存在的地点。
6. 每个版本的 `plan.summary` 都要说明这条路线为什么适合当前场景，不要只写空泛好听的话。
7. 每个版本的 `plan.tip` 都要是一个真正有用的执行建议，比如“先吃再逛”或“先去低楼层减少折返”。
8. 每个版本的 `plan.suggestions` 都要和当前路线强相关，像用户下一步真的会点的追问，不能太泛。
9. `default_variant_id` 固定输出 `"balanced"`。
"""

    raw = await call_openrouter(
        [
            {"role": "system", "content": "你是一个严格返回 JSON 的商场行程规划助手。"},
            {"role": "user", "content": prompt},
        ],
        json_mode=True,
    )

    data = json.loads(raw)
    return _normalize_plan_bundle_response(data, fallback)


async def _edit_plan_step_with_model(
    req: EditPlanStepRequest,
    db: Session,
    *,
    user_id: str | None,
    session_id: str | None,
) -> EditPlanStepResponse:
    people = max(1, req.people or 1)
    idx = min(max(req.selected_step_index, 0), max(len(req.current_plan.steps) - 1, 0))
    selected_step = req.current_plan.steps[idx] if req.current_plan.steps else ""
    current_plan_text = "\n".join(
        f"{i + 1}. {step}" for i, step in enumerate(req.current_plan.steps)
    ) or "（当前还没有可编辑的步骤）"
    plan_context = build_plan_context(db)
    user_context = build_user_context(
        db,
        user_id=user_id,
        session_id=session_id,
    )
    user_context_block = user_context or "暂无可用用户历史。"

    prompt = f"""你是中洲湾 C Future City 的路线编辑助手 Cadence。

你的任务不是重写整条路线，而是在尽量保留原路线结构的前提下，按照用户要求修改其中一个指定节点。

商场信息：
{plan_context}

用户历史上下文：
{user_context_block}

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
4. 不要推荐数据库上下文里被标为 scheduled 或 ended 的活动。
5. 如果用户说“换便宜一点”“轻松一点”“更适合小朋友”“换成餐厅/咖啡”，要明确体现到改动后的那一步。
6. 可以参考“用户历史上下文”做轻量个性化，但如果和这次修改指令冲突，优先这次修改指令。

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
        response = await _edit_plan_step_with_model(
            req,
            db,
            user_id=tracking.user_id,
            session_id=tracking.session_id,
        )
    except Exception:
        response = _build_fallback_step_edit(req, db)
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
            "user_context_attempted": True,
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


@router.post("/day", response_model=DayPlanBundleResponse)
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
        response = await _generate_plan_with_model(
            req,
            db,
            user_id=tracking.user_id,
            session_id=tracking.session_id,
        )
    except Exception:
        response = _build_fallback_plan_variants(req, db)
        source = "fallback"

    response.user_id = tracking.user_id
    response.session_id = tracking.session_id
    default_variant = next(
        (variant for variant in response.feel_variants if variant.id == response.default_variant_id),
        response.feel_variants[0],
    )
    save_message(
        db,
        session_id=tracking.session_id,
        role="assistant",
        content=default_variant.plan.summary,
        intent="day_plan",
        metadata={
            "source": source,
            "default_variant_id": response.default_variant_id,
            "feel_variants": [
                {
                    "id": variant.id,
                    "label": variant.label,
                    "steps": variant.plan.steps,
                }
                for variant in response.feel_variants
            ],
            "steps": default_variant.plan.steps,
            "tip": default_variant.plan.tip,
            "suggestions": default_variant.plan.suggestions,
            "user_context_attempted": True,
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
            "default_variant_id": response.default_variant_id,
        },
        summary=default_variant.plan.summary,
        steps=default_variant.plan.steps,
        tip=default_variant.plan.tip,
        suggestions=default_variant.plan.suggestions,
    )
    safe_commit(db)
    return response
