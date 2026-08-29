-- Sales tax.
--
-- Until now checkout computed `total = subtotal + delivery_charge` and the
-- word "tax" appeared nowhere in the schema or the code. That is workable in
-- Pakistan, where the price on the menu board is the price the customer pays.
-- It is not workable in the United States, where tax is added at the till, the
-- rate is set by the state, the county and sometimes the city, and in many
-- states a sandwich eaten in is taxed differently from the same sandwich taken
-- away.
--
-- Three things follow from that, and each one is a column below.

-- ── Which rates a café charges ──────────────────────────────────────────────
--
-- A table rather than a single percentage on the tenant, because a US café
-- routinely charges two or three at once — 6.25% state plus 2% county plus a
-- 0.5% transit district — and the receipt has to break them out separately for
-- the customer and the books have to total them separately for filing. One
-- summed percentage cannot be un-summed afterwards.
--
-- On the tenant, not the location, for the same reason 025 put the trading day
-- there: locations exists, most cafés have exactly one, and nothing in the app
-- can yet say which branch a session is standing in (requireTenant() returns no
-- location id). location_id is here and nullable so that a chain trading across
-- a state line has somewhere to put the difference the day the branch switcher
-- lands; NULL means "every branch of this café", which is every row today.
CREATE TABLE IF NOT EXISTS tax_rates (
  id          VARCHAR(50)   PRIMARY KEY,
  tenant_id   VARCHAR(50)   NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  location_id VARCHAR(50)   REFERENCES locations(id) ON DELETE CASCADE,
  -- What the customer sees on the receipt: "NY State Tax", "County Tax", "GST".
  name        VARCHAR(60)   NOT NULL,
  -- A percentage, not a fraction: 8.875 is New York City's, and four decimal
  -- places is enough for every rate anyone actually levies.
  rate        NUMERIC(7,4)  NOT NULL CHECK (rate >= 0 AND rate <= 100),
  -- Which order types this rate applies to. Empty means all of them, which is
  -- the common case; ['dine_in'] is the prepared-food surcharge several states
  -- levy on eating in.
  order_types TEXT[]        NOT NULL DEFAULT '{}',
  -- Which menu categories this rate applies to, by categories.key. Empty means
  -- all of them. This is how "prepared food is taxed, packaged goods are not"
  -- is expressed.
  categories  TEXT[]        NOT NULL DEFAULT '{}',
  -- Switched off rather than deleted: a rate that stops applying next quarter
  -- must not disappear from the café's own record of what it was charging.
  enabled     BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tax_rates_tenant_idx ON tax_rates (tenant_id);

-- The same isolation every other café-data table carries. Written out rather
-- than added to 016's array because 016 has already run everywhere.
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax_rates;
CREATE POLICY tenant_isolation ON tax_rates
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── Whether the menu price already contains the tax ─────────────────────────
--
-- Pakistan, the UK and most of Europe quote tax-inclusive prices: the customer
-- pays what the board says and the tax is carved back out of it for the books.
-- The US quotes tax-exclusive: the tax is added on top at the till and the
-- customer pays more than the board says.
--
-- Defaults to TRUE because that is what every café already on the platform is
-- doing, whether or not it has ever thought about it — their menu price is the
-- price paid. With no rates configured the two settings are indistinguishable,
-- so this only starts to mean anything once a café adds its first rate, and at
-- that moment the inclusive reading is the one that leaves its totals alone.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS prices_include_tax BOOLEAN NOT NULL DEFAULT TRUE;

-- ── What was actually charged, on the invoice ───────────────────────────────
--
-- The rate is stored on the sale and never read back from tax_rates. Rates
-- change — a county raises half a point in July — and an invoice from June
-- must still say what June said. Reprinting a receipt, refunding it, or filing
-- the quarter it belongs to all read this and not the current configuration.
--
-- tax_lines is the breakdown, one entry per rate that applied:
--   [{ id, name, rate, taxable, amount }]
-- tax_total is their sum, kept as a column so reports can total a quarter
-- without unpacking JSON on every row.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_total     NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_lines     JSONB         NOT NULL DEFAULT '[]';
-- Which way round this particular sale was priced. Not derivable later: the
-- café's setting may have changed since, and the receipt has to say either
-- "Tax included" or show the tax added on top, correctly, forever.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN       NOT NULL DEFAULT FALSE;
