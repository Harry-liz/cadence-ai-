ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE sessions
SET last_activity_at = COALESCE(ended_at, started_at, NOW())
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_last_activity
ON sessions(user_id, last_activity_at DESC);
