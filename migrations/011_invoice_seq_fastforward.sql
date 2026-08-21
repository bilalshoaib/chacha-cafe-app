-- Fast-forward the per-business invoice sequences past any invoice id that
-- already exists.
--
-- Checkout hardcoded businessType = 'combined' from 2 Jul 2026, so only
-- invoice_seq_combined advanced after that date. Now that the type is derived
-- from the order's lines again, inv-cafe-N and inv-burger-N ids resume being
-- issued. Sequences keep their position across normal operation, so this is
-- expected to be a no-op — but a database restored from a dump that did not
-- carry sequence state would hand out a number that is already taken, and the
-- primary key violation would surface as a failed checkout at the till.
--
-- Only ever moves a sequence forward, so it is safe to re-run.
DO $$
DECLARE
  slug        TEXT;
  highest     BIGINT;
  current_pos BIGINT;
BEGIN
  FOREACH slug IN ARRAY ARRAY['cafe', 'burger', 'combined'] LOOP
    SELECT COALESCE(MAX((regexp_match(id, '^inv-' || slug || '-(\d+)$'))[1]::BIGINT), 0)
      INTO highest
      FROM invoices;

    current_pos := COALESCE(pg_sequence_last_value(('invoice_seq_' || slug)::regclass), 0);

    IF highest > current_pos THEN
      PERFORM setval('invoice_seq_' || slug, highest, true);
      RAISE NOTICE 'invoice_seq_% fast-forwarded from % to %', slug, current_pos, highest;
    END IF;
  END LOOP;
END $$;
