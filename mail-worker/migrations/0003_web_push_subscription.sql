-- Standards-based Web Push (RFC 8030/8291/8292) subscriptions for browser/PWA
-- clients — separate from notification_device (Android FCM + legacy web FCM
-- tokens, see that table's ad hoc CREATE in notification-service.js). endpoint
-- is the browser-generated subscription URL and is globally unique by
-- construction (not scoped to user_id): registerSubscription() upserts on it
-- so a browser re-subscribing, or a different user signing into the same
-- browser profile, reassigns ownership instead of erroring.
CREATE TABLE IF NOT EXISTS web_push_subscription (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	endpoint TEXT NOT NULL UNIQUE,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	platform TEXT NOT NULL DEFAULT 'web',
	device_name TEXT,
	user_agent TEXT,
	enabled INTEGER NOT NULL DEFAULT 1,
	last_seen_time TEXT,
	create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscription_user ON web_push_subscription (user_id, enabled);
