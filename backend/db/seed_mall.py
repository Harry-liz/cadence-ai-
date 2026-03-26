from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import delete, select

from data.mall import RESTAURANTS
from db import Base, SessionLocal, engine
from db.models import Event, Floor, Mall, MediaAsset, Offer, Venue, VenueItem, VenueTag

MALL_CODE = "c_future_city"
MALL_DESCRIPTION = "融合艺术、科技与自然的购物中心，结合 teamLab 与 Patrick Blanc 等装置概念，适合餐饮、零售、活动与轻量路线体验。"

FLOORS = [
    ("B2", "B2层", -2),
    ("B1", "B1层", -1),
    ("L1", "L1层", 1),
    ("L2", "L2层", 2),
    ("L3", "L3层", 3),
    ("L4", "L4层", 4),
]

RESTAURANT_FLOORS = {
    "探魚·鲜青椒爽麻烤鱼 (福田中洲湾店)": "B1",
    "绿茶餐厅 (福田中洲湾店)": "B1",
    "椿庐ChunLounge (中洲湾店)": "L3",
    "客家围·客家菜 (福田中洲湾店)": "L3",
    "Peet's Coffee 皮爷咖啡 (中洲湾店)": "B1",
    "1-7Bread (中洲湾店)": "B1",
    "霸王茶姬 (广东深圳福田中洲湾店)": "B1",
    "野人先生现做冰淇淋": "B1",
    "KOI Thé (福田中洲湾店)": "B1",
    "灼灼木自助寿司·任点任食 (中洲湾店)": "B1",
}

# 核心高频点位：用户最常在 mall context 和推荐里看到的具体店铺/娱乐点
CORE_HIGHLIGHT_VENUES = [
    {
        "name": "TSUTAYA BOOKSTORE 蔦屋书店",
        "external_seed": "tsutaya-bookstore",
        "floor_code": "B2",
        "venue_type": "bookstore",
        "category": "retail",
        "description": "日式生活方式书店，包含艺术、日本进口书籍、动漫周边和主题打印机。",
        "budget_text": "¥73/人",
        "rating": 4.9,
        "location_code": "B2-B228",
        "tags": [("theme", "艺术"), ("theme", "日本进口书籍"), ("facility", "免费停车")],
    },
    {
        "name": "POPMART 泡泡玛特",
        "external_seed": "popmart",
        "floor_code": "B1",
        "venue_type": "retail",
        "category": "toys",
        "description": "潮玩零售门店，主营盲盒、手办和收藏周边。",
        "budget_text": "¥194/人",
        "rating": 4.7,
        "location_code": "B1-57A",
        "tags": [("theme", "盲盒"), ("theme", "手办"), ("theme", "潮玩")],
    },
    {
        "name": "寰映影城激光IMAX",
        "external_seed": "cinity-cinema",
        "floor_code": "L2",
        "venue_type": "cinema",
        "category": "entertainment",
        "description": "影城提供激光 IMAX 影厅，适合观影休闲。",
        "budget_text": "¥45起",
        "rating": None,
        "location_code": "L2影院入口",
        "tags": [("feature", "激光IMAX"), ("scene", "观影休闲")],
    },
    {
        "name": "熊怡怡·娃娃屋",
        "external_seed": "bear-claw-house",
        "floor_code": "L2",
        "venue_type": "arcade",
        "category": "entertainment",
        "description": "娃娃抓机和游艺空间，适合亲子和情侣。",
        "budget_text": "100枚游戏币¥39.9",
        "rating": 4.1,
        "location_code": "L2",
        "tags": [("scene", "亲子"), ("scene", "情侣"), ("hours", "10:00-22:00")],
    },
    {
        "name": "PURE nfTEA",
        "external_seed": "pure-nftea",
        "floor_code": "B1",
        "venue_type": "restaurant",
        "category": "light",
        "description": "新茶饮点位，适合边逛边买饮品，作为 B1 美食街的轻食补充。",
        "budget_text": "¥18-28/人",
        "rating": None,
        "location_code": "B1",
        "tags": [("cuisine", "茶饮"), ("scene", "随手买"), ("scene", "轻松休息")],
        "metadata": {"seed_type": "static_venue", "source_note": "from_mall_context"},
    },
]

