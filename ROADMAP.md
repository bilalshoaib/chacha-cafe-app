# White-label POS — state of play and what's next

Written 2026-08-29 as a handoff. The point of this file is that a new session
can pick up the work without re-reading the whole codebase to find out what has
already been decided. If you change something here, update this file.

**Context:** the product is a café POS built originally for one customer
(Chacha Burger & Cafe, Pakistan) and since made multi-tenant and white-label.
There are now demos lined up in the United States, which is what most of the
backlog below is driven by.

**Last audited 2026-08-30** against the working tree on `feat/multi-tenant`.
Every claim below was re-checked against the code: the seven shipped items are
in it, and none of the eight backlog items has been started.

## Status at a glance

| | Item | Where |
|---|---|---|
| ✅ | Currency and locale-aware formatting | §2.1 |
| ✅ | Settings split into subpages, language picker removed | §2.2 |
| ✅ | Sales tax | §2.3 |
| ✅ | Offline mode — the till keeps selling | §2.4 |
| ✅ | Timezone picker, and the shift-date bug it fixes | §2.5 |
| ✅ | End-of-day close / Z-report | §2.6 |
| ✅ | Open tabs and table service | §2.7 |
| ✅ | The app stays on screen when the network goes | §2.8 |
| ✅ | Table numbers on an invoice | §2.9 |
| ⬜ | 1. Tipping — *blocker* | §3 |
| ⬜ | 2. Card payments — *blocker* | §3 |
| ⬜ | 3. Menu modifiers — *largest build* | §3 |
| ⬜ | 4. UI translation (Spanish first) | §3 |
| ⬜ | 5. Right-to-left layout | §3 |
| ⬜ | 6. Partial refunds | §3 |
| ⬜ | 7. Email / SMS receipts | §3 |
| ⬜ | 8. Smaller / later (per-branch currency, console locale, loyalty) | §3 |

§2.1 is commit `1ca8bb2`; §2.2 and §2.3 are commit `95d97f9`; §2.4 is commit
`52eafaa`; §2.5 is commit `077e155`; §2.6 is commit `d8fa265`; §2.7 is commit
`f6d7912`; §2.8 is commit `7822be0`. §2.9 is the commit this line ships in.
Nothing is left uncommitted.

---

## 1. Conventions a new session needs to know

Read these before writing code; several of them are load-bearing and not
obvious from a single file.

**Stack.** Next.js 15 App Router, React 19, plain Postgres via `pg` (no ORM),
`iron-session` cookies, JSX with no TypeScript. Dev server runs on **port 3002**.

