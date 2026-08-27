-- The platform's own books.
--
-- Everything financial in this database until now belonged to a café: their
-- invoices, their expenses, scoped by tenant_id and fenced off by row level
-- security. None of it answers the question the person running the platform
-- actually has, which is whether the business underneath all those cafés is
-- making money.
--
-- So these three tables are deliberately *not* tenant-scoped. A payment row
-- names the café it came from, but it belongs to the platform, and no café may
-- read it — which is why none of these get an RLS policy and none of them are
-- granted to app_tenant. The only way in is requirePlatformOwner().

-- What each plan costs a month. One row per plan, edited from the console
-- rather than hardcoded, because a price list is a business decision and not
-- a deployment.
CREATE TABLE IF NOT EXISTS plan_prices (
  plan          VARCHAR(30)    PRIMARY KEY,
  monthly_price NUMERIC(12,2)  NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

INSERT INTO plan_prices (plan, monthly_price) VALUES
  ('trial', 0), ('standard', 0), ('multi-branch', 0)
ON CONFLICT (plan) DO NOTHING;

-- The café that pays something other than its plan's price. NULL means "use
-- the plan price", which is what almost every café will be — an override is
-- for the deal that got negotiated, and storing one for everybody would mean
-- a price change had to be applied a hundred times.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(12,2);

-- Money in. One row per payment actually received, never per payment due:
-- what a café owes is derived from its price and the periods it has paid for,
-- and a table that recorded both would eventually disagree with itself.
CREATE TABLE IF NOT EXISTS platform_payments (
  id          VARCHAR(50)   PRIMARY KEY,
  -- No ON DELETE CASCADE: a café leaving must not erase the record of what it
  -- paid while it was here. The name is copied for the same reason.
  tenant_id   VARCHAR(50)   REFERENCES tenants(id),
  tenant_name VARCHAR(120)  NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  method      VARCHAR(30)   NOT NULL DEFAULT 'bank',
  -- The month this payment buys, as a date on its first day. What makes it
  -- possible to say "they have paid up to March" rather than only "they have
  -- paid us this much in total".
  period      DATE,
  note        VARCHAR(500)  NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by  VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS platform_payments_received_idx ON platform_payments (received_at DESC);
CREATE INDEX IF NOT EXISTS platform_payments_tenant_idx   ON platform_payments (tenant_id, received_at DESC);
-- One payment per café per month. Recording March twice is a slip, not an
-- intention, and it would overstate revenue silently.
CREATE UNIQUE INDEX IF NOT EXISTS platform_payments_period_idx
  ON platform_payments (tenant_id, period) WHERE period IS NOT NULL;

-- Money out. The platform's own costs — hosting, domains, whatever is paid to
-- keep the thing running. Same shape as a café's expenses so the two screens
-- read alike, but a separate table because they are separate books.
CREATE TABLE IF NOT EXISTS platform_expenses (
  id         VARCHAR(50)   PRIMARY KEY,
  title      VARCHAR(200)  NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  category   VARCHAR(60)   NOT NULL DEFAULT 'other',
  note       VARCHAR(500)  NOT NULL DEFAULT '',
  -- Marks a cost that repeats every month, so the report can separate what is
  -- owed again next month from what was a one-off.
  recurring  BOOLEAN       NOT NULL DEFAULT FALSE,
  spent_at   TIMESTAMPTZ   NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS platform_expenses_spent_idx ON platform_expenses (spent_at DESC);

-- Take the grants back.
--
-- Migrations 017 and 021 grant the tenant roles blanket privileges on every
-- table in the schema, including future ones — which is right for the tables a
-- café's own queries touch, and wrong for these three. They carry no RLS
-- policy, because there is no tenant to scope them to, so a grant is the whole
-- of the permission: a café's role holding SELECT here could read what every
-- other café pays.
--
-- No code path does that today. It is revoked anyway, on the same reasoning
-- that put the tenant isolation in Postgres rather than in the queries — a
-- rule a future route has to remember is a rule that will eventually be
-- forgotten, and the platform's books are the last thing to leak.
REVOKE ALL ON plan_prices, platform_payments, platform_expenses FROM app_tenant;
REVOKE ALL ON plan_prices, platform_payments, platform_expenses FROM app_tenant_ro;
