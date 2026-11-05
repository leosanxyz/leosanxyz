CREATE TABLE capsule_stakes (
  source_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 0 AND amount <= 1000000),
  created_at INTEGER NOT NULL
);
CREATE INDEX capsule_stakes_user ON capsule_stakes(user_id);
