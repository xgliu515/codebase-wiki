CREATE TABLE IF NOT EXISTS progress (
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug        TEXT NOT NULL,
  chapter_id          TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('read', 'unread')),
  last_version_label  TEXT NOT NULL,
  marked_at           INTEGER NOT NULL,
  PRIMARY KEY (user_id, subject_slug, chapter_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_slug    TEXT NOT NULL,
  version_label   TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  attempted_at    INTEGER NOT NULL,
  results_json    TEXT NOT NULL,
  score           REAL NOT NULL,
  question_count  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user_chapter
  ON attempts(user_id, subject_slug, chapter_id, attempted_at);
CREATE INDEX IF NOT EXISTS idx_attempts_user_subject
  ON attempts(user_id, subject_slug);

CREATE TABLE IF NOT EXISTS addenda (
  id              INTEGER PRIMARY KEY,
  subject_slug    TEXT NOT NULL,
  version_label   TEXT NOT NULL,
  chapter_id      TEXT NOT NULL,
  author_user_id  INTEGER NOT NULL REFERENCES users(id),
  question        TEXT NOT NULL,
  answer          TEXT,
  created_at      INTEGER NOT NULL,
  hidden_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_addenda_chapter
  ON addenda(subject_slug, version_label, chapter_id, created_at);
