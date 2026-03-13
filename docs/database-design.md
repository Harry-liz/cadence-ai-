# Cadence AI Database Design Roadmap

## Goals

This project needs a database design that supports two different workloads at the same time:

1. Serve end users in real time through Cadence.
2. Generate structured, privacy-aware analytics for mall operators and downstream agents.

The design below separates those responsibilities into clear domains so the system can evolve from today's prompt-driven prototype into a production-ready application.

## Design Principles

- Keep mall source data separate from normalized business data.
- Keep raw conversations separate from extracted memory and profile data.
- Keep online serving data separate from analytics outputs.
- Use structured fields for exact filtering and vector search only for semantic recall.
- Prefer PostgreSQL as the first system of record, with JSONB for flexible source payloads.

## Domain Model

### 1. Mall Master Data

This domain stores the canonical mall entities that Cadence can reason over.

- `malls`: mall-level metadata.
- `floors`: floor definitions within a mall.
- `venues`: stores, restaurants, cinemas, service points, and event spaces.
- `venue_tags`: ambiance, facilities, cuisine, audience, and similar labels.
- `offers`:套餐、优惠、票价等时效性商品信息。
- `events`: mall-level and venue-level activities.
- `media_assets`: images and display assets attached to venues or events.

This is the source that should eventually replace hardcoded prompt context in `backend/data/mall.py`.

### 2. User Interaction Data

This domain captures what the user asked for, what Cadence returned, and what the user did next.

- `users`: logical user identity for the product.
- `sessions`: one visit or conversation context.
- `messages`: raw user/assistant/tool messages.
- `interaction_events`: clicks, route selections, venue views, feedback triggers.
- `recommendation_results`: a snapshot of one recommendation output.
- `plan_results`: a snapshot of one generated route or itinerary.
- `feedback`: structured user sentiment on outputs or venues.

This layer is the operational history used to improve recommendation quality and analyze adoption.

### 3. Agent Memory Data

This domain stores what the system has learned about a user over time.

- `user_profiles`: stable, structured long-term preferences.
- `user_preferences`: fine-grained extracted preferences with confidence and provenance.
- `agent_memories`: natural-language memories, constraints, and summaries.
- `memory_embeddings`: vector references for semantic recall.

Only a subset of interaction data should become memory. Raw chat logs are not memory by default.

### 4. Source Ingestion Data

Mall data may come from feeds, spreadsheets, APIs, or operations uploads. This domain keeps that ingestion process auditable.

- `data_sources`: source system registry.
- `raw_source_records`: raw payload archive.
- `sync_jobs`: sync job metadata and failure tracking.

This keeps external format changes from leaking into serving tables.

### 5. Analytics Data

This domain exists for mall-side reporting and for downstream agent analysis. It should be privacy-aware and mostly aggregated.

- `anon_users`: anonymized analysis identity.
- `user_segments`: segment definitions for reporting.
- `session_summaries`: one summarized and de-identified session record.
- `venue_performance_daily`: daily venue exposure and engagement metrics.
- `mall_demand_daily`: daily demand distribution by intent, scene, and budget segment.
- `fact_recommendation`: recommendation exposure and adoption facts.
- `fact_interest_signal`: extracted user interest signals over time.

Downstream analysis agents should query this layer, not raw chat tables.

## What Should Be Vectorized

Vectorization is useful only for semantic retrieval.

Good candidates:

- `agent_memories.content`
- session summaries or conversation summaries
- venue descriptions
- event descriptions
- knowledge-base content such as FAQ or operations notes

Not good candidates:

- IDs, floor codes, timestamps, ratings, prices
- exact facilities like `有宝宝椅`
- aggregated analytics metrics

Recommended strategy:

1. Use SQL filters for exact constraints like mall, floor, budget, open status, facility.
2. Use vector search to recall relevant memories or knowledge text.
3. Assemble the final context for the model from both sources.

## Delivery Roadmap

### Phase 1: Establish the System of Record

Goal: replace hardcoded business data with normalized storage.

Deliverables:

- create the core mall master data tables
- create interaction tables for sessions, messages, events, and results
- create a first-pass memory model
- load current mall data from code into the database

Exit criteria:

- `venues`, `offers`, and `events` can answer the current dining and planning flows
- `sessions` and `messages` are written for every user request

