-- Enforces tenant isolation in the database itself.
--
-- Every café-data query already carries an explicit tenant_id predicate and
-- runs inside withTenant(), which declares app.tenant_id for the transaction.
-- This makes that declaration binding: a query that forgets the predicate
-- returns nothing instead of returning someone else's rows, and a forgotten
-- WHERE stops being a data breach and becomes an empty screen.
--
-- FORCE, not merely ENABLE. A table's owner is exempt from its own policies
-- by default, and the application connects as the owner — so ENABLE alone
-- would leave the policies switched on and doing nothing at all, which is
-- worse than not having them, because it looks like protection.
--
-- users and tenants are deliberately left out. Login has to find an account
-- before it can know which tenant applies, and the tenant list is what the
-- platform console reads; both are scoped in application code instead.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['menu_items', 'deals', 'deal_includes', 'invoices', 'expenses'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);

    -- current_setting(..., true) returns NULL rather than raising when the
    -- setting is absent, and `tenant_id = NULL` is NULL, which is not true —
    -- so a query outside withTenant() matches no rows. That is the intended
    -- behaviour: silence, not an exception, and never everything.
    --
    -- WITH CHECK covers writes, so a row cannot be inserted or updated into
    -- a tenant other than the one the transaction declared.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $f$, t);
  END LOOP;
END $$;