# 场景与服务点位：活动区、花园、VIP、超市、地铁口、停车场等
EXPERIENCE_AND_SERVICE_VENUES = [
    {
        "name": "L1 中庭活动区",
        "external_seed": "l1-atrium-event-space",
        "floor_code": "L1",
        "venue_type": "event_space",
        "category": "event",
        "description": "L1 中庭活动与快闪展示区域，是 teamLab 展和明星快闪等活动的主要发生地。",
        "budget_text": None,
        "rating": None,
        "location_code": "L1中庭",
        "tags": [("scene", "活动"), ("scene", "打卡"), ("feature", "大型活动区")],
        "metadata": {"seed_type": "static_venue"},
    },
    {
        "name": "L2 露台花园",
        "external_seed": "l2-terrace-garden",
        "floor_code": "L2",
        "venue_type": "garden",
        "category": "landscape",
        "description": "L2 户外露台花园，适合散步、拍照、约会续摊和短暂停留。",
        "budget_text": None,
        "rating": None,
        "location_code": "L2露台区",
        "tags": [("scene", "约会"), ("scene", "散步"), ("feature", "户外花园"), ("theme", "拍照")],
        "metadata": {"seed_type": "static_venue"},
    },
    {
        "name": "L4 天台花园",
        "external_seed": "l4-rooftop-garden",
        "floor_code": "L4",
        "venue_type": "garden",
        "category": "landscape",
        "description": "L4 天台花园，适合作为高楼层休息和收尾点位。",
        "budget_text": None,
        "rating": None,
        "location_code": "L4天台",
        "tags": [("scene", "休闲"), ("scene", "约会"), ("feature", "天台花园")],
        "metadata": {"seed_type": "static_venue"},
    },
    {
        "name": "L3 VIP中心",
        "external_seed": "l3-vip-center",
        "floor_code": "L3",
        "venue_type": "service_center",
        "category": "service",
        "description": "商场 VIP 中心，可承接会员活动、咨询和节日沙龙。",
        "budget_text": None,
        "rating": None,
        "location_code": "L3 VIP中心",
        "tags": [("feature", "会员服务"), ("feature", "活动举办地")],
        "metadata": {"seed_type": "static_venue"},
    },
    {
        "name": "B2 生活超市",
        "external_seed": "b2-supermarket",
        "floor_code": "B2",
        "venue_type": "supermarket",
        "category": "grocery",
        "description": "B2 生活超市，适合补给和日常采购。",
        "budget_text": None,
        "rating": None,
        "location_code": "B2",
        "tags": [("scene", "日常采购"), ("feature", "生活补给")],
        "metadata": {"seed_type": "static_venue"},
    },
    {
        "name": "B2 地铁直达入口",
        "external_seed": "b2-metro-entry",
        "floor_code": "B2",
        "venue_type": "transit_access",
        "category": "access",
        "description": "B2 地铁直达入口，是商场的重要交通接入点。",
        "budget_text": None,
        "rating": None,
        "location_code": "B2地铁口",
        "tags": [("feature", "地铁直达"), ("scene", "到达离场")],
        "metadata": {"seed_type": "static_venue"},
    },
    {
        "name": "B1 停车场",
        "external_seed": "b1-parking",
        "floor_code": "B1",
        "venue_type": "parking",
        "category": "service",
        "description": "B1 停车区，近主入口，适合快速进入商场。",
        "budget_text": "¥6/小时，当日最高¥50",
        "rating": None,
        "location_code": "B1停车场",
        "tags": [("feature", "停车"), ("feature", "近主入口")],
        "metadata": {"seed_type": "static_venue", "total_spaces": 200},
    },
    {
        "name": "B2 停车场",
        "external_seed": "b2-parking",
        "floor_code": "B2",
        "venue_type": "parking",
        "category": "service",
        "description": "B2 停车区，靠近电梯厅，适合作为商场到达和离场动线。",
        "budget_text": "¥6/小时，当日最高¥50",
        "rating": None,
        "location_code": "B2停车场",
        "tags": [("feature", "停车"), ("feature", "近电梯厅")],
        "metadata": {"seed_type": "static_venue", "total_spaces": 300},
    },
]

