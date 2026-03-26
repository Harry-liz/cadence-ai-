from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base, TimestampMixin, UpdatedAtMixin


def uuid_column() -> Mapped[UUID]:
    return mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)


class Mall(Base, TimestampMixin, UpdatedAtMixin):
    __tablename__ = "malls"

    id: Mapped[UUID] = uuid_column()
    code: Mapped[str | None] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="Asia/Shanghai")
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")


class Floor(Base, TimestampMixin):
    __tablename__ = "floors"
    __table_args__ = (UniqueConstraint("mall_id", "floor_code", name="uq_floors_mall_floor_code"),)

    id: Mapped[UUID] = uuid_column()
    mall_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"), nullable=False)
    floor_code: Mapped[str] = mapped_column(Text, nullable=False)
    floor_name: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Venue(Base, TimestampMixin, UpdatedAtMixin):
    __tablename__ = "venues"
    __table_args__ = (UniqueConstraint("mall_id", "external_id", name="uq_venues_mall_external_id"),)

    id: Mapped[UUID] = uuid_column()
    mall_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"), nullable=False)
    floor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("floors.id", ondelete="SET NULL"))
    external_id: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    venue_type: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    budget_text: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    location_code: Mapped[str | None] = mapped_column(Text)
    open_hours: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    source: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class VenueTag(Base, TimestampMixin):
    __tablename__ = "venue_tags"
    __table_args__ = (UniqueConstraint("venue_id", "tag_type", "tag_value", name="uq_venue_tags_value"),)

    id: Mapped[UUID] = uuid_column()
    venue_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    tag_type: Mapped[str] = mapped_column(Text, nullable=False)
    tag_value: Mapped[str] = mapped_column(Text, nullable=False)


class VenueItem(Base, TimestampMixin):
    __tablename__ = "venue_items"

    id: Mapped[UUID] = uuid_column()
    venue_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    item_type: Mapped[str] = mapped_column(Text, nullable=False, default="highlight")
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price_text: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class Offer(Base, TimestampMixin, UpdatedAtMixin):
    __tablename__ = "offers"

    id: Mapped[UUID] = uuid_column()
    venue_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    price_text: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class Event(Base, TimestampMixin, UpdatedAtMixin):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("mall_id", "external_id", name="uq_events_mall_external_id"),)

    id: Mapped[UUID] = uuid_column()
    mall_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"), nullable=False)
    venue_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"))
    external_id: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False, default="scheduled")
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class MediaAsset(Base, TimestampMixin):
    __tablename__ = "media_assets"

    id: Mapped[UUID] = uuid_column()
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    asset_type: Mapped[str] = mapped_column(Text, nullable=False, default="image")
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt_text: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class User(Base, TimestampMixin, UpdatedAtMixin):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("channel", "external_user_id", name="uq_users_channel_external"),)

    id: Mapped[UUID] = uuid_column()
    external_user_id: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(Text, nullable=False, default="web")
    nickname: Mapped[str | None] = mapped_column(Text)
    locale: Mapped[str | None] = mapped_column(Text, default="zh-CN")


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[UUID] = uuid_column()
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mall_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="SET NULL"))
    session_type: Mapped[str] = mapped_column(Text, nullable=False, default="chat")
    entry_source: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id: Mapped[UUID] = uuid_column()
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class InteractionEvent(Base, TimestampMixin):
    __tablename__ = "interaction_events"

    id: Mapped[UUID] = uuid_column()
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str | None] = mapped_column(Text)
    target_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class RecommendationResult(Base, TimestampMixin):
    __tablename__ = "recommendation_results"

    id: Mapped[UUID] = uuid_column()
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    recommendation_type: Mapped[str] = mapped_column(Text, nullable=False)
    request_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_name: Mapped[str | None] = mapped_column(Text)


class PlanResult(Base, TimestampMixin):
    __tablename__ = "plan_results"

    id: Mapped[UUID] = uuid_column()
    session_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    scene: Mapped[str | None] = mapped_column(Text)
    duration_hours: Mapped[int | None] = mapped_column(Integer)
    budget: Mapped[int | None] = mapped_column(Integer)
    arrival_time: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    tip: Mapped[str | None] = mapped_column(Text)
    suggestions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class Feedback(Base, TimestampMixin):
    __tablename__ = "feedback"
    __table_args__ = (CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_feedback_rating_range"),)

    id: Mapped[UUID] = uuid_column()
    session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"))
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    rating: Mapped[int | None] = mapped_column(SmallInteger)
    comment: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    preferred_budget_min: Mapped[int | None] = mapped_column(Integer)
    preferred_budget_max: Mapped[int | None] = mapped_column(Integer)
    preferred_scene: Mapped[str | None] = mapped_column(Text)
    preferred_visit_time: Mapped[str | None] = mapped_column(Text)
    family_structure: Mapped[str | None] = mapped_column(Text)
    mobility_constraints: Mapped[str | None] = mapped_column(Text)
    profile_summary: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (UniqueConstraint("user_id", "preference_key", "preference_value", name="uq_user_preferences_value"),)

    id: Mapped[UUID] = uuid_column()
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    preference_key: Mapped[str] = mapped_column(Text, nullable=False)
    preference_value: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    source_message_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AgentMemory(Base, TimestampMixin):
    __tablename__ = "agent_memories"
    __table_args__ = (CheckConstraint("importance BETWEEN 1 AND 5", name="ck_agent_memories_importance_range"),)

    id: Mapped[UUID] = uuid_column()
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"))
    memory_type: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    importance: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_ref_type: Mapped[str | None] = mapped_column(Text)
    source_ref_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))


