-- Add split-revenue columns to deals for combined (Cafe + Burger) deals.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS cafe_split  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS burger_split NUMERIC(12,2) NOT NULL DEFAULT 0;
