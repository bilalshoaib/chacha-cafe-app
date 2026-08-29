/**
 * What tax a sale carries, and which way round the price was quoted.
 *
 * Pure arithmetic over lines and rates: no database, no React, no formatting.
 * Checkout, the invoice editor, the till's live preview and the tests all call
 * the same function, because the one thing that must never happen is the
 * number on the screen disagreeing with the number on the receipt.
 *
 * Two rules are worth stating up front, because they are decisions rather than
 * consequences:
 *
 *   • Delivery is not taxed. Whether a delivery charge is taxable varies by
 *     state and sometimes by whether the food itself is taxable, and getting
 *     it wrong in the confident direction overcharges customers. Tax is
 *     computed on the sold lines only; a café that needs delivery taxed can
 *     say so when somebody asks for it.
 *
 *   • A deal is taxed only by rates that name no category. A deal bundles
 *     items from several categories at one bundled price, so "tax prepared
 *     food but not packaged goods" has no single answer for it. Rates that
 *     apply to everything — which is what a state sales tax is — apply to
 *     deals normally.
 */

import { roundMoney } from './pricing.js'

/** The order types a rate can be restricted to — the same three checkout accepts. */
export const TAX_ORDER_TYPES = ['dine_in', 'takeaway', 'delivery']

export const MAX_TAX_RATE = 100
export const MAX_TAX_NAME = 60

/**
 * Whether a rate applies to one line of one order.
 *
 * An empty restriction list means "no restriction", not "nothing" — a rate
 * with no order types and no categories is the ordinary case and applies to
 * everything.
 */
export function rateApplies(rate, { orderType = null, category = null, kind = 'item' } = {}) {
  if (!rate || rate.enabled === false) return false
  if (!(Number(rate.rate) > 0)) return false

  const types = Array.isArray(rate.orderTypes) ? rate.orderTypes : []
  // A rate restricted to certain order types cannot be judged against an order
  // that has not said which it is, so it does not apply. The alternative —
  // charging it anyway — puts a dine-in surcharge on a ticket nobody has said
  // is dine-in.
  if (types.length > 0 && (!orderType || !types.includes(orderType))) return false

  const cats = Array.isArray(rate.categories) ? rate.categories : []
  if (cats.length > 0) {
    if (kind === 'deal') return false
    if (!category || !cats.includes(category)) return false
  }
  return true
}

/**
 * The tax on a set of order lines.
 *
 * Returns the shape that is stored on the invoice and rendered on the receipt:
 *
 *   {
 *     inclusive,        // was the quoted price tax-inclusive
 *     taxTotal,         // the money, summed
 *     taxableTotal,     // the net amount those rates were applied to
 *     lines: [{ id, name, rate, taxable, amount }]
 *   }
 *
 * Exclusive is the simple direction: each rate takes its percentage of the
 * lines it applies to, and the sale's total grows by the sum.
 *
 * Inclusive is the awkward one, and the awkwardness is real rather than
 * incidental. The line total already contains the tax, so the net has to be
 * divided back out — and when two rates both apply, they were both inside the
 * same price, so the divisor is their sum and each rate's share of what comes
 * out is proportional to its own percentage. Doing it rate by rate instead
 * would carve each one out of the full gross and over-collect.
 */
export function computeInvoiceTax({ lines = [], rates = [], orderType = null, pricesIncludeTax = false } = {}) {
  const inclusive = Boolean(pricesIncludeTax)
  const applicable = (Array.isArray(rates) ? rates : []).filter(
    (r) => r && r.enabled !== false && Number(r.rate) > 0,
  )

  const empty = { inclusive, taxTotal: 0, taxableTotal: 0, lines: [] }
  if (!applicable.length || !Array.isArray(lines) || !lines.length) return empty

  // Exact, unrounded, per rate. Rounding once at the end rather than per line
  // keeps a twenty-line ticket from drifting a cent per line away from the
  // percentage actually printed on the receipt.
  const tally = new Map(applicable.map((r) => [r.id, { rate: r, taxable: 0, amount: 0 }]))
  let carvedExact = 0
  // The sale's own taxable base, counted once per line however many rates hit
  // it. Each rate's `taxable` below is that rate's own base and is what the
  // filing breakdown wants; summing those instead would report a hundred-dollar
  // line taxed by two rates as two hundred dollars of taxable sales.
  let baseExact = 0

  for (const line of lines) {
    const gross = Number(line?.lineTotal) || 0
    if (gross <= 0) continue
    const context = { orderType, category: line?.category ?? null, kind: line?.kind ?? 'item' }
    const hits = applicable.filter((r) => rateApplies(r, context))
    if (!hits.length) continue

    if (!inclusive) {
      baseExact += gross
      for (const r of hits) {
        const entry = tally.get(r.id)
        entry.taxable += gross
        entry.amount += (gross * Number(r.rate)) / 100
      }
      continue
    }

    const combined = hits.reduce((s, r) => s + Number(r.rate), 0)
    const net = gross / (1 + combined / 100)
    const lineTax = gross - net
    carvedExact += lineTax
    baseExact += net
    for (const r of hits) {
      const entry = tally.get(r.id)
      const share = lineTax * (Number(r.rate) / combined)
      entry.taxable += net
      entry.amount += share
    }
  }

  const out = []
  let taxTotal = 0
  for (const { rate, taxable, amount } of tally.values()) {
    const money = roundMoney(amount)
    if (money <= 0) continue
    out.push({
      id: rate.id,
      name: rate.name,
      rate: Number(rate.rate),
      taxable: roundMoney(taxable),
      amount: money,
    })
    taxTotal = roundMoney(taxTotal + money)
  }
  if (!out.length) return empty

  // Inclusive tax is money already inside the total the customer is paying, so
  // the parts have to reconcile with what was carved out exactly — otherwise
  // subtotal-minus-tax and the printed net disagree by a cent. Exclusive tax
  // has no such constraint: there the total is *defined* as the sum of these
  // rounded amounts.
  if (inclusive) {
    const drift = roundMoney(roundMoney(carvedExact) - taxTotal)
    if (drift !== 0) {
      const biggest = out.reduce((a, b) => (b.amount > a.amount ? b : a), out[0])
      biggest.amount = roundMoney(biggest.amount + drift)
      taxTotal = roundMoney(taxTotal + drift)
    }
  }

  return { inclusive, taxTotal, taxableTotal: roundMoney(baseExact), lines: out }
}

