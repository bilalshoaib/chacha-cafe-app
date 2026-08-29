# White-label POS — state of play and what's next

Written 2026-08-29 as a handoff. The point of this file is that a new session
can pick up the work without re-reading the whole codebase to find out what has
already been decided. If you change something here, update this file.

**Context:** the product is a café POS built originally for one customer
(Chacha Burger & Cafe, Pakistan) and since made multi-tenant and white-label.
There are now demos lined up in the United States, which is what most of the
backlog below is driven by.

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

**Validation is asymmetric on purpose** (`constants/locales.js`): `isCurrency` /
`isLocale` refuse on the way *in*, `parseCurrency` / `parseLocale` fall back on
the way *out*. A till that throws is worse than one showing the wrong symbol,
but a bad value must never reach the database.

**Migrations** are numbered SQL files in `migrations/`, registered in
`lib/migrate.js`, run automatically via `instrumentation.js` on boot. They are
written to be re-runnable (`IF NOT EXISTS`).

**Tests:** `npm test` (`node --test tests/*.test.js`, no framework). 110 passing.
Integration tests in `tests/integration/` need a database.

**Environment gotchas** (these have bitten before):
- `.env.local` switches `DATABASE_URL` between local Postgres and the **live
  Neon production database**. Check which one is active before running anything
  that writes.
- **Never start a second dev server.** A second `next dev` shares `.next` and
  corrupts the running one. Check `lsof -ti:3002` first.
- Big work goes on a branch (currently `feat/multi-tenant`); `master` stays
  deployable for live hotfixes.

---

## 2. Done — currency and language (commit `1ca8bb2`)

A café can now choose the money and the language it works in.

**The problem it fixed.** `locations` had carried correct `currency` and
`locale` columns since the multi-tenant work, and nothing in the app read them.
`formatMoney` accepted `{locale, currency}` and not one of its ~40 call sites
passed either, so every price on every screen rendered as Pakistani rupees. An
American prospect saw `Rs 12.50` on the menu board.

**What shipped:**

| Area | File(s) |
|---|---|
| Currency + language lists, validation, RTL detection | `constants/locales.js` *(new)* |
| Locale-aware money and date formatting, cached `Intl` instances | `utils/formatting.js` |
| Read path — both values join the cached branding query | `lib/tenantBranding.js` |
| `useMoney()` / `useLocale()` hooks | `context/BrandingContext.jsx` |
| `<html lang dir>` follows the café's language | `app/layout.jsx` |
| Write path + validation, applied to all of a tenant's locations | `lib/repositories/tenantsRepository.js` |
| Café owner's own endpoint (owner-only, exactly two fields) | `app/api/tenant/settings/route.js` *(new)* |
| Shared picker with live preview | `components/LocaleFields.jsx` *(new)* |
| Set from: café settings / console / café creation | `app/settings/page.jsx`, `app/platform/tenants/[id]/(console)/details/page.jsx`, `app/platform/tenants/new/page.jsx` |
| 17 tests | `tests/locales.test.js` *(new)* |

Roughly 40 call sites across 20 screens and components were rethreaded onto the
hooks. The new-café form's currency field was previously a free-text box three
characters wide that could produce a code `Intl` has never heard of, and offered
no way to set language at all.

**Offered:** 23 currencies, 22 languages. Adding a market is one line each in
`constants/locales.js`.

**Verified:** build clean, 110 tests pass, read path returns USD/en-US for a
tenant set to it, write path refuses `ZZZ`/`xx-YY` and busts the cache,
`/api/tenant/settings` correct, served page emits `<html lang="en-US">` and
ships `USD` to the client provider. **Not** visually confirmed in a browser —
the Chrome extension was not connected, so rendered prices are confirmed via
unit tests and server payload rather than a screenshot. Worth one manual look.

**Local staging DB was modified** (`cafe_order_staging`, not Neon): tenant
"Solo Coffee" set to USD/en-US, and user `solo@test.local` password set to
`demo12345`. Change or reset if unwanted.

---

## 3. Not done — the backlog

Ordered by what will actually cost an American demo. Items 1–3 are the ones a
US café legally or practically cannot operate without.

### 1. Sales tax — blocker, nothing exists

`app/api/checkout/route.js` computes `total = subtotal + deliveryCharge`. There
is no tax anywhere in the schema or the code.

In the US this is a legal requirement, the rate varies by state / county / city,
and in many states dine-in is taxed differently from takeaway. `orderType`
(`takeaway` / `dine_in` / `delivery`) already exists, which is half of that.

