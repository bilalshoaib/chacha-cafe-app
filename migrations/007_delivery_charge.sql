-- Add delivery_charge column to invoices for delivery orders.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'delivery_charge'
  ) THEN
    ALTER TABLE invoices ADD COLUMN delivery_charge NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;
