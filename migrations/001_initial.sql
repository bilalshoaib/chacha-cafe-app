-- Cafe Order App — initial schema
-- Run once; all statements use IF NOT EXISTS so re-running is safe.

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(50)  PRIMARY KEY,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff',
  display_name  VARCHAR(80),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            VARCHAR(50)   PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  category      VARCHAR(40)   NOT NULL DEFAULT 'other',
  business_type VARCHAR(10)   NOT NULL DEFAULT 'cafe',
  price         NUMERIC(12,2) NOT NULL,
  size          VARCHAR(60),
  flavour       VARCHAR(80),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id            VARCHAR(50)   PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  business_type VARCHAR(10)   NOT NULL DEFAULT 'cafe',
  price         NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Many-to-many: which items (and quantities) a deal includes.
CREATE TABLE IF NOT EXISTS deal_includes (
  deal_id VARCHAR(50) NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL REFERENCES menu_items(id),
  qty     INTEGER     NOT NULL DEFAULT 1 CHECK (qty >= 1),
  PRIMARY KEY (deal_id, item_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            VARCHAR(50) PRIMARY KEY,
  business_type VARCHAR(10) NOT NULL DEFAULT 'cafe',
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  lines         JSONB       NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invoiced_at   TIMESTAMPTZ,
  invoice_id    VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS invoices (
  id            VARCHAR(50)   PRIMARY KEY,
  order_id      VARCHAR(50),
  business_type VARCHAR(10)   NOT NULL DEFAULT 'cafe',
  customer_note VARCHAR(200)  NOT NULL DEFAULT '',
  lines         JSONB         NOT NULL DEFAULT '[]',
  subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid          BOOLEAN       NOT NULL DEFAULT FALSE,
  paid_at       TIMESTAMPTZ,
  returned      BOOLEAN       NOT NULL DEFAULT FALSE,
  returned_at   TIMESTAMPTZ,
  return_note   VARCHAR(300),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_business_type_idx ON invoices (business_type);

CREATE TABLE IF NOT EXISTS expenses (
  id            VARCHAR(50)   PRIMARY KEY,
  title         VARCHAR(200)  NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  category      VARCHAR(60)   NOT NULL DEFAULT 'other',
  business_type VARCHAR(10)   NOT NULL DEFAULT 'cafe',
  note          VARCHAR(500)  NOT NULL DEFAULT '',
  spent_at      TIMESTAMPTZ   NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_spent_at_idx ON expenses (spent_at DESC);

-- Session store table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR         NOT NULL COLLATE "default",
  "sess"   JSON            NOT NULL,
  "expire" TIMESTAMP(6)    NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
