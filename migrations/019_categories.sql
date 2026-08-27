-- Menu categories become the café's own, instead of seven keys compiled into
-- constants/categories.js.
--
-- That list named pizza, burger, fries, wings, shawarma, roll and drinks — a
-- fast-food menu, and no use at all to a coffee house or a sushi bar. It was
-- also already wrong for the café that owns it: fries, wings and roll have no
-- items, while shwarma, broast, snack, snacks and drink are in daily use and
-- appear nowhere in the list, so the menu board renders them with the generic
-- plate icon and the fallback grey.
--
-- Seeded from what each tenant actually uses rather than from the constant, so
-- nothing invents categories nobody has. menu_items.category keeps its slug —
-- items are already tenant-scoped, so the key is a per-tenant namespace and
-- needs no migration. What moves here is the label, icon, colour and order.
CREATE TABLE IF NOT EXISTS categories (
  id         VARCHAR(50) PRIMARY KEY,
  tenant_id  VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        VARCHAR(40) NOT NULL,
  label      VARCHAR(80) NOT NULL,
  icon       VARCHAR(16),
  color      VARCHAR(9),
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories (tenant_id);

-- Seed each tenant from the categories its own menu uses. Known keys get the
-- label, icon and colour they already render with; obvious spelling variants
-- are matched to the same presentation so the board stops showing a plate for
-- half the menu. Anything unrecognised gets a title-cased label and the
-- neutral styling, which is exactly what it renders with today — the owner can
-- rename it, and now has somewhere to do so.
INSERT INTO categories (id, tenant_id, key, label, icon, color, sort_order)
SELECT
  'cat-' || substr(md5(m.tenant_id || ':' || m.category), 1, 12),
  m.tenant_id,
  m.category,
  CASE m.category
    WHEN 'pizza'   THEN 'Pizzas'      WHEN 'burger'  THEN 'Burgers'
    WHEN 'fries'   THEN 'Fries'       WHEN 'wings'   THEN 'Wings'
    WHEN 'shawarma' THEN 'Shawarmas'  WHEN 'shwarma' THEN 'Shawarmas'
    WHEN 'roll'    THEN 'Rolls'       WHEN 'drinks'  THEN 'Cold drinks'
    WHEN 'drink'   THEN 'Cold drinks' WHEN 'broast'  THEN 'Broast'
    WHEN 'snack'   THEN 'Snacks'      WHEN 'snacks'  THEN 'Snacks'
    ELSE initcap(replace(m.category, '-', ' '))
  END,
  CASE m.category
    WHEN 'pizza'   THEN '🍕' WHEN 'burger'   THEN '🍔'
    WHEN 'fries'   THEN '🍟' WHEN 'wings'    THEN '🍗'
    WHEN 'broast'  THEN '🍗' WHEN 'shawarma' THEN '🌯'
    WHEN 'shwarma' THEN '🌯' WHEN 'roll'     THEN '🌯'
    WHEN 'drinks'  THEN '🥤' WHEN 'drink'    THEN '🥤'
    WHEN 'snack'   THEN '🍿' WHEN 'snacks'   THEN '🍿'
    ELSE '🍽️'
  END,
  CASE m.category
    WHEN 'pizza'   THEN '#8a1f1f' WHEN 'burger'   THEN '#c45c26'
    WHEN 'fries'   THEN '#b8860b' WHEN 'wings'    THEN '#6b3fa0'
    WHEN 'broast'  THEN '#6b3fa0' WHEN 'shawarma' THEN '#1f7a5c'
    WHEN 'shwarma' THEN '#1f7a5c' WHEN 'roll'     THEN '#1f7a5c'
    WHEN 'drinks'  THEN '#1f7a3c' WHEN 'drink'    THEN '#1f7a3c'
    ELSE '#55483c'
  END,
  ROW_NUMBER() OVER (PARTITION BY m.tenant_id ORDER BY COUNT(*) DESC, m.category)
FROM menu_items m
WHERE m.tenant_id IS NOT NULL
GROUP BY m.tenant_id, m.category
ON CONFLICT (tenant_id, key) DO NOTHING;
