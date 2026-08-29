# White-label POS — state of play and what's next

Written 2026-08-29 as a handoff. The point of this file is that a new session
can pick up the work without re-reading the whole codebase to find out what has
already been decided. If you change something here, update this file.

**Context:** the product is a café POS built originally for one customer
(Chacha Burger & Cafe, Pakistan) and since made multi-tenant and white-label.
There are now demos lined up in the United States, which is what most of the
backlog below is driven by.

**Last audited 2026-08-30** against the working tree on `feat/multi-tenant`.
Every claim below was re-checked: the three shipped items are in the code, and
none of the eleven backlog items has been started.

## Status at a glance

| | Item | Where |
|---|---|---|
| ✅ | Currency and locale-aware formatting | §2.1 |
| ✅ | Settings split into subpages, language picker removed | §2.2 |
| ✅ | Sales tax | §2.3 |
| ⬜ | 1. Tipping — *blocker* | §3 |
| ⬜ | 2. Card payments — *blocker* | §3 |
| ⬜ | 3. Menu modifiers — *largest build* | §3 |
| ⬜ | 4. UI translation (Spanish first) | §3 |
| ⬜ | 5. Right-to-left layout | §3 |
| ⬜ | 6. Offline mode | §3 |
| ⬜ | 7. Partial refunds | §3 |
| ⬜ | 8. End-of-day close / Z-report | §3 |
| ⬜ | 9. Open tabs and table service | §3 |
| ⬜ | 10. Email / SMS receipts | §3 |
| ⬜ | 11. Smaller / later (timezone picker, per-branch currency, …) | §3 |

**Only §2.1 is committed** (`1ca8bb2`). The settings split (§2.2) and sales tax
(§2.3) are done as code but live entirely in the working tree — `git status`
shows `app/settings/{profile,password,tax}/`, `components/SettingsSubpage.jsx`,
`components/CurrencyField.jsx`, `components/TaxSettings.jsx`,
`app/api/tenant/`, the console currency tab, `lib/tax.js`,
`lib/repositories/taxRepository.js`, `migrations/027_sales_tax.sql` and
`tests/tax.test.js` all untracked, alongside ~25 modified files. Committing
this branch is the first thing the next session should do; an uncommitted
working tree is the one way this work can still be lost.

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

**Migrations** are numbered SQL files in `migrations/`, registered in
`lib/migrate.js`, run automatically via `instrumentation.js` on boot. They are
written to be re-runnable (`IF NOT EXISTS`).

**Tests:** `npm test` (`node --test tests/*.test.js`, no framework). 137 passing.
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

### 6. Offline mode

All pricing and checkout is server-side against Neon. If the café's wifi drops
they stop selling. Square and its competitors queue offline and sync. At minimum
cache the menu client-side and queue checkouts locally.

### 7. Partial refunds

`returned` is a boolean on the invoice — refunds are all-or-nothing. US cafés
refund one item off a four-item ticket routinely, and card refunds must go back
to the original card. Needs per-line quantities and a reason code.

### 8. End-of-day close / Z-report

No cash drawer count, no expected-vs-actual variance, no Z-report. Managers ask
about this specifically because it is how they catch theft.

### 9. Open tabs and table service

The `orders` table exists in the schema and **nothing reads or writes it** —
checkout goes straight to `invoices`. So a customer cannot start a tab and a
server cannot hold a table's order open. Fine for counter service, blocking for
anything with table numbers. Either build on it or drop the table.

### 10. Email / SMS receipts

Receipts are print-only (`app/invoices/[invoiceId]/page.jsx` builds receipt
HTML). US customers expect a digital receipt, and it is also the cheapest route
into a customer list for loyalty later.

### 11. Smaller / later

- **Timezone picker** is still a free-text box on the new-café form, unlike
  currency. Same treatment would take an hour, and the currency's own locale
  cannot supply it — a café in Karachi and one in Lahore share `en-PK` and a
  timezone, but `en-US` spans six.
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
4. Offline and partial refunds.

Items 5, 9 and 11 are cleanup that can happen whenever.

**Two things sales tax leaves for whoever does the next item:**

- Partial refunds (item 7) will have to refund tax proportionally. The
  breakdown to do it with is already on every invoice — `taxLines` carries the
  taxable base per rate — but `returned` is still a boolean, so today a refund
  returns the tax with the whole ticket or not at all.
- Tipping (item 1) must be added *after* tax and must not be taxed. The place
  it goes is `invoiceTotal()` in `lib/tax.js`, which is the one function that
  decides what the customer owes.
