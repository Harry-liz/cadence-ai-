from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import ENABLE_DATABASE
from data.mall import MALL_CONTEXT
from db.models import Mall, MediaAsset, Offer, Venue, VenueItem, VenueTag

DEFAULT_MALL_CODE = "c_future_city"


def _format_rating(value) -> str:
    if value is None:
        return ""
    return str(value)


def _build_restaurant_lines(
    venues: list[Venue],
    items_by_venue: dict,
    tags_by_venue: dict,
    offers_by_venue: dict,
    media_by_venue: dict,
) -> str:
    lines: list[str] = []
    for index, venue in enumerate(venues, start=1):
        tag_map = tags_by_venue.get(venue.id, {})
        dishes = items_by_venue.get(venue.id, [])
        ambiance = tag_map.get("ambiance", [])
        facilities = tag_map.get("facility", [])
        cuisine = ", ".join(tag_map.get("cuisine", [])) or venue.description or "未标注类型"
        deals = offers_by_venue.get(venue.id, [])
        image_url = media_by_venue.get(venue.id, "")
        image_line = f'image: "{image_url}"' if image_url else "image: (无图片记录)"
        deals_str = str(deals) if deals else "[]"

        lines.append(
            f'{index}. "{venue.name}" — {cuisine}\n'
            f'   category: {venue.category or "unknown"} | budget: {venue.budget_text or ""} | rating: {_format_rating(venue.rating)}\n'
            f"   {image_line}\n"
            f'   dishes: {", ".join(dishes) if dishes else "暂无推荐菜品"}\n'
            f'   ambiance: [{", ".join(ambiance) if ambiance else "暂无标签"}]\n'
            f'   facilities: [{", ".join(facilities) if facilities else "暂无特殊设施"}]\n'
            f"   deals: {deals_str}"
        )
    return "\n\n".join(lines)


def build_dining_context(db: Session) -> str:
    if not ENABLE_DATABASE:
        return MALL_CONTEXT

    try:
        mall = db.scalar(select(Mall).where(Mall.code == DEFAULT_MALL_CODE))
        if not mall:
            return MALL_CONTEXT

        venues = list(
            db.scalars(
                select(Venue)
                .where(
                    Venue.mall_id == mall.id,
                    Venue.venue_type == "restaurant",
                    Venue.status == "active",
                )
                .order_by(Venue.created_at.asc())
            )
        )
        if not venues:
            return MALL_CONTEXT

        venue_ids = [venue.id for venue in venues]

        tags_by_venue: dict = defaultdict(lambda: defaultdict(list))
        for tag in db.scalars(
            select(VenueTag)
            .where(VenueTag.venue_id.in_(venue_ids))
            .order_by(VenueTag.created_at.asc())
        ):
            tags_by_venue[tag.venue_id][tag.tag_type].append(tag.tag_value)

        items_by_venue: dict = defaultdict(list)
        for item in db.scalars(
            select(VenueItem)
            .where(
                VenueItem.venue_id.in_(venue_ids),
                VenueItem.item_type == "highlight",
            )
            .order_by(VenueItem.sort_order.asc(), VenueItem.created_at.asc())
        ):
            items_by_venue[item.venue_id].append(item.name)

        offers_by_venue: dict = defaultdict(list)
        for offer in db.scalars(
            select(Offer)
            .where(
                Offer.venue_id.in_(venue_ids),
                Offer.status == "active",
            )
            .order_by(Offer.created_at.asc())
        ):
            offers_by_venue[offer.venue_id].append(
                {"name": offer.title, "price": offer.price_text or ""}
            )

        media_by_venue: dict = {}
        for media in db.scalars(
            select(MediaAsset)
            .where(
                MediaAsset.target_type == "venue",
                MediaAsset.target_id.in_(venue_ids),
            )
            .order_by(MediaAsset.sort_order.asc(), MediaAsset.created_at.asc())
        ):
            media_by_venue.setdefault(media.target_id, media.url)

        restaurant_context = _build_restaurant_lines(
            venues,
            items_by_venue,
            tags_by_venue,
            offers_by_venue,
            media_by_venue,
        )

        return f"""
You are an AI Mall Assistant for "{mall.name}" located in {mall.city or "Shenzhen"}.
Mall description: {mall.description or "Shopping mall database context"}.

Restaurants at this mall:
{restaurant_context}
""".strip()
    except Exception:
        return MALL_CONTEXT
