CREATE TABLE student_passes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  intro_json TEXT NOT NULL DEFAULT '{}',
  draft_json TEXT,
  completed_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
