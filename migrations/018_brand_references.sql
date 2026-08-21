-- Points menu items, deals and invoices at a brand row instead of the
-- business_type string.
--
-- business_type stays where it is for now and keeps being written: the app
-- still reads it, and dropping it in the same step as adding its replacement
-- would mean the schema and the running code disagree for the length of a
-- deploy. It is removed once nothing reads it.
--
-- NULL brand_id means "not one particular brand", which is a real answer
-- rather than missing data:
--   • a menu item marked 'both' is sold at either counter
--   • a deal marked 'combined' spans them, and its split lives in deal_splits
--   • an invoice marked 'combined' holds lines from both
-- A café with one brand has no such rows, and never sees the concept.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS brand_id VARCHAR(50) REFERENCES brands(id);
ALTER TABLE deals      ADD COLUMN IF NOT EXISTS brand_id VARCHAR(50) REFERENCES brands(id);
ALTER TABLE invoices   ADD COLUMN IF NOT EXISTS brand_id VARCHAR(50) REFERENCES brands(id);

CREATE INDEX IF NOT EXISTS menu_items_brand_idx ON menu_items (brand_id);
CREATE INDEX IF NOT EXISTS deals_brand_idx      ON deals (brand_id);
CREATE INDEX IF NOT EXISTS invoices_brand_idx   ON invoices (brand_id);

-- Replaces deals.cafe_split / deals.burger_split, which named Chacha's two
-- counters in the schema and so could not describe a third, or a customer
-- whose counters are called something else.
CREATE TABLE IF NOT EXISTS deal_splits (
  deal_id   VARCHAR(50)   NOT NULL REFERENCES deals(id)  ON DELETE CASCADE,
  brand_id  VARCHAR(50)   NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  tenant_id VARCHAR(50)   NOT NULL REFERENCES tenants(id),
  amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (deal_id, brand_id)
);

CREATE INDEX IF NOT EXISTS deal_splits_tenant_idx ON deal_splits (tenant_id);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Matched on the brand's slug, so this works for any tenant whose brands are
-- named after the business_type values their rows carry — which is every
-- tenant that predates brands, there being exactly one.
UPDATE menu_items m SET brand_id = b.id FROM brands b
 WHERE m.brand_id IS NULL AND b.tenant_id = m.tenant_id AND b.slug = m.business_type;

UPDATE deals d SET brand_id = b.id FROM brands b
 WHERE d.brand_id IS NULL AND b.tenant_id = d.tenant_id AND b.slug = d.business_type;

UPDATE invoices i SET brand_id = b.id FROM brands b
 WHERE i.brand_id IS NULL AND b.tenant_id = i.tenant_id AND b.slug = i.business_type;

-- Combined deals: one row per brand carrying that brand's share of the price.
INSERT INTO deal_splits (deal_id, brand_id, tenant_id, amount)
SELECT d.id, b.id, d.tenant_id,
       CASE b.slug WHEN 'cafe' THEN d.cafe_split ELSE d.burger_split END
  FROM deals d
  JOIN brands b ON b.tenant_id = d.tenant_id AND b.slug IN ('cafe', 'burger')
 WHERE d.business_type = 'combined'
ON CONFLICT (deal_id, brand_id) DO NOTHING;
