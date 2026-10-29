-- The address that actually sent a received mail when its domain differs
-- from From's: the Sender header (on behalf of), else the envelope sender.
-- '' otherwise. The reader shows "via …" for it. Not in the drizzle entity
-- (so an older database without it keeps working); read and written with raw SQL.
-- Rollback: ALTER TABLE email DROP COLUMN sender_email;
ALTER TABLE email ADD COLUMN sender_email TEXT NOT NULL DEFAULT '';
