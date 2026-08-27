-- A café's uploaded logo.
--
-- The bytes live in their own table rather than in a column on tenants,
-- because tenants is read on *every* request: app/layout.jsx resolves the
-- café's name and colours before it renders anything. A logo inlined there
-- would be dragged across the wire on every page load, for a value the browser
-- is perfectly capable of caching on its own.
--
-- So the row on tenants keeps only logo_url — a path to the route that serves
-- these bytes, carrying a version stamp so a replaced logo busts the cache
-- without anything having to be purged.
--
-- Stored in the database rather than on a disk or in a bucket because there is
-- no bucket: the app runs on Vercel, where the filesystem is neither writable
-- nor shared between instances. A logo is a few tens of kilobytes and is read
-- through a cached route, so a BYTEA column is the honest answer here and not
-- merely the expedient one.
CREATE TABLE IF NOT EXISTS tenant_logos (
  tenant_id  VARCHAR(50)  PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  mime       VARCHAR(40)  NOT NULL,
  bytes      BYTEA        NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- No row level security, for the same reason tenants has none: this is read
-- outside any tenant context. The route that serves a logo has no session to
-- read a tenant from — it is reached by a browser fetching an <img> on the
-- public menu board and on the login page, where nobody is signed in yet.
-- A logo is not a secret; it is the thing a café wants shown.
GRANT SELECT ON tenant_logos TO app_tenant, app_tenant_ro;
