CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  password_hash TEXT,
  must_change INTEGER NOT NULL DEFAULT 1,
  disabled INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  group_id TEXT REFERENCES student_groups(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE student_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE board_grants (
  board_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'group')),
  subject_id TEXT NOT NULL,
  PRIMARY KEY (board_id, kind, subject_id)
);
CREATE INDEX grants_subject ON board_grants(kind, subject_id, board_id);
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
