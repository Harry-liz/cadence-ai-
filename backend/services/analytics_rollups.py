from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from db.models import (
    FactInterestSignal,
    FactRecommendation,
    Feedback,
    InteractionEvent,
    MallDemandDaily,
    Message,
    RecommendationResult,
    SessionSummary,
    UserSession,
    Venue,
    VenuePerformanceDaily,
)
from services.rollups import PREFERENCE_PATTERNS


@dataclass
class AnalyticsRollupResult:
    metric_date: str
    recommendation_fact_count: int
    interest_signal_count: int
    venue_daily_count: int
    demand_daily_count: int


def _safe_date(value: datetime | None) -> date | None:
    if not value:
        return None
    return value.astimezone(timezone.utc).date() if value.tzinfo else value.date()


def _session_metric_date(session_obj: UserSession) -> date | None:
    return _safe_date(session_obj.last_activity_at or session_obj.ended_at or session_obj.started_at)


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _parse_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, TypeError):
        return None


def _build_venue_name_map(db: Session) -> tuple[dict[tuple[UUID | None, str], UUID], dict[str, UUID]]:
    by_mall_and_name: dict[tuple[UUID | None, str], UUID] = {}
    by_name: dict[str, UUID] = {}
    venues = list(db.scalars(select(Venue)))
    for venue in venues:
        by_mall_and_name[(venue.mall_id, venue.name)] = venue.id
        by_name.setdefault(venue.name, venue.id)
    return by_mall_and_name, by_name


def _resolve_venue_id(
    *,
    mall_id,
    venue_name: str | None,
    venue_id_value: object,
    by_mall_and_name: dict[tuple[UUID | None, str], UUID],
    by_name: dict[str, UUID],
) -> UUID | None:
    explicit_uuid = _parse_uuid(venue_id_value)
    if explicit_uuid:
        return explicit_uuid
    if venue_name:
        return by_mall_and_name.get((mall_id, venue_name)) or by_name.get(venue_name)
    return None


def _event_matches_venue(event: InteractionEvent, venue_id: UUID | None, venue_name: str | None) -> bool:
    if venue_id and event.target_id == venue_id:
        return True
    payload = event.payload or {}
    payload_venue_id = _parse_uuid(payload.get("venue_id"))
    if venue_id and payload_venue_id == venue_id:
        return True
    if venue_name and payload.get("venue_name") == venue_name:
        return True
    if venue_name and payload.get("name") == venue_name:
        return True
    return False


def _average_rating(rows: list[Feedback]) -> Decimal | None:
    values = [Decimal(row.rating) for row in rows if row.rating is not None]
    if not values:
        return None
    return sum(values) / Decimal(len(values))


def _extract_preference_signals(messages: list[Message]) -> list[tuple[str, str]]:
    signals: list[tuple[str, str]] = []
    for message in messages:
        if message.role != "user":
            continue
        text = _normalize_text(message.content)
        for key, keywords in PREFERENCE_PATTERNS.items():
            for keyword in keywords:
                if keyword in text:
                    signals.append((key, keyword))
    return signals


