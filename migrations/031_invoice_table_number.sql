-- Which table a sale was served to.
--
-- Order type already says *dine in*; nothing said *where*. A café running food
-- to tables had one place to put it — the free-text customer note, whose
-- placeholder still reads "Table name, pickup, etc." — and a note is not a
-- field: it cannot be searched for as a table, it prints buried at the foot of
-- the receipt under "Note:", and half the staff write "T4" while the other
-- half write "table four". So the runner reads the note if there is one, and
-- guesses if there is not.
--
-- On invoices rather than on tabs. `tabs.label` is already a table number for
-- the cafés that use tabs, but tabs are opt-in and hidden from the UI for now
-- (§2.7), the label is deliberately free text — "Dave", "the two by the
-- window" — and, per the backlog note under §2.7, the tab knows its invoice
-- and not the reverse, so a sale cannot be traced back to a table through it.
-- This is the forward link that reporting actually needs, and it works for the
-- counter-service path that never opens a tab at all.
--
-- Free text, not an integer. "12A", "Patio 3" and "Bar 2" are all table
-- numbers to the people calling them out, and a café that numbers 1..20 loses
-- nothing by storing "7" as text.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS table_number VARCHAR(20);

-- Finding a table's sale is a live question — "who's on four?" — asked while
-- somebody waits at the till, so it is one of the things the invoice search
-- matches (see lib/invoiceQuery.js). Lowercased in the index because the
-- search lowercases what it is given: "t4" has to find "T4".
CREATE INDEX IF NOT EXISTS invoices_tenant_table_number_idx
  ON invoices (tenant_id, lower(table_number))
  WHERE table_number IS NOT NULL;
