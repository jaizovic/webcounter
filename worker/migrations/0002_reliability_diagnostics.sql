ALTER TABLE visits ADD COLUMN event_id TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN browser_family TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE visits ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_site_event_id
ON visits(site_id, event_id)
WHERE event_id <> '';

CREATE TABLE IF NOT EXISTS event_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'view',
  page_path TEXT NOT NULL DEFAULT '/',
  browser_family TEXT NOT NULL DEFAULT 'Unknown',
  is_bot INTEGER NOT NULL DEFAULT 0,
  transport TEXT NOT NULL DEFAULT 'xhr',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_diagnostics_site_created
ON event_diagnostics(site_id, created_at DESC);

PRAGMA optimize;
