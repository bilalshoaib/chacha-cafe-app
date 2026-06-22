-- Add order_type column to invoices (takeaway | dine_in | delivery).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE invoices ADD COLUMN order_type VARCHAR(20);
  END IF;
END $$;
