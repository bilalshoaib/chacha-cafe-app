-- Add cost_price to menu_items: what the item costs the business to make or
-- buy, alongside `price` which is what the customer pays. Nullable, because
-- existing items have no cost recorded and "unknown" must stay distinct from
-- "free" — a zero here would report a 100% margin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE menu_items ADD COLUMN cost_price NUMERIC(12,2);
  END IF;
END $$;
