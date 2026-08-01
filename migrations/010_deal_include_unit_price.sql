-- Add unit_price to deal_includes: what one unit of this item is worth *inside
-- this deal*, e.g. a zinger counted at Rs 180 in a Rs 1,000 combo even though
-- it sells for Rs 200 on its own.
--
-- Nullable: deals created before this, and items the owner doesn't want to
-- price individually, leave it unset and fall back to splitting the deal's
-- revenue by menu price.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deal_includes' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE deal_includes ADD COLUMN unit_price NUMERIC(12,2);
  END IF;
END $$;