def _load_date_payload(db: Session, metric_date: date):
    session_rows = db.execute(
        select(UserSession, SessionSummary)
        .join(SessionSummary, SessionSummary.session_id == UserSession.id)
    ).all()
    filtered = [
        (session_obj, summary)
        for session_obj, summary in session_rows
        if _session_metric_date(session_obj) == metric_date
    ]

    session_ids = [session_obj.id for session_obj, _ in filtered]
    if not session_ids:
        return filtered, {}, {}, {}, {}

    messages = list(
        db.scalars(
            select(Message)
            .where(Message.session_id.in_(session_ids))
            .order_by(Message.created_at.asc())
        )
    )
    events = list(
        db.scalars(
            select(InteractionEvent)
            .where(InteractionEvent.session_id.in_(session_ids))
            .order_by(InteractionEvent.created_at.asc())
        )
    )
    feedback_rows = list(
        db.scalars(
            select(Feedback)
            .where(Feedback.session_id.in_(session_ids))
            .order_by(Feedback.created_at.asc())
        )
    )
    recommendation_rows = list(
        db.scalars(
            select(RecommendationResult)
            .where(RecommendationResult.session_id.in_(session_ids))
            .order_by(RecommendationResult.created_at.asc())
        )
    )

    messages_by_session: dict[UUID, list[Message]] = defaultdict(list)
    events_by_session: dict[UUID, list[InteractionEvent]] = defaultdict(list)
    feedback_by_session: dict[UUID, list[Feedback]] = defaultdict(list)
    recommendations_by_session: dict[UUID, list[RecommendationResult]] = defaultdict(list)

    for message in messages:
        messages_by_session[message.session_id].append(message)
    for event in events:
        events_by_session[event.session_id].append(event)
    for row in feedback_rows:
        if row.session_id:
            feedback_by_session[row.session_id].append(row)
    for recommendation in recommendation_rows:
        recommendations_by_session[recommendation.session_id].append(recommendation)

    return (
        filtered,
        messages_by_session,
        events_by_session,
        feedback_by_session,
        recommendations_by_session,
    )


def _clear_metric_date(db: Session, metric_date: date) -> None:
    db.execute(delete(FactRecommendation).where(FactRecommendation.metric_date == metric_date))
    db.execute(delete(FactInterestSignal).where(FactInterestSignal.metric_date == metric_date))
    db.execute(delete(VenuePerformanceDaily).where(VenuePerformanceDaily.metric_date == metric_date))
    db.execute(delete(MallDemandDaily).where(MallDemandDaily.metric_date == metric_date))


def _roll_up_recommendation_facts(
    db: Session,
    *,
    metric_date: date,
    session_pairs: list[tuple[UserSession, SessionSummary]],
    events_by_session: dict[UUID, list[InteractionEvent]],
    feedback_by_session: dict[UUID, list[Feedback]],
    recommendations_by_session: dict[UUID, list[RecommendationResult]],
    by_mall_and_name: dict[tuple[UUID | None, str], UUID],
    by_name: dict[str, UUID],
) -> list[FactRecommendation]:
    rows: list[FactRecommendation] = []
    for session_obj, summary in session_pairs:
        session_events = events_by_session.get(session_obj.id, [])
        session_feedback = feedback_by_session.get(session_obj.id, [])
        for recommendation in recommendations_by_session.get(session_obj.id, []):
            result_items = recommendation.result_payload.get("results", []) if recommendation.result_payload else []
            if not isinstance(result_items, list):
                continue
            for item in result_items:
                venue_name = item.get("name") if isinstance(item, dict) else None
                venue_id = _resolve_venue_id(
                    mall_id=session_obj.mall_id,
                    venue_name=venue_name,
                    venue_id_value=item.get("venue_id") if isinstance(item, dict) else None,
                    by_mall_and_name=by_mall_and_name,
                    by_name=by_name,
                )
                clicked = any(
                    event.event_type == "click_recommendation" and _event_matches_venue(event, venue_id, venue_name)
                    for event in session_events
                )
                selected = any(
                    event.event_type in {"select_plan", "open_navigation"} and _event_matches_venue(event, venue_id, venue_name)
                    for event in session_events
                )
                feedback_rows = [
                    row
                    for row in session_feedback
                    if row.target_type == "venue" and venue_id and row.target_id == venue_id
                ]
                if not feedback_rows:
                    feedback_rows = [row for row in session_feedback if row.target_type == "recommendation"]

                rows.append(
                    FactRecommendation(
                        metric_date=metric_date,
                        mall_id=session_obj.mall_id,
                        anon_user_id=summary.anon_user_id,
                        session_id=session_obj.id,
                        recommendation_id=recommendation.id,
                        recommendation_type=recommendation.recommendation_type,
                        venue_id=venue_id,
                        was_clicked=clicked,
                        was_selected=selected,
                        feedback_score=_average_rating(feedback_rows),
                    )
                )
    db.add_all(rows)
    return rows


