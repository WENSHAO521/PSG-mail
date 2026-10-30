-- On-site delivery used to copy the sender's Bcc list onto every recipient's
-- copy, so recipients could see who was blind-copied (fixed in code in the
-- same release). Clear the list from received copies already stored; the
-- sender's own copy (type = 1) keeps it.
-- Rollback: none needed (the cleared data must not be shown to recipients).
UPDATE email SET bcc = '[]' WHERE type = 0 AND bcc IS NOT NULL AND bcc NOT IN ('', '[]');