/**
 * What the customer pays.
 *
 * The single place the three components are added up, so checkout, the invoice
 * editor and the till preview cannot each decide differently whether tax goes
 * on top. Inclusive tax is already inside the line totals and must not be
 * added again — that is the whole of the difference, and it is exactly the
 * mistake this function exists to make impossible.
 */
export function invoiceTotal({ subtotal = 0, deliveryCharge = 0, taxTotal = 0, inclusive = false }) {
  const base = roundMoney(Number(subtotal) + Number(deliveryCharge))
  return inclusive ? base : roundMoney(base + Number(taxTotal))
}

/**
 * What the sale was worth to the business, with the tax taken out.
 *
 * Tax is collected on behalf of a government and passed on; counting it as
 * revenue overstates every sales figure in the app by the rate. Under
 * exclusive pricing the line totals never contained it, so the subtotal is
 * already net; under inclusive pricing it has to come off.
 */
export function netOfTax(invoice) {
  const subtotal = Number(invoice?.subtotal ?? 0)
  if (!invoice?.taxInclusive) return roundMoney(subtotal)
  return roundMoney(subtotal - Number(invoice?.taxTotal ?? 0))
}

/**
 * Checks one rate on the way into the database.
 *
 * Deliberately strict, and the mirror of the asymmetry in constants/locales.js:
 * a bad rate is refused on the way in, because a rate stored wrong is charged
 * to real customers on real sales and cannot be quietly defaulted away
 * afterwards. Returns { rate } or { error }.
 */
export function parseTaxRateInput(body = {}, existing = null) {
  const next = {
    name: existing?.name ?? '',
    rate: existing?.rate ?? 0,
    orderTypes: existing?.orderTypes ?? [],
    categories: existing?.categories ?? [],
    enabled: existing?.enabled ?? true,
    sortOrder: existing?.sortOrder ?? 0,
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return { error: 'A tax needs a name — it is printed on the receipt.' }
    next.name = name.slice(0, MAX_TAX_NAME)
  }
  if (!next.name) return { error: 'A tax needs a name — it is printed on the receipt.' }

  if (body.rate !== undefined) {
    const rate = Number(body.rate)
    if (!Number.isFinite(rate) || rate < 0 || rate > MAX_TAX_RATE) {
      return { error: `Rate must be a percentage between 0 and ${MAX_TAX_RATE}.` }
    }
    // Four decimals is what the column holds; rounding here rather than
    // letting Postgres do it means the value read back is the value validated.
    next.rate = Math.round(rate * 10000) / 10000
  }

  if (body.orderTypes !== undefined) {
    const list = Array.isArray(body.orderTypes) ? body.orderTypes : []
    if (list.some((t) => !TAX_ORDER_TYPES.includes(t))) {
      return { error: 'Unknown order type.' }
    }
    // All three selected is the same rule as none selected, stored as none so
    // that adding a fourth order type later does not silently exclude it.
    next.orderTypes = list.length === TAX_ORDER_TYPES.length ? [] : [...new Set(list)]
  }

  if (body.categories !== undefined) {
    const list = Array.isArray(body.categories) ? body.categories : []
    if (list.some((c) => typeof c !== 'string' || !c.trim())) {
      return { error: 'Unknown menu category.' }
    }
    next.categories = [...new Set(list.map((c) => c.trim().slice(0, 40)))]
  }

  if (body.enabled !== undefined) next.enabled = Boolean(body.enabled)
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder)
    next.sortOrder = Number.isFinite(n) ? Math.trunc(n) : 0
  }

  return { rate: next }
}
