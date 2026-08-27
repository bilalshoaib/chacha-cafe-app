-- The four tables the white-label work is built on. Creates them empty and
-- touches nothing that exists; the café is backfilled into them by 014, and
-- the app does not read them until the code that follows ships.
--
-- Three levels, because the café's two counters and its branches are not the
-- same kind of thing:
--
--   tenant    the business that pays for the product
--     location  a branch with its own till, its own timezone and currency
--       brand     a counter/menu inside it — today's business_type
--
-- Most customers will have one location and one brand and must never be shown
-- either concept. The columns exist regardless, so turning a second one on
-- later is a change of interface rather than a migration of data.

CREATE TABLE IF NOT EXISTS tenants (
  id              VARCHAR(50)  PRIMARY KEY,
  slug            VARCHAR(60)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  -- active | trial | suspended. Suspension has to keep the data intact, so it
  -- is a status here rather than a deletion.
  status          VARCHAR(20)  NOT NULL DEFAULT 'active',
  plan            VARCHAR(30)  NOT NULL DEFAULT 'standard',
  -- Branding. Nullable: a tenant that has not chosen falls back to the
  -- product's own palette in constants/theme.js.
  brand_primary   VARCHAR(9),
  brand_secondary VARCHAR(9),
  logo_url        TEXT,
  tagline         VARCHAR(160),
  receipt_footer  VARCHAR(200),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Currency, locale, timezone and the shift boundary live on the location, not
-- the tenant: a business can open across a border, and when the day rolls over
-- is a decision each branch makes.
CREATE TABLE IF NOT EXISTS locations (
  id               VARCHAR(50)  PRIMARY KEY,
  tenant_id        VARCHAR(50)  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             VARCHAR(120) NOT NULL,
  -- Short code for human-readable invoice ids once numbering goes per-branch.
  code             VARCHAR(12)  NOT NULL,
  timezone         VARCHAR(60)  NOT NULL DEFAULT 'Asia/Karachi',
  currency         VARCHAR(3)   NOT NULL DEFAULT 'PKR',
  locale           VARCHAR(10)  NOT NULL DEFAULT 'en-PK',
  shift_start_hour SMALLINT     NOT NULL DEFAULT 18 CHECK (shift_start_hour BETWEEN 0 AND 23),
  address          VARCHAR(300),
  phone            VARCHAR(40),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS locations_tenant_idx ON locations (tenant_id);

CREATE TABLE IF NOT EXISTS brands (
  id         VARCHAR(50) PRIMARY KEY,
  tenant_id  VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(80) NOT NULL,
  slug       VARCHAR(40) NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS brands_tenant_idx ON brands (tenant_id);

-- Who may do what, and where. This replaces users.role, which cannot express
-- "manager of the Gulberg branch only" — a role with no branch attached stops
-- meaning anything the moment a tenant has two.
--
-- location_id NULL means every location of the tenant, which is how an owner
-- is stored.
CREATE TABLE IF NOT EXISTS memberships (
  id          VARCHAR(50) PRIMARY KEY,
  user_id     VARCHAR(50) NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  tenant_id   VARCHAR(50) NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  location_id VARCHAR(50)          REFERENCES locations(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A surrogate key rather than (user_id, tenant_id, location_id), because
-- primary key columns are implicitly NOT NULL and location_id has to stay
-- nullable. COALESCE gives the same guarantee while letting the all-locations
-- row take part: one membership per user per tenant per location, and at most
-- one all-locations row.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_unique_idx
  ON memberships (user_id, tenant_id, COALESCE(location_id, ''));

CREATE INDEX IF NOT EXISTS memberships_tenant_idx ON memberships (tenant_id);

-- The platform owner sits above every tenant and belongs to none, so it cannot
-- be a membership. It is the account that creates customers and impersonates
-- them for support.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'platform_owner'
  ) THEN
    ALTER TABLE users ADD COLUMN platform_owner BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
