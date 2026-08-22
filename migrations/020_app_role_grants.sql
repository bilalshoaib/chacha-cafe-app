-- Grants app_tenant everything in the schema, and arranges for tables added
-- later to be granted automatically.
--
-- 017 granted on a list of table names written by hand, and the list went
-- stale two migrations later: categories and deal_splits were created after
-- it, so the application could not read its own menu categories. The error
-- surfaced as "permission denied for table categories" the first time a café
-- was created, which is late.
--
-- A hand-maintained list of every table is a list that will be wrong again, so
-- this grants across the schema and sets default privileges for whatever comes
-- next. Row level security is what limits app_tenant to one tenant's rows;
-- these grants only decide which tables it may reach at all, and withholding
-- one buys no safety — it buys an outage.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_tenant;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_tenant;

-- Applies to tables this role creates from now on. Migrations run as the
-- connecting role, so this is the role that will create them.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant', current_user);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO app_tenant', current_user);
END $$;

-- schema_migrations is the exception, and deliberately so: it records what has
-- been applied, and nothing running inside a tenant transaction has any
-- business writing to it.
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM app_tenant;
