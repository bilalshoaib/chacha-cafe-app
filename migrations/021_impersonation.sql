-- Support access to a café's account, and the record of it.
--
-- Customers will ask whether you can see their data. "Yes, and every time it
-- happens is written down and visible to you" is an answer that earns trust;
-- "no" is one you cannot honestly give while also offering support. That makes
-- the log part of the feature rather than an addition to it.
CREATE TABLE IF NOT EXISTS audit_log (
  id         VARCHAR(50)  PRIMARY KEY,
  -- Who was really at the keyboard. Never the account being acted as, so an
  -- entry can always be traced back to a person.
  actor_id   VARCHAR(50)  NOT NULL REFERENCES users(id),
  actor_email VARCHAR(120) NOT NULL,
  -- The café the action touched. Kept even if the tenant is later deleted,
  -- hence no foreign key: an audit trail that disappears with its subject is
  -- not an audit trail.
  tenant_id  VARCHAR(50),
  tenant_name VARCHAR(120),
  action     VARCHAR(60)  NOT NULL,
  detail     VARCHAR(500),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_idx  ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

-- A role that can look but not touch.
--
-- Impersonation is read-only until the platform owner deliberately takes
-- control, and that guarantee is enforced here rather than by a check in each
-- write route. A route guard has to be remembered on every route ever added;
-- a role without INSERT cannot be talked into writing by a handler that forgot
-- to ask.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant_ro') THEN
    CREATE ROLE app_tenant_ro NOLOGIN;
  END IF;
  EXECUTE format('GRANT app_tenant_ro TO %I', current_user);
EXCEPTION WHEN duplicate_object OR invalid_grant_operation THEN
  NULL;
END $$;

GRANT USAGE ON SCHEMA public TO app_tenant_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_tenant_ro;

DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO app_tenant_ro',
    current_user);
END $$;

-- Row level security applies to it exactly as it does to app_tenant: read-only
-- must still mean read-only *of one café*.