### Phase 2: Start Writing Interaction and Memory Data

Goal: make Cadence stateful and analyzable.

Deliverables:

- persist chat sessions and user messages
- persist recommendation and planning outputs
- extract user preferences into `user_preferences`
- generate memory summaries into `agent_memories`

Exit criteria:

- the product can recall a user's known preferences
- recommendation outputs can be replayed and audited

## Session Lifecycle Strategy

`users` and `sessions` serve different purposes:

- `user_id`: long-lived user identity
- `session_id`: one continuous visit or conversation window

Recommended rule set for Cadence:

1. Reuse the current `session_id` when the user is still actively chatting.
2. Create a new `session_id` when the client explicitly starts a new conversation.
3. Create a new `session_id` when the previous session has been idle for more than 30 minutes.

Implementation notes:

- store `last_activity_at` on `sessions`
- update `last_activity_at` whenever a new message is written
- if a stale session is reused by the client, mark the old row as `expired` and create a new session row

This gives the system useful session boundaries for:

- short-term conversational context
- session summaries
- mall-side analytics
- future agent memory extraction

## Interaction Event Strategy

Raw messages alone are not enough for mall-side analysis. The product should also write structured interaction events into `interaction_events`.

Recommended first event set:

- `view_venue`: user opened a store, restaurant, or event detail
- `click_recommendation`: user clicked one item from a recommendation list
- `select_plan`: user accepted or entered a route flow
- `open_navigation`: user requested wayfinding or directions
- `expand_offer`: user opened an offer or package detail
- `submit_feedback`: user gave explicit feedback

Suggested payload shape:

- `event_type`
- `target_type`
- `target_id`
- `payload`
- `created_at`

Design rule:

- keep `messages` for conversation history
- keep `interaction_events` for structured actions
- build analytics facts from `interaction_events` first, and only fall back to message parsing when needed

This reduces ambiguity when Agent2 answers business questions such as:

- which venues are getting exposure but low clicks
- which recommendations are being opened or ignored
- which user journeys end in route generation or feedback

Suggested ingestion path:

- frontend calls `POST /api/interactions/event`
- backend resolves `user_id` and `session_id`
- backend writes one row into `interaction_events`
- daily jobs aggregate these rows into analytics facts

## Feedback Strategy

Feedback should be treated as a first-class signal, not just another event payload.

Recommended feedback targets:

- recommendation result
- venue
- event
- plan
- overall session

Write path:

1. frontend submits feedback to `POST /api/feedback`
2. backend writes one row to `feedback`
3. backend also writes one `submit_feedback` event into `interaction_events`

Why keep both:

- `feedback` is the clean fact table for explicit sentiment
- `interaction_events` keeps the chronological event stream complete

Suggested feedback semantics:

- `rating = 1-2`: negative signal
- `rating = 3`: neutral or weakly useful
- `rating = 4-5`: positive signal
- `comment`: optional natural-language explanation

Recommended target mapping:

- `target_type = venue`
- `target_type = recommendation`
- `target_type = plan`
- `target_type = event`
- `target_type = session`

This supports later analytics such as:

- which recommendations are shown often but rated poorly
- which venues convert to positive feedback
- which itinerary styles get better session outcomes

## Analytics Aggregation Plan

The analytics layer should be generated from operational tables on a schedule, instead of being written directly by product routes.

### Source tables

- `sessions`
- `messages`
- `interaction_events`
- `recommendation_results`
- `plan_results`
- `feedback`

### First aggregation jobs

1. `session_summary_job`
2. `venue_performance_job`
3. `mall_demand_job`
4. `recommendation_fact_job`
5. `interest_signal_job`

### 1. Session Summary Job

Input:

- one finished or idle `session`
- its `messages`
- its `interaction_events`
- its `feedback`

Output:

- one row in `session_summaries`

Derived fields:

- `primary_intent`
- `scene_tag`
- `budget_segment`
- `duration_seconds`
- `venue_count_viewed`
- `recommendation_count`
- `feedback_score`
- `summary_text`

### 2. Venue Performance Job

Input:

- `interaction_events`
- `feedback`

Output:

- daily rows in `venue_performance_daily`

Suggested metrics:

- `exposure_count`: count of `view_venue`
- `click_count`: count of clicks on venue-related results
- `recommend_count`: count of recommendations containing the venue
- `route_add_count`: count of plans or selections involving the venue
- `positive_feedback_count`
- `negative_feedback_count`

### 3. Mall Demand Job

Input:

- `messages`
- `session_summaries`
- extracted tags or intent classifiers

Output:

- daily rows in `mall_demand_daily`

Typical dimensions:

- `intent`
- `scene`
- `budget_segment`

This becomes the base for Agent2 prompts like "today's top user demand themes".

### 4. Recommendation Fact Job

Input:

- `recommendation_results`
- `interaction_events`
- `feedback`

Output:

- `fact_recommendation`

This table should answer:

- was the recommendation shown
- was it clicked
- was it selected
- did it receive feedback

Current implementation direction:

- rebuild recommendation facts from `recommendation_results`
- match recommended items back to `venues` by name or `venue_id`
- infer clicks and selections from `interaction_events`
- attach session-level anonymized identity from `session_summaries`

### 5. Interest Signal Job

Input:

- `messages`
- `session_summaries`
- optional extraction model output

Output:

- `fact_interest_signal`

Examples:

- `signal_type = scene`, `signal_value = 两个人约会`
- `signal_type = taste`, `signal_value = 想吃辣`
- `signal_type = ambiance`, `signal_value = 安静`
- `signal_type = budget`, `signal_value = 100-150`

Current implementation direction:

- emit first-pass scene and budget signals from `session_summaries`
- emit explicit preference signals from user messages using rule-based extraction
- keep this as a baseline until a dedicated extraction model is introduced

## Agent2 Consumption Layer

Agent2 should not read raw conversations by default. It should read analytics views and summary tables first.

Recommended read order:

1. `vw_mall_daily_summary`
2. `vw_top_venues_by_day`
3. `vw_recommendation_effectiveness`
4. `vw_feedback_summary`
5. `vw_top_interest_signals`

If Agent2 needs examples, provide session summaries rather than full raw chats.

Design rule:

- default access: views and fact tables
- restricted access: raw `messages`
- privileged/manual access only: user-identifiable details

## Memory Generation Strategy

`agent_memories` should not be a full copy of chat history. It should store only compact, reusable knowledge that helps future assistance.

### Memory source priority

Preferred sources, from strongest to weakest:

1. explicit user preferences
2. repeated user constraints across sessions
3. clear session outcomes
4. high-signal feedback
5. summarized behavior patterns

Avoid generating memory from:

- one-off casual comments
- low-confidence model guesses
- transient operational details that expire quickly
- raw mall facts that already live in master data tables

### Recommended memory types

- `preference`: stable likes or dislikes
- `constraint`: mobility, family, budget, dietary, timing constraints
- `fact`: durable user facts that matter for planning
- `summary`: one useful summary of a completed session

Examples:

- `preference`: 用户偏好安静、适合聊天的餐厅
- `constraint`: 用户带老人时希望少换楼层
- `fact`: 用户常在工作日傍晚来商场
- `summary`: 上次最终接受了咖啡+晚餐路线组合

### Memory write timing

Do not write memory on every message. Preferred timing:

1. session ends naturally
2. session becomes idle and is summarized
3. user gives explicit positive or negative feedback
4. the same preference appears multiple times

### Memory extraction pipeline

Recommended pipeline:

1. read one completed or idle session
2. summarize the session into `session_summaries`
3. run extraction rules or an LLM pass
4. write stable findings to `user_preferences`
5. write compact natural-language memories to `agent_memories`
6. optionally generate embeddings for high-value memories

Current implementation direction:

- a rollup job scans sessions that are ended, expired, or idle for at least 30 minutes
- it creates one `session_summaries` row per session
- it promotes explicit rule-based signals into `user_preferences`
- it writes compact first-pass memories into `agent_memories`

This is a good first milestone because it makes the memory layer real before the product starts using it in prompt assembly.

### Memory promotion rules

Promote to `agent_memories` when at least one is true:

- the user explicitly states a preference or constraint
- the same signal appears in 2 or more sessions
- the user gives strong feedback tied to a result
- the signal materially changes future recommendations

Otherwise, keep the information only in:

- `messages`
- `session_summaries`
- `fact_interest_signal`

### Memory expiration and freshness

Not all memories should live forever.