class KnowledgeChunk(Base, TimestampMixin):
    __tablename__ = "knowledge_chunks"

    id: Mapped[UUID] = uuid_column()
    mall_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"))
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class MemoryEmbedding(Base):
    __tablename__ = "memory_embeddings"

    id: Mapped[UUID] = uuid_column()
    memory_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent_memories.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    embedding_model: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KnowledgeEmbedding(Base):
    __tablename__ = "knowledge_embeddings"

    id: Mapped[UUID] = uuid_column()
    knowledge_chunk_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("knowledge_chunks.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    embedding_model: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DataSource(Base, TimestampMixin):
    __tablename__ = "data_sources"

    id: Mapped[UUID] = uuid_column()
    source_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    meta: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)


class RawSourceRecord(Base):
    __tablename__ = "raw_source_records"

    id: Mapped[UUID] = uuid_column()
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    external_id: Mapped[str | None] = mapped_column(Text)
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[UUID] = uuid_column()
    source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False)
    job_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class UserSegment(Base, TimestampMixin):
    __tablename__ = "user_segments"

    id: Mapped[UUID] = uuid_column()
    segment_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    segment_type: Mapped[str] = mapped_column(Text, nullable=False)
    definition_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class AnonUser(Base):
    __tablename__ = "anon_users"

    anon_user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    segment_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("user_segments.id", ondelete="SET NULL"))


class SessionSummary(Base, TimestampMixin):
    __tablename__ = "session_summaries"

    id: Mapped[UUID] = uuid_column()
    session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    mall_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="SET NULL"))
    anon_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("anon_users.anon_user_id", ondelete="SET NULL"))
    primary_intent: Mapped[str | None] = mapped_column(Text)
    scene_tag: Mapped[str | None] = mapped_column(Text)
    budget_segment: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    venue_count_viewed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recommendation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    feedback_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    summary_text: Mapped[str | None] = mapped_column(Text)


class VenuePerformanceDaily(Base):
    __tablename__ = "venue_performance_daily"
    __table_args__ = (
        PrimaryKeyConstraint("metric_date", "mall_id", "venue_id", name="pk_venue_performance_daily"),
    )

    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    mall_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"), nullable=False)
    venue_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    exposure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    click_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recommend_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    route_add_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    positive_feedback_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    negative_feedback_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class VenueEngagementDaily(Base):
    __tablename__ = "venue_engagement_daily"
    __table_args__ = (
        PrimaryKeyConstraint("metric_date", "mall_id", "source", "venue_name", name="pk_venue_engagement_daily"),
    )

    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    mall_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="dining_recommendation")
    venue_name: Mapped[str] = mapped_column(Text, nullable=False)
    venue_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"))
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meaningful_view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quick_skip_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_dwell_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_dwell_ms: Mapped[int | None] = mapped_column(Integer)
    median_dwell_ms: Mapped[int | None] = mapped_column(Integer)
    max_dwell_ms: Mapped[int | None] = mapped_column(Integer)


class MallDemandDaily(Base):
    __tablename__ = "mall_demand_daily"
    __table_args__ = (
        PrimaryKeyConstraint(
            "metric_date",
            "mall_id",
            "intent",
            "scene",
            "budget_segment",
            name="pk_mall_demand_daily",
        ),
    )

    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    mall_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="CASCADE"), nullable=False)
    intent: Mapped[str] = mapped_column(Text, nullable=False)
    scene: Mapped[str | None] = mapped_column(Text)
    budget_segment: Mapped[str | None] = mapped_column(Text)
    demand_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class FactRecommendation(Base, TimestampMixin):
    __tablename__ = "fact_recommendation"

    id: Mapped[UUID] = uuid_column()
    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    mall_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="SET NULL"))
    anon_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("anon_users.anon_user_id", ondelete="SET NULL"))
    session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"))
    recommendation_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("recommendation_results.id", ondelete="SET NULL"),
    )
    recommendation_type: Mapped[str] = mapped_column(Text, nullable=False)
    venue_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"))
    was_clicked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    was_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    feedback_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))


class FactInterestSignal(Base, TimestampMixin):
    __tablename__ = "fact_interest_signal"

    id: Mapped[UUID] = uuid_column()
    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    mall_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("malls.id", ondelete="SET NULL"))
    anon_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("anon_users.anon_user_id", ondelete="SET NULL"))
    session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"))
    signal_type: Mapped[str] = mapped_column(Text, nullable=False)
    signal_value: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
