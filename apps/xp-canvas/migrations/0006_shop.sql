CREATE TABLE shop_reviews (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 questions_json TEXT NOT NULL,
 answers_json TEXT,
 passed INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 finished_at INTEGER
);
CREATE INDEX shop_reviews_user_day ON shop_reviews(user_id, day);
