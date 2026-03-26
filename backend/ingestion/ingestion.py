from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import (
    DataSource,
    Event,
    Floor,
    KnowledgeChunk,
    Mall,
    Offer,
    RawSourceRecord,
    SyncJob,
    Venue,
    VenueTag,
)
from ingestion.file_parser import ParseResult, parse_file
from ingestion.nlu_extractor import ExtractedEntity, extract


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KNOWN_VENUE_TYPES = {
    "restaurant", "retail", "entertainment", "service", "cinema",
    "bookstore", "arcade", "garden", "event_space", "parking",
    "supermarket", "transit_access", "zone", "service_center",
    "cafe", "bar", "gym", "salon", "clinic", "education",
    "unknown",
}

# Lightweight fallback — only catches obvious mismatches that slip past the prompt.
# The LLM prompt already constrains venue_type to the enum list.
VENUE_TYPE_FALLBACK: dict[str, str] = {
    "餐厅": "restaurant",
    "餐饮": "restaurant",
    "dining": "restaurant",
    "咖啡": "cafe",
    "coffee": "cafe",
    "茶饮": "cafe",
    "零售": "retail",
    "购物": "retail",
    "娱乐": "entertainment",
    "影院": "cinema",
    "书店": "bookstore",
    "超市": "supermarket",
    "服务": "service",
}

KNOWN_FLOORS = {"B2", "B1", "L1", "L2", "L3", "L4", "L5", "L6"}

AUTO_APPROVE_THRESHOLD = 0.85


def normalize_venue_type(raw: str | None) -> str:
    """Normalize venue_type. The LLM prompt already constrains values,
    this is a lightweight safety net for edge cases."""
    if not raw:
        return "unknown"
    key = raw.strip().lower()
    if key in KNOWN_VENUE_TYPES:
        return key
    return VENUE_TYPE_FALLBACK.get(key, "unknown")


@dataclass
class EntityRecord:
    entity_type: str = ""
    confidence: float = 0.0
    status: str = ""
    data: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    source_row: int | None = None


@dataclass
class IngestResult:
    job_id: str = ""
    status: str = "completed"
    file_type: str = ""
    total_entities: int = 0
    auto_approved: int = 0
    pending_review: int = 0
    errors: list[str] = field(default_factory=list)
    stats: dict = field(default_factory=dict)
    entities: list[EntityRecord] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate_venue(data: dict) -> list[str]:
    warnings: list[str] = []
    if not data.get("name"):
        warnings.append("Missing venue name")
    vt = normalize_venue_type(data.get("venue_type"))
    if vt == "unknown" and data.get("venue_type"):
        warnings.append(f"venue_type normalized to unknown (raw: {data['venue_type']})")
    fc = data.get("floor_code")
    if fc and fc.upper() not in KNOWN_FLOORS:
        warnings.append(f"Unknown floor_code: {fc}")
    budget = data.get("budget_text")
    if budget and not re.search(r"\d", budget):
        warnings.append(f"budget_text has no digits: {budget}")
    rating = data.get("rating")
    if rating is not None:
        try:
            r = float(rating)
            if r < 0 or r > 5:
                warnings.append(f"rating out of range: {rating}")
        except (ValueError, TypeError):
            warnings.append(f"Invalid rating: {rating}")
    return warnings


def _validate_event(data: dict) -> list[str]:
    warnings: list[str] = []
    if not data.get("title"):
        warnings.append("Missing event title")
    return warnings


def _validate_offer(data: dict) -> list[str]:
    warnings: list[str] = []
    if not data.get("title"):
        warnings.append("Missing offer title")
    return warnings


VALIDATORS = {
    "venue": _validate_venue,
    "event": _validate_event,
    "offer": _validate_offer,
}


def validate_entity(entity: ExtractedEntity) -> list[str]:
    validator = VALIDATORS.get(entity.entity_type)
    if validator:
        return validator(entity.data)
    return []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def stable_external_id(prefix: str, value: str) -> str:
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}:{digest}"


