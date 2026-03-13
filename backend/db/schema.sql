-- Cadence AI initial PostgreSQL schema
-- This schema is organized by domain so the project can grow from
-- a prompt-driven prototype into a stateful mall assistant platform.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Enable this when semantic recall is introduced.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Mall master data
-- ============================================================================

CREATE TABLE IF NOT EXISTS malls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    city TEXT,
    address TEXT,
    description TEXT,
    timezone TEXT DEFAULT 'Asia/Shanghai',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mall_id UUID NOT NULL REFERENCES malls(id) ON DELETE CASCADE,
    floor_code TEXT NOT NULL,
    floor_name TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mall_id, floor_code)
);

CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mall_id UUID NOT NULL REFERENCES malls(id) ON DELETE CASCADE,
    floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
    external_id TEXT,
    name TEXT NOT NULL,
    venue_type TEXT NOT NULL,
    category TEXT,
    description TEXT,
    budget_text TEXT,
    rating NUMERIC(3, 2),
    location_code TEXT,
    open_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mall_id, external_id)
);

CREATE TABLE IF NOT EXISTS venue_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    tag_type TEXT NOT NULL,
    tag_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (venue_id, tag_type, tag_value)
);

CREATE TABLE IF NOT EXISTS venue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL DEFAULT 'highlight',
    name TEXT NOT NULL,
    description TEXT,
    price_text TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price_text TEXT,
    description TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mall_id UUID NOT NULL REFERENCES malls(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    event_type TEXT,
    description TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'scheduled',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (mall_id, external_id)
);

CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'image',
    url TEXT NOT NULL,
    alt_text TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- User interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_user_id TEXT,
    channel TEXT NOT NULL DEFAULT 'web',
    nickname TEXT,
    locale TEXT DEFAULT 'zh-CN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (channel, external_user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mall_id UUID REFERENCES malls(id) ON DELETE SET NULL,
    session_type TEXT NOT NULL DEFAULT 'chat',
    entry_source TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    intent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interaction_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recommendation_type TEXT NOT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    model_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    scene TEXT,
    duration_hours INT,
    budget INT,
    arrival_time TEXT,
    summary TEXT NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    tip TEXT,
    suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    rating SMALLINT,
    comment TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);

-- ============================================================================
-- Agent memory and semantic recall
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_budget_min INT,
    preferred_budget_max INT,
    preferred_scene TEXT,
    preferred_visit_time TEXT,
    family_structure TEXT,
    mobility_constraints TEXT,
    profile_summary TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    confidence NUMERIC(4, 3),
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, preference_key, preference_value)
);

CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    importance SMALLINT NOT NULL DEFAULT 3,
    expires_at TIMESTAMPTZ,
    source_ref_type TEXT,
    source_ref_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (importance BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mall_id UUID REFERENCES malls(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_ref_id UUID,
    title TEXT,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID UNIQUE NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
    embedding_model TEXT NOT NULL,
    embedding_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Add: embedding VECTOR(1536)
);

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_chunk_id UUID UNIQUE NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
    embedding_model TEXT NOT NULL,
    embedding_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Add: embedding VECTOR(1536)
);

-- ============================================================================
-- Source ingestion
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL,
    owner TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_source_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    external_id TEXT,
    raw_payload JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    error_message TEXT,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================================
-- Analytics and mall-side reporting
-- ============================================================================

CREATE TABLE IF NOT EXISTS anon_users (
    anon_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    segment_id UUID
);

CREATE TABLE IF NOT EXISTS user_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_name TEXT NOT NULL UNIQUE,
    segment_type TEXT NOT NULL,
    definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE anon_users
    ADD CONSTRAINT fk_anon_users_segment
    FOREIGN KEY (segment_id) REFERENCES user_segments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS session_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    mall_id UUID REFERENCES malls(id) ON DELETE SET NULL,
    anon_user_id UUID REFERENCES anon_users(anon_user_id) ON DELETE SET NULL,
    primary_intent TEXT,
    scene_tag TEXT,
    budget_segment TEXT,
    duration_seconds INT,
    venue_count_viewed INT NOT NULL DEFAULT 0,
    recommendation_count INT NOT NULL DEFAULT 0,
    feedback_score NUMERIC(4, 2),
    summary_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venue_performance_daily (
    metric_date DATE NOT NULL,
    mall_id UUID NOT NULL REFERENCES malls(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    exposure_count INT NOT NULL DEFAULT 0,
    click_count INT NOT NULL DEFAULT 0,
    recommend_count INT NOT NULL DEFAULT 0,
    route_add_count INT NOT NULL DEFAULT 0,
    positive_feedback_count INT NOT NULL DEFAULT 0,
    negative_feedback_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (metric_date, mall_id, venue_id)
);

CREATE TABLE IF NOT EXISTS mall_demand_daily (
    metric_date DATE NOT NULL,
    mall_id UUID NOT NULL REFERENCES malls(id) ON DELETE CASCADE,
    intent TEXT NOT NULL,
    scene TEXT,
    budget_segment TEXT,
    demand_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (metric_date, mall_id, intent, scene, budget_segment)
);

CREATE TABLE IF NOT EXISTS fact_recommendation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    mall_id UUID REFERENCES malls(id) ON DELETE SET NULL,
    anon_user_id UUID REFERENCES anon_users(anon_user_id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    recommendation_id UUID REFERENCES recommendation_results(id) ON DELETE SET NULL,
    recommendation_type TEXT NOT NULL,
    venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
    was_clicked BOOLEAN NOT NULL DEFAULT FALSE,
    was_selected BOOLEAN NOT NULL DEFAULT FALSE,
    feedback_score NUMERIC(4, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fact_interest_signal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    mall_id UUID REFERENCES malls(id) ON DELETE SET NULL,
    anon_user_id UUID REFERENCES anon_users(anon_user_id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    signal_type TEXT NOT NULL,
    signal_value TEXT NOT NULL,
    confidence NUMERIC(4, 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_floors_mall_sort ON floors(mall_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_venues_mall_type ON venues(mall_id, venue_type);
CREATE INDEX IF NOT EXISTS idx_venues_floor ON venues(floor_id);
CREATE INDEX IF NOT EXISTS idx_venue_tags_lookup ON venue_tags(tag_type, tag_value);
CREATE INDEX IF NOT EXISTS idx_offers_venue_status ON offers(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_events_mall_time ON events(mall_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_last_activity ON sessions(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_interaction_events_session_created ON interaction_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recommendation_results_session_created ON recommendation_results(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_results_session_created ON plan_results(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_key ON user_preferences(user_id, preference_key);
CREATE INDEX IF NOT EXISTS idx_agent_memories_user_created ON agent_memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_mall_source ON knowledge_chunks(mall_id, source_type);

CREATE INDEX IF NOT EXISTS idx_raw_source_records_source_entity ON raw_source_records(source_id, entity_type, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_source_started ON sync_jobs(source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_summaries_mall_created ON session_summaries(mall_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fact_recommendation_date_mall ON fact_recommendation(metric_date, mall_id);
CREATE INDEX IF NOT EXISTS idx_fact_interest_signal_date_mall ON fact_interest_signal(metric_date, mall_id);
