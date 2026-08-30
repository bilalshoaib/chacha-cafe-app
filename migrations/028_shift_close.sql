-- End-of-day close, and the Z-report it produces.
--
-- A café had no way to close a day. Sales accumulated against a shift_date and
-- the reports screen could add them up on request, but nothing recorded that a
-- manager had counted the drawer, what they found in it, or whether it matched
-- what the till said should be there. That difference is the whole point: it
-- is how a café notices money going missing, and it is the first thing a
-- manager asks about in a demo.
--
-- One row per café per trading day, written once when the shift is closed.

CREATE TABLE IF NOT EXISTS shift_closes (
  id          VARCHAR(50)   PRIMARY KEY,
  tenant_id   VARCHAR(50)   NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  -- Nullable for the same reason tax_rates.location_id is, and it is the same
  -- reasoning migration 025 gave for the trading day: requireTenant() returns
  -- no location id, so nothing in the app can yet say which branch a session
  -- is standing in. NULL means "this café", which is every row today. The day
  -- a branch switcher lands, a chain closes each till separately and this is
  -- where the difference goes.
  location_id VARCHAR(50)   REFERENCES locations(id) ON DELETE CASCADE,

  -- The trading day being closed, as lib/shift.js computes it — which since
  -- migration 027's successor is computed on the café's own clock rather than
  -- Karachi's. Not a timestamp: a shift that runs 6 PM to 5 PM spans two
  -- calendar dates and belongs to neither of them more than the other.
  shift_date  DATE          NOT NULL,

  closed_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Who counted it. The point of a variance is that somebody is accountable
  -- for it, so the row names them. Kept even if the user is later deleted —
  -- an unattributed close is still a fact about the day.
  closed_by   VARCHAR(50)   REFERENCES users(id) ON DELETE SET NULL,
  closed_by_email VARCHAR(200),

  -- What the drawer started with. Not takings, and never counted as revenue —
  -- it is here only so expected_cash is comparable against what is physically
  -- in the drawer at the end of the night.
  opening_float NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- What a person counted, and what the till thought should be there. Both
  -- stored, rather than storing one and deriving the other, because the whole
  -- value of this row is that the two were arrived at independently.
  counted_cash  NUMERIC(12,2) NOT NULL,
  expected_cash NUMERIC(12,2) NOT NULL,
  -- Signed: positive is over, negative is short. Stored rather than computed
  -- on read so that a query looking for bad nights can index and filter on it
  -- without unpacking the JSON below.
  variance      NUMERIC(12,2) NOT NULL,

  -- The whole Z-report as it read at the moment of closing.
  --
  -- Frozen by value, for the same reason migration 027 freezes the tax rate
  -- onto the invoice: a Z-report reprinted next month has to say what it said
  -- on the night. Recomputing it from the invoice table would quietly change
  -- as invoices are edited, refunded or synced in late from an offline till,
  -- and a report that changes after it was signed off is not evidence of
  -- anything.
  totals      JSONB         NOT NULL DEFAULT '{}',

  -- "£20 short, new starter on the till" — the manager's own account of a
  -- variance, which is usually the only thing that explains one.
  note        VARCHAR(300)  NOT NULL DEFAULT '',

  -- A trading day is closed once. A second attempt is a mistake or a
  -- double-submit, and either way must not produce two contradictory
  -- Z-reports for the same night.
  UNIQUE (tenant_id, shift_date)
);

CREATE INDEX IF NOT EXISTS shift_closes_tenant_date_idx
  ON shift_closes (tenant_id, shift_date DESC);

-- The same isolation every other café-data table carries. Written out rather
-- than added to 016's array because 016 has already run everywhere.
ALTER TABLE shift_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_closes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON shift_closes;
CREATE POLICY tenant_isolation ON shift_closes
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