def _parse_rating(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        r = float(value)
        return r if 0 <= r <= 5 else None
    except (ValueError, TypeError):
        return None


def _get_or_create_source(db: Session, source_name: str) -> DataSource:
    source = db.scalar(
        select(DataSource).where(DataSource.source_name == source_name)
    )
    if source:
        return source

    source = DataSource(
        source_name=source_name,
        source_type="file_upload",
        status="active",
        meta={},
    )
    db.add(source)
    db.flush()
    return source


def _create_sync_job(db: Session, source_id: UUID, file_type: str) -> SyncJob:
    job = SyncJob(
        source_id=source_id,
        job_type="file_ingest",
        status="processing",
        stats={"file_type": file_type},
    )
    db.add(job)
    db.flush()
    return job


def _get_floor_map(db: Session, mall_id: UUID) -> dict[str, Floor]:
    floors = list(db.scalars(select(Floor).where(Floor.mall_id == mall_id)))
    return {f.floor_code: f for f in floors}


# ---------------------------------------------------------------------------
# Upsert functions
# ---------------------------------------------------------------------------

def _upsert_venue(
    db: Session,
    mall_id: UUID,
    floor_map: dict[str, Floor],
    data: dict,
    source_label: str,
) -> tuple[str, UUID]:
    """Upsert a venue. Returns (action, venue_id)."""
    name = data["name"]
    external_id = stable_external_id("ingest", name)

    floor_code = (data.get("floor_code") or "").upper().strip()
    floor = floor_map.get(floor_code)

    venue = db.scalar(
        select(Venue).where(Venue.mall_id == mall_id, Venue.external_id == external_id)
    )
    normalized_type = normalize_venue_type(data.get("venue_type"))

    action = "updated" if venue else "created"
    if not venue:
        venue = Venue(
            mall_id=mall_id,
            external_id=external_id,
            name=name,
            venue_type=normalized_type,
        )
        db.add(venue)

    venue.name = name
    venue.venue_type = normalized_type
    venue.category = data.get("category") or venue.category
    venue.description = data.get("description") or venue.description
    venue.budget_text = data.get("budget_text") or venue.budget_text
    venue.rating = _parse_rating(data.get("rating")) or venue.rating
    venue.location_code = data.get("location_code") or venue.location_code
    venue.floor_id = floor.id if floor else venue.floor_id
    venue.source = source_label
    venue.status = "active"
    db.flush()

    tags = data.get("tags", [])
    if tags:
        existing_tags = set()
        for tag in db.scalars(select(VenueTag).where(VenueTag.venue_id == venue.id)):
            existing_tags.add((tag.tag_type, tag.tag_value))
        for tag_pair in tags:
            if isinstance(tag_pair, (list, tuple)) and len(tag_pair) >= 2:
                tag_type, tag_value = str(tag_pair[0]), str(tag_pair[1])
                if (tag_type, tag_value) not in existing_tags:
                    db.add(VenueTag(
                        venue_id=venue.id,
                        tag_type=tag_type,
                        tag_value=tag_value,
                    ))

    return action, venue.id


def _upsert_event(
    db: Session,
    mall_id: UUID,
    data: dict,
) -> tuple[str, UUID]:
    """Upsert an event. Returns (action, event_id)."""
    title = data["title"]
    external_id = stable_external_id("ingest", title)

    event = db.scalar(
        select(Event).where(Event.mall_id == mall_id, Event.external_id == external_id)
    )
    action = "updated" if event else "created"
    if not event:
        event = Event(
            mall_id=mall_id,
            external_id=external_id,
            title=title,
        )
        db.add(event)

    event.title = title
    event.event_type = data.get("event_type") or event.event_type
    event.description = data.get("description") or event.description
    event.status = data.get("status", "scheduled")
    event.meta = {
        **(event.meta or {}),
        "ingested": True,
        "raw_start_time": data.get("start_time"),
        "raw_end_time": data.get("end_time"),
    }
    db.flush()
    return action, event.id


def _upsert_offer(
    db: Session,
    mall_id: UUID,
    data: dict,
) -> tuple[str, UUID]:
    """Create an offer. Returns (action, offer_id)."""
    title = data["title"]

    venue_name = data.get("venue_name")
    venue_id = None
    if venue_name:
        venue = db.scalar(
            select(Venue).where(Venue.mall_id == mall_id, Venue.name == venue_name)
        )
        if venue:
            venue_id = venue.id

    if not venue_id:
        venue = db.scalar(
            select(Venue).where(Venue.mall_id == mall_id).limit(1)
        )
        if venue:
            venue_id = venue.id

    if not venue_id:
        return "skipped", UUID(int=0)

    offer = Offer(
        venue_id=venue_id,
        title=title,
        price_text=data.get("price_text"),
        description=data.get("description"),
        status="active",
        meta={"ingested": True},
    )
    db.add(offer)
    db.flush()
    return "created", offer.id


def _create_knowledge(
    db: Session,
    mall_id: UUID,
    source_id: UUID,
    data: dict,
) -> tuple[str, UUID]:
    """Create a knowledge chunk. Returns (action, chunk_id)."""
    chunk = KnowledgeChunk(
        mall_id=mall_id,
        source_type="file_ingestion",
        source_ref_id=source_id,
        title=data.get("title"),
        content=data.get("content", ""),
        meta={"ingested": True},
    )
    db.add(chunk)
    db.flush()
    return "created", chunk.id


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def ingest_file(
    db: Session,
    *,
    file_path: str,
    mall_code: str = "c_future_city",
    source_name: str = "file_upload",
    hint: str | None = None,
    auto_approve: bool = True,
) -> IngestResult:
    """
    Full ingestion pipeline: parse → extract → validate → write to DB.
    """
    result = IngestResult()

    # --- Resolve mall ---
    mall = db.scalar(select(Mall).where(Mall.code == mall_code))
    if not mall:
        result.status = "failed"
        result.errors.append(f"Mall not found: {mall_code}")
        return result

    # --- Parse file ---
    parse_result = parse_file(file_path)
    result.file_type = parse_result.file_type

    if parse_result.metadata.get("error"):
        result.status = "failed"
        result.errors.append(parse_result.metadata["error"])
        return result

    # --- Create data source and sync job ---
    source = _get_or_create_source(db, source_name)
    job = _create_sync_job(db, source.id, parse_result.file_type)
    result.job_id = str(job.id)

    # --- Extract entities ---
    try:
        entities = await extract(parse_result, hint=hint)
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        db.flush()
        result.status = "failed"
        result.errors.append(f"Extraction failed: {exc}")
        return result

    result.total_entities = len(entities)
    if not entities:
        job.status = "completed"
        job.stats = {"total": 0}
        db.flush()
        result.status = "completed"
        return result

    # --- Validate and write ---
    floor_map = _get_floor_map(db, mall.id)
    source_label = f"ingest:{source.id}"
    counters: dict[str, int] = {}

    for entity in entities:
        validation_warnings = validate_entity(entity)
        entity.warnings.extend(validation_warnings)

        has_critical_warning = any("Missing" in w for w in entity.warnings)
        approved = (
            auto_approve
            and entity.confidence >= AUTO_APPROVE_THRESHOLD
            and not has_critical_warning
        )

        record_status = "approved" if approved else "pending_review"

        # Always write to raw_source_records
        raw_record = RawSourceRecord(
            source_id=source.id,
            entity_type=entity.entity_type,
            external_id=None,
            raw_payload={
                "entity_type": entity.entity_type,
                "confidence": entity.confidence,
                "data": entity.data,
                "warnings": entity.warnings,
                "source_row": entity.source_row,
                "status": record_status,
            },
        )
        db.add(raw_record)

        # Collect for response
        result.entities.append(EntityRecord(
            entity_type=entity.entity_type,
            confidence=entity.confidence,
            status=record_status,
            data=entity.data,
            warnings=entity.warnings,
            source_row=entity.source_row,
        ))

        if not approved:
            result.pending_review += 1
            continue

        # Upsert to business tables
        try:
            if entity.entity_type == "venue":
                action, _ = _upsert_venue(db, mall.id, floor_map, entity.data, source_label)
                key = f"venues_{action}"
            elif entity.entity_type == "event":
                action, _ = _upsert_event(db, mall.id, entity.data)
                key = f"events_{action}"
            elif entity.entity_type == "offer":
                action, _ = _upsert_offer(db, mall.id, entity.data)
                key = f"offers_{action}"
            elif entity.entity_type == "knowledge":
                action, _ = _create_knowledge(db, mall.id, source.id, entity.data)
                key = f"knowledge_{action}"
            else:
                key = f"{entity.entity_type}_skipped"

            counters[key] = counters.get(key, 0) + 1
            result.auto_approved += 1
        except Exception as exc:
            result.errors.append(f"Row {entity.source_row}: {exc}")

    # --- Finalize sync job ---
    job.status = "completed"
    job.stats = {
        "total_entities": result.total_entities,
        "auto_approved": result.auto_approved,
        "pending_review": result.pending_review,
        "errors": len(result.errors),
        **counters,
    }
    from datetime import datetime, timezone
    job.ended_at = datetime.now(timezone.utc)
    db.flush()

    result.stats = counters
    result.status = "completed" if not result.errors else "partial"
    return result