def _roll_up_interest_signals(
    db: Session,
    *,
    metric_date: date,
    session_pairs: list[tuple[UserSession, SessionSummary]],
    messages_by_session: dict[UUID, list[Message]],
) -> list[FactInterestSignal]:
    rows: list[FactInterestSignal] = []
    for session_obj, summary in session_pairs:
        if summary.scene_tag:
            rows.append(
                FactInterestSignal(
                    metric_date=metric_date,
                    mall_id=session_obj.mall_id,
                    anon_user_id=summary.anon_user_id,
                    session_id=session_obj.id,
                    signal_type="scene",
                    signal_value=summary.scene_tag,
                    confidence=Decimal("0.950"),
                )
            )
        if summary.budget_segment:
            rows.append(
                FactInterestSignal(
                    metric_date=metric_date,
                    mall_id=session_obj.mall_id,
                    anon_user_id=summary.anon_user_id,
                    session_id=session_obj.id,
                    signal_type="budget",
                    signal_value=summary.budget_segment,
                    confidence=Decimal("0.850"),
                )
            )
        for signal_type, signal_value in _extract_preference_signals(messages_by_session.get(session_obj.id, [])):
            rows.append(
                FactInterestSignal(
                    metric_date=metric_date,
                    mall_id=session_obj.mall_id,
                    anon_user_id=summary.anon_user_id,
                    session_id=session_obj.id,
                    signal_type=signal_type,
                    signal_value=signal_value,
                    confidence=Decimal("0.900"),
                )
            )
    db.add_all(rows)
    return rows


def _roll_up_mall_demand(
    db: Session,
    *,
    metric_date: date,
    session_pairs: list[tuple[UserSession, SessionSummary]],
) -> list[MallDemandDaily]:
    counter: Counter[tuple[UUID | None, str, str | None, str | None]] = Counter()
    for session_obj, summary in session_pairs:
        counter[(session_obj.mall_id, summary.primary_intent or "unknown", summary.scene_tag, summary.budget_segment)] += 1

    rows: list[MallDemandDaily] = []
    for (mall_id, intent, scene, budget_segment), count in counter.items():
        if not mall_id:
            continue
        rows.append(
            MallDemandDaily(
                metric_date=metric_date,
                mall_id=mall_id,
                intent=intent,
                scene=scene,
                budget_segment=budget_segment,
                demand_count=count,
            )
        )
    db.add_all(rows)
    return rows


def _roll_up_venue_performance(
    db: Session,
    *,
    metric_date: date,
    session_pairs: list[tuple[UserSession, SessionSummary]],
    events_by_session: dict[UUID, list[InteractionEvent]],
    feedback_by_session: dict[UUID, list[Feedback]],
    recommendation_facts: list[FactRecommendation],
    by_mall_and_name: dict[tuple[UUID | None, str], UUID],
    by_name: dict[str, UUID],
) -> list[VenuePerformanceDaily]:
    counters: dict[tuple[UUID, UUID], dict[str, int]] = defaultdict(
        lambda: {
            "exposure_count": 0,
            "click_count": 0,
            "recommend_count": 0,
            "route_add_count": 0,
            "positive_feedback_count": 0,
            "negative_feedback_count": 0,
        }
    )

    for fact in recommendation_facts:
        if fact.mall_id and fact.venue_id:
            counters[(fact.mall_id, fact.venue_id)]["recommend_count"] += 1

    for session_obj, _summary in session_pairs:
        for event in events_by_session.get(session_obj.id, []):
            venue_name = event.payload.get("venue_name") if event.payload else None
            venue_id = _resolve_venue_id(
                mall_id=session_obj.mall_id,
                venue_name=venue_name,
                venue_id_value=event.target_id or (event.payload or {}).get("venue_id"),
                by_mall_and_name=by_mall_and_name,
                by_name=by_name,
            )
            if not (session_obj.mall_id and venue_id):
                continue
            bucket = counters[(session_obj.mall_id, venue_id)]
            if event.event_type == "view_venue":
                bucket["exposure_count"] += 1
            elif event.event_type == "click_recommendation":
                bucket["click_count"] += 1
            elif event.event_type in {"select_plan", "open_navigation"}:
                bucket["route_add_count"] += 1

        for row in feedback_by_session.get(session_obj.id, []):
            if row.target_type != "venue" or not row.target_id or row.rating is None or not session_obj.mall_id:
                continue
            bucket = counters[(session_obj.mall_id, row.target_id)]
            if row.rating >= 4:
                bucket["positive_feedback_count"] += 1
            elif row.rating <= 2:
                bucket["negative_feedback_count"] += 1

    rows: list[VenuePerformanceDaily] = []
    for (mall_id, venue_id), metrics in counters.items():
        rows.append(
            VenuePerformanceDaily(
                metric_date=metric_date,
                mall_id=mall_id,
                venue_id=venue_id,
                exposure_count=metrics["exposure_count"],
                click_count=metrics["click_count"],
                recommend_count=metrics["recommend_count"],
                route_add_count=metrics["route_add_count"],
                positive_feedback_count=metrics["positive_feedback_count"],
                negative_feedback_count=metrics["negative_feedback_count"],
            )
        )
    db.add_all(rows)
    return rows


