-- A short description of a menu item, for the menus customers read on the web.
--
-- Plain text, one or two sentences — it sits under the name on a menu card.
-- The public menus (/api/menu-public and a partner's
-- /api/menu-public/partners/<slug>) carry it; the till and receipts do not.
--
-- Nullable: an item without one shows none.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description VARCHAR(300);
