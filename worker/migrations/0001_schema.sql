CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  total_views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS visitors (
  site_id TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'XX',
  city TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (site_id, visitor_hash),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'XX',
  city TEXT NOT NULL DEFAULT '',
  page_path TEXT NOT NULL DEFAULT '/',
  visited_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visitors_site_last_seen
ON visitors(site_id, last_seen);

CREATE INDEX IF NOT EXISTS idx_visits_site_visited_at
ON visits(site_id, visited_at DESC);

PRAGMA optimize;