# 区域型 zone：更偏“楼层分区/逛法建议”而不是具体店铺
STYLE_AND_DINING_ZONES = [
    {
        "name": "L1 国际品牌旗舰店区",
        "external_seed": "l1-flagship-zone",
        "floor_code": "L1",
        "venue_type": "zone",
        "category": "retail",
        "description": "L1 国际品牌旗舰店区，适合先看主打单品和完整成套搭配。",
        "budget_text": None,
        "rating": None,
        "location_code": "L1",
        "tags": [("theme", "质感单品"), ("theme", "成套搭配"), ("scene", "购物")],
        "metadata": {"seed_type": "style_zone"},
    },
    {
        "name": "L2 设计师品牌区",
        "external_seed": "l2-designer-zone",
        "floor_code": "L2",
        "venue_type": "zone",
        "category": "retail",
        "description": "L2 设计师品牌区，更适合寻找有风格感的穿搭。",
        "budget_text": None,
        "rating": None,
        "location_code": "L2",
        "tags": [("theme", "设计感"), ("theme", "剪裁好"), ("scene", "购物")],
        "metadata": {"seed_type": "style_zone"},
    },
    {
        "name": "L2 生活方式精品店",
        "external_seed": "l2-lifestyle-zone",
        "floor_code": "L2",
        "venue_type": "zone",
        "category": "retail",
        "description": "L2 生活方式精品店，适合补鞋包、配饰和日常单品。",
        "budget_text": None,
        "rating": None,
        "location_code": "L2",
        "tags": [("theme", "配饰友好"), ("theme", "鞋包优先"), ("scene", "购物")],
        "metadata": {"seed_type": "style_zone"},
    },
    {
        "name": "B1 潮流零售区",
        "external_seed": "b1-trend-zone",
        "floor_code": "B1",
        "venue_type": "zone",
        "category": "retail",
        "description": "B1 潮流零售区，偏轻松和街头风，适合基础款和休闲单品。",
        "budget_text": None,
        "rating": None,
        "location_code": "B1",
        "tags": [("theme", "休闲感"), ("theme", "年轻一点"), ("scene", "购物")],
        "metadata": {"seed_type": "style_zone"},
    },
    {
        "name": "L4 高端餐饮区",
        "external_seed": "l4-fine-dining-zone",
        "floor_code": "L4",
        "venue_type": "zone",
        "category": "dining",
        "description": "L4 高端餐饮区，适合正式聚餐和高客单价用餐场景。",
        "budget_text": None,
        "rating": None,
        "location_code": "L4",
        "tags": [("scene", "正式聚餐"), ("scene", "约会"), ("feature", "高端餐饮")],
        "metadata": {"seed_type": "static_venue"},
    },
]

STATIC_VENUES = CORE_HIGHLIGHT_VENUES + EXPERIENCE_AND_SERVICE_VENUES + STYLE_AND_DINING_ZONES

# 当前重点活动：仍可能被前端、路线和聊天显式提及
FEATURED_EVENTS = [
    {
        "title": "teamLab Future Park: 艺术与科技展",
        "external_seed": "teamlab-future-park",
        "event_type": "exhibition",
        "description": "L1 中庭艺术科技展，沉浸式光影体验与互动艺术装置，适合亲子及艺术爱好者。",
        "start_time": "2026-04-01T00:00:00+08:00",
        "end_time": "2026-05-31T23:59:59+08:00",
        "image_url": "/teamlab艺术展.png",
        "venue_name": "L1 中庭活动区",
        "metadata": {
            "floor_code": "L1",
            "location_code": "L1中庭",
            "ticket_info": "需购票入场",
            "hot_tag": "早鸟票预售中",
            "details": ["全天开放", "沉浸式光影体验", "互动艺术装置", "适合亲子及艺术爱好者"],
            "tags": ["亲子出游", "情侣约会", "艺术爱好者"],
            "scenes": ["带小孩来玩", "两个人约会", "朋友聚会", "自己逛逛"],
            "ai_insight": "建议提前关注官方购票渠道，早鸟票和工作日下午场通常体验更好。",
            "ai_tips": [
                "工作日下午 2-4 点人流通常少于周末",
                "带小朋友来时，互动光影区会是亮点",
                "建议提前在线购票，现场排队可能较长",
            ],
            "ai_questions": ["怎么买票？", "适合几岁的小孩？", "帮我规划当天行程"],
            "scene_insights": {
                "带小孩来玩": "适合安排成轻松的亲子半日路线，展后可顺路去 L3 用餐。",
                "两个人约会": "光影展天然出片，适合傍晚入场，展后可去露台花园继续散步。",
                "朋友聚会": "适合小团体一起体验互动装置，团体出行记得提前订票。",
                "自己逛逛": "工作日早场更安静，适合慢慢拍照和沉浸体验。",
            },
        },
    },
    {
        "title": "超级巨星·惊喜降临 — 亚洲顶流女星官方快闪",
        "external_seed": "asia-pop-up-star",
        "event_type": "pop_up",
        "description": "L1 中庭限时快闪活动，沉浸式还原专属格调美学空间，官方独家周边限量发售。",
        "start_time": "2026-03-02T00:00:00+08:00",
        "end_time": "2026-03-20T23:59:59+08:00",
        "image_url": "/亚洲女星活动.png",
        "venue_name": "L1 中庭活动区",
        "metadata": {
            "floor_code": "L1",
            "location_code": "L1中庭",
            "ticket_info": "免费入场",
            "hot_tag": "限量周边告急",
            "details": [
                "亚洲顶流女星官方快闪「大陆首场」登陆中洲湾",
                "沉浸式还原专属格调美学空间",
                "官方独家周边亮相，限量发售",
                "ta 是谁？现场揭晓！不见不散",
            ],
            "tags": ["限时快闪", "限量周边", "明星活动"],
            "scenes": ["两个人约会", "朋友聚会", "自己逛逛"],
            "ai_insight": "工作日下午人相对更少，适合打卡和购买周边。",
            "ai_tips": [
                "限量周边通常在活动中后期逐步售罄",
                "活动在 L1 中庭，从主入口进入后比较容易看到",
                "周末明显更挤，工作日体验通常更好",
            ],
            "ai_questions": ["ta 是哪位明星？", "周边怎么购买？", "顺道推荐什么餐厅？"],
            "scene_insights": {
                "两个人约会": "适合一起打卡，结束后顺路去 B1 吃饭。",
                "朋友聚会": "适合 2-4 人一起拍照和逛周边。",
                "自己逛逛": "工作日一个人来体验也很自然，人少更方便拍照。",
            },
        },
    },
]

