from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import ENABLE_DATABASE
from data.mall import MALL_CONTEXT
from db.models import Event, Mall, Offer, Venue, VenueTag

DEFAULT_MALL_CODE = "c_future_city"
ACTIVE_EVENT_STATUSES = {"active", "live", "ongoing"}


def _format_rating(value) -> str:
    if value is None:
        return ""
    return str(value)


def _build_tag_map(db: Session, venue_ids: list) -> dict:
    tags_by_venue: dict = defaultdict(lambda: defaultdict(list))
    for tag in db.scalars(
        select(VenueTag)
        .where(VenueTag.venue_id.in_(venue_ids))
        .order_by(VenueTag.created_at.asc())
    ):
        tags_by_venue[tag.venue_id][tag.tag_type].append(tag.tag_value)
    return tags_by_venue


def _build_offer_map(db: Session, venue_ids: list) -> dict:
    offers_by_venue: dict = defaultdict(list)
    for offer in db.scalars(
        select(Offer)
        .where(
            Offer.venue_id.in_(venue_ids),
            Offer.status == "active",
        )
        .order_by(Offer.created_at.asc())
    ):
        offers_by_venue[offer.venue_id].append(f"{offer.title}（{offer.price_text or '价格未标注'}）")
    return offers_by_venue


def _build_event_location(event: Event) -> str:
    meta = event.meta if isinstance(event.meta, dict) else {}
    return str(meta.get("floor_code") or meta.get("location_code") or "").strip()


def _build_venue_snapshot(venue: Venue, tag_map: dict, offers: list[str]) -> dict:
    meta = venue.meta if isinstance(venue.meta, dict) else {}
    return {
        "id": str(venue.id),
        "name": venue.name,
        "venue_type": venue.venue_type,
        "category": venue.category or "",
        "description": venue.description or "",
        "budget_text": venue.budget_text or "",
        "rating": float(venue.rating) if venue.rating is not None else None,
        "location": venue.location_code or str(meta.get("floor_code") or "").strip(),
        "tags": {tag_type: list(values) for tag_type, values in tag_map.items()},
        "offers": list(offers),
    }


def _value(source, key: str, default=""):
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def get_plan_snapshot(db: Session) -> dict | None:
    if not ENABLE_DATABASE:
        return None

    try:
        mall = db.scalar(select(Mall).where(Mall.code == DEFAULT_MALL_CODE))
        if not mall:
            return None

        venues = list(
            db.scalars(
                select(Venue)
                .where(
                    Venue.mall_id == mall.id,
                    Venue.status == "active",
                )
                .order_by(Venue.venue_type.asc(), Venue.created_at.asc())
            )
        )
        if not venues:
            return None

        venue_ids = [venue.id for venue in venues]
        tags_by_venue = _build_tag_map(db, venue_ids)
        offers_by_venue = _build_offer_map(db, venue_ids)

        restaurants = [
            _build_venue_snapshot(venue, tags_by_venue.get(venue.id, {}), offers_by_venue.get(venue.id, []))
            for venue in venues
            if venue.venue_type == "restaurant"
        ]
        highlights = [
            _build_venue_snapshot(venue, tags_by_venue.get(venue.id, {}), offers_by_venue.get(venue.id, []))
            for venue in venues
            if venue.venue_type != "restaurant"
        ]

        events = [
            {
                "id": str(event.id),
                "external_id": event.external_id or "",
                "title": event.title,
                "event_type": event.event_type or "",
                "description": event.description or "",
                "status": event.status,
                "location": _build_event_location(event),
            }
            for event in db.scalars(
                select(Event)
                .where(Event.mall_id == mall.id)
                .order_by(Event.start_time.asc().nullslast(), Event.created_at.asc())
            )
        ]

        return {
            "mall_name": mall.name,
            "mall_city": mall.city or "Shenzhen",
            "mall_description": mall.description or "Shopping mall database context",
            "restaurants": restaurants,
            "highlights": highlights,
            "events": events,
        }
    except Exception:
        return None