def find_analytics_candidate_dates(db: Session, limit: int = 30) -> list[date]:
    session_rows = db.execute(
        select(UserSession, SessionSummary)
        .join(SessionSummary, SessionSummary.session_id == UserSession.id)
        .order_by(UserSession.last_activity_at.desc().nullslast(), UserSession.started_at.desc())
    ).all()
    dates: list[date] = []
    seen: set[date] = set()
    for session_obj, _summary in session_rows:
        metric_date = _session_metric_date(session_obj)
        if metric_date and metric_date not in seen:
            dates.append(metric_date)
            seen.add(metric_date)
        if len(dates) >= limit:
            break
    return dates


def roll_up_analytics_for_date(db: Session, metric_date: date) -> AnalyticsRollupResult | None:
    (
        session_pairs,
        messages_by_session,
        events_by_session,
        feedback_by_session,
        recommendations_by_session,
    ) = _load_date_payload(db, metric_date)

    if not session_pairs:
        return None

    _clear_metric_date(db, metric_date)
    by_mall_and_name, by_name = _build_venue_name_map(db)

    recommendation_facts = _roll_up_recommendation_facts(
        db,
        metric_date=metric_date,
        session_pairs=session_pairs,
        events_by_session=events_by_session,
        feedback_by_session=feedback_by_session,
        recommendations_by_session=recommendations_by_session,
        by_mall_and_name=by_mall_and_name,
        by_name=by_name,
    )
    interest_signals = _roll_up_interest_signals(
        db,
        metric_date=metric_date,
        session_pairs=session_pairs,
        messages_by_session=messages_by_session,
    )
    demand_rows = _roll_up_mall_demand(
        db,
        metric_date=metric_date,
        session_pairs=session_pairs,
    )
    venue_rows = _roll_up_venue_performance(
        db,
        metric_date=metric_date,
        session_pairs=session_pairs,
        events_by_session=events_by_session,
        feedback_by_session=feedback_by_session,
        recommendation_facts=recommendation_facts,
        by_mall_and_name=by_mall_and_name,
        by_name=by_name,
    )
    db.commit()

    return AnalyticsRollupResult(
        metric_date=str(metric_date),
        recommendation_fact_count=len(recommendation_facts),
        interest_signal_count=len(interest_signals),
        venue_daily_count=len(venue_rows),
        demand_daily_count=len(demand_rows),
    )


def roll_up_recent_analytics(db: Session, limit: int = 30) -> list[AnalyticsRollupResult]:
    results: list[AnalyticsRollupResult] = []
    for metric_date in find_analytics_candidate_dates(db, limit=limit):
        result = roll_up_analytics_for_date(db, metric_date)
        if result:
            results.append(result)
    return results
