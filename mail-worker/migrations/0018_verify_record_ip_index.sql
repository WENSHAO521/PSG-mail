-- verify_record is looked up by ip on the public login-page config request (COUNT verify mode).
-- Without an index that is a table scan per visitor. Additive; rollback: DROP INDEX idx_verify_record_ip;
CREATE INDEX IF NOT EXISTS idx_verify_record_ip ON verify_record(ip, type);
