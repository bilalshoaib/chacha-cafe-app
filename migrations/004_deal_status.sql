-- Soft-delete support for deals: 'active' (default) or 'archived'.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS deals_status_idx ON deals (status);
