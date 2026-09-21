CREATE TABLE gachapon_spins (
 source_key TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 skin TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX gachapon_spins_user ON gachapon_spins(user_id, skin);
