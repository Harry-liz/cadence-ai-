-- Safe read layer for Agent2.
-- These views intentionally avoid raw user messages and direct user identifiers.

CREATE OR REPLACE VIEW vw_agent2_daily_brief AS
SELECT
    mds.metric_date,
    mds.mall_id,
    mds.total_demand,
    mds.intent_count,
    mds.scene_count
FROM vw_mall_daily_summary mds;


CREATE OR REPLACE VIEW vw_agent2_top_venue_signals AS
SELECT
    tv.metric_date,
    tv.mall_id,
    tv.venue_id,
    tv.engagement_score,
    tv.exposure_count,
    tv.click_count,
    tv.recommend_count,
    tv.route_add_count,
    tv.positive_feedback_count,
    tv.negative_feedback_count
FROM vw_top_venues_by_day tv;


CREATE OR REPLACE VIEW vw_agent2_interest_mix AS
SELECT
    tis.metric_date,
    tis.mall_id,
    tis.signal_type,
    tis.signal_value,
    tis.signal_count,
    tis.avg_confidence
FROM vw_top_interest_signals tis;


CREATE OR REPLACE VIEW vw_agent2_feedback_rollup AS
SELECT
    fs.target_type,
    fs.target_id,
    fs.feedback_count,
    fs.avg_rating,
    fs.positive_feedback_count,
    fs.negative_feedback_count
FROM vw_feedback_summary fs;


CREATE OR REPLACE VIEW vw_agent2_session_examples AS
SELECT
    ss.id,
    ss.mall_id,
    ss.primary_intent,
    ss.scene_tag,
    ss.budget_segment,
    ss.duration_seconds,
    ss.venue_count_viewed,
    ss.recommendation_count,
    ss.feedback_score,
    ss.summary_text,
    ss.created_at
FROM session_summaries ss
WHERE ss.summary_text IS NOT NULL;
