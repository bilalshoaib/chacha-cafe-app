-- Add payment_method column to invoices.
-- Safe to re-run (IF NOT EXISTS guard via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE invoices ADD COLUMN payment_method VARCHAR(20);
  END IF;
END $$;
