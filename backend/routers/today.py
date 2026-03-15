from datetime import datetime, timezone, timedelta
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/today", tags=["today"])


class TodayStatusItem(BaseModel):
    label: str
    value: str
    tone: str  # green | amber | indigo | neutral


class TodaySummaryResponse(BaseModel):
    headline: str
    subheadline: str
    statuses: list[TodayStatusItem]
    recommended_action: str
    right_now: str
    avoid_now: str
    best_for: list[str]
    highlights: list[dict]


@router.get("/summary", response_model=TodaySummaryResponse)
async def get_today_summary():
    now = datetime.now(timezone(timedelta(hours=8)))
    hour = now.hour
    is_weekend = now.weekday() >= 5

    if is_weekend and 11 <= hour <= 14:
        crowd = TodayStatusItem(label="商场人流", value="偏拥挤", tone="amber")
    elif 14 <= hour <= 18:
        crowd = TodayStatusItem(label="商场人流", value="逛起来最舒服", tone="green")
    elif hour >= 19:
        crowd = TodayStatusItem(label="商场人流", value="傍晚逐渐回落", tone="indigo")
    else:
        crowd = TodayStatusItem(label="商场人流", value="比较从容", tone="green")

    if 11 <= hour <= 13 or 18 <= hour <= 20:
        dining = TodayStatusItem(label="餐饮状态", value="高峰将至", tone="amber")
    elif 14 <= hour <= 17:
        dining = TodayStatusItem(label="餐饮状态", value="错峰用餐好时段", tone="green")
    else:
        dining = TodayStatusItem(label="餐饮状态", value="选择空间较大", tone="indigo")

    activity = TodayStatusItem(label="今日活动", value="L1 快闪适合现在去", tone="green")

    if 14 <= hour <= 18:
        headline = "今天适合来一趟"
        subheadline = "下午是体验最舒服的时间段，活动和餐饮都不算拥挤。"
        recommended_action = "先去 L1 中庭看快闪，再下楼去 B1 吃饭，会是今天最顺的一条线。"
        right_now = "现在更适合先看活动，再安排晚一点的用餐。"
        avoid_now = "别一上来就排热门餐厅，高峰会让节奏变慢。"
    elif 11 <= hour <= 13:
        headline = "午间来要讲顺序"
        subheadline = "现在更适合先看活动，错开午餐高峰后再吃饭。"
        recommended_action = "先逛 L1 / B2，再把用餐安排到 13:30 之后，体验会更轻松。"
        right_now = "先做轻量逛逛，再把吃饭放到稍晚一些。"
        avoid_now = "现在直接冲热门餐厅，通常不划算。"
    elif hour >= 19:
        headline = "今晚来得及逛一圈"
        subheadline = "适合安排 2 小时轻量路线：活动 + 晚餐 + 轻松逛。"
        recommended_action = "今晚更适合走轻量路线，不建议安排太多点位。"
        right_now = "控制在 2-3 个点位，会比排太满舒服很多。"
        avoid_now = "不建议做跨太多楼层的长路线。"
    else:
        headline = "今天可以轻松来逛"
        subheadline = "现在更适合先挑一个重点，再顺路安排吃饭和打卡。"
        recommended_action = "如果你时间不多，优先看活动或先吃饭，别把路线排太满。"
        right_now = "先选一个重点内容，再顺路补上吃饭或休息。"
        avoid_now = "不要把活动、吃饭、打卡都塞进一条太满的路线。"

    highlights = [
        {
            "title": "今天先看什么",
            "desc": "L1 中庭活动仍然是今天最值得先看的重点内容。",
            "action": "events",
            "action_label": "查看活动",
        },
        {
            "title": "今天怎么吃更顺",
            "desc": "如果你现在来，比较推荐把吃饭安排在活动之后。",
            "action": "dining",
            "action_label": "去看美食推荐",
        },
        {
            "title": "直接帮我安排",
            "desc": "如果你只想知道今天怎么逛最值，直接让我排路线就行。",
            "action": "chat",
            "action_label": "让 Cadence 安排",
            "query": "帮我安排今天在中洲湾的路线",
        },
    ]

    return TodaySummaryResponse(
        headline=headline,
        subheadline=subheadline,
        statuses=[activity, dining, crowd],
        recommended_action=recommended_action,
        right_now=right_now,
        avoid_now=avoid_now,
        best_for=["下班后来一趟", "2-3 小时轻量逛", "约会或朋友碰面"],
        highlights=highlights,
    )
