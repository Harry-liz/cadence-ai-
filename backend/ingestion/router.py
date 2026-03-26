from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from config import ENABLE_DATABASE
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
from db.session import get_db
from ingestion.ingestion import (
    IngestResult,
    _get_floor_map,
    _upsert_event,
    _upsert_offer,
    _upsert_venue,
    _create_knowledge,
    ingest_file,
    stable_external_id,
)

router = APIRouter(prefix="/api/ingest", tags=["ingestion"])

UPLOAD_DIR = Path(
    os.getenv(
        "UPLOAD_DIR",
        str(Path(tempfile.gettempdir()) / "cadence-ai-uploads"),
    )
)
_HTML_PAGE = Path(__file__).resolve().parent / "upload_page.html"


@router.get("/ui", response_class=HTMLResponse, include_in_schema=False)
async def upload_ui():
    return HTMLResponse(_HTML_PAGE.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class ExtractedRecord(BaseModel):
    entity_type: str
    confidence: float
    status: str
    data: dict
    warnings: list[str] = Field(default_factory=list)
    source_row: int | None = None


class IngestResponse(BaseModel):
    job_id: str
    status: str
    file_type: str
    total_entities: int
    auto_approved: int
    pending_review: int
    errors: list[str] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)
    entities: list[ExtractedRecord] = Field(default_factory=list)


class JobDetail(BaseModel):
    job_id: str
    source_name: str
    job_type: str
    status: str
    started_at: str
    ended_at: str | None
    error_message: str | None
    stats: dict


class PendingRecord(BaseModel):
    record_id: str
    entity_type: str
    confidence: float
    data: dict
    warnings: list[str]
    source_row: int | None


class ApproveResponse(BaseModel):
    status: str
    entity_type: str
    action: str
    entity_id: str


# ---------------------------------------------------------------------------
# POST /api/ingest/upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=IngestResponse)
async def upload_file(
    file: UploadFile = File(...),
    mall_code: str = Form(default="c_future_city"),
    source_name: str = Form(default="file_upload"),
    hint: str = Form(default=""),
    auto_approve: bool = Form(default=True),
    db: Session = Depends(get_db),
):
    """Upload a file for data ingestion."""
    if not ENABLE_DATABASE:
        raise HTTPException(status_code=503, detail="Database is not enabled")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())[:8]
    original_name = file.filename or "unknown"
    ext = Path(original_name).suffix
    saved_name = f"{file_id}_{original_name}"
    saved_path = UPLOAD_DIR / saved_name

    with open(saved_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = await ingest_file(
            db,
            file_path=str(saved_path),
            mall_code=mall_code,
            source_name=source_name,
            hint=hint or None,
            auto_approve=auto_approve,
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    return IngestResponse(
        job_id=result.job_id,
        status=result.status,
        file_type=result.file_type,
        total_entities=result.total_entities,
        auto_approved=result.auto_approved,
        pending_review=result.pending_review,
        errors=result.errors,
        stats=result.stats,
        entities=[
            ExtractedRecord(
                entity_type=e.entity_type,
                confidence=e.confidence,
                status=e.status,
                data=e.data,
                warnings=e.warnings,
                source_row=e.source_row,
            )
            for e in result.entities
        ],
    )


# ---------------------------------------------------------------------------
# GET /api/ingest/jobs/{job_id}
# ---------------------------------------------------------------------------

@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(job_id: str, db: Session = Depends(get_db)):
    """Get details of an ingestion job."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = db.get(SyncJob, job_uuid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    source = db.get(DataSource, job.source_id)
    return JobDetail(
        job_id=str(job.id),
        source_name=source.source_name if source else "unknown",
        job_type=job.job_type,
        status=job.status,
        started_at=job.started_at.isoformat(),
        ended_at=job.ended_at.isoformat() if job.ended_at else None,
        error_message=job.error_message,
        stats=job.stats or {},
    )


# ---------------------------------------------------------------------------
# GET /api/ingest/jobs/{job_id}/records
# ---------------------------------------------------------------------------

@router.get("/jobs/{job_id}/records", response_model=list[ExtractedRecord])
async def get_job_records(job_id: str, db: Session = Depends(get_db)):
    """Get all extracted records for a specific ingestion job."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = db.get(SyncJob, job_uuid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    records = list(db.scalars(
        select(RawSourceRecord)
        .where(RawSourceRecord.source_id == job.source_id)
        .order_by(RawSourceRecord.fetched_at.desc())
        .limit(200)
    ))

    results: list[ExtractedRecord] = []
    for record in records:
        payload = record.raw_payload or {}
        results.append(ExtractedRecord(
            entity_type=payload.get("entity_type", "unknown"),
            confidence=payload.get("confidence", 0),
            status=payload.get("status", "unknown"),
            data=payload.get("data", {}),
            warnings=payload.get("warnings", []),
            source_row=payload.get("source_row"),
        ))

    return results


# ---------------------------------------------------------------------------
# GET /api/ingest/pending
# ---------------------------------------------------------------------------

@router.get("/pending", response_model=list[PendingRecord])
async def list_pending(
    mall_code: str = "c_future_city",
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List records pending manual review."""
    records = list(db.scalars(
        select(RawSourceRecord)
        .order_by(RawSourceRecord.fetched_at.desc())
        .limit(limit * 3)
    ))

    pending: list[PendingRecord] = []
    for record in records:
        payload = record.raw_payload or {}
        if payload.get("status") != "pending_review":
            continue
        pending.append(PendingRecord(
            record_id=str(record.id),
            entity_type=payload.get("entity_type", "unknown"),
            confidence=payload.get("confidence", 0),
            data=payload.get("data", {}),
            warnings=payload.get("warnings", []),
            source_row=payload.get("source_row"),
        ))
        if len(pending) >= limit:
            break

    return pending


# ---------------------------------------------------------------------------
# POST /api/ingest/approve/{record_id}
# ---------------------------------------------------------------------------

@router.post("/approve/{record_id}", response_model=ApproveResponse)
async def approve_record(
    record_id: str,
    mall_code: str = Form(default="c_future_city"),
    db: Session = Depends(get_db),
):
    """Manually approve a pending record and write it to business tables."""
    try:
        record_uuid = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid record ID")

    record = db.get(RawSourceRecord, record_uuid)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    payload = record.raw_payload or {}
    if payload.get("status") != "pending_review":
        raise HTTPException(status_code=400, detail="Record is not pending review")

    mall = db.scalar(select(Mall).where(Mall.code == mall_code))
    if not mall:
        raise HTTPException(status_code=404, detail=f"Mall not found: {mall_code}")

    entity_type = payload.get("entity_type", "knowledge")
    data = payload.get("data", {})
    source_label = f"ingest:{record.source_id}"

    try:
        if entity_type == "venue":
            floor_map = _get_floor_map(db, mall.id)
            action, entity_id = _upsert_venue(db, mall.id, floor_map, data, source_label)
        elif entity_type == "event":
            action, entity_id = _upsert_event(db, mall.id, data)
        elif entity_type == "offer":
            action, entity_id = _upsert_offer(db, mall.id, data)
        elif entity_type == "knowledge":
            action, entity_id = _create_knowledge(db, mall.id, record.source_id, data)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown entity_type: {entity_type}")

        payload["status"] = "approved"
        record.raw_payload = payload
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(record, "raw_payload")
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    return ApproveResponse(
        status="approved",
        entity_type=entity_type,
        action=action,
        entity_id=str(entity_id),
    )
