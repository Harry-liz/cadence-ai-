-- Candidate analytics views for mall reporting and Agent2 consumption.
-- These are intentionally lightweight and can evolve into materialized views later.

CREATE OR REPLACE VIEW vw_feedback_summary AS
SELECT
    target_type,
    target_id,
    COUNT(*) AS feedback_count,
    AVG(rating) AS avg_rating,
    COUNT(*) FILTER (WHERE rating >= 4) AS positive_feedback_count,
    COUNT(*) FILTER (WHERE rating <= 2) AS negative_feedback_count
FROM feedback
GROUP BY target_type, target_id;


CREATE OR REPLACE VIEW vw_recommendation_effectiveness AS
SELECT
    fr.metric_date,
    fr.mall_id,
    fr.recommendation_type,
    fr.venue_id,
    COUNT(*) AS recommendation_rows,
    COUNT(*) FILTER (WHERE fr.was_clicked) AS clicked_count,
    COUNT(*) FILTER (WHERE fr.was_selected) AS selected_count,
    AVG(fr.feedback_score) AS avg_feedback_score
FROM fact_recommendation fr
GROUP BY fr.metric_date, fr.mall_id, fr.recommendation_type, fr.venue_id;


CREATE OR REPLACE VIEW vw_top_interest_signals AS
SELECT
    metric_date,
    mall_id,
    signal_type,
    signal_value,
    COUNT(*) AS signal_count,
    AVG(confidence) AS avg_confidence
FROM fact_interest_signal
GROUP BY metric_date, mall_id, signal_type, signal_value;


CREATE OR REPLACE VIEW vw_top_venues_by_day AS
SELECT
    vpd.metric_date,
    vpd.mall_id,
    vpd.venue_id,
    (vpd.exposure_count + vpd.click_count + vpd.recommend_count + vpd.route_add_count) AS engagement_score,
    vpd.exposure_count,
    vpd.click_count,
    vpd.recommend_count,
    vpd.route_add_count,
    vpd.positive_feedback_count,
    vpd.negative_feedback_count
FROM venue_performance_daily vpd;


CREATE OR REPLACE VIEW vw_mall_daily_summary AS
SELECT
    mdd.metric_date,
    mdd.mall_id,
    SUM(mdd.demand_count) AS total_demand,
    COUNT(DISTINCT mdd.intent) AS intent_count,
    COUNT(DISTINCT mdd.scene) AS scene_count
FROM mall_demand_daily mdd
GROUP BY mdd.metric_date, mdd.mall_id;
