-- Gives the application a role that row level security actually applies to.
--
-- 016 enabled and forced the policies, and they did nothing: Neon grants
-- neondb_owner the BYPASSRLS attribute, which overrides ENABLE, FORCE and
-- every policy on the table. Measured, not assumed — a raw SELECT still
-- returned all 4,333 invoices with the policies in place.
--
-- BYPASSRLS cannot be dropped from the role the app connects as without
-- breaking migrations, which legitimately need to reach across tenants. So
-- the connection stays as it is, and each tenant-scoped transaction steps
-- down into a role that has no such attribute. Migrations, running outside
-- withTenant(), keep the owner's full reach.
--
-- app_tenant has NOLOGIN and no password: it exists only to be assumed with
-- SET LOCAL ROLE, so there is no new credential to distribute or rotate, and
-- nothing to leak into the repository or the deployment config.
--
-- To be clear about what this defends against: a forgotten WHERE clause, and
-- a query that never went through withTenant(). Application code could call
-- RESET ROLE and climb back out, so this is not a boundary against hostile
-- code running inside the app — it is a boundary against the mistake that
-- actually happens.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN;
  END IF;
END $$;

-- The connecting role must be a member of app_tenant to SET ROLE to it.
DO $$
BEGIN
  EXECUTE format('GRANT app_tenant TO %I', current_user);
EXCEPTION WHEN duplicate_object OR invalid_grant_operation THEN
  NULL;
END $$;

GRANT USAGE ON SCHEMA public TO app_tenant;

-- Only the tables the application reaches from inside withTenant().
-- schema_migrations is not among them: migrations run as the owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  menu_items, deals, deal_includes, invoices, expenses,
  users, memberships, tenants, locations, brands, shift_counters
TO app_tenant;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_tenant;
