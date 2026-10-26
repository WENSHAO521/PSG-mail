-- Reply-To of received mail, as a JSON list like `recipient`
-- ('[{"address":"…","name":"…"}]'); '' when the mail had none. Reply and
-- Reply all answer these addresses instead of From. Not in the drizzle entity
-- (so an older database without it keeps working); read and written with raw SQL.
-- Rollback: ALTER TABLE email DROP COLUMN reply_to;
ALTER TABLE email ADD COLUMN reply_to TEXT NOT NULL DEFAULT '';
