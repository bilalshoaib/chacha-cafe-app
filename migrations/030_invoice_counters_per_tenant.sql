-- One invoice-number counter per café, not one for the whole platform.
--
-- 005 created three global sequences and checkout has drawn from
-- invoice_seq_combined ever since. That was correct while there was one café.
-- It stopped being correct the moment a second one signed up: every café drew
-- from the same series, so a sale at Chacha took inv-200 and a sale ringing up
-- at the same moment in another café took inv-201. Neither café's invoices
-- count 1, 2, 3, and the number a customer is holding says nothing about how
-- many that café has issued.
--
-- 026 fixed exactly this for order numbers. This is the same fix for the
-- number printed on the receipt, and it is deliberately the same shape: a
-- counters table keyed by tenant, bumped by one atomic UPSERT.

CREATE TABLE IF NOT EXISTS invoice_counters (
  tenant_id VARCHAR(50) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  counter   INTEGER NOT NULL DEFAULT 0
);

-- Seeded from what each café has already issued, so nobody is renumbered and
-- no number is handed out twice. A café mid-service keeps counting from where
-- its last receipt left off; a café that has never sold anything — and every
-- café created from here on — starts at 1.
--
-- Both id shapes are read, because Chacha predates the current one: today's is
-- inv-<n>, and before 011 it was inv-cafe-<n> / inv-burger-<n> /
-- inv-combined-<n>. Only those two are matched, and only anchored. The older
-- ids also include a hex form (inv-cafe-6365e86b) whose trailing characters
-- are not a counter at all, and reading one as a number would launch a café's
-- numbering into the millions.
INSERT INTO invoice_counters (tenant_id, counter)
SELECT t.id,
       COALESCE((
         SELECT MAX((substring(i.id from '^inv-(?:cafe-|burger-|combined-)?([0-9]+)$'))::bigint)
           FROM invoices i
          WHERE i.tenant_id = t.id
            AND i.id ~ '^inv-(?:cafe-|burger-|combined-)?[0-9]+$'
       ), 0)
  FROM tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- An invoice with no café cannot be seeded, counted or read — RLS already
-- hides it from every query in the app. It also cannot be part of the key
-- below. There should be none: 015 backfilled the pre-tenant rows and every
-- write since has gone through a tenant-scoped session. If one exists anyway
-- it is a real anomaly in the sales record, and quietly deleting it or
-- guessing an owner would be the wrong way to find that out.
DO $$
DECLARE orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphans FROM invoices WHERE tenant_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION
      'invoices has % row(s) with no tenant_id; attribute them before this migration can key on it', orphans;
  END IF;
END $$;

ALTER TABLE invoices ALTER COLUMN tenant_id SET NOT NULL;

-- The key becomes the pair, which is what lets two cafés each hold an inv-1.
-- Until now the id alone was the primary key, so the global sequence was not
-- only the numbering policy — it was the only thing keeping ids unique.
--
-- Nothing in the app is weakened by the change: every statement that reads or
-- writes an invoice is already tenant-scoped, by the RLS policy 016 forces on
-- this table and by getInvoiceById, which has always matched on the pair.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE invoices ADD PRIMARY KEY (tenant_id, id);


-- invoice_seq_cafe / _burger / _combined are left where they are. Nothing
-- draws from them after this, and dropping a sequence is the one part of this
-- that could not be undone if a café had to be rolled back onto older code.
