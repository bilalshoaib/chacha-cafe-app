-- Adds the tenant and location columns to the tables that hold café data.
--
-- Nullable for now, and nothing reads them yet: 015 fills them in and a later
-- migration makes them NOT NULL, once the application code can no longer write
-- a row without them. Splitting it that way means each step is verifiable on
-- its own and none of them can leave the table in a state the running app
-- cannot cope with.
--
-- business_type is deliberately left alone. Replacing it with a brands
-- reference is its own piece of work; mixing it in here would put a data
-- migration of every menu item, deal and invoice in the same step as the
-- isolation work, and the isolation work is the part that has to be right.

-- ── tenant_id ───────────────────────────────────────────────────────────────
-- users.tenant_id is nullable for good: the platform owner belongs to no
-- tenant. Every other account has one.
ALTER TABLE users         ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id);
ALTER TABLE menu_items    ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id);
ALTER TABLE deals         ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id);
ALTER TABLE invoices      ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id);
ALTER TABLE expenses      ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id);

-- deal_includes carries its own tenant_id rather than reaching through deals.
-- Row level security evaluates per table, and a policy that had to join to its
-- parent to decide would be both slower and easier to get wrong.
ALTER TABLE deal_includes ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id);

-- ── location_id ─────────────────────────────────────────────────────────────
-- Only the things that happen at a branch: an order is taken somewhere and a
-- cost is incurred somewhere. The menu is shared across a tenant's branches,
-- with per-branch price overrides to come later.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS location_id VARCHAR(50) REFERENCES locations(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS location_id VARCHAR(50) REFERENCES locations(id);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The queries that matter are "this tenant, this branch, this date range", so
-- the date column rides along in the index rather than sitting in one of its
-- own. The existing single-column date indexes stay for the report endpoints
-- that scan a range across everything.
CREATE INDEX IF NOT EXISTS invoices_tenant_location_created_idx
  ON invoices (tenant_id, location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_tenant_location_spent_idx
  ON expenses (tenant_id, location_id, spent_at DESC);
CREATE INDEX IF NOT EXISTS menu_items_tenant_idx    ON menu_items (tenant_id);
CREATE INDEX IF NOT EXISTS deals_tenant_idx         ON deals (tenant_id);
CREATE INDEX IF NOT EXISTS deal_includes_tenant_idx ON deal_includes (tenant_id);
CREATE INDEX IF NOT EXISTS users_tenant_idx         ON users (tenant_id);
