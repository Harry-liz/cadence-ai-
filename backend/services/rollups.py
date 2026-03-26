from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import (
    AgentMemory,
    AnonUser,
    Feedback,
    InteractionEvent,
    Message,
    PlanResult,
    RecommendationResult,
    SessionSummary,
    UserProfile,
    UserPreference,
    UserSession,
    Venue,
    VenueEngagementDaily,
    VenuePerformanceDaily,
)

IDLE_SUMMARY_THRESHOLD = timedelta(minutes=30)
SCENE_KEYWORDS = {
    "两个人约会": ["约会", "情侣", "两个人"],
    "带小孩来玩": ["带小孩", "带娃", "亲子", "小朋友"],
    "朋友聚会": ["朋友聚会", "聚会", "多人"],
    "和家人": ["家人", "带老人", "一家人", "父母"],
}
BUDGET_SEGMENTS = [
    (0, 80, "0-80"),
    (81, 150, "81-150"),
    (151, 300, "151-300"),
    (301, 999999, "301+"),
]
PREFERENCE_PATTERNS = {
    "ambiance": ["安静", "热闹", "适合聊天", "适合拍照"],
    "facility": ["宝宝椅", "包厢", "停车", "可带宠物"],
    "taste": ["辣", "咖啡", "甜品", "下午茶", "火锅", "烤鱼"],
}
DINING_DWELL_SOURCE = "dining_recommendation"
MIN_VALID_DWELL_MS = 800
QUICK_SKIP_MAX_MS = 2000
MEANINGFUL_VIEW_MIN_MS = 3000


@dataclass
class SessionRollupResult:
    session_id: str
    summary_created: bool
    memory_count: int
    preference_count: int


@dataclass
class VenueEngagementRollupResult:
    metric_date: str
    source: str
    venue_name: str
    view_count: int


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_ready_for_rollup(session_obj: UserSession, now: datetime) -> bool:
    if session_obj.ended_at is not None:
        return True
    if session_obj.status in {"expired", "closed"}:
        return True
    last_activity = session_obj.last_activity_at or session_obj.started_at
    return (now - last_activity) >= IDLE_SUMMARY_THRESHOLD


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _extract_int(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


def _resolve_venue_by_name(
    db: Session,
    *,
    mall_id,
    venue_name: str,
    venue_cache: dict[tuple[object, str], Venue | None],
) -> Venue | None:
    cache_key = (mall_id, venue_name)
    if cache_key in venue_cache:
        return venue_cache[cache_key]

    venue = db.scalar(
        select(Venue)
        .where(Venue.mall_id == mall_id, Venue.name == venue_name)
        .limit(1)
    )
    venue_cache[cache_key] = venue
    return venue


def _collect_messages(db: Session, session_id) -> list[Message]:
    return list(
        db.scalars(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.asc())
        )
    )


def _collect_events(db: Session, session_id) -> list[InteractionEvent]:
    return list(
        db.scalars(
            select(InteractionEvent)
            .where(InteractionEvent.session_id == session_id)
            .order_by(InteractionEvent.created_at.asc())
        )
    )


def _collect_feedback(db: Session, session_id) -> list[Feedback]:
    return list(
        db.scalars(
            select(Feedback)
            .where(Feedback.session_id == session_id)
            .order_by(Feedback.created_at.asc())
        )
    )


def _collect_plan_results(db: Session, session_id) -> list[PlanResult]:
    return list(
        db.scalars(
            select(PlanResult)
            .where(PlanResult.session_id == session_id)
            .order_by(PlanResult.created_at.asc())
        )
    )


def _collect_recommendations(db: Session, session_id) -> list[RecommendationResult]:
    return list(
        db.scalars(
            select(RecommendationResult)
            .where(RecommendationResult.session_id == session_id)
            .order_by(RecommendationResult.created_at.asc())
        )
    )