# 已结束但仍有参考价值的历史活动
ARCHIVED_EVENTS = [
    {
        "title": '"客味团圆·手作暖心" 元宵节汤圆 DIY',
        "external_seed": "lantern-festival-tangyuan-diy",
        "event_type": "workshop",
        "description": "L3 客家围店铺举办的元宵节汤圆 DIY 活动，适合家庭亲子和朋友小聚。",
        "start_time": "2026-03-01T15:00:00+08:00",
        "end_time": "2026-03-01T16:00:00+08:00",
        "image_url": "/客味团圆活动.png",
        "venue_name": "客家围·客家菜 (福田中洲湾店)",
        "metadata": {
            "floor_code": "L3",
            "location_code": "L3客家围店铺",
            "ticket_info": "会员免费，凭积分报名",
            "gift": "活动结束额外获赠元宵节灯笼一个及客家围品牌代金券",
            "notes": "请准时入场，迟到视为自动放弃活动名额。",
            "details": ["14:50-15:00 入场签到", "15:00-15:10 老师讲解", "15:10-15:50 汤圆DIY制作环节", "15:50-16:00 汤圆分享合影留念"],
            "tags": ["家庭亲子", "传统节日", "免费参与"],
            "scenes": ["带小孩来玩", "朋友聚会"],
            "ai_insight": "活动本身已结束，但类似节日手作活动仍值得继续关注。",
            "ai_tips": [
                "关注官方公众号可以更早看到新活动",
                "亲子手工活动通常会在节日前后上线",
                "结束后可顺路在客家围用餐",
            ],
            "ai_questions": ["之后还有类似活动吗？", "客家围怎么预订？"],
        },
    },
    {
        "title": "马年新春灯笼DIY沙龙",
        "external_seed": "horse-year-lantern-diy",
        "event_type": "workshop",
        "description": "L3 VIP中心举办的节日手工沙龙，适合亲子、朋友或轻度约会场景。",
        "start_time": "2026-02-08T15:00:00+08:00",
        "end_time": "2026-02-08T16:30:00+08:00",
        "image_url": "/马年灯笼活动.jpg",
        "venue_name": "L3 VIP中心",
        "metadata": {
            "floor_code": "L3",
            "location_code": "L3 VIP中心",
            "gift": "额外获得马年新春DIY萌马帽一份",
            "notes": "请准时入场，迟到视为自动放弃活动名额。",
            "details": ["14:50-15:00 入场签到", "15:00-15:20 老师讲解", "15:20-16:20 制作环节", "16:20-16:30 合影留念"],
            "tags": ["节日限定", "手工体验", "会员专属"],
            "scenes": ["带小孩来玩", "朋友聚会", "两个人约会"],
            "ai_insight": "活动已结束，但同系列手作活动未来仍可能继续推出。",
            "ai_tips": ["关注中洲湾公众号，新活动会第一时间发布", "类似手作活动通常在重要节日前后出现"],
            "ai_questions": ["之后还有类似活动吗？", "我想了解其他活动"],
        },
    },
]

