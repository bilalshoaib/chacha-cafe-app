-- One order-number counter per café, not one for the whole platform.
--
-- shift_counters has been keyed on the date alone since 008, when there was
-- one café and that was the same thing. It stopped being the same thing the
-- moment a second café signed up: two cafés trading on the same date drew from
-- one counter, so their receipts interleaved — café A got 1, café B got 2,
-- café A got 3 — and neither's short numbers ran 1, 2, 3 as their staff
-- expect. 025 makes it plainer still, because two cafés on different trading
-- hours no longer even roll over at the same moment.
ALTER TABLE shift_counters
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE;

-- Existing rows are attributed to whoever actually traded on that date, read
-- from the invoices themselves rather than assumed to be Chacha. A date whose
-- invoices are gone leaves a counter nothing can be inferred from, and a
-- counter with no café is a row no query will ever match again.
UPDATE shift_counters c
   SET tenant_id = (
     SELECT i.tenant_id
       FROM invoices i
      WHERE i.shift_date = c.shift_date
        AND i.tenant_id IS NOT NULL
      GROUP BY i.tenant_id
      ORDER BY COUNT(*) DESC
      LIMIT 1
   )
 WHERE c.tenant_id IS NULL;

DELETE FROM shift_counters WHERE tenant_id IS NULL;

ALTER TABLE shift_counters ALTER COLUMN tenant_id SET NOT NULL;

-- The key becomes the pair. Dropped by name rather than recreated wholesale so
-- the counters themselves — the numbers a café's receipts are already printed
-- with — are carried across untouched.
ALTER TABLE shift_counters DROP CONSTRAINT IF EXISTS shift_counters_pkey;
ALTER TABLE shift_counters ADD PRIMARY KEY (tenant_id, shift_date);