def _format_venue_line(venue: Venue, tag_map: dict, offers: list[str]) -> str:
    tags = []
    if tag_map.get("scene"):
        tags.append(f"scene: {', '.join(tag_map['scene'])}")
    if tag_map.get("theme"):
        tags.append(f"theme: {', '.join(tag_map['theme'])}")
    if tag_map.get("feature"):
        tags.append(f"feature: {', '.join(tag_map['feature'])}")
    if tag_map.get("facility"):
        tags.append(f"facility: {', '.join(tag_map['facility'])}")
    tag_suffix = f" | {' | '.join(tags)}" if tags else ""
    offer_suffix = f" | offers: {', '.join(offers[:2])}" if offers else ""
    return (
        f'- "{_value(venue, "name")}"'
        f" | type: {_value(venue, 'venue_type')}"
        f" | category: {_value(venue, 'category') or 'unknown'}"
        f" | budget: {_value(venue, 'budget_text') or '未标注'}"
        f" | rating: {_format_rating(_value(venue, 'rating')) or '未标注'}"
        f"{tag_suffix}{offer_suffix}"
    )


def _format_restaurant_line(venue: Venue, tag_map: dict, offers: list[str]) -> str:
    cuisine = ", ".join(tag_map.get("cuisine", [])) or _value(venue, "description") or "未标注类型"
    ambiance = ", ".join(tag_map.get("ambiance", [])) or "暂无标签"
    facilities = ", ".join(tag_map.get("facility", [])) or "暂无特殊设施"
    offer_suffix = f" | offers: {', '.join(offers[:2])}" if offers else ""
    return (
        f'- "{_value(venue, "name")}"'
        f" | cuisine: {cuisine}"
        f" | category: {_value(venue, 'category') or 'unknown'}"
        f" | budget: {_value(venue, 'budget_text') or '未标注'}"
        f" | rating: {_format_rating(_value(venue, 'rating')) or '未标注'}"
        f" | ambiance: {ambiance}"
        f" | facilities: {facilities}"
        f"{offer_suffix}"
    )


def build_plan_context(db: Session) -> str:
    snapshot = get_plan_snapshot(db)
    if not snapshot:
        return MALL_CONTEXT

    restaurant_lines = "\n".join(
        _format_restaurant_line(
            venue=venue,
            tag_map=venue.get("tags", {}),
            offers=venue.get("offers", []),
        )
        for venue in snapshot["restaurants"][:12]
    ) or "- 暂无餐饮数据"

    highlight_lines = "\n".join(
        _format_venue_line(
            venue=venue,
            tag_map=venue.get("tags", {}),
            offers=venue.get("offers", []),
        )
        for venue in snapshot["highlights"][:12]
    ) or "- 暂无其他点位数据"

    active_events = [event for event in snapshot["events"] if event.get("status") in ACTIVE_EVENT_STATUSES]
    event_lines = "\n".join(
        f'- "{event["title"]}" | status: {event["status"]} | description: {event["description"] or "暂无描述"}'
        for event in snapshot["events"][:10]
    ) or "- 暂无活动数据"

    active_event_note = (
        "\n".join(f'- "{event["title"]}" currently active' for event in active_events)
        if active_events
        else "- 当前数据库中没有明确标记为 active/live/ongoing 的活动"
    )

    return f"""
You are an AI Mall Assistant for "{snapshot["mall_name"]}" located in {snapshot["mall_city"]}.
Mall description: {snapshot["mall_description"]}.

Important event rule:
- Only events with status active/live/ongoing can be treated as currently available.
- Events with status scheduled are future items and should not be recommended as current stops.
- Events with status ended are historical and should not be recommended as current stops.

Currently active events:
{active_event_note}

Mall events:
{event_lines}

Mall highlights:
{highlight_lines}

Restaurants:
{restaurant_lines}
""".strip()