STATIC_EVENTS = FEATURED_EVENTS + ARCHIVED_EVENTS


def stable_external_id(prefix: str, value: str) -> str:
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}:{digest}"


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def parse_rating(value: str | float | None) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def current_event_status(start_time: datetime | None, end_time: datetime | None) -> str:
    now = datetime.now(timezone.utc)
    if start_time and start_time.astimezone(timezone.utc) > now:
        return "scheduled"
    if end_time and end_time.astimezone(timezone.utc) < now:
        return "ended"
    return "ongoing"


def get_or_create_mall(session) -> Mall:
    mall = session.scalar(select(Mall).where(Mall.code == MALL_CODE))
    if mall:
        mall.name = "中洲湾 C Future City"
        mall.city = "深圳"
        mall.address = "深圳市福田区"
        mall.description = MALL_DESCRIPTION
        mall.status = "active"
        return mall

    mall = Mall(
        code=MALL_CODE,
        name="中洲湾 C Future City",
        city="深圳",
        address="深圳市福田区",
        description=MALL_DESCRIPTION,
        status="active",
    )
    session.add(mall)
    session.flush()
    return mall


def ensure_floors(session, mall: Mall) -> dict[str, Floor]:
    floor_map: dict[str, Floor] = {}
    for floor_code, floor_name, sort_order in FLOORS:
        floor = session.scalar(
            select(Floor).where(Floor.mall_id == mall.id, Floor.floor_code == floor_code)
        )
        if not floor:
            floor = Floor(
                mall_id=mall.id,
                floor_code=floor_code,
                floor_name=floor_name,
                sort_order=sort_order,
            )
            session.add(floor)
            session.flush()
        floor_map[floor_code] = floor
    return floor_map


def reset_seeded_children(session, venue_id):
    session.execute(delete(VenueTag).where(VenueTag.venue_id == venue_id))
    session.execute(delete(VenueItem).where(VenueItem.venue_id == venue_id))
    session.execute(delete(Offer).where(Offer.venue_id == venue_id))
    session.execute(
        delete(MediaAsset).where(
            MediaAsset.target_type == "venue",
            MediaAsset.target_id == venue_id,
        )
    )


def reset_seeded_event_media(session, event_id):
    session.execute(
        delete(MediaAsset).where(
            MediaAsset.target_type == "event",
            MediaAsset.target_id == event_id,
        )
    )


def resolve_venue_id(session, mall_id, *, venue_name: str | None = None):
    if not venue_name:
        return None
    venue = session.scalar(select(Venue).where(Venue.mall_id == mall_id, Venue.name == venue_name))
    return venue.id if venue else None


def upsert_venue(
    session,
    *,
    mall_id,
    floor_id,
    external_id: str,
    name: str,
    venue_type: str,
    category: str | None,
    description: str | None,
    budget_text: str | None,
    rating: float | None,
    location_code: str | None,
    tags: list[tuple[str, str]],
    items: list[str] | None = None,
    offers: list[tuple[str, str]] | None = None,
    image_url: str | None = None,
    metadata: dict | None = None,
    open_hours: dict | None = None,
) -> Venue:
    venue = session.scalar(
        select(Venue).where(Venue.mall_id == mall_id, Venue.external_id == external_id)
    )
    if not venue:
        venue = Venue(
            mall_id=mall_id,
            external_id=external_id,
            name=name,
            venue_type=venue_type,
        )
        session.add(venue)

    venue.floor_id = floor_id
    venue.name = name
    venue.venue_type = venue_type
    venue.category = category
    venue.description = description
    venue.budget_text = budget_text
    venue.rating = rating
    venue.location_code = location_code
    venue.status = "active"
    venue.source = "seed:mall_py"
    venue.open_hours = open_hours or {}
    venue.meta = metadata or {}
    session.flush()

    reset_seeded_children(session, venue.id)

    for tag_type, tag_value in tags:
        session.add(VenueTag(venue_id=venue.id, tag_type=tag_type, tag_value=tag_value))

    for index, item_name in enumerate(items or []):
        session.add(
            VenueItem(
                venue_id=venue.id,
                item_type="highlight",
                name=item_name,
                sort_order=index,
            )
        )

    for title, price_text in offers or []:
        session.add(
            Offer(
                venue_id=venue.id,
                title=title,
                price_text=price_text,
                status="active",
            )
        )

    if image_url:
        session.add(
            MediaAsset(
                target_type="venue",
                target_id=venue.id,
                asset_type="image",
                url=image_url,
                alt_text=name,
            )
        )

    return venue


