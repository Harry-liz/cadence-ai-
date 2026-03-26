from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import ENABLE_DATABASE
from db.models import AgentMemory, SessionSummary, UserPreference, UserProfile, UserSession


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _resolve_user_id(db: Session, *, user_id: str | None, session_id: str | None) -> UUID | None:
    user_uuid = _parse_uuid(user_id)
    if user_uuid:
        return user_uuid

    session_uuid = _parse_uuid(session_id)
    if not session_uuid:
        return None

    session_obj = db.get(UserSession, session_uuid)
    return session_obj.user_id if session_obj else None


def build_user_context(
    db: Session,
    *,
    user_id: str | None,
    session_id: str | None,
    max_preferences: int = 6,
    max_memories: int = 4,
    max_summaries: int = 3,
) -> str:
    if not ENABLE_DATABASE:
        return ""

    resolved_user_id = _resolve_user_id(db, user_id=user_id, session_id=session_id)
    if not resolved_user_id:
        return ""

    profile = db.get(UserProfile, resolved_user_id)
    preferences = list(
        db.scalars(
            select(UserPreference)
            .where(UserPreference.user_id == resolved_user_id)
            .order_by(UserPreference.confidence.desc().nullslast(), UserPreference.updated_at.desc())
            .limit(max_preferences)
        )
    )
    memories = list(
        db.scalars(
            select(AgentMemory)
            .where(AgentMemory.user_id == resolved_user_id)
            .order_by(AgentMemory.importance.desc(), AgentMemory.created_at.desc())
            .limit(max_memories)
        )
    )
    summaries = list(
        db.scalars(
            select(SessionSummary)
            .join(UserSession, UserSession.id == SessionSummary.session_id)
            .where(UserSession.user_id == resolved_user_id)
            .order_by(SessionSummary.created_at.desc())
            .limit(max_summaries)
        )
    )

    sections: list[str] = []
    if profile and profile.profile_summary:
        sections.append(f"用户画像：{profile.profile_summary}")

    if preferences:
        preference_lines = [
            f"- {preference.preference_key}: {preference.preference_value}"
            for preference in preferences
        ]
        sections.append("历史偏好：\n" + "\n".join(preference_lines))

    if memories:
        memory_lines = [f"- {memory.content}" for memory in memories]
        sections.append("可参考记忆：\n" + "\n".join(memory_lines))

    if summaries:
        summary_lines = [
            f"- {summary.summary_text}"
            for summary in summaries
            if summary.summary_text
        ]
        if summary_lines:
            sections.append("近期会话摘要：\n" + "\n".join(summary_lines))

    if not sections:
        return ""

    sections.append("使用规则：以上内容仅作为弱个性化参考；若与本轮用户明确表达冲突，以本轮需求为准，不要过度脑补。")
    return "\n\n".join(sections)