Recommended expiry policy:

- stable preferences: no expiry by default
- soft preferences: review after 90 days
- short-term constraints: expiry after the relevant visit window
- session summaries: short retention in recall layer, long retention in analytics layer

Suggested operational rule:

- rank memories by `importance`
- recall the highest-value memories first
- archive or ignore stale low-value memories during prompt assembly

### Memory quality rules

To keep memory useful:

- one memory row should express one idea
- use concrete language, not vague summaries
- store provenance using `source_ref_type` and `source_ref_id`
- avoid duplicating the same preference with different wording
- prefer updating `user_preferences` for exact structured facts

## Agent2 Query Boundary And Permissions

Agent2 should operate on de-identified, business-ready data by default.

### Default readable layer

Agent2 may read:

- `session_summaries`
- `venue_performance_daily`
- `mall_demand_daily`
- `fact_recommendation`
- `fact_interest_signal`
- analytics views such as `vw_mall_daily_summary`
- safe example views derived from `session_summaries`

### Restricted layer

Agent2 should not read directly unless explicitly approved:

- `messages`
- `users`
- raw `sessions` metadata with user linkage
- `agent_memories` that contain identifiable personal detail
- `raw_source_records`

### Privileged layer

Human-only or tightly controlled access:

- personally identifiable user information
- external source payloads with private fields
- any table that can reconstruct a full named user journey

### Recommended permission model

Use logical data products rather than broad table access:

1. operational app layer
2. memory layer
3. analytics safe layer
4. privileged raw layer

Agent2 should be wired only to layer 3 by default.

### Agent2-safe example data

If Agent2 needs examples of user journeys, expose:

- summarized session examples
- top repeated complaints
- top positive themes
- top venue interaction patterns

Do not expose:

- full raw chat logs
- exact user identifiers
- cross-session raw message history

### Escalation rule

If Agent2 needs raw text for debugging or qualitative analysis:

1. start from `session_summaries`
2. escalate to a curated sample
3. only then allow restricted raw access with human approval

This prevents the analytics agent from becoming a shadow customer support agent with unrestricted chat access.

## Final Design State

At this stage the database design is organized into:

- master data
- interaction history
- results and feedback
- memory and preference extraction
- analytics facts and views
- Agent2-safe consumption boundaries

This ordering is intentional:

1. capture raw facts
2. derive reusable memory
3. aggregate safe analytics
4. expose only the minimum layer needed for each downstream agent

### Phase 3: Add Semantic Recall

Goal: improve continuity and knowledge retrieval.

Deliverables:

- enable `pgvector`
- generate embeddings for memories and knowledge chunks
- add retrieval flow before LLM prompting

Exit criteria:

- the model can recall relevant prior preferences without reading full chat history

### Phase 4: Build the Analytics Layer

Goal: support mall-facing analysis and downstream reporting agents.

Deliverables:

- anonymize or segment users for analytics
- generate session summaries and daily aggregates
- expose analytics views and reporting tables to Agent2

Exit criteria:

- Agent2 no longer needs raw user chat data
- mall-side analysis can run on summarized facts

## Query Strategy by Use Case

### Real-Time User Assistance

Read from:

- `venues`, `offers`, `events`
- `user_profiles`, `user_preferences`
- `agent_memories` and semantic recall results
- recent `sessions` and `messages`

### Mall Operations Analysis

Read from:

- `session_summaries`
- `venue_performance_daily`
- `mall_demand_daily`
- `fact_recommendation`
- `fact_interest_signal`

### Data Quality and Sync Troubleshooting

Read from:

- `data_sources`
- `raw_source_records`
- `sync_jobs`

## Recommended Initial Stack

- Primary database: PostgreSQL
- Flexible fields: JSONB
- Semantic retrieval: `pgvector`
- API layer: FastAPI + SQLAlchemy or SQLModel
- Background jobs: APScheduler, Celery, or a simple cron-driven task runner

## Suggested Next Implementation Steps

1. Create the schema in `backend/db/schema.sql`.
2. Add a `backend/db` module for engine, session, and model wiring.
3. Start with write paths for `sessions`, `messages`, `recommendation_results`, and `plan_results`.
4. Replace hardcoded mall data with a database seed process.
5. Add one summarization job that converts a finished session into memory and analytics rows.
