CREATE TABLE cosmetics (
  source_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  cost INTEGER NOT NULL CHECK (cost >= 0 AND cost <= 1000000)
);
CREATE INDEX cosmetics_user ON cosmetics(user_id);
