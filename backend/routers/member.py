from datetime import date, datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/member", tags=["member"])

# ── Mock data (Phase 2 will replace with real DB) ──────────────────────────────

MOCK_MEMBER = {
    "id": "CF2026001",
    "name": "逛街达人",
    "avatar_emoji": "🛍️",
    "level": "gold",          # regular | gold | platinum | diamond
    "points": 2580,
    "total_spending": 3860,
    "checkin_streak": 3,
    "last_checkin_date": None,  # ISO date string or None
}

LEVEL_CONFIG = {
    "regular":  {"label": "普通会员", "color": "#6B7280", "next_level": "gold",     "next_threshold": 1000,  "current_threshold": 0},
    "gold":     {"label": "黄金会员", "color": "#F59E0B", "next_level": "platinum", "next_threshold": 5000,  "current_threshold": 1000},
    "platinum": {"label": "铂金会员", "color": "#8B5CF6", "next_level": "diamond",  "next_threshold": 15000, "current_threshold": 5000},
    "diamond":  {"label": "钻石会员", "color": "#3B82F6", "next_level": None,       "next_threshold": None,  "current_threshold": 15000},
}

MOCK_COUPONS = [
    {
        "id": "c1",
        "title": "满100减20",
        "desc": "全场餐饮通用，不与其他优惠叠加",
        "expiry": "2026-03-31",
        "min_spend": 100,
        "discount_text": "￥20",
        "tag": "餐饮",
        "used": False,
        "expired": False,
    },
    {
        "id": "c2",
        "title": "下午茶8折",
        "desc": "适用于 B1 层轻食/咖啡品牌",
        "expiry": "2026-04-15",
        "min_spend": 0,
        "discount_text": "8折",
        "tag": "咖啡",
        "used": False,
        "expired": False,
    },
    {
        "id": "c3",
        "title": "新人礼 ¥50 优惠券",
        "desc": "首次消费满200元可用",
        "expiry": "2026-02-28",
        "min_spend": 200,
        "discount_text": "￥50",
        "tag": "全场",
        "used": False,
        "expired": True,
    },
    {
        "id": "c4",
        "title": "生日专属立减30",
        "desc": "生日当月消费满150元可用",
        "expiry": "2026-05-01",
        "min_spend": 150,
        "discount_text": "￥30",
        "tag": "生日礼",
        "used": True,
        "expired": False,
    },
]

MOCK_TRANSACTIONS = [
    {"id": "t1", "date": "2026-03-04", "merchant": "椿庐 ChunLounge",    "amount": 438, "points_earned": 44, "category": "餐饮"},
    {"id": "t2", "date": "2026-03-03", "merchant": "Peet's Coffee",      "amount": 68,  "points_earned": 7,  "category": "咖啡"},
    {"id": "t3", "date": "2026-03-01", "merchant": "灼灼木自助寿司",        "amount": 138, "points_earned": 14, "category": "餐饮"},
    {"id": "t4", "date": "2026-02-28", "merchant": "TSUTAYA BOOKSTORE",  "amount": 220, "points_earned": 22, "category": "零售"},
    {"id": "t5", "date": "2026-02-25", "merchant": "泡泡玛特 POPMART",     "amount": 194, "points_earned": 19, "category": "零售"},
    {"id": "t6", "date": "2026-02-22", "merchant": "绿茶餐厅",             "amount": 186, "points_earned": 19, "category": "餐饮"},
]

MOCK_POINTS_HISTORY = [
    {"id": "p1", "date": "2026-03-04", "desc": "椿庐消费积分",   "delta": +44,  "type": "earn"},
    {"id": "p2", "date": "2026-03-03", "desc": "每日签到奖励",   "delta": +10,  "type": "earn"},
    {"id": "p3", "date": "2026-03-03", "desc": "Peet's Coffee 消费", "delta": +7, "type": "earn"},
    {"id": "p4", "date": "2026-03-01", "desc": "使用满100减20券", "delta": -100, "type": "spend"},
    {"id": "p5", "date": "2026-03-01", "desc": "自助寿司消费积分", "delta": +14, "type": "earn"},
    {"id": "p6", "date": "2026-02-28", "desc": "每日签到奖励",   "delta": +10,  "type": "earn"},
    {"id": "p7", "date": "2026-02-28", "desc": "蔦屋书店消费积分", "delta": +22, "type": "earn"},
]


# ── Response models ────────────────────────────────────────────────────────────

class MemberProfile(BaseModel):
    id: str
    name: str
    avatar_emoji: str
    level: str
    level_label: str
    level_color: str
    points: int
    total_spending: int
    checkin_streak: int
    checked_in_today: bool
    next_level: str | None
    next_level_label: str | None
    next_threshold: int | None
    progress_pct: float


class CheckinResponse(BaseModel):
    success: bool
    points_earned: int
    new_total: int
    streak: int
    message: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=MemberProfile)
async def get_profile():
    m = MOCK_MEMBER
    cfg = LEVEL_CONFIG[m["level"]]
    today = date.today().isoformat()

    checked_in_today = m["last_checkin_date"] == today

    # Progress to next level based on total spending
    if cfg["next_threshold"]:
        span = cfg["next_threshold"] - cfg["current_threshold"]
        done = min(m["total_spending"] - cfg["current_threshold"], span)
        progress_pct = round(max(0.0, done / span * 100), 1)
    else:
        progress_pct = 100.0

    next_cfg = LEVEL_CONFIG.get(cfg["next_level"]) if cfg["next_level"] else None

    return MemberProfile(
        id=m["id"],
        name=m["name"],
        avatar_emoji=m["avatar_emoji"],
        level=m["level"],
        level_label=cfg["label"],
        level_color=cfg["color"],
        points=m["points"],
        total_spending=m["total_spending"],
        checkin_streak=m["checkin_streak"],
        checked_in_today=checked_in_today,
        next_level=cfg["next_level"],
        next_level_label=next_cfg["label"] if next_cfg else None,
        next_threshold=cfg["next_threshold"],
        progress_pct=progress_pct,
    )


@router.post("/checkin", response_model=CheckinResponse)
async def checkin():
    m = MOCK_MEMBER
    today = date.today().isoformat()

    if m["last_checkin_date"] == today:
        return CheckinResponse(
            success=False,
            points_earned=0,
            new_total=m["points"],
            streak=m["checkin_streak"],
            message="今天已经签到过啦 😊",
        )

    points_earned = 10 + (m["checkin_streak"] // 7) * 5  # bonus every 7-day streak
    m["points"] += points_earned
    m["checkin_streak"] += 1
    m["last_checkin_date"] = today

    return CheckinResponse(
        success=True,
        points_earned=points_earned,
        new_total=m["points"],
        streak=m["checkin_streak"],
        message=f"签到成功！获得 {points_earned} 积分 🎉",
    )


@router.get("/coupons")
async def get_coupons():
    return {"coupons": MOCK_COUPONS}


@router.get("/transactions")
async def get_transactions():
    return {"transactions": MOCK_TRANSACTIONS}


@router.get("/points-history")
async def get_points_history():
    return {"history": MOCK_POINTS_HISTORY}
