-- Attachment objects are content-addressed and shared between mails, so "is this object still
-- referenced?" is asked on every delete (att-service removeAttByField) and on every upload
-- (dedupe check). Without an index on `key` each of those questions is a scan of the whole
-- attachments table. Additive; rollback: DROP INDEX idx_attachments_key;
CREATE INDEX IF NOT EXISTS idx_attachments_key ON attachments(key);
