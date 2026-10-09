-- Daily aggregate counters for operations / security monitoring (src/service/ops-metrics.js).
-- One row per (UTC day, metric); no per-event rows, no user ids, IPs, addresses or mail content.
-- Rollback: DROP TABLE ops_metric;  (nothing else depends on it; the app ignores a missing table).
CREATE TABLE IF NOT EXISTS ops_metric (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  max_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
) WITHOUT ROWID;