def _infer_primary_intent(messages: list[Message], recommendations: list[RecommendationResult], plans: list[PlanResult]) -> str | None:
    intent_counter = Counter(message.intent for message in messages if message.intent)
    if plans:
        intent_counter["day_plan"] += len(plans)
    for recommendation in recommendations:
        intent_counter[f"{recommendation.recommendation_type}_recommendation"] += 1
    if not intent_counter:
        return None
    return intent_counter.most_common(1)[0][0]


def _infer_scene(messages: list[Message], plans: list[PlanResult]) -> str | None:
    if plans:
        for plan in reversed(plans):
            if plan.scene:
                return plan.scene

    full_text = "\n".join(_normalize_text(message.content) for message in messages)
    for scene, keywords in SCENE_KEYWORDS.items():
        if any(keyword in full_text for keyword in keywords):
            return scene
    return None


def _extract_budget_number(text: str) -> int | None:
    digits = "".join(ch if ch.isdigit() else " " for ch in text).split()
    if not digits:
        return None
    return int(digits[0])


def _infer_budget_segment(messages: list[Message], plans: list[PlanResult], recommendations: list[RecommendationResult]) -> str | None:
    candidates: list[int] = []
    for plan in plans:
        if plan.budget:
            candidates.append(plan.budget)
    for message in messages:
        value = _extract_budget_number(message.content)
        if value:
            candidates.append(value)
    for recommendation in recommendations:
        budget = recommendation.request_payload.get("budget") if recommendation.request_payload else None
        if isinstance(budget, str):
            value = _extract_budget_number(budget)
            if value:
                candidates.append(value)
    if not candidates:
        return None
    avg_budget = round(sum(candidates) / len(candidates))
    for min_value, max_value, label in BUDGET_SEGMENTS:
        if min_value <= avg_budget <= max_value:
            return label
    return None


def _build_summary_text(
    session_obj: UserSession,
    primary_intent: str | None,
    scene_tag: str | None,
    budget_segment: str | None,
    venue_count_viewed: int,
    recommendation_count: int,
    feedback_score: Decimal | None,
) -> str:
    parts = [
        f"会话类型为{session_obj.session_type}",
        f"主要意图是{primary_intent or '未识别'}",
        f"场景为{scene_tag or '未识别'}",
        f"预算段为{budget_segment or '未识别'}",
        f"查看了{venue_count_viewed}个点位",
        f"产生了{recommendation_count}次推荐结果",
    ]
    if feedback_score is not None:
        parts.append(f"平均反馈分为{feedback_score}")
    return "，".join(parts) + "。"


def _get_or_create_anon_user_id(db: Session, user_id) -> object | None:
    anon_user_id = db.scalar(
        select(SessionSummary.anon_user_id)
        .join(UserSession, UserSession.id == SessionSummary.session_id)
        .where(UserSession.user_id == user_id, SessionSummary.anon_user_id.is_not(None))
        .order_by(SessionSummary.created_at.desc())
        .limit(1)
    )
    if anon_user_id:
        return anon_user_id

    anon_user = AnonUser()
    db.add(anon_user)
    db.flush()
    return anon_user.anon_user_id


def _upsert_session_summary(
    db: Session,
    *,
    session_obj: UserSession,
    primary_intent: str | None,
    scene_tag: str | None,
    budget_segment: str | None,
    duration_seconds: int | None,
    venue_count_viewed: int,
    recommendation_count: int,
    feedback_score: Decimal | None,
    summary_text: str,
) -> SessionSummary:
    summary = db.scalar(select(SessionSummary).where(SessionSummary.session_id == session_obj.id))
    if not summary:
        summary = SessionSummary(
            session_id=session_obj.id,
            mall_id=session_obj.mall_id,
            anon_user_id=_get_or_create_anon_user_id(db, session_obj.user_id),
        )
        db.add(summary)

    summary.primary_intent = primary_intent
    summary.scene_tag = scene_tag
    summary.budget_segment = budget_segment
    summary.duration_seconds = duration_seconds
    summary.venue_count_viewed = venue_count_viewed
    summary.recommendation_count = recommendation_count
    summary.feedback_score = feedback_score
    summary.summary_text = summary_text
    db.flush()
    return summary


