-- On the Pulse likes + comments. ip_hash = truncated salted SHA-256; raw IPs are never stored.
CREATE TABLE IF NOT EXISTS likes (
  slug        TEXT NOT NULL,
  visitor     TEXT NOT NULL,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (slug, visitor)
);
CREATE INDEX IF NOT EXISTS likes_ip ON likes (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published')),
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS comments_slug ON comments (slug, status, created_at);
CREATE INDEX IF NOT EXISTS comments_ip ON comments (ip_hash, created_at);
