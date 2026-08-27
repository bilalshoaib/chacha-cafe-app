-- When a café's day starts and ends.
--
-- Chacha opens at 6 PM and closes at 5 PM the next afternoon, and those two
-- hours were written into lib/shift.js and into the reports screen as the
-- number 18 and the number 17. Every café on the platform inherited a burger
-- shop's night shift: a breakfast place opening at seven had its takings for
-- Tuesday morning counted against Monday, and its order numbers reset in the
-- middle of service.
--
-- On tenants rather than locations, which has carried a shift_start_hour since
-- 013 and is still read by nothing. A trading day is a decision the business
-- makes, and the platform console governs businesses; when a chain's branches
-- genuinely differ, the location's column becomes the override and this stays
-- the default it falls back to.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS day_start_hour SMALLINT NOT NULL DEFAULT 18
    CHECK (day_start_hour BETWEEN 0 AND 23);

-- The hour the day closes, the next calendar day. Equal to the start means a
-- café that never shuts: the day runs the full twenty-four hours and rolls
-- straight into the next.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS day_end_hour SMALLINT NOT NULL DEFAULT 17
    CHECK (day_end_hour BETWEEN 0 AND 23);

-- The defaults above are Chacha's hours, deliberately: every café already on
-- the platform has been trading, numbering and reporting on them, and a
-- migration that quietly moved somebody's day boundary would move money
-- between two days of their books. Whoever runs the platform sets the real
-- hours per café from the console.