def _upsert_user_preference(
    db: Session,
    *,
    user_id,
    key: str,
    value: str,
    confidence: Decimal,
    source_message_id,
) -> bool:
    existing = db.scalar(
        select(UserPreference).where(
            UserPreference.user_id == user_id,
            UserPreference.preference_key == key,
            UserPreference.preference_value == value,
        )
    )
    if existing:
        existing.confidence = confidence
        existing.source_message_id = source_message_id
        return False

    db.add(
        UserPreference(
            user_id=user_id,
            preference_key=key,
            preference_value=value,
            confidence=confidence,
            source_message_id=source_message_id,
        )
    )
    return True


def _memory_exists(db: Session, *, user_id, memory_type: str, content: str) -> bool:
    return (
        db.scalar(
            select(AgentMemory.id).where(
                AgentMemory.user_id == user_id,
                AgentMemory.memory_type == memory_type,
                AgentMemory.content == content,
            )
        )
        is not None
    )


def _create_memory_if_missing(
    db: Session,
    *,
    user_id,
    session_id,
    memory_type: str,
    content: str,
    importance: int,
    source_ref_type: str,
    source_ref_id,
) -> bool:
    if _memory_exists(db, user_id=user_id, memory_type=memory_type, content=content):
        return False
    db.add(
        AgentMemory(
            user_id=user_id,
            session_id=session_id,
            memory_type=memory_type,
            content=content,
            importance=importance,
            source_ref_type=source_ref_type,
            source_ref_id=source_ref_id,
        )
    )
    return True


def _upsert_user_profile(
    db: Session,
    *,
    user_id,
    scene_tag: str | None,
    budget_segment: str | None,
) -> None:
    profile = db.get(UserProfile, user_id)
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)

    if scene_tag:
        profile.preferred_scene = scene_tag
    if budget_segment:
        if budget_segment == "0-80":
            profile.preferred_budget_min = 0
            profile.preferred_budget_max = 80
        elif budget_segment == "81-150":
            profile.preferred_budget_min = 81
            profile.preferred_budget_max = 150
        elif budget_segment == "151-300":
            profile.preferred_budget_min = 151
            profile.preferred_budget_max = 300
        elif budget_segment == "301+":
            profile.preferred_budget_min = 301
            profile.preferred_budget_max = None

    summary_parts = []
    if profile.preferred_scene:
        summary_parts.append(f"常见场景为{profile.preferred_scene}")
    if budget_segment:
        summary_parts.append(f"预算段偏向{budget_segment}")
    if summary_parts:
        profile.profile_summary = "，".join(summary_parts) + "。"


def _extract_preferences_from_messages(messages: list[Message]) -> list[tuple[str, str, object]]:
    preferences: list[tuple[str, str, object]] = []
    for message in messages:
        if message.role != "user":
            continue
        text = _normalize_text(message.content)
        for key, keywords in PREFERENCE_PATTERNS.items():
            for keyword in keywords:
                if keyword in text:
                    preferences.append((key, keyword, message.id))
    return preferences