Needs: a tax-rate table per location (possibly per category — prepared food vs
packaged goods differ), tax-inclusive vs tax-exclusive pricing as a setting
(Pakistan is inclusive, the US is exclusive), tax broken out as its own line on
the receipt, and a tax total in reports for filing. Store the rate *on the
invoice* at time of sale — rates change and old invoices must not move.

### 2. Tipping — blocker, nothing exists

Zero occurrences in the codebase. In the US the tip prompt is the checkout
screen. Needs: a tip step after payment (15/18/20/custom), tips stored separately
from revenue so they never inflate sales figures, and a per-employee per-shift
tip report for payroll. Card tips and cash tips need distinguishing.

### 3. Card payments — blocker

`VALID_PAYMENT_METHODS = ['cash', 'online']` in `app/api/checkout/route.js:99`.
Every American demo asks "does it take cards?" within five minutes.

Doesn't require becoming a processor — integrate Stripe Terminal or Square. At
minimum add a `card` method recording the auth reference and last 4 so the day's
takings reconcile against the processor's own statement.

### 4. Menu modifiers — the biggest café-specific gap

`menu_items` has fixed `size` and `flavour` columns
(`migrations/001_initial.sql`), so every combination is a separate menu row.

An American coffee shop sells "large oat latte, extra shot, half sweet" — a base
item plus priced modifiers. Needs modifier groups → options → price delta →
required/optional/max-select, attached to items and stored on the invoice line.
Without it you cannot ring up a latte, and staff hit this in the first ten
minutes of any hands-on trial. This is the largest build on the list.

### 5. UI translation — decided against for now, foundation is ready

The language selector currently changes number, currency and date *formatting*
and the page's `lang`/`dir`. **Every UI label is still English in every
language.** Picking "Español — México" gets Spanish formatting and English words.

Scope: ~416 user-facing strings across 44 files, plus a message-catalog layer
and actual translation. It consumes the same `locale` value already plumbed
through, so nothing from section 2 needs redoing — it is additive.

Worth doing for the US market specifically: a large share of American café
staffing is Spanish-speaking, and Spanish UI is a visible differentiator in a
demo. Start with `es-US`/`es-MX` only rather than all 22.

### 6. Right-to-left layout — partial

`dir` follows the language, which mirrors text, inputs, flexbox and grid for
Arabic and Urdu for free. But `app/styles/` contains **zero** logical properties
and:
- **66** unambiguous 1:1 conversions (`margin-left` → `margin-inline-start`,
  `padding-left`, `border-left`, `text-align: left` → `start`). These are
  *identical* under `dir=ltr`, so there is no regression risk to LTR screens.
- **51** positioning declarations (`left: 0`, `right: 0`) that need looking at
  individually — some should mirror, some (spinners, fixed toasts) should not.

Benefits Urdu/Arabic, not the American demos, which is why it was left.

### 7. Offline mode

All pricing and checkout is server-side against Neon. If the café's wifi drops
they stop selling. Square and its competitors queue offline and sync. At minimum
cache the menu client-side and queue checkouts locally.

### 8. Partial refunds

`returned` is a boolean on the invoice — refunds are all-or-nothing. US cafés
refund one item off a four-item ticket routinely, and card refunds must go back
to the original card. Needs per-line quantities and a reason code.

### 9. End-of-day close / Z-report

No cash drawer count, no expected-vs-actual variance, no Z-report. Managers ask
about this specifically because it is how they catch theft.

### 10. Open tabs and table service

The `orders` table exists in the schema and **nothing reads or writes it** —
checkout goes straight to `invoices`. So a customer cannot start a tab and a
server cannot hold a table's order open. Fine for counter service, blocking for
anything with table numbers. Either build on it or drop the table.

### 11. Email / SMS receipts

Receipts are print-only (`app/invoices/[invoiceId]/page.jsx` builds receipt
HTML). US customers expect a digital receipt, and it is also the cheapest route
into a customer list for loyalty later.

### 12. Smaller / later

- **Timezone picker** is still a free-text box on the new-café form, unlike
  currency and language. Same treatment would take an hour.
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

1. Sales tax, then tipping, then card — the three a US café cannot trade without,
   and the three you will be asked about out loud in a demo.
2. Modifiers — the real engineering project, and the one staff hit fastest.
3. Spanish UI (item 5) — visible differentiator, foundation already laid.
4. Offline and partial refunds.

Items 6, 10 and 12 are cleanup that can happen whenever.
