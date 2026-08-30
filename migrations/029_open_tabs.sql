-- Open tabs and table service.
--
-- Checkout goes straight from a cart held in the browser to an invoice, so an
-- order only exists on the device that is typing it. A customer cannot start a
-- tab, a server cannot hold table four's order open while they fetch the
-- drinks, and a cashier cannot pick up an order somebody else began. That is
-- fine for counter service and blocking for anything with table numbers.
--
-- ── Why not the existing `orders` table ─────────────────────────────────────
--
-- There is one, from before the multi-tenant work, and nothing has written to
-- it since. The obvious move is to build on it. It is the wrong move twice
-- over.
--
-- It predates every tenancy concept in the app: no tenant_id, no location_id,
-- and therefore no row level security. Adding those is most of a new table
-- anyway, and doing it in place means a window where the old rows have no
-- tenant and the policy cannot be enabled.
--
-- And it is not dead weight to be cleared away — it holds 38 real rows from
-- June and July 2026, 25 of which are referenced by `invoices.order_id`.
-- Dropping it, which is the other course the backlog suggested, would orphan
-- the history of twenty-five real sales. So it stays exactly as it is, as a
-- record of how orders used to work, and tabs get a table of their own.

CREATE TABLE IF NOT EXISTS tabs (
  id          VARCHAR(50)  PRIMARY KEY,
  tenant_id   VARCHAR(50)  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Nullable, as on tax_rates and shift_closes, and for the same reason:
  -- requireTenant() returns no location id yet. The day a branch switcher
  -- lands, a tab belongs to the till it was opened on.
  location_id VARCHAR(50)  REFERENCES locations(id) ON DELETE CASCADE,

  -- What staff call it out as: "Table 4", "Dave", "the two by the window".
  -- Free text rather than a table number, because a café that runs tabs by
  -- customer name is as common as one that runs them by table, and a café
  -- with no tables at all still wants to hold an order open.
  label       VARCHAR(60)  NOT NULL,

  -- open      — being added to
  -- invoiced  — rung up; invoice_id says what it became
  -- abandoned — walked out on, or opened by mistake
  --
  -- Abandoned rather than deleted. A tab that vanishes is a tab nobody can
  -- ask about, and "table six left without paying" is exactly the thing a
  -- manager wants a record of.
  status      VARCHAR(20)  NOT NULL DEFAULT 'open',

  -- The cart, in the shape the till already holds it. Prices here are what was
  -- shown when the line was added; they are advisory, and /api/checkout
  -- re-prices every line against the live menu when the tab is rung up. That
  -- is the same rule the ordinary cart follows and it matters more here, since
  -- a tab can sit open across a menu price change.
  lines       JSONB        NOT NULL DEFAULT '[]',

  order_type    VARCHAR(20),
  customer_note VARCHAR(200) NOT NULL DEFAULT '',

  -- Two servers can have the same tab on screen. Every write states the
  -- version it was based on and is refused if that is no longer current, so
  -- one person's additions cannot silently erase another's — which is the
  -- failure mode that makes shared tabs untrustworthy, and the reason a
  -- last-write-wins tab is worse than no tab at all.
  version     INTEGER      NOT NULL DEFAULT 1,

  opened_by       VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  opened_by_email VARCHAR(200),
  opened_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,

  -- What it became. One-directional on purpose: the tab knows its invoice, the
  -- invoice does not know its tab. Nothing on a receipt or in the books needs
  -- to say which table a sale came from, and `invoices.order_id` already means
  -- something else — a row in the legacy table above.
  invoice_id  VARCHAR(50),

  -- Which trading day it was opened in, stamped the same way an invoice's is,
  -- so a tab left open overnight can be found by the shift it belongs to.
  shift_date  DATE
);

-- The list the till draws on every visit: this café's open tabs, newest first.
CREATE INDEX IF NOT EXISTS tabs_tenant_status_idx
  ON tabs (tenant_id, status, updated_at DESC);

ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tabs;
CREATE POLICY tenant_isolation ON tabs
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