def roll_up_session(db: Session, session_obj: UserSession) -> SessionRollupResult:
    messages = _collect_messages(db, session_obj.id)
    events = _collect_events(db, session_obj.id)
    feedback_rows = _collect_feedback(db, session_obj.id)
    plans = _collect_plan_results(db, session_obj.id)
    recommendations = _collect_recommendations(db, session_obj.id)

    duration_seconds = None
    if session_obj.started_at:
        end_time = session_obj.ended_at or session_obj.last_activity_at or _utcnow()
        duration_seconds = max(int((end_time - session_obj.started_at).total_seconds()), 0)

    venue_count_viewed = sum(1 for event in events if event.event_type == "view_venue")
    recommendation_count = len(recommendations)
    feedback_values = [Decimal(row.rating) for row in feedback_rows if row.rating is not None]
    feedback_score = (
        (sum(feedback_values) / Decimal(len(feedback_values)))
        if feedback_values
        else None
    )

    primary_intent = _infer_primary_intent(messages, recommendations, plans)
    scene_tag = _infer_scene(messages, plans)
    budget_segment = _infer_budget_segment(messages, plans, recommendations)
    summary_text = _build_summary_text(
        session_obj,
        primary_intent,
        scene_tag,
        budget_segment,
        venue_count_viewed,
        recommendation_count,
        feedback_score,
    )
    summary = _upsert_session_summary(
        db,
        session_obj=session_obj,
        primary_intent=primary_intent,
        scene_tag=scene_tag,
        budget_segment=budget_segment,
        duration_seconds=duration_seconds,
        venue_count_viewed=venue_count_viewed,
        recommendation_count=recommendation_count,
        feedback_score=feedback_score,
        summary_text=summary_text,
    )

    preference_count = 0
    for key, value, source_message_id in _extract_preferences_from_messages(messages):
        created = _upsert_user_preference(
            db,
            user_id=session_obj.user_id,
            key=key,
            value=value,
            confidence=Decimal("0.900"),
            source_message_id=source_message_id,
        )
        if created:
            preference_count += 1

    _upsert_user_profile(
        db,
        user_id=session_obj.user_id,
        scene_tag=scene_tag,
        budget_segment=budget_segment,
    )

    memory_count = 0
    if scene_tag:
        memory_count += int(
            _create_memory_if_missing(
                db,
                user_id=session_obj.user_id,
                session_id=session_obj.id,
                memory_type="summary",
                content=f"用户近期一次典型场景是{scene_tag}。",
                importance=3,
                source_ref_type="session_summary",
                source_ref_id=summary.id,
            )
        )

    if feedback_score is not None and feedback_score >= Decimal("4.0"):
        memory_count += int(
            _create_memory_if_missing(
                db,
                user_id=session_obj.user_id,
                session_id=session_obj.id,
                memory_type="summary",
                content="用户对近期推荐或路线结果反馈较好。",
                importance=3,
                source_ref_type="session_summary",
                source_ref_id=summary.id,
            )
        )

    for key, value, _ in _extract_preferences_from_messages(messages):
        memory_content = f"用户偏好与{key}相关，倾向于{value}。"
        memory_count += int(
            _create_memory_if_missing(
                db,
                user_id=session_obj.user_id,
                session_id=session_obj.id,
                memory_type="preference",
                content=memory_content,
                importance=4,
                source_ref_type="session_summary",
                source_ref_id=summary.id,
            )
        )

    db.flush()
    return SessionRollupResult(
        session_id=str(session_obj.id),
        summary_created=True,
        memory_count=memory_count,
        preference_count=preference_count,
    )


