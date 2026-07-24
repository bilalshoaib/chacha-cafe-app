-- Per-shift order numbering. A shift starts at 6 PM (Asia/Karachi) and runs
-- until the next 6 PM; the counter resets to 1 at the start of each shift so
-- waiters/chefs can track same-evening orders by a short number instead of
-- the full invoice id.
CREATE TABLE IF NOT EXISTS shift_counters (
  shift_date DATE NOT NULL PRIMARY KEY,
  counter    INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'shift_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN shift_date DATE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'shift_number'
  ) THEN
    ALTER TABLE invoices ADD COLUMN shift_number INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoices_shift_number_idx ON invoices (shift_date, shift_number);
