-- Sequential invoice numbering per business type.
-- Existing UUID-based invoice IDs are untouched; new invoices get inv-cafe-1, inv-burger-1, inv-combined-1, etc.
CREATE SEQUENCE IF NOT EXISTS invoice_seq_cafe     START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_seq_burger   START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_seq_combined START 1;
