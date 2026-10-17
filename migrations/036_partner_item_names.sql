-- The name a partner kitchen gives a café item on its own website.
--
-- A partner sells the café's items under its own brand, and may call them
-- something else — the café's "Zinger" is the kitchen's "Crispy Chicken
-- Burger". Only the partner's public menu (/api/menu-public/partners/<slug>)
-- shows it; the till, receipts and reports keep the café's name, so the
-- cashier and the settlement still speak of the same item.
--
-- Nullable: no name of its own means the café's name is shown, as before.
ALTER TABLE partner_prices ADD COLUMN IF NOT EXISTS display_name VARCHAR(120);