def seed_restaurants(session, mall: Mall, floors: dict[str, Floor]) -> int:
    count = 0
    for restaurant in RESTAURANTS:
        floor_code = RESTAURANT_FLOORS.get(restaurant.name, "B1")
        tags = [("ambiance", value) for value in restaurant.ambiance]
        tags.extend(("facility", value) for value in restaurant.facilities)
        tags.append(("cuisine", restaurant.type))
        tags.append(("category", restaurant.category))

        upsert_venue(
            session,
            mall_id=mall.id,
            floor_id=floors[floor_code].id,
            external_id=stable_external_id("restaurant", restaurant.name),
            name=restaurant.name,
            venue_type="restaurant",
            category=restaurant.category,
            description=f"{restaurant.type}，适合{', '.join(restaurant.ambiance)}。",
            budget_text=restaurant.budget,
            rating=parse_rating(restaurant.rating),
            location_code=None,
            tags=tags,
            items=restaurant.dishes,
            offers=[(deal.name, deal.price) for deal in restaurant.deals],
            image_url=restaurant.image or None,
            metadata={"original_type": restaurant.type},
        )
        count += 1
    return count


def seed_static_venues(session, mall: Mall, floors: dict[str, Floor]) -> int:
    count = 0
    for venue_data in STATIC_VENUES:
        upsert_venue(
            session,
            mall_id=mall.id,
            floor_id=floors[venue_data["floor_code"]].id,
            external_id=stable_external_id("venue", venue_data["external_seed"]),
            name=venue_data["name"],
            venue_type=venue_data["venue_type"],
            category=venue_data["category"],
            description=venue_data["description"],
            budget_text=venue_data["budget_text"],
            rating=venue_data["rating"],
            location_code=venue_data["location_code"],
            tags=venue_data["tags"],
            items=venue_data.get("items"),
            offers=venue_data.get("offers"),
            image_url=venue_data.get("image_url"),
            metadata=venue_data.get("metadata") or {"seed_type": "static_venue"},
            open_hours=venue_data.get("open_hours"),
        )
        count += 1
    return count


def seed_events(session, mall: Mall) -> int:
    count = 0
    for event_data in STATIC_EVENTS:
        external_id = stable_external_id("event", event_data["external_seed"])
        event = session.scalar(
            select(Event).where(Event.mall_id == mall.id, Event.external_id == external_id)
        )
        if not event:
            event = Event(mall_id=mall.id, external_id=external_id, title=event_data["title"])
            session.add(event)

        start_time = parse_datetime(event_data["start_time"])
        end_time = parse_datetime(event_data["end_time"])
        event.title = event_data["title"]
        event.event_type = event_data["event_type"]
        event.description = event_data["description"]
        event.start_time = start_time
        event.end_time = end_time
        event.status = current_event_status(start_time, end_time)
        event.venue_id = resolve_venue_id(session, mall.id, venue_name=event_data.get("venue_name"))
        event.meta = event_data["metadata"]
        session.flush()
        reset_seeded_event_media(session, event.id)
        if event_data.get("image_url"):
            session.add(
                MediaAsset(
                    target_type="event",
                    target_id=event.id,
                    asset_type="image",
                    url=event_data["image_url"],
                    alt_text=event.title,
                )
            )
        count += 1
    return count


def main():
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as session:
        mall = get_or_create_mall(session)
        floors = ensure_floors(session, mall)
        restaurant_count = seed_restaurants(session, mall, floors)
        venue_count = seed_static_venues(session, mall, floors)
        event_count = seed_events(session, mall)
        mall_name = mall.name
        session.commit()

    print(
        f"Seed complete for {mall_name}: "
        f"{restaurant_count} restaurants, {venue_count} venues, {event_count} events."
    )


if __name__ == "__main__":
    main()
