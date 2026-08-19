-- Recover the business type of invoices written while checkout hardcoded
-- 'combined'.
--
-- Every invoice taken between 29 Jun 2026 and this migration says 'combined'
-- regardless of what was actually ordered. Because matchesBusiness() shows a
-- combined invoice under both the Cafe and the Burger report filter, that made
-- the filters return everything — the owner has never been able to look at one
-- business on its own. Fixing checkout only helps invoices taken from now on,
-- so the history is recovered here.
--
-- The lines carry what the header lost: buildOrderLine() stamps each line with
-- lineBusinessType, so the invoice's type can be derived from its contents.
-- This mirrors invoiceBusinessTypeForLines() in lib/businessTypes.js.
--
-- Two deliberate conservatisms:
--
--   • 'both' lines (shared items sold at either counter) never decide the
--     answer on their own, exactly as in the JS.
--   • An invoice where no line carries a type at all is left untouched rather
--     than guessed at. There are a handful, they predate the field, and their
--     contents range from a lone Zinger to a pizza-and-burger combo — 'combined'
--     is the honest answer for them, and it keeps them visible under both
--     filters instead of hiding them under the wrong one.
--
-- Only rewrites rows whose stored value actually disagrees, so re-running is a
-- no-op.
WITH line_types AS (
  SELECT i.id,
         bool_or(l ->> 'lineBusinessType' = 'combined') AS has_combined,
         bool_or(l ->> 'lineBusinessType' = 'cafe')     AS has_cafe,
         bool_or(l ->> 'lineBusinessType' = 'burger')   AS has_burger
  FROM invoices i
  CROSS JOIN LATERAL jsonb_array_elements(i.lines) AS l
  GROUP BY i.id
),
derived AS (
  SELECT id,
         CASE
           WHEN has_combined              THEN 'combined'
           WHEN has_cafe AND has_burger   THEN 'combined'
           WHEN has_burger                THEN 'burger'
           ELSE                                'cafe'
         END AS business_type
  FROM line_types
  WHERE has_combined OR has_cafe OR has_burger
)
UPDATE invoices inv
   SET business_type = d.business_type
  FROM derived d
 WHERE inv.id = d.id
   AND inv.business_type IS DISTINCT FROM d.business_type;
