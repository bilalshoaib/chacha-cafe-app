-- What a partner kitchen's receipts print in place of the café's identity.
--
-- A partner's customer is the partner's customer: the receipt for a sale rung
-- up on the partner's till names the partner, and nothing of the café whose
-- counter it was rung up at. The name is the brand's own; these are the two
-- lines the café prints from tenants.tagline and tenants.receipt_footer.
--
-- Both nullable. A partner that has set neither prints its name and nothing
-- else, which is still not the café's.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS receipt_tagline VARCHAR(160);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS receipt_footer  VARCHAR(200);
