-- Used by docker-compose to create the cache table (mirrors src/db/schema.ts).
CREATE TABLE IF NOT EXISTS source_cache (
  key text PRIMARY KEY,
  body text NOT NULL,
  upstream_url text NOT NULL,
  retrieved_at timestamptz NOT NULL
);
