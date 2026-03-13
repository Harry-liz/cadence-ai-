# Database Bootstrap

## Environment

Set `DATABASE_URL` in `backend/.env` before running database scripts.
Set `ENABLE_DATABASE=true` when you want the app routes to actively use PostgreSQL.

Example:

```env
ENABLE_DATABASE=true
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/cadence_ai
```

## Initialize Schema

```bash
python -m db.init_db
```

## Seed Current Mall Data

```bash
python -m db.seed_mall
```

## Roll Up Idle Sessions

```bash
python -m db.rollup_idle_sessions
```

This processes sessions that are ended, expired, or idle for at least 30 minutes and generates:

- `session_summaries`
- `user_preferences`
- `agent_memories`
- `user_profiles` updates

## Roll Up Analytics

```bash
python -m db.rollup_analytics
```

This rebuilds analytics rows for candidate dates derived from summarized sessions and writes:

- `fact_recommendation`
- `fact_interest_signal`
- `venue_performance_daily`
- `mall_demand_daily`

The seed currently loads:

- the core mall record for `中洲湾 C Future City`
- floors `B2` through `L4`
- restaurant and offer data from `data.mall.RESTAURANTS`
- a small set of static venue and event records from the current hardcoded context
