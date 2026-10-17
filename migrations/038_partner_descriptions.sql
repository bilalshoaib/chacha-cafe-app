-- A partner kitchen's own descriptions for its website.
--
-- partner_prices.description: what the partner says about a café item it
-- sells. When set it is shown on the partner's public menu in place of the
-- café's description (menu_items.description, migration 037); blank shows the
-- café's. A partner login cannot change the café's menu, so this is where its
-- words go.
--
-- partner_items.description: the same for an item the partner makes itself.
--
-- Both plain text and nullable; only the partner's public menu shows them.
ALTER TABLE partner_prices ADD COLUMN IF NOT EXISTS description VARCHAR(300);
ALTER TABLE partner_items  ADD COLUMN IF NOT EXISTS description VARCHAR(300);
