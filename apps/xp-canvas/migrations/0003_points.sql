CREATE TABLE point_awards (
  source_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  activity_kind TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0 AND amount <= 1000000),
  created_at INTEGER NOT NULL
);
CREATE INDEX point_awards_user ON point_awards(user_id);
