-- Port of services/web/project/models.py. Booleans are 0/1 in SQLite.
CREATE TABLE shortlinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_url TEXT NOT NULL,
  short_url TEXT NOT NULL,
  expired INTEGER NOT NULL DEFAULT 0,
  expiration_date TEXT NULL,
  max_clicks INTEGER NOT NULL DEFAULT -1,
  current_clicks INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_shortlinks_short_url ON shortlinks (short_url);
CREATE INDEX idx_shortlinks_expired_deleted ON shortlinks (expired, deleted);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  short_url_id INTEGER NOT NULL REFERENCES shortlinks(id),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  country TEXT NOT NULL,
  country_name TEXT NOT NULL DEFAULT 'Unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_visits_short_url_id ON visits (short_url_id);
