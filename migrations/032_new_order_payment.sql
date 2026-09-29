-- Whether a new order is rung up already paid.
--
-- Every sale has come out of checkout unpaid, to be marked paid from the
-- invoice afterwards. That suits a café that serves first and takes the money
-- at the end. It does not suit a counter where the customer pays as they
-- order: there, every single sale needs a second tap to say what was always
-- true, and a missed tap leaves the Z report showing money as unaccounted for
-- when it is sitting in the drawer.
--
-- A method rather than a yes/no, because "paid" on its own is not something
-- the books can use: the Z report counts cash and card separately, and an
-- invoice with no method is reported unpaid, not folded into cash (§ ROADMAP).
--
--   unpaid — as before; marked paid from the invoice
--   cash   — paid in cash the moment it is rung up
--   online — paid online / by card the moment it is rung up
--
-- Defaults to 'unpaid', which is what every café already on the platform does.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS new_order_payment VARCHAR(20) NOT NULL DEFAULT 'unpaid';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_new_order_payment_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_new_order_payment_check
      CHECK (new_order_payment IN ('unpaid', 'cash', 'online'));
  END IF;
END $$;
