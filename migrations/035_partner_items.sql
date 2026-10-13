-- A partner kitchen's own items: food it makes itself and sells through the
-- café's till, beside the café's items it sells at its own prices.
--
-- The café supplies nothing for these, so it is owed nothing for them — a line
-- sold from here freezes a supply price of 0 and the whole of it settles to
-- the partner (lib/partners.js). They are not menu_items: the café's menu,
-- stock and reports never see them as the café's.
--
-- `category` is one of the café's category keys when the partner files the
-- item under one, or a name of the partner's own otherwise.
CREATE TABLE IF NOT EXISTS partner_items (
  id         VARCHAR(50)   PRIMARY KEY,
  brand_id   VARCHAR(50)   NOT NULL REFERENCES brands(id)  ON DELETE CASCADE,
  tenant_id  VARCHAR(50)   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(120)  NOT NULL,
  category   VARCHAR(60)   NOT NULL DEFAULT 'other',
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  visible    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_items_brand_idx ON partner_items (tenant_id, brand_id);

ALTER TABLE partner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON partner_items;
CREATE POLICY tenant_isolation ON partner_items
  USING      (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
