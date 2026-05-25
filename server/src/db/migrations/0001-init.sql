CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  github_id     INTEGER NOT NULL UNIQUE,
  github_login  TEXT    NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  email         TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE subjects (
  slug            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  language        TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  latest_version  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE wiki_versions (
  subject_slug    TEXT NOT NULL REFERENCES subjects(slug) ON DELETE CASCADE,
  version_label   TEXT NOT NULL,
  schema_version  TEXT NOT NULL,
  data_dir        TEXT NOT NULL,
  manifest_json   TEXT NOT NULL,
  uploaded_by     INTEGER NOT NULL REFERENCES users(id),
  uploaded_at     INTEGER NOT NULL,
  deleted_at      INTEGER,
  PRIMARY KEY (subject_slug, version_label)
);
CREATE INDEX idx_wiki_versions_uploaded_at ON wiki_versions(uploaded_at);