def roll_up_venue_engagement_daily(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[VenueEngagementRollupResult]:
    event_rows = list(
        db.scalars(
            select(InteractionEvent)
            .where(InteractionEvent.event_type == "view_venue")
            .order_by(InteractionEvent.created_at.asc())
        )
    )

    session_cache: dict[object, UserSession | None] = {}
    venue_cache: dict[tuple[object, str], Venue | None] = {}
    grouped_dwell: dict[tuple[date, object, str, str], list[int]] = defaultdict(list)
    grouped_venue_ids: dict[tuple[date, object, str, str], object | None] = {}

    for event in event_rows:
        payload = event.payload or {}
        source = _normalize_text(payload.get("source"))
        if source != DINING_DWELL_SOURCE:
            continue

        dwell_ms = _extract_int(payload.get("dwell_ms"))
        if dwell_ms is None or dwell_ms < MIN_VALID_DWELL_MS:
            continue

        venue_name = _normalize_text(payload.get("name"))
        if not venue_name or not event.created_at:
            continue

        metric_date = event.created_at.date()
        if start_date and metric_date < start_date:
            continue
        if end_date and metric_date > end_date:
            continue

        session_obj = session_cache.get(event.session_id)
        if event.session_id not in session_cache:
            session_obj = db.get(UserSession, event.session_id)
            session_cache[event.session_id] = session_obj
        if not session_obj or not session_obj.mall_id:
            continue

        venue = _resolve_venue_by_name(
            db,
            mall_id=session_obj.mall_id,
            venue_name=venue_name,
            venue_cache=venue_cache,
        )

        group_key = (metric_date, session_obj.mall_id, source, venue_name)
        grouped_dwell[group_key].append(dwell_ms)
        grouped_venue_ids[group_key] = venue.id if venue else None

    results: list[VenueEngagementRollupResult] = []
    for (metric_date, mall_id, source, venue_name), dwell_values in sorted(grouped_dwell.items()):
        total_dwell_ms = sum(dwell_values)
        view_count = len(dwell_values)
        avg_dwell_ms = int(round(total_dwell_ms / view_count)) if view_count else None
        median_dwell_ms = int(round(median(dwell_values))) if dwell_values else None
        max_dwell_ms = max(dwell_values) if dwell_values else None
        meaningful_view_count = sum(1 for value in dwell_values if value >= MEANINGFUL_VIEW_MIN_MS)
        quick_skip_count = sum(1 for value in dwell_values if value <= QUICK_SKIP_MAX_MS)

        row = db.scalar(
            select(VenueEngagementDaily).where(
                VenueEngagementDaily.metric_date == metric_date,
                VenueEngagementDaily.mall_id == mall_id,
                VenueEngagementDaily.source == source,
                VenueEngagementDaily.venue_name == venue_name,
            )
        )
        if not row:
            row = VenueEngagementDaily(
                metric_date=metric_date,
                mall_id=mall_id,
                source=source,
                venue_name=venue_name,
            )
            db.add(row)

        row.venue_id = grouped_venue_ids.get((metric_date, mall_id, source, venue_name))
        row.view_count = view_count
        row.meaningful_view_count = meaningful_view_count
        row.quick_skip_count = quick_skip_count
        row.total_dwell_ms = total_dwell_ms
        row.avg_dwell_ms = avg_dwell_ms
        row.median_dwell_ms = median_dwell_ms
        row.max_dwell_ms = max_dwell_ms

        if row.venue_id:
            performance_row = db.scalar(
                select(VenuePerformanceDaily).where(
                    VenuePerformanceDaily.metric_date == metric_date,
                    VenuePerformanceDaily.mall_id == mall_id,
                    VenuePerformanceDaily.venue_id == row.venue_id,
                )
            )
            if not performance_row:
                performance_row = VenuePerformanceDaily(
                    metric_date=metric_date,
                    mall_id=mall_id,
                    venue_id=row.venue_id,
                )
                db.add(performance_row)
            performance_row.exposure_count = view_count

        results.append(
            VenueEngagementRollupResult(
                metric_date=metric_date.isoformat(),
                source=source,
                venue_name=venue_name,
                view_count=view_count,
            )
        )

    db.commit()
    return results


def find_rollup_candidates(db: Session, limit: int = 50) -> list[UserSession]:
    now = _utcnow()
    sessions = list(
        db.scalars(
            select(UserSession)
            .where(
                ~select(SessionSummary.id)
                .where(SessionSummary.session_id == UserSession.id)
                .exists()
            )
            .order_by(UserSession.last_activity_at.asc().nullsfirst(), UserSession.started_at.asc())
            .limit(limit)
        )
    )
    return [session_obj for session_obj in sessions if _is_ready_for_rollup(session_obj, now)]


def roll_up_idle_sessions(db: Session, limit: int = 50) -> list[SessionRollupResult]:
    results: list[SessionRollupResult] = []
    for session_obj in find_rollup_candidates(db, limit=limit):
        results.append(roll_up_session(db, session_obj))
    db.commit()
    return results