**Tenancy is three levels** (`migrations/013_multitenant_core.sql` explains the
reasoning):
- `tenants` — the business that pays for the product
- `locations` — a branch with its own till, timezone, currency, locale, trading hours
- `brands` — a counter/menu inside it (today's `business_type`)

Most customers have one location and one brand and **must never be shown either
concept**. Row-level security isolates tenants (`016_row_level_security.sql`);
repositories take a `ctx` from `requireTenant()` as their first argument.

**The "branding road."** Anything every screen needs on first paint goes through
`lib/tenantBranding.js` → `app/layout.jsx` → `context/BrandingContext.jsx`.
It is one cached query (15s TTL, per-instance) resolved server-side and handed
to the client as context. Currency, locale, writing direction and trading hours
all travel it, none of them strictly "branding", because the alternative is a
second query and a second provider on every navigation. **Neon round trips are
~261ms from Pakistan** — that is why this pattern exists. Any write that touches
these columns must call `forgetTenantBranding(tenantId)`.

**The look is the "White Label UI Redesign"** (applied 2026-09-08). Manrope
body / Bricolage Grotesque display, loaded in `app/globals.css` and referenced
only as `--font-body` / `--font-display`. Every colour still derives from the
two brand custom properties — the derivation lives in `app/styles/01-base.css`,
which also carries an opt-in dark surface mode under
`:root[data-theme="dark"]`. The dark choice is a per-device localStorage flag
(`pos-theme`) set by `components/ThemeToggle.jsx` in the sidebar footer and
pre-applied by an inline script in `app/layout.jsx` (hence
`suppressHydrationWarning` on `<html>`). The café app is a fixed left sidebar
(`.side-nav` / `.app-shell` / `.app-main` in `AppShell.jsx` + `03-components.css`),
collapsing to the existing hamburger drawer below 900px. The **sign-in page
shows no café identity** — the tenant is only resolved after the session
exists. The **platform console** keeps its own brand-independent neutral
palette, set by re-pointing the semantic tokens on `.app--platform` at the top
of `app/styles/07-platform.css`.

**Take order keeps its single-column entry-row flow** — a two-column
"catalogue + sticky cart" rebuild was tried and reverted as harder to use at
the counter. The page is only re-skinned: same `ItemAutocomplete` entry row,
`DealPicker` dropdown and editable lines table, now on the redesign's neutral
surfaces (`.theme-chacha` in `app/styles/05-menu-board.css`).

**Money and dates are never formatted directly.** Use `useMoney()` and
`useLocale()` from `context/BrandingContext.jsx`. Only reach for
`moneyFormatter()` / `formatShortDateTime()` in `utils/formatting.js` when a
hook cannot be used — a module-scope string builder (printed receipt, printed
report) or a component the console renders against a café that is not the
session's own (`ReportsWorkbench`). Those take the values as arguments/props.

**Validation is asymmetric on purpose** (`constants/locales.js`): `isCurrency`
refuses on the way *in*, `parseCurrency` falls back on the way *out*. A till
that throws is worse than one showing the wrong symbol, but a bad value must
never reach the database.

**Currency is the only regional choice, and it decides the locale.** There is
no language picker — see section 2.2. `localeForCurrency()` is the single answer
to "what locale is this café in", used on the read path and written to the
`locale` column beside the currency so the two cannot disagree.

**The pricing modules are pure, and that is load-bearing.** `lib/pricing.js`,
`lib/tax.js`, `lib/businessTypes.js`, `lib/shift.js` and `lib/offlineSale.js`
import nothing from the server and run unchanged in the browser. Offline mode
(§2.4) depends on it: a disconnected till prices a sale by running the very
functions `/api/checkout` runs. **Do not reach for `pg`, `next/server` or a
node builtin inside them** — it would not fail loudly, it would quietly stop
the till from being able to sell offline.

**Migrations** are numbered SQL files in `migrations/`, registered in
`lib/migrate.js`, run automatically via `instrumentation.js` on boot. They are
written to be re-runnable (`IF NOT EXISTS`). Offline mode added none: reserving
a number is just consuming the counters that already existed.

**Tests:** `npm test` (`node --test tests/*.test.js`, no framework). 194 passing.
Integration tests in `tests/integration/` need a database.

**Environment gotchas** (these have bitten before):
- `.env.local` switches `DATABASE_URL` between local Postgres and the **live
  Neon production database**. Check which one is active before running anything
  that writes.
- **Never start a second dev server, and never run `next build` while one is
  up.** Both share `.next` and corrupt the running server, which then serves
  500s with `Cannot find module './NNNN.js'`. Check `lsof -ti:3002` first; to
  recover, stop it, `rm -rf .next`, and `npm run dev` again.
- Big work goes on a branch (currently `feat/multi-tenant`); `master` stays
  deployable for live hotfixes.

---

## 2. ✅ DONE — Completed work

### 2.1 Done — currency (commit `1ca8bb2`, amended by section 2.2)

A café trades in its own money, and every screen writes numbers and dates the
way that market does.

> **Amended.** This shipped as *currency and language*, with a language picker
> on three screens. Section 2.2 removed the language half and moved the currency
> half to the platform owner. The table below is the state after that; the
> reasoning here is why the plumbing exists at all.

**The problem it fixed.** `locations` had carried correct `currency` and
`locale` columns since the multi-tenant work, and nothing in the app read them.
`formatMoney` accepted `{locale, currency}` and not one of its ~40 call sites
passed either, so every price on every screen rendered as Pakistani rupees. An
American prospect saw `Rs 12.50` on the menu board.

**What shipped:**

| Area | File(s) |
|---|---|
| Currency list, the locale each implies, validation, RTL detection | `constants/locales.js` *(new)* |
| Locale-aware money and date formatting, cached `Intl` instances | `utils/formatting.js` |
| Read path — both values join the cached branding query | `lib/tenantBranding.js` |
| `useMoney()` / `useLocale()` hooks | `context/BrandingContext.jsx` |
| `<html lang dir>` follows the café's locale | `app/layout.jsx` |
| Write path + validation, applied to all of a tenant's locations | `lib/repositories/tenantsRepository.js` |
| Picker with live priced preview | `components/CurrencyField.jsx` |
| Set from: console / café creation. **Not** from the café's own settings | `app/platform/tenants/[id]/(console)/details/page.jsx`, `app/platform/tenants/new/page.jsx` |
| 21 tests | `tests/locales.test.js` |

Roughly 40 call sites across 20 screens and components were rethreaded onto the
hooks. The new-café form's currency field was previously a free-text box three
characters wide that could produce a code `Intl` has never heard of.

**Offered:** 23 currencies. Adding a market is one line in
`constants/locales.js` — the code, its symbol, and the English locale of that
market.

**Verified:** build clean, read path returns USD/en-US for a tenant set to it,
write path refuses `ZZZ` and busts the cache, served page emits
`<html lang="en-US">` and ships `USD` to the client provider. **Not** visually
confirmed in a browser — the Chrome extension was not connected, so rendered
prices are confirmed via unit tests and server payload rather than a
screenshot. Worth one manual look.

**Local staging DB was modified** (`cafe_order_staging`, not Neon): tenant
"Solo Coffee" set to USD, and user `solo@test.local` password set to
`demo12345`. Change or reset if unwanted.

---

### 2.2 Done — settings split up, language removed (2026-08-29)

Five things stopped sharing one screen, and the two regional choices became
one.

**The problem it fixed.** `app/settings/page.jsx` was a single column holding
currency, language, sales tax, profile and password — five forms, each with its
own submit button and its own pair of banners. Three could be saved from the
same screenful, so "Saved." appeared beside forms nobody had touched, and
reaching the password fields meant scrolling past the tax rates. It had no room
left in it, and tipping and card payments are both next.

**What shipped:**

| Area | File(s) |
|---|---|
| Settings is a hub of tiles, one per thing, plus the currency shown read-only | `app/settings/page.jsx` |
| Shared subpage frame — title, blurb, way back | `components/SettingsSubpage.jsx` *(new)* |
| A page each | `app/settings/profile/`, `app/settings/password/`, `app/settings/tax/` *(new)* |
| Language picker gone; the locale now follows the currency | `constants/locales.js` |
| Currency picker rebuilt as a searchable grid of priced cards | `components/CurrencyField.jsx` *(new, replaces `LocaleFields.jsx`)* |
| Currency gets its own console tab, and the overview says what a café trades in | `app/platform/tenants/[id]/(console)/currency/page.jsx` *(new)*, `…/(console)/layout.jsx`, `…/(console)/page.jsx` |
| Café-side currency write path deleted | `app/api/tenant/settings/route.js` *(removed)*, `api.js` |
| Locale derived, never read from the column, and written from the currency | `lib/tenantBranding.js`, `lib/repositories/tenantsRepository.js` |

**Decisions worth knowing before changing any of it:**

- **There is no language choice, because there is no translation.** The picker
  changed number formatting, `lang` and `dir` — and not one word on any screen.
  An owner who set their café to اردو got English words in a right-to-left
  layout. Backlog item 4 is the real thing; a picker that pretends it already
  shipped is worse than no picker.
- **The locale follows the currency** (`localeForCurrency`). What the locale is
  actually needed for is 1,234.56 against 1 234,56 and Aug 29 against 29 Aug,
  and a café charging in rand is in the market that writes it the second way.
  Every tag it hands out is English, and `tests/locales.test.js` asserts that,
  so choosing a currency can never half-translate the app.
- **A row still holding `ur-PK` is ignored, not migrated.** The read path
  derives; the write path stores the derived value next time the currency is
  set. No migration, and no café stuck in a language nobody can unset.
- **Currency is the platform owner's.** A café does not change the money it
  trades in while it is trading, and the one time it happens the owner is
  already on the phone to whoever sold them the product. Their own settings
  screen shows what it is set to — an owner who thinks their prices are in the
  wrong currency has to be able to see it to say so — and offers no way to
  change it. The café-side PATCH route is gone rather than merely unlinked.
- **The currency picker is a grid, not a `<select>`.** The thing being chosen
  is what a price will look like; a dropdown showed 23 rows one at a time and
  never said. Each card prices the same amount through the same function the
  receipt uses.
- **It is a console tab of its own, because it is the only copy.** It shipped
  as the third card on Details, under a tab labelled "Name and web address",
  and could not be found — which is a bad state for the single control that
  changes a setting no café can change itself. It now has a tab, and the
  overview — the screen opened before a support call — states what the café
  trades in and links straight to it.

**Verified:** production build clean, 137 tests pass, all six settings routes
return 200 to a signed-in owner, and the served page emits
`<html lang="en-US">` for the USD tenant — the derived locale, since that
tenant's stored column is what the old picker left there. **Not** visually
confirmed: the Chrome extension is not connected, and the cached Chromium would
not expose a debugging port under the sandbox. The hub, the four subpages and
the currency grid are worth one manual look.

---

### 2.3 Done — sales tax (2026-08-29)

A café can now charge tax, and say which side of the price it sits on.

**The problem it fixed.** `app/api/checkout/route.js` computed
`total = subtotal + deliveryCharge`, and the word "tax" appeared nowhere in the
schema or the code. In the US charging it is a legal requirement, the rate is
set by the state, the county and sometimes the city, and in many states eating
in is taxed differently from taking away.

**What shipped:**

| Area | File(s) |
|---|---|
| Schema — `tax_rates` (+ RLS), `tenants.prices_include_tax`, three invoice columns | `migrations/027_sales_tax.sql` *(new)* |
| The arithmetic: which rates apply, inclusive vs exclusive, validation | `lib/tax.js` *(new)* |
| Read/write of rates and the pricing mode | `lib/repositories/taxRepository.js` *(new)* |
| Rates ride along in the menu's existing round trip | `lib/repositories/menuRepository.js` |
| Computed server-side and frozen onto the sale | `app/api/checkout/route.js` |
| Recomputed when an invoice's lines are edited | `app/api/invoices/[id]/route.js` |
| Stored and read back per invoice | `lib/repositories/invoicesRepository.js` |
| Owner-only endpoints (config, add, edit, remove) | `app/api/tenant/tax/route.js`, `app/api/tenant/tax/[rateId]/route.js` *(new)* |
| Settings screen with a live priced preview | `components/TaxSettings.jsx` *(new)*, `app/settings/page.jsx` |
| Live tax on the ticket before checkout | `context/OrdersContext.jsx`, `app/orders/page.jsx` |
| Broken out on screen and on the printed receipt | `app/invoices/[invoiceId]/page.jsx` |
| Edit screen's total, which was short by delivery and would now be short by tax | `app/invoices/[invoiceId]/edit/page.jsx` |
| Tax collected + taxable sales tile, and printed report | `app/api/reports/summary/route.js`, `components/ReportsWorkbench.jsx` |
| 25 tests | `tests/tax.test.js` *(new)* |

**Decisions worth knowing before changing any of it:**

- **The rate is stored on the invoice, by value.** Nothing reads `tax_rates`
  to render an old receipt. Rates change; a receipt reprinted next year has to
  say what it said.
- **Rates are on the tenant**, with a nullable `location_id` for when a branch
  switcher exists — the same reasoning migration 025 gave for trading hours,
  and for the same reason: `requireTenant()` returns no location id.
- **Delivery is not taxed.** Whether it is taxable varies by state, and the
  confident direction overcharges customers.
- **A deal is only taxed by rates that name no category.** A deal bundles
  several categories at one price, so "prepared food but not packaged goods"
  has no answer for it.
- **Inclusive tax is divided out once by the combined rate**, then split
  between the rates proportionally, with the rounding drift given to the
  largest so the parts reconcile exactly with the total. Carving each rate out
  of the full gross separately over-collects.
- **Net sales is reported net of tax.** Tax is collected for a government, not
  earned; counting it as revenue overstates every sales figure by the rate.
  `netAfterExpenses` now subtracts it.
- **`prices_include_tax` defaults to TRUE**, which is what every existing café
  is already doing. With no rates configured the two modes are
  indistinguishable, so the setting only starts to matter at the moment a café
  adds its first rate — and inclusive is the reading that leaves their totals
  alone.

**Verified:** production build clean, 137 tests pass. Against the local staging
database, end to end: a dine-in ticket of a $5 latte and $20 beans with a 4%
state tax and a 4.875% dine-in prepared-food tax rang up $26.24 with both taxes
broken out; the same basket as takeaway dropped the surcharge and rang $26.00;
a delivery order left the delivery charge untaxed; editing an invoice's lines
moved its tax with them; the same basket under inclusive pricing held the total
at $25.00 and carved $1.18 out of it; a switched-off rate stopped being
charged; the reports summary reported $4.62 collected on $103.82 of taxable
sales; bad input (`150%`, a blank name, an unknown order type) was refused; and
row level security confirmed one café cannot see another's rates. **Not**
visually confirmed in a browser — the screens return 200 and the figures are
confirmed through the API, but the settings card, the till's totals block and
the receipt are worth one manual look.

**Local staging DB was modified** (`cafe_order_staging`, not Neon): tenant
"Solo Coffee" now has two menu items (Latte, Bag of Beans), two tax rates (NY
State Tax 4%, Prepared Food Tax 4.875% dine-in on coffee) and is set to
tax-exclusive US-style pricing, plus five test invoices. It is a usable US demo
tenant as it stands; clear it if you want it clean.

---

### 2.4 Done — offline mode (commit `52eafaa`, 2026-08-30)

The wifi can go down and the till keeps taking money.

**The problem it fixed.** Every price and every total was decided by
`/api/checkout` against Neon, and the menu lived in React state that was
re-fetched on each load. A café whose connection dropped could not ring up a
sale, could not reprint a receipt, and lost whatever was in the cart. Square
and its competitors queue offline and sync, and it is asked about in demos.

**What shipped:**

| Area | File(s) |
|---|---|
| Reserving a block of invoice + order numbers | `app/api/checkout/reserve/route.js` *(new)*, `lib/repositories/invoicesRepository.js` |
| Building and checking an offline sale — both pure, both shared | `lib/offlineSale.js` *(new)* |
| Taking the queued sales back | `app/api/checkout/sync/route.js` *(new)* |
| Menu cache, reserved block, sale queue on the device | `lib/offline/store.js` *(new)* |
| Offline checkout, reconnect detection, automatic draining | `context/OrdersContext.jsx` |
| Telling a network failure apart from a refusal | `api.js` |
| The bar that says what state the till is in | `components/OfflineBanner.jsx` *(new)*, `app/orders/page.jsx`, `app/styles/03-components.css` |
| Printing a receipt for a sale that has not synced | `app/invoices/[invoiceId]/page.jsx` |
| 20 tests | `tests/offlineSale.test.js` *(new)* |

**Decisions worth knowing before changing any of it:**

- **Offline pricing is the same code, not a second copy.** `lib/pricing.js`,
  `lib/tax.js` and `lib/businessTypes.js` were already pure, and the till
  already previewed tax through them, so the offline path runs the identical
  functions over a cached menu. There is no second implementation to drift.
- **Invoice numbers are reserved in advance, not invented.** A till takes a
  block of 50 while it is connected and tops up below 15, so an offline
  receipt carries a real, final number and nothing is renumbered on sync. The
  numbers are consumed at the database whether used or not, so an unused block
  leaves gaps in the sequence. Gaps are cosmetic; two customers holding the
  same invoice number is not.
- **Running out of numbers is the one hard stop.** Everything else about a sale
  the till can work out for itself. The banner counts down so a café gets
  warning rather than a refusal at the counter.
- **Invoice numbers are per café, not per platform.** Every café draws from
  its own counter in `invoice_counters`, so its receipts count 1, 2, 3. They
  came off one global sequence until 030, which meant a sale at one café and a
  sale ringing up at another in the same moment took consecutive numbers off
  the same series — neither café's numbering was its own. The primary key on
  `invoices` is `(tenant_id, id)` for the same reason: two cafés are each
  allowed an `inv-1`, and before 030 the global sequence was the only thing
  keeping ids apart. Cafés trading at the time were seeded from their own
  highest number, so nothing already printed was renumbered.
- **Order numbers are shift-bound and invoice numbers are not.** A till still
  selling after the café's trading day rolls over holds order numbers that
  belong to a shift that has ended, so those sales take an invoice number from
  the block and no order number, and the sync assigns one from the shift they
  actually landed in. Every screen already rendered a missing order number
  correctly, which is what made this the cheap answer.
- **A queued sale is never re-priced on the way in.** It happened against a
  menu and rates that may since have changed, and the customer has the receipt.
  Re-pricing would either fail on an item deleted in the meantime or store a
  figure that is not the one that was charged. What the server checks instead
  is that the sale is *internally consistent* — every line total follows from
  its price and quantity, the subtotal is the sum of the lines, the tax lines
  sum to the tax, and the total is those added up the one way `invoiceTotal`
  adds them. That does not stop staff discounting a sale, but neither does the
  ordinary checkout, which takes staff-supplied discounts too.
- **Sync skips rather than upserts.** `saveInvoice` is an upsert, which would
  let a retry overwrite an invoice that had since been edited or refunded. The
  sync path checks for the id first, so a second attempt reports `duplicate`
  and changes nothing.
- **Each sale is reported on individually.** `stored` and `rejected` are both
  final and the till drops them; anything else is kept and retried. A single
  all-or-nothing answer would make a till choose between losing sales and
  duplicating them.
- **`navigator.onLine` is only trusted when it says no.** It reports the
  network adapter, and a café wifi that has stopped routing still reports
  true. Going offline is taken at its word because it is the fastest negative
  signal there is; coming back only triggers a request, and the outcome of
  that decides.
- **IndexedDB, not localStorage, for the queue.** Queued sales are money that
  exists nowhere else. localStorage has a small cap, no transactions, and
  blocks the main thread. The store is named per tenant so two cafés on one
  browser cannot drain each other's sales into the wrong books.

**Verified** against the local staging database: two reservations returned
disjoint blocks (51–53, then 54–56) across both counters; a dine-in latte and
bag of beans priced offline came to **$26.24 with $1.24 of tax broken across
both rates — the identical figure the online checkout produced** for the same
basket in §2.3; syncing stored it, and syncing again reported `duplicate`
without writing twice; a sale whose total had been altered was refused with
"the total is not the subtotal, delivery and tax added up", and one whose line
total had been altered with "a line total does not match its price and
quantity"; a sale arriving with no order number was assigned one from the shift
it belonged to. The orders and invoice screens return 200 and the client chunk
carries the banner, the store and `buildOfflineInvoice` and compiles clean.
156 tests pass.

**Not verified:** none of the *browser* half has been exercised — IndexedDB
writes, the banner, the reconnect handler and offline checkout itself were
confirmed by unit test and by bundle inspection, not by pulling the network in
a real browser. `next build` was not run either, because a dev server was up on
3002 and the two corrupt `.next` between them. **Both are worth doing before a
demo**, and pulling the wifi mid-sale is the single most valuable manual test
on this list.

**Local staging DB was modified**: invoices `inv-51` and `inv-54` are synced
offline test sales, and invoice numbers 52, 53, 55 and 56 plus a few order
numbers were consumed by reservations and never used — which is exactly the
gap-leaving behaviour described above, showing up in the test data.

---

### 2.5 Done — timezone, and the shift date it fixes (commit `077e155`, 2026-08-30)

A café says where it is, and its trading day is counted on that clock.

**The problem it fixed.** Two halves of one gap. The new-café form asked for a
timezone in a free-text box, and nothing ever read the answer:
`app/api/checkout/route.js` passed `shiftDateForInstant` only a start hour, so
`lib/shift.js` fell back to its `Asia/Karachi` default for every café on the
platform. A Chicago café closing at 6 PM had its morning takings filed against
the wrong trading day, and its order numbers restarting mid-service.

**What shipped:**

| Area | File(s) |
|---|---|
| The offered zones, validation, the live clock | `constants/timezones.js` *(new)* |
| Picker — the currency grid's twin, grouped by region | `components/TimezoneField.jsx` *(new)* |
| Read path: location → tenant runtime → the till | `lib/repositories/tenantsRepository.js`, `lib/tradingDay.js` |
| The fix itself — the shift date on the café's own clock | `app/api/checkout/route.js`, `app/api/checkout/reserve/route.js` |
| The offline till gets the zone with its block | `lib/offlineSale.js`, `lib/offline/store.js`, `context/OrdersContext.jsx` |
| Set on creation and from the console's Trading day card | `app/platform/tenants/new/page.jsx`, `…/(console)/details/page.jsx`, `context/TenantConsoleContext.jsx` |
| Write path, validation, audit line | `lib/repositories/tenantsRepository.js`, `app/api/platform/tenants/[id]/route.js` |
| 17 tests | `tests/timezones.test.js` *(new)* |

**Decisions worth knowing before changing any of it:**

- **The currency cannot supply the timezone**, which is the whole reason it is
  a field of its own rather than another thing `localeForCurrency` derives. A
  café in Karachi and one in Lahore share `en-PK` and share a clock, so
  deriving would have worked for the original customer and gone unnoticed —
  but `en-US` spans six zones, and New York and Los Angeles do not close on the
  same instant.
- **Reading the column is a no-op for existing data.** Every location row
  already held `Asia/Karachi`, the value the code was hard-defaulting to, so
  not one stored sale moves. `tests/timezones.test.js` asserts that explicitly.
  That is what made this safe to do now rather than after a US café had
  accumulated a month of sales under the wrong zone — and it is why the
  roadmap's old warning that this "moves which day existing sales report into"
  turned out not to apply.
- **Anything `Intl` can resolve is accepted, not just the curated list.** The
  list is what the picker offers, not the limit of what is legal. Validation is
  asymmetric in the same way `constants/locales.js` is: refused on the way in,
  falls back on the way out, because a till that throws is worse than one with
  the wrong day boundary.
- **The card shows a clock, not a UTC offset.** An offset is a number somebody
  has to convert in their head, and it is wrong for half the year in any zone
  that observes daylight saving. Nothing about the offset is stored for the
  same reason.
- **It lives in the Trading day card, not a tab of its own.** An opening hour
  without the zone it is counted in is two thirds of an answer, so the two are
  set and saved together, and the audit line names both.
- **`tradingDay()` carries the zone but never invents one.** `lib/shift.js`
  owns the default; a second module deciding it would be a second place that
  can disagree.

**Verified** against local staging: Solo Coffee set to Chicago with a boundary
where the two zones diverge, and both the reservation and a real checkout
stamped `2026-08-28` where the old behaviour gave `2026-08-29`. A bad zone is
refused on the create and the update path; the audit trail reads "Set the
trading day to 6 PM – 5 PM the next day, Denver time"; the picker is in the
compiled client chunk. 173 tests pass. **Staging was restored** to
`Asia/Karachi` afterwards, the probe invoice deleted, and the throwaway
platform-owner account used for the console checks removed.

**Not verified:** no manual browser pass, and `next build` was not run — a dev
server was up on 3002.

---

### 2.6 Done — end-of-day close / Z-report (commit `d8fa265`, 2026-08-30)

A café counts the drawer and closes the day, and the difference is kept.

**The problem it fixed.** There was no way to close a trading day. Sales
accumulated against a `shift_date` and the reports screen would add them up on
request, but nothing recorded that anybody had counted the drawer, what they
found, or whether it matched. That difference is how a café notices money going
astray, and it is the first thing a manager asks about.

**What shipped:**

| Area | File(s) |
|---|---|
| Schema — one row per café per trading day, with RLS | `migrations/028_shift_close.sql` *(new)* |
| The arithmetic, and the check on what a person types | `lib/zReport.js` *(new)* |
| Read/write of closes | `lib/repositories/shiftClosesRepository.js` *(new)* |
| Invoices for one trading day | `lib/repositories/invoicesRepository.js` |
| The report, and closing it | `app/api/shifts/[shiftDate]/route.js`, `app/api/shifts/route.js` *(new)* |
| The screen | `components/ShiftClose.jsx`, `app/settings/close/page.jsx` *(new)*, `app/settings/page.jsx` |
| 21 tests | `tests/zReport.test.js` *(new)* |

**Decisions worth knowing before changing any of it:**

- **The variance is the feature.** It needs two numbers arrived at
  independently, so the counted figure is refused rather than defaulted — a
  blank box read as zero would record a drawer nobody counted as an empty one —
  and the expected figure is computed server-side from the invoices, never
  taken from the request.
- **Cash is the only line that can vary.** Card takings reconcile against the
  processor's statement, not a drawer, so a card refund does not come out of
  expected cash and card sales are not counted there. Doing otherwise invents a
  discrepancy nobody can act on.
- **An unmarked invoice is reported unpaid, not folded into cash.** Folding it
  in would make the drawer look short by exactly that amount with nothing on the
  report to say why.
- **The report is frozen onto the close**, the same way 027 freezes a tax rate
  onto an invoice. Recomputing would drift as invoices are edited, refunded or
  synced late from an offline till, and a report that changes after sign-off is
  not evidence of anything. Verified: refunding an invoice after the close left
  the recorded figures untouched.
- **Closing is owner-only**, which is the substance rather than a detail: a
  cashier signing off their own variance is not a control.
- **The screen warns when offline sales are still queued**, because closing on
  top of them counts the day short by their value.
- **A day is closed once.** A second attempt returns 409 with the standing
  count rather than overwriting it.

**Verified** against local staging: two cash sales, a card sale and a cash
refund gave expected cash of 110.40 against a 100 float; a counted 108 recorded
a variance of −2.40; a second close was refused with 409; the audit trail reads
"Closed 2026-08-29. The drawer was 2.40 short." Probe data removed afterwards.

---

### 2.7 Done — open tabs and table service (commit `f6d7912`, 2026-08-30)

An order can be held open on a table and picked up on any device.

**The problem it fixed.** Checkout went from a cart in one browser straight to
an invoice, so an order existed only on the device typing it. No tabs, no table
service, and no picking up an order somebody else began.

**What shipped:**

| Area | File(s) |
|---|---|
| Schema — tabs, versioned, with RLS | `migrations/029_open_tabs.sql` *(new)* |
| Open, edit, close, abandon | `lib/repositories/tabsRepository.js` *(new)* |
| The endpoints | `app/api/tabs/route.js`, `app/api/tabs/[tabId]/route.js` *(new)* |
| Ringing a tab up | `app/api/checkout/route.js` |
| Tabs in the till | `context/OrdersContext.jsx`, `components/TabStrip.jsx` *(new)*, `app/orders/page.jsx` |
| 10 integration tests | `tests/integration/tabs.test.js` *(new)* |

**Decisions worth knowing before changing any of it:**

- **The old `orders` table was neither built on nor dropped**, which is the one
  thing the backlog did not consider. It predates every tenancy concept, so
  adapting it in place is most of a new table anyway — but it is *not* empty:
  it holds **38 rows from June–July 2026, 25 of them referenced by
  `invoices.order_id`**. Dropping it, which this file previously suggested,
  would orphan the history of twenty-five real sales. It stays as a record of
  how orders used to work.
- **Every write states the version it read.** Two servers can hold the same tab,
  and a stale save is refused rather than allowed to erase the round the other
  just added. The conflict is surfaced, never auto-resolved: choosing which of
  two people's rounds to keep is not a decision that can be made correctly, and
  guessing wrong loses somebody's drinks.
- **A tab is checked before checkout prices anything**, so one already closed
  elsewhere is refused without spending an invoice number — the sequence has no
  way to hand one back. It is marked invoiced only *after* the invoice is
  written, because a tab closed against a sale that failed to save is a sale
  that has vanished.
- **Abandoned, never deleted.** "Table six left without paying" is exactly the
  thing a manager wants a record of.
- **Tabs need a connection, by definition** — the point of one is that it is not
  on this device. The strip says so when offline rather than failing oddly. This
  is the one place offline mode (§2.4) and tabs do not meet.

**Verified** against local staging: a stale write refused with the first
writer's round intact; checkout closed the tab and linked the invoice; a second
checkout refused with the sequence still at 64, so no number was wasted; the 38
legacy rows and their 25 invoice links untouched throughout. The 10 integration
tests cover the version check, the closed-once guard, and that one café can
neither read, write, close nor abandon another's tabs.

**Both 2.6 and 2.7:** migrations 028 and 029 were applied to staging by hand,
with their `schema_migrations` rows, because the dev server had booted before
the files existed. A restart runs them normally; both are idempotent. Neither
has had a manual browser pass, and `next build` was not run.

---

### 2.8 Done — the app stays on screen when the network goes (2026-09-07)

The manual test §2.4 asked for was finally done, on a real machine with the
wifi switched off, and offline mode failed at the last step.

**The problem it fixed.** Everything §2.4 built worked: the disconnect was
noticed in about two seconds, the cached menu sold, the sale was priced on the
device and queued. Then the cashier pressed **Create invoice** and the app
vanished, replaced by Chrome's dinosaur and `ERR_INTERNET_DISCONNECTED`.

Nothing was lost — the sale was already in IndexedDB and synced later — but a
till that disappears at the moment of taking money is not a till anybody will
trust, and the demo is over.

The cause was one line: `clearSoldOrder` finishes with
`router.push('/invoices/…')`. Every screen change in the App Router is a fetch.
Next asks for the route's payload, and when that fails it falls back to a full
document navigation — which, with no network and no service worker, the
*browser* answers, not the app. The same applied to every nav tab and to
reloading the tab. Offline mode only ever worked inside one already-loaded page
that never navigated, which is not a condition anybody can hold to during a
lunch rush.

**What shipped:**

| Area | File(s) |
|---|---|
| Serving screens from a cache when the network cannot | `public/sw.js` *(new)* |
| The last-resort page for a screen never opened | `public/offline.html` *(new)* |
| Registering it, and warming it once there is a session | `components/ServiceWorkerRegistrar.jsx` *(new)*, `app/layout.jsx` |
| Not mistaking an unreachable server for a sign-out | `context/AuthContext.jsx`, `utils/lastSession.js` *(new)* |
| Reading the invoice from the address, not the route data | `app/invoices/[invoiceId]/page.jsx` |
| 13 tests | `tests/offlineShell.test.js` *(new)*, `tests/lastSession.test.js` *(new)* |

**Decisions worth knowing before changing any of it:**

- **The worker never touches `/api`.** This is the one rule that cannot bend.
  The entire offline path hangs off requests genuinely failing —
  `isOfflineError` is what the till tests before it prices a sale locally. A
  cached 200 from `/api/menu` would tell a disconnected till it was online and
  leave it waiting on a checkout that can never answer. Caching there would not
  degrade offline mode, it would disable it.
- **One cached copy of the receipt screen answers for every invoice.** The
  screen is a client component that fetches its own sale, so the server renders
  the same skeleton whatever the id — which is what lets a receipt for `inv-115`
  open on a till that has never loaded that URL. Only routes whose server HTML
  is identical for every parameter may be templated this way; adding one whose
  HTML depends on its id would show one sale's data under another sale's
  address, which is worse than the error page this replaces.
- **Therefore the page reads its id from the address bar, not the route
  parameter.** The route data baked into that shared copy names whichever
  invoice happened to be cached. The URL is the only thing that names the sale
  the cashier actually asked for.
- **Route payload requests are deliberately left to fail.** Answering them from
  cache would hand the router a tree built for the wrong URL. Letting them fail
  makes Next do a full navigation, which is the request the worker *can*
  serve safely.
- **Warming pulls the scripts too.** A warmed screen has never been rendered by
  a browser, so its chunks have never been fetched. Caching the HTML alone
  produced the worst of both worlds — the document served from cache, every
  script on it failing. The chunk names are content-hashed, so they are read out
  of the markup rather than listed.
- **An unreachable server is not a sign-out.** `verifySession` always knew this
  and left a working till alone; the *first* call of the page's life did not, so
  an offline reload came back with no café, no menu and no queue. It now
  restores the last signed-in user. This grants nothing — every request still
  carries the cookie, the server still decides, and the next heartbeat that
  reaches it settles the question. It decides which chrome to draw and no more.
- **Cached screens are thrown away on sign-out**, along with the remembered
  user. They are one café's till wearing one café's name.
- **The worker asks for its own update on load.** Browsers only recheck the
  script on their own once their copy is a day old, and a till is opened in the
  morning and left running — so a deploy could take a day to reach the very
  thing that decides what happens when the wifi drops.
- **Production only, and dev actively unregisters.** `localhost` is one origin
  for `next start` and `next dev`, so one production run would otherwise leave a
  worker serving cached chunks over the dev server for every session after it —
  a symptom that reads like anything except a service worker.

**Verified in a real browser**, production build, by killing the server
mid-session: checkout with the server down landed on the receipt for `inv-115`
— rendered from IndexedDB, marked "not yet sent", on a URL the till had never
visited — where the recording showed the dinosaur; reloading with the server
still down brought the app back signed in rather than the error page; the till
tab navigated normally offline and the banner read "49 more sales can be rung
up on this device, 1 waiting to send"; a screen never opened before got the
fallback page rather than the browser's; and on restarting the server the queued
sale synced on its own — `inv-115`, $250.00, with `shift_number` assigned at
sync because the reserved block's shift had rolled over, which is §2.4's
rollover path firing for real. 206 tests pass and `next build` is clean.

**Local staging DB was modified**: `t-976f1495` (mr.code) gained one invoice,
`inv-115`, a $250 dine-in zinger burger — a genuine offline sale that synced.
Invoice numbers below 115 and order numbers in that block were consumed by
earlier reservations and never used.

**Not verified:** the worker has only been exercised against a killed server on
`localhost`, not against a Vercel deploy, and not on the phones or tablets a
café would actually use. Safari's handling of service workers is its own
subject. Worth one pass on the real domain before it is relied on in front of a
customer.

---

### 2.9 Done — table numbers on an invoice (2026-09-07)

A sale records which table it went to, and the receipt says so in print big
enough to read across a room.

**The problem it fixed.** Order type already said *dine in*; nothing said
*where*. A café running food to tables had exactly one place to put it — the
free-text customer note, whose placeholder still read "Table name, pickup,
etc." — and a note is not a field. It cannot be searched for as a table, it
prints buried at the foot of the receipt under "Note:", and half the staff
write "T4" while the other half write "table four". So the runner reads the
note if there is one and guesses if there is not.

`tabs.label` was the nearest thing to this and is not a substitute: tabs are
opt-in and currently hidden from the till (§2.7), the label is deliberately
free text — "Dave", "the two by the window" — and the link runs the wrong way,
tab to invoice, as that section's own backlog note says.

**What shipped:**

| Area | File(s) |
|---|---|
| Schema — the column and the index the search uses | `migrations/031_invoice_table_number.sql` *(new)* |
| One definition of what a table number is | `lib/tableNumber.js` *(new)* |
| Storing and reading it | `lib/repositories/invoicesRepository.js` |
| Taking it at checkout | `app/api/checkout/route.js` |
| Correcting one that was mis-keyed | `app/api/invoices/[id]/route.js`, `app/invoices/[invoiceId]/edit/page.jsx` |
| Selling with it offline, and checking it at sync | `lib/offlineSale.js` |
| Finding a table's sale | `lib/invoiceQuery.js`, `app/invoices/page.jsx` |
| Typing it in | `context/OrdersContext.jsx`, `app/orders/page.jsx` |
| On the receipt and the invoice | `app/invoices/[invoiceId]/page.jsx`, `app/styles/04-pages.css` |
| 13 tests | `tests/tableNumber.test.js` *(new)*, `tests/offlineSale.test.js`, `tests/invoiceQuery.test.js` |

**Decisions worth knowing before changing any of it:**

- **Free text, not an integer.** "12A", "Patio 3" and "Bar 2" are all table
  numbers to the people calling them out, and a café that numbers 1..20 loses
  nothing by storing "7" as text.
- **One module defines what a table number is** (`lib/tableNumber.js`), because
  four things have to agree: checkout, the invoice PATCH, the offline till that
  builds the invoice itself, and the sync endpoint that checks what the till
  built. A second "trim it and cut it to twenty" that drifted from the column
  width would fail at the insert in the one path — a queued offline sale — where
  the customer has already left with the receipt.
- **A delivery has no table**, so one sent with a delivery is dropped rather
  than stored, the mirror of the rule delivery charges already follow. Takeaway
  *keeps* its table: counter-service cafés hand out a number and run the food
  out to it.
- **The table rides in the receipt's order-type banner**, not in a meta row
  beside the invoice number. It is the one thing on the paper read from across
  a room — a runner holding four tickets is looking for the table, not for
  `inv-1183` — and sharing the banner costs no extra height on a 72mm roll.
- **The search matches a table exactly, never as a substring**, unlike the
  invoice id. "4" finding tables 4, 14, 24 and 41 is worse than no match when
  somebody at the till is asking who is on four. The needle is already
  lowercased by the route, so the column is lowercased to meet it — "t4" finds
  "T4" — which is the expression migration 031 indexes.
- **It is editable, and the order type is not.** A table is keyed in a hurry and
  a sale filed against the wrong one sends a plate to the wrong customer, so the
  PATCH takes it. It applies the delivery rule against the *invoice's* order
  type rather than the request's, so a delivery cannot acquire a table by way
  of an edit. A returned invoice refuses the change, as it already refuses lines
  and the note.
- **The tab's label does not seed it.** Copying a label in would put a name in
  the table field as often as a table, truncated to twenty characters.
- **The customer-note placeholder changed** from "Table name, pickup, etc." to
  "Allergy, pickup time, etc." — the note was standing in for this field, and
  leaving the old hint there would keep half the staff typing tables into it.

**Verified**: 220 tests pass and `next build` is clean. Migration 031 applied to
the local staging DB and checked — `varchar(20)`, index present; a real save and
read-back through the repository stored `12A` against a dine-in invoice, and
clearing it through the upsert path cleared it rather than leaving the old value
(the probe invoice was deleted afterwards); the new search predicate was run
against the real table.

**Not verified:** no manual browser pass. Nothing has been typed into the field
on screen, printed, or looked at on a phone — the till, receipt and invoice-list
rendering are argued from the code, not seen.

---

## 3. ⬜ LEFT — not done, the backlog

Ordered by what will actually cost an American demo. Items 1 and 2 are the ones
a US café practically cannot operate without.

Re-verified against the working tree on 2026-08-30 — every item below is still
outstanding, nothing here has been half-built and forgotten. What was checked:
no tipping feature anywhere; `VALID_PAYMENT_METHODS` is still
`['cash', 'online']` in both `app/api/checkout/route.js:100` and
`app/api/invoices/[id]/route.js:133`; zero occurrences of "modifier"; zero
logical properties in `app/styles/`; no query anywhere reads or writes the
`orders` table; `returned` is still the boolean from
`migrations/001_initial.sql:61`.

### 1. Tipping — blocker, nothing exists

Zero occurrences in the codebase. In the US the tip prompt is the checkout
screen. Needs: a tip step after payment (15/18/20/custom), tips stored separately
from revenue so they never inflate sales figures, and a per-employee per-shift
tip report for payroll. Card tips and cash tips need distinguishing.

### 2. Card payments — blocker

`VALID_PAYMENT_METHODS = ['cash', 'online']` in `app/api/checkout/route.js:100`.
Every American demo asks "does it take cards?" within five minutes.

Doesn't require becoming a processor — integrate Stripe Terminal or Square. At
minimum add a `card` method recording the auth reference and last 4 so the day's
takings reconcile against the processor's own statement.

The list is duplicated — `app/api/checkout/route.js:100` and
`app/api/invoices/[id]/route.js:133` each declare their own copy, so adding a
method means editing both or lifting it to one shared constant.

### 3. Menu modifiers — the biggest café-specific gap

`menu_items` has fixed `size` and `flavour` columns
(`migrations/001_initial.sql`), so every combination is a separate menu row.

An American coffee shop sells "large oat latte, extra shot, half sweet" — a base
item plus priced modifiers. Needs modifier groups → options → price delta →
required/optional/max-select, attached to items and stored on the invoice line.
Without it you cannot ring up a latte, and staff hit this in the first ten
minutes of any hands-on trial. This is the largest build on the list.

### 4. UI translation — nothing offers it now, and the plumbing is ready

**Every UI label is English**, which is why section 2.2 removed the language
picker: it changed formatting and `lang`/`dir` and not one word, so choosing
Español got Spanish decimal points and English sentences.

Scope: ~416 user-facing strings across 44 files, plus a message-catalog layer
and actual translation. It consumes the same `locale` value already plumbed
through, so nothing from section 2.1 needs redoing — it is additive.

Shipping it means putting the picker back, and that is the right order: the
catalog first, then a list of the languages that actually have one. Until then
`localeForCurrency` is the only thing setting a locale, and it only ever
answers English.

Worth doing for the US market specifically: a large share of American café
staffing is Spanish-speaking, and Spanish UI is a visible differentiator in a
demo. Start with `es-US`/`es-MX` only.

### 5. Right-to-left layout — partial

`dir` follows the language, which mirrors text, inputs, flexbox and grid for
Arabic and Urdu for free. But `app/styles/` contains **zero** logical properties
and:
- **66** unambiguous 1:1 conversions (`margin-left` → `margin-inline-start`,
  `padding-left`, `border-left`, `text-align: left` → `start`). These are
  *identical* under `dir=ltr`, so there is no regression risk to LTR screens.
- **51** positioning declarations (`left: 0`, `right: 0`) that need looking at
  individually — some should mirror, some (spinners, fixed toasts) should not.

Benefits Urdu/Arabic, not the American demos, which is why it was left.

### 6. Partial refunds

`returned` is a boolean on the invoice — refunds are all-or-nothing. US cafés
refund one item off a four-item ticket routinely, and card refunds must go back
to the original card. Needs per-line quantities and a reason code.

### 7. Email / SMS receipts

Receipts are print-only (`app/invoices/[invoiceId]/page.jsx` builds receipt
HTML). US customers expect a digital receipt, and it is also the cheapest route
into a customer list for loyalty later.

### 8. Smaller / later

*(The timezone picker and the Karachi shift-date bug that used to head this
list are done — see §2.5.)*

- **Per-branch currency.** `getTenantBranding` deliberately reads the tenant's
  *first* location. A tenant trading across a border needs a branch switcher
  first; the query comment marks the spot.
- **Platform console locale.** `app/platform/page.jsx` correctly formats each
  café's revenue in that café's currency, but with the platform's number
  formatting. Harmless today.
- **Loyalty, time clock / labour %, inventory.** Real asks in the US market;
  `cost_price` already exists so COGS is partly there.

---

## 4. Suggested order

1. Tipping, then card — the two remaining things a US café is asked about out
   loud in a demo. Tipping is the smaller build and shares the checkout screen
   that tax has just been threaded through, so it is the natural next one.
2. Modifiers — the real engineering project, and the one staff hit fastest.
3. Spanish UI (item 4) — visible differentiator, foundation already laid.
4. Partial refunds, which offline mode has made more urgent: a sale can now be
   rung up on a device and refunded before it has ever reached the server.

Items 5 and 8 are cleanup that can happen whenever.

**What the shipped work leaves for whoever does the next item:**

*From sales tax (§2.3):*

- Partial refunds (item 6) will have to refund tax proportionally. The
  breakdown to do it with is already on every invoice — `taxLines` carries the
  taxable base per rate — but `returned` is still a boolean, so today a refund
  returns the tax with the whole ticket or not at all.
- Tipping (item 1) must be added *after* tax and must not be taxed. The place
  it goes is `invoiceTotal()` in `lib/tax.js`, which is the one function that
  decides what the customer owes.

*From the end-of-day close (§2.6):*

- Tipping also has to reach `lib/zReport.js`. A cash tip is in the drawer and
  will otherwise read as an overage on every shift that takes one; a card tip
  is not in the drawer and must not. Tips are held for staff rather than earned
  by the café, so they belong beside tax as a figure the report carries but net
  sales does not include.
- Card payments (item 2) will want their own line in `byMethod`. The bucket
  list is `PAYMENT_METHODS` in `lib/zReport.js` and the same constant in
  `app/api/checkout/route.js` — adding a method means both, which is the
  duplication item 2 already has to resolve.
- Partial refunds will have to decide what a refund against a *closed* day
  does. The close is frozen deliberately, so the refund belongs to the day it
  is given on, not the day of the sale — but nothing enforces that yet.

*From open tabs (§2.7):*

- Tabs are the one thing offline mode (§2.4) cannot cover, since a tab exists
  precisely so it is not on one device. If offline table service is ever
  wanted, it needs a merge story, not just a queue.
- `invoices` has no `tab_id`. The link is one-directional — the tab knows its
  invoice. Reporting "which table did this sale come from" would need the
  reverse, and `order_id` is taken by the legacy table. **Partly answered by
  §2.9**: the invoice now carries a `table_number` of its own, so the question
  "which table" has an answer that does not depend on a tab having been opened.
  What is still missing is the link to the *tab*, which is a different question.
