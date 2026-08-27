-- Moves the existing café into the tenant model as customer number one.
--
-- Everything in the database until now belongs to one business, so this is a
-- single tenant with a single location. Nothing about the app changes: the
-- staff see the same screens, the same menu and the same invoices. What
-- changes is that every row can now say who it belongs to, which is what the
-- isolation work in the next migration needs in order to mean anything.
--
-- Ids are fixed strings rather than generated, so re-running this reaches the
-- same rows instead of creating a second café. Every statement is guarded, so
-- a re-run changes nothing.

-- ── The tenant ──────────────────────────────────────────────────────────────
-- Colours come from constants/theme.js, which has been the single source of
-- the palette all along. Holding them here is what lets a second café pick
-- its own without a deploy.
INSERT INTO tenants (id, slug, name, status, plan, brand_primary, brand_secondary, tagline)
VALUES ('t-chacha', 'chacha', 'Chacha Burger & Cafe', 'active', 'standard',
        '#0d9488', '#f0a830', 'Good Food ★ Good Mood')
ON CONFLICT (id) DO NOTHING;

-- ── Its one branch ──────────────────────────────────────────────────────────
-- The timezone, currency and 6 PM shift boundary are the values that were
-- hardcoded in lib/shift.js and utils/formatting.js. The phone is the one
-- printed on the menu board.
INSERT INTO locations (id, tenant_id, name, code, timezone, currency, locale, shift_start_hour, phone)
VALUES ('loc-chacha-main', 't-chacha', 'Main Branch', 'MAIN',
        'Asia/Karachi', 'PKR', 'en-PK', 18, '0315-9988295')
ON CONFLICT (id) DO NOTHING;

-- ── Its two counters ────────────────────────────────────────────────────────
-- Recorded now so the business_type migration later has somewhere to point.
-- Nothing reads these yet.
INSERT INTO brands (id, tenant_id, name, slug, sort_order) VALUES
  ('br-chacha-cafe',   't-chacha', 'Chacha Cafe',   'cafe',   1),
  ('br-chacha-burger', 't-chacha', 'Chacha Burger', 'burger', 2)
ON CONFLICT (id) DO NOTHING;

-- ── Every existing row belongs to that tenant ───────────────────────────────
-- WHERE tenant_id IS NULL keeps these idempotent and, once a second tenant
-- exists, makes it impossible for a re-run to reach their rows.
UPDATE users         SET tenant_id = 't-chacha' WHERE tenant_id IS NULL AND platform_owner = FALSE;
UPDATE menu_items    SET tenant_id = 't-chacha' WHERE tenant_id IS NULL;
UPDATE deals         SET tenant_id = 't-chacha' WHERE tenant_id IS NULL;
UPDATE deal_includes SET tenant_id = 't-chacha' WHERE tenant_id IS NULL;
UPDATE invoices      SET tenant_id = 't-chacha' WHERE tenant_id IS NULL;
UPDATE expenses      SET tenant_id = 't-chacha' WHERE tenant_id IS NULL;

UPDATE invoices SET location_id = 'loc-chacha-main' WHERE location_id IS NULL;
UPDATE expenses SET location_id = 'loc-chacha-main' WHERE location_id IS NULL;

-- ── Roles become memberships ────────────────────────────────────────────────
-- users.role stays where it is for now; the app still reads it, and it is not
-- dropped until the code reads memberships instead. This writes the equivalent
-- membership alongside it.
--
-- An owner gets location_id NULL, meaning every branch of the tenant. Everyone
-- else is tied to the branch they work at — which for now is the only one.
INSERT INTO memberships (id, user_id, tenant_id, location_id, role)
SELECT
  'mem-' || u.id,
  u.id,
  't-chacha',
  CASE WHEN u.role = 'super_admin' THEN NULL ELSE 'loc-chacha-main' END,
  CASE u.role
    WHEN 'super_admin'     THEN 'tenant_owner'
    WHEN 'admin'           THEN 'location_manager'
    WHEN 'counter_cashier' THEN 'cashier'
    ELSE                        'staff'
  END
FROM users u
WHERE u.platform_owner = FALSE
ON CONFLICT DO NOTHING;
