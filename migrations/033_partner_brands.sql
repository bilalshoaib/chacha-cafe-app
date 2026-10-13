-- Partner kitchens: a second business selling through this café's till, from
-- this café's menu, at its own prices.
--
-- The case that prompted it: another operator takes items from the café at a
-- discount off the café's menu price, sells whichever of them it chooses at
-- prices it sets, and the café's cashier rings those sales up and takes the
-- money. At the end of a period the two settle from the reports — the café
-- keeps its discounted price for every unit sold and owes the partner the rest.
--
-- A partner is a brand, because that is what a brand already is here: a menu
-- inside a tenant that its reports keep apart. What sets it apart from the
-- café's own counters is that it does not sell the menu at the menu's prices.
-- It has a price list of its own, below, and a sale belongs to it alone — a
-- bill is never part café, part partner.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS partner BOOLEAN NOT NULL DEFAULT FALSE;

-- What the café takes off its own menu price when it supplies the partner.
-- 20 means the partner owes 80% of the café's price for every unit it sells.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS supply_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brands_supply_discount_pct_check') THEN
    ALTER TABLE brands ADD CONSTRAINT brands_supply_discount_pct_check
      CHECK (supply_discount_pct >= 0 AND supply_discount_pct <= 100);
  END IF;
END $$;

-- A partner's menu: which of the café's items it sells, and for how much.
--
-- An item with no row here is one the partner does not sell. `visible` is the
-- softer "not today" — the price is kept so it does not have to be typed in
-- again when the item comes back.
CREATE TABLE IF NOT EXISTS partner_prices (
  brand_id   VARCHAR(50)   NOT NULL REFERENCES brands(id)     ON DELETE CASCADE,
  item_id    VARCHAR(50)   NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  tenant_id  VARCHAR(50)   NOT NULL REFERENCES tenants(id)    ON DELETE CASCADE,
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  visible    BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_id, item_id)
);

CREATE INDEX IF NOT EXISTS partner_prices_tenant_idx ON partner_prices (tenant_id);

ALTER TABLE partner_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_prices FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON partner_prices;
CREATE POLICY tenant_isolation ON partner_prices
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- A partner's sales carry its slug in business_type, the column every report
-- already filters on. Ten characters was enough for 'cafe', 'burger' and
-- 'combined'; a brand slug can be forty. Widening a varchar is a catalogue
-- change in Postgres, not a table rewrite, so this takes no lasting lock.
ALTER TABLE invoices ALTER COLUMN business_type TYPE VARCHAR(40);

-- A login belonging to a partner. Such an account reaches only its own
-- partner's screens: selling, its price list and its own sales. NULL for every
-- other account, which is every account that existed before this.
ALTER TABLE users ADD COLUMN IF NOT EXISTS brand_id VARCHAR(50) REFERENCES brands(id) ON DELETE SET NULL;
