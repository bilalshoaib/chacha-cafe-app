-- When a café may be used, and why it may not.
--
-- Until now `status` was the whole answer and only 'suspended' meant anything.
-- Two things were missing. A trial that never ends is not a trial, and a café
-- whose payment is late needs stopping in a way that is plainly not the same
-- thing as being shut down — the owner rings up about it, and "suspended" and
-- "we are waiting on your payment" should not read identically.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS restricted_at     TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS restricted_reason VARCHAR(200);

-- Existing trials get their fortnight from today, not from the day they were
-- created. Backdating would be arithmetically tidier and would lock out every
-- café that has been trialling for longer than that the moment this migration
-- lands — which is a billing decision, and not one a schema change gets to
-- make on its own. Whoever runs the platform can shorten them from the console.
UPDATE tenants
   SET trial_ends_at = NOW() + INTERVAL '14 days'
 WHERE status = 'trial' AND trial_ends_at IS NULL;

-- Read on the way in to every request that touches a café's data, so the
-- lookup that decides whether to allow it should not be a sequential scan.
CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status);
