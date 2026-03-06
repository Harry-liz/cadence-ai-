from datetime import datetime, timedelta
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/plan", tags=["plan"])


class DayPlanRequest(BaseModel):
    scene: str
    duration_hours: int = 2
    budget: int | None = None
    arrival_time: str | None = None


class DayPlanResponse(BaseModel):
    summary: str
    steps: list[str]
    tip: str
    suggestions: list[str] = []
    action: str | None = "dining"
    action_label: str | None = "去看美食推荐"


def _start_time_label(hour: int) -> str:
    return f"{hour:02d}:00"


def _build_steps(scene: str, duration_hours: int):
    now = datetime.now()
    start = now.replace(minute=0, second=0, microsecond=0)

    if scene == "两个人约会":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} 先去 L1 中庭看快闪，边逛边拍照",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} 去 B1 喝杯咖啡或甜品，慢慢聊天",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} 晚一点去椿庐或绿茶吃饭，节奏更舒服",
        ]
    if scene == "带小孩来玩":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} 先去 L1 看快闪或互动装置，停留时间不要太久",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} 去 L2 娃娃屋或轻松的互动点位消耗精力",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} 去客家围或绿茶用餐，方便休息",
        ]
    if scene == "朋友聚会":
        return [
            f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} 先在 L1 中庭集合看活动，统一节奏",
            f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} 去 B1 继续逛潮玩和饮品店，边走边聊",
            f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 4))).hour)} 去探鱼或绿茶落座吃饭，适合多人聚会",
        ]

    return [
        f"{_start_time_label(start.hour)}-{_start_time_label((start + timedelta(hours=1)).hour)} 先去 L1 快闪或中庭重点活动，抓住今天最值得看的内容",
        f"{_start_time_label((start + timedelta(hours=1)).hour)}-{_start_time_label((start + timedelta(hours=2)).hour)} 去 B2 蔦屋或 B1 轻松逛一圈，保持节奏",
        f"{_start_time_label((start + timedelta(hours=2)).hour)}-{_start_time_label((start + timedelta(hours=min(duration_hours, 3))).hour)} 最后找一家顺路餐厅或咖啡店收尾",
    ]


@router.post("/day", response_model=DayPlanResponse)
async def generate_day_plan(req: DayPlanRequest):
    steps = _build_steps(req.scene, req.duration_hours)

    if req.scene == "两个人约会":
        summary = "这条路线更偏氛围感和节奏感，适合边逛边聊天，不会太赶。"
        tip = "约会路线的关键不是点位多，而是留出聊天和拍照的时间。"
        suggestions = ["想要更安静一点", "预算 300 内怎么安排", "顺路吃什么更合适"]
    elif req.scene == "带小孩来玩":
        summary = "这条路线优先考虑小朋友的体力和节奏，避免一直走路或排太满。"
        tip = "带娃路线建议控制在 2-3 个主要点位，中间一定安排坐下吃饭。"
        suggestions = ["更适合几岁的小朋友", "有没有更省体力的路线", "吃饭推荐要有宝宝椅"]
    elif req.scene == "朋友聚会":
        summary = "这条路线更适合朋友一起走，不容易有人掉队，也方便最后落到一顿饭。"
        tip = "朋友聚会更适合先看活动再吃饭，大家更容易统一节奏。"
        suggestions = ["想再热闹一点", "有没有适合拍照的点", "预算 200/人怎么排"]
    else:
        summary = "这是一条今天就能直接走的轻量路线，适合时间不多但想逛得值。"
        tip = "如果你只有 2 小时，优先做 1 个重点活动 + 1 顿顺路的饭就够了。"
        suggestions = ["我只有 2 小时", "今天适合先吃还是先逛", "给我一个更轻松的版本"]

    return DayPlanResponse(
        summary=summary,
        steps=steps,
        tip=tip,
        suggestions=suggestions,
    )
