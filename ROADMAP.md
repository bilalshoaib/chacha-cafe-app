# White-label POS — state of play and what's next

Written 2026-08-29 as a handoff. The point of this file is that a new session
can pick up the work without re-reading the whole codebase to find out what has
already been decided. If you change something here, update this file.

**Context:** the product is a café POS built originally for one customer
(Chacha Burger & Cafe, Pakistan) and since made multi-tenant and white-label.
There are now demos lined up in the United States, which is what most of the
backlog below is driven by.

**Last audited 2026-08-30** against the working tree on `feat/multi-tenant`.
Every claim below was re-checked against the code: the four shipped items are
in it, and none of the ten backlog items has been started.

## Status at a glance

| | Item | Where |
|---|---|---|
| ✅ | Currency and locale-aware formatting | §2.1 |
| ✅ | Settings split into subpages, language picker removed | §2.2 |
| ✅ | Sales tax | §2.3 |
| ✅ | Offline mode — the till keeps selling | §2.4 |
| ⬜ | 1. Tipping — *blocker* | §3 |
| ⬜ | 2. Card payments — *blocker* | §3 |
| ⬜ | 3. Menu modifiers — *largest build* | §3 |
| ⬜ | 4. UI translation (Spanish first) | §3 |
| ⬜ | 5. Right-to-left layout | §3 |
| ⬜ | 6. Partial refunds | §3 |
| ⬜ | 7. End-of-day close / Z-report | §3 |
| ⬜ | 8. Open tabs and table service | §3 |
| ⬜ | 9. Email / SMS receipts | §3 |
| ⬜ | 10. Smaller / later (timezone picker, per-branch currency, …) | §3 |

§2.1 is commit `1ca8bb2`; §2.2 and §2.3 are commit `95d97f9`; §2.4 is commit
`52eafaa`. Nothing is left uncommitted.

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

**Tests:** `npm test` (`node --test tests/*.test.js`, no framework). 156 passing.
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

### 7. End-of-day close / Z-report

No cash drawer count, no expected-vs-actual variance, no Z-report. Managers ask
about this specifically because it is how they catch theft.

### 8. Open tabs and table service

The `orders` table exists in the schema and **nothing reads or writes it** —
checkout goes straight to `invoices`. So a customer cannot start a tab and a
server cannot hold a table's order open. Fine for counter service, blocking for
anything with table numbers. Either build on it or drop the table.

### 9. Email / SMS receipts

Receipts are print-only (`app/invoices/[invoiceId]/page.jsx` builds receipt
HTML). US customers expect a digital receipt, and it is also the cheapest route
into a customer list for loyalty later.

### 10. Smaller / later

- **Timezone picker** is still a free-text box on the new-café form, unlike
  currency. Same treatment would take an hour, and the currency's own locale
  cannot supply it — a café in Karachi and one in Lahore share `en-PK` and a
  timezone, but `en-US` spans six.
- **The shift date is computed in Karachi time for every café.**
  `app/api/checkout/route.js` passes `shiftDateForInstant` only a start hour,
  so `lib/shift.js` falls back to its `Asia/Karachi` default even for a US
  tenant — a late-evening American sale can be counted against the wrong
  trading day. `locations.timezone` already holds the right answer and is not
  read. Left alone deliberately: fixing it moves which day existing sales
  report into, so it wants doing on purpose rather than as a side effect.
  Offline mode sidesteps it by resolving the shift date server-side at
  reservation time, so the two paths at least agree with each other.
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

Items 5, 8 and 10 are cleanup that can happen whenever.

**Two things sales tax leaves for whoever does the next item:**

- Partial refunds (item 6) will have to refund tax proportionally. The
  breakdown to do it with is already on every invoice — `taxLines` carries the
  taxable base per rate — but `returned` is still a boolean, so today a refund
  returns the tax with the whole ticket or not at all.
- Tipping (item 1) must be added *after* tax and must not be taxed. The place
  it goes is `invoiceTotal()` in `lib/tax.js`, which is the one function that
  decides what the customer owes.
