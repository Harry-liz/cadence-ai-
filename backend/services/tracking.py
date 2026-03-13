from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import ENABLE_DATABASE
from db.models import (
    Feedback,
    InteractionEvent,
    Mall,
    Message,
    PlanResult,
    RecommendationResult,
    User,
    UserSession,
)

DEFAULT_MALL_CODE = "c_future_city"
SESSION_IDLE_TIMEOUT = timedelta(minutes=30)


@dataclass
class TrackingContext:
    user_id: str | None = None
    session_id: str | None = None
    enabled: bool = False


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_session_expired(session_obj: UserSession, now: datetime) -> bool:
    last_activity = session_obj.last_activity_at or session_obj.started_at
    return now - last_activity > SESSION_IDLE_TIMEOUT


def ensure_tracking_context(
    db: Session,
    *,
    user_id: str | None,
    session_id: str | None,
    channel: str = "web",
) -> TrackingContext:
    if not ENABLE_DATABASE:
        return TrackingContext(user_id=user_id, session_id=session_id, enabled=False)

    try:
        now = _utcnow()
        user_uuid = _parse_uuid(user_id)
        session_uuid = _parse_uuid(session_id)

        session_obj = db.get(UserSession, session_uuid) if session_uuid else None
        user_obj = db.get(User, user_uuid) if user_uuid else None

        if session_obj and not user_obj:
            user_obj = db.get(User, session_obj.user_id)

        if not user_obj:
            user_obj = User(channel=channel)
            db.add(user_obj)
            db.flush()

        mall = db.scalar(select(Mall).where(Mall.code == DEFAULT_MALL_CODE))

        if session_obj and session_obj.user_id == user_obj.id and _is_session_expired(session_obj, now):
            session_obj.status = "expired"
            session_obj.ended_at = session_obj.last_activity_at
            session_obj = None

        if not session_obj or session_obj.user_id != user_obj.id:
            session_obj = UserSession(
                user_id=user_obj.id,
                mall_id=mall.id if mall else None,
                session_type="chat",
                status="active",
                started_at=now,
                last_activity_at=now,
            )
            db.add(session_obj)
            db.flush()
        else:
            session_obj.last_activity_at = now
            db.flush()

        return TrackingContext(
            user_id=str(user_obj.id),
            session_id=str(session_obj.id),
            enabled=True,
        )
    except Exception:
        db.rollback()
        return TrackingContext(user_id=user_id, session_id=session_id, enabled=False)


def save_message(
    db: Session,
    *,
    session_id: str | None,
    role: str,
    content: str,
    intent: str | None = None,
    metadata: dict | None = None,
) -> None:
    if not ENABLE_DATABASE:
        return

    session_uuid = _parse_uuid(session_id)
    if not session_uuid:
        return

    try:
        session_obj = db.get(UserSession, session_uuid)
        if session_obj:
            session_obj.last_activity_at = _utcnow()
        db.add(
            Message(
                session_id=session_uuid,
                role=role,
                content=content,
                intent=intent,
                meta=metadata or {},
            )
        )
        db.flush()
    except Exception:
        db.rollback()


def save_recommendation_result(
    db: Session,
    *,
    session_id: str | None,
    user_id: str | None,
    recommendation_type: str,
    request_payload: dict,
    result_payload: dict,
    model_name: str | None,
) -> None:
    if not ENABLE_DATABASE:
        return

    session_uuid = _parse_uuid(session_id)
    if not session_uuid:
        return

    try:
        db.add(
            RecommendationResult(
                session_id=session_uuid,
                user_id=_parse_uuid(user_id),
                recommendation_type=recommendation_type,
                request_payload=request_payload,
                result_payload=result_payload,
                model_name=model_name,
            )
        )
        db.flush()
    except Exception:
        db.rollback()


def save_plan_result(
    db: Session,
    *,
    session_id: str | None,
    user_id: str | None,
    request_payload: dict,
    summary: str,
    steps: list[str],
    tip: str,
    suggestions: list[str],
) -> None:
    if not ENABLE_DATABASE:
        return

    session_uuid = _parse_uuid(session_id)
    if not session_uuid:
        return

    try:
        db.add(
            PlanResult(
                session_id=session_uuid,
                user_id=_parse_uuid(user_id),
                scene=request_payload.get("scene"),
                duration_hours=request_payload.get("duration_hours"),
                budget=request_payload.get("budget"),
                arrival_time=request_payload.get("arrival_time"),
                summary=summary,
                steps=steps,
                tip=tip,
                suggestions=suggestions,
            )
        )
        db.flush()
    except Exception:
        db.rollback()


def save_interaction_event(
    db: Session,
    *,
    session_id: str | None,
    user_id: str | None,
    event_type: str,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict | None = None,
) -> None:
    if not ENABLE_DATABASE:
        return

    session_uuid = _parse_uuid(session_id)
    if not session_uuid:
        return

    try:
        session_obj = db.get(UserSession, session_uuid)
        if session_obj:
            session_obj.last_activity_at = _utcnow()
        db.add(
            InteractionEvent(
                session_id=session_uuid,
                user_id=_parse_uuid(user_id),
                event_type=event_type,
                target_type=target_type,
                target_id=_parse_uuid(target_id),
                payload=payload or {},
            )
        )
        db.flush()
    except Exception:
        db.rollback()


def save_feedback(
    db: Session,
    *,
    session_id: str | None,
    user_id: str | None,
    target_type: str,
    target_id: str | None = None,
    rating: int | None = None,
    comment: str | None = None,
    payload: dict | None = None,
) -> None:
    if not ENABLE_DATABASE:
        return

    session_uuid = _parse_uuid(session_id)

    try:
        if session_uuid:
            session_obj = db.get(UserSession, session_uuid)
            if session_obj:
                session_obj.last_activity_at = _utcnow()
        db.add(
            Feedback(
                session_id=session_uuid,
                user_id=_parse_uuid(user_id),
                target_type=target_type,
                target_id=_parse_uuid(target_id),
                rating=rating,
                comment=comment,
                payload=payload or {},
            )
        )
        db.flush()
    except Exception:
        db.rollback()


def safe_commit(db: Session) -> None:
    if not ENABLE_DATABASE:
        return

    try:
        db.commit()
    except Exception:
        db.rollback()
