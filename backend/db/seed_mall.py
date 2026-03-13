from __future__ import annotations

import hashlib
from datetime import datetime

from sqlalchemy import delete, select

from data.mall import RESTAURANTS
from db import Base, SessionLocal, engine
from db.models import Event, Floor, Mall, MediaAsset, Offer, Venue, VenueItem, VenueTag

MALL_CODE = "c_future_city"

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

STATIC_VENUES = [
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
]

STATIC_EVENTS = [
    {
        "title": "teamLab Future Park 艺术科技展",
        "external_seed": "teamlab-future-park",
        "event_type": "exhibition",
        "description": "L1 中庭艺术科技展，2026年4月1日开幕，当前状态为即将开放。",
        "start_time": "2026-04-01T10:00:00+08:00",
        "end_time": None,
        "status": "scheduled",
        "metadata": {"floor_code": "L1", "opening_note": "尚未开放"},
    },
    {
        "title": "亚洲顶流女星快闪店",
        "external_seed": "asia-pop-up-star",
        "event_type": "pop_up",
        "description": "L1 中庭限时快闪活动，3月2日到3月8日，当前已结束。",
        "start_time": "2026-03-02T10:00:00+08:00",
        "end_time": "2026-03-08T22:00:00+08:00",
        "status": "ended",
        "metadata": {"floor_code": "L1"},
    },
]


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


def get_or_create_mall(session) -> Mall:
    mall = session.scalar(select(Mall).where(Mall.code == MALL_CODE))
    if mall:
        return mall

    mall = Mall(
        code=MALL_CODE,
        name="中洲湾 C Future City",
        city="深圳",
        address="深圳市福田区",
        description="融合艺术、科技与自然的购物中心。",
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
    venue.open_hours = {}
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
            metadata={"seed_type": "static_venue"},
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

        event.title = event_data["title"]
        event.event_type = event_data["event_type"]
        event.description = event_data["description"]
        event.start_time = parse_datetime(event_data["start_time"])
        event.end_time = parse_datetime(event_data["end_time"])
        event.status = event_data["status"]
        event.meta = event_data["metadata"]
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
