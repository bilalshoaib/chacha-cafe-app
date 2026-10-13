'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ItemAutocomplete from '@/components/ItemAutocomplete.jsx'
import { SkeletonStatus } from '@/components/Skeleton.jsx'
import { PARTNER_ORDER_TYPE, PartnerSaleDone, usePartnerTill } from '@/components/PartnerTill.jsx'
import { categoryLabel, formatItemExtras } from '@/utils/formatting.js'
import { discountPartsOf, priceLine, roundMoney } from '@/lib/pricing.js'
import { useMoney } from '@/context/BrandingContext.jsx'

/**
 * A partner kitchen's till, classic view — the partner's version of /orders:
 * type to find an item, set the quantity and any discount, add the line, edit
 * the lines in place. Shares its cart with the tile view at
 * /partners/[id]/quick (components/PartnerTill.jsx).
 *
 * Narrower than the café's screen on purpose: a partner sells only what is on
 * its own list, so there is no creating an item from the till, and no deals.
 */
export default function PartnerClassicTillPage() {
  const money = useMoney()
  const {
    partnerId, data, partnerName, loadError, reload, items, error, lines,
    addItem, setLineQty, setLineDiscount, removeLine, clearOrder,
    deliveryCharge, setDeliveryCharge,
    customerNote, setCustomerNote, subtotal, tax, dc, total, checkout, checkingOut, sold,
  } = usePartnerTill()

  const searchInputRef = useRef(null)
  const qtyInputRef = useRef(null)
  const [entrySearch, setEntrySearch] = useState('')
  const [entryItem, setEntryItem] = useState(null)
  const [entryQty, setEntryQty] = useState('1')
  const [entryUnitDiscount, setEntryUnitDiscount] = useState('')
  const [entryLineDiscount, setEntryLineDiscount] = useState('')
  const [qtyDraftByLine, setQtyDraftByLine] = useState({})
  const [discountDraftByLine, setDiscountDraftByLine] = useState({})

  // Ready to type the moment the menu is in.
  useEffect(() => {
    if (data) queueMicrotask(() => searchInputRef.current?.focus({ preventScroll: true }))
  }, [data])

  // Only one kind of discount per line — whichever is filled in locks the other.
  const entryUnitAmt = Number(entryUnitDiscount) || 0
  const entryLineAmt = Number(entryLineDiscount) || 0
  const entryUnitLocked = entryLineAmt > 0 && entryUnitAmt === 0
  const entryLineLocked = entryUnitAmt > 0 && entryLineAmt === 0
  const canCommitLine = Boolean(entryItem) && Number(entryQty) >= 1 && Number.isFinite(Number(entryQty))

  const entryLinePreview = entryItem && Number(entryQty) >= 1
    ? priceLine({ unitPrice: entryItem.price, qty: Number(entryQty), unitDiscount: entryUnitAmt, lineDiscount: entryLineAmt }).lineTotal
    : null

  function resetEntryRow() {
    setEntrySearch('')
    setEntryItem(null)
    setEntryQty('1')
    setEntryUnitDiscount('')
    setEntryLineDiscount('')
    queueMicrotask(() => searchInputRef.current?.focus({ preventScroll: true }))
  }

  function commitEntryRow() {
    if (!canCommitLine) return
    const ok = addItem(entryItem, Number(entryQty), {
      unitDiscount: Math.max(0, entryUnitAmt),
      lineDiscount: Math.max(0, entryLineAmt),
    })
    if (ok) resetEntryRow()
  }

  const draftKey = (lineId, field) => `${lineId}:${field}`
  const dropDraft = (setter, key) => setter((prev) => { const next = { ...prev }; delete next[key]; return next })

  function lineQtyDisplay(line) {
    const d = qtyDraftByLine[line.id]
    return d !== undefined ? d : String(line.qty)
  }

  function lineDiscountDisplay(line, field) {
    const d = discountDraftByLine[draftKey(line.id, field)]
    if (d !== undefined) return d
    const saved = discountPartsOf(line)[field]
    return saved ? String(saved) : ''
  }

  function draftedAmount(line, field) {
    const raw = discountDraftByLine[draftKey(line.id, field)]
    if (raw === undefined) return discountPartsOf(line)[field]
    const n = Number(raw === '' ? 0 : raw)
    return Number.isFinite(n) && n >= 0 ? n : discountPartsOf(line)[field]
  }

  function discountLockedBy(line, field) {
    const other = field === 'unitDiscount' ? 'lineDiscount' : 'unitDiscount'
    return draftedAmount(line, other) > 0 && draftedAmount(line, field) === 0
  }

  function previewLineTotal(line) {
    const rawQty = qtyDraftByLine[line.id]
    const q = rawQty !== undefined && rawQty !== '' ? Math.floor(Number(rawQty)) : line.qty
    if (!Number.isFinite(q) || q < 1) return line.lineTotal
    return priceLine({
      unitPrice: line.unitPrice,
      qty: q,
      unitDiscount: draftedAmount(line, 'unitDiscount'),
      lineDiscount: draftedAmount(line, 'lineDiscount'),
    }).lineTotal
  }

  function commitLineQty(line) {
    const raw = qtyDraftByLine[line.id]
    if (raw === undefined) return
    const q = Math.floor(Number(raw))
    if (Number.isFinite(q) && q >= 1 && q !== line.qty) setLineQty(line.id, q)
    dropDraft(setQtyDraftByLine, line.id)
  }

  function commitLineDiscount(line, field) {
    const key = draftKey(line.id, field)
    const raw = discountDraftByLine[key]
    if (raw === undefined) return
    const d = raw === '' ? 0 : Number(raw)
    if (Number.isFinite(d) && d >= 0 && d !== discountPartsOf(line)[field]) setLineDiscount(line.id, field, d)
    dropDraft(setDiscountDraftByLine, key)
  }

  const typeMeta = PARTNER_ORDER_TYPE

  if (sold) return <PartnerSaleDone />

  return (
    <main className="order-flow theme-chacha">
      <section className="card order-card">
        <div className="card-head">
          <h2>{partnerName} · Take order</h2>
          <div className="row">
            <Link href={`/partners/${partnerId}/quick`} className="ghost sm">Quick view →</Link>
            <button type="button" className="ghost sm" onClick={() => void reload()}>Refresh menu</button>
            {lines.length ? <button type="button" className="ghost danger sm" onClick={clearOrder}>Clear</button> : null}
          </div>
        </div>

        {loadError ? <p className="banner error" role="alert">{loadError}</p> : null}
        {error ? <p className="banner error" role="alert">{error}</p> : null}

        {!data ? (
          <SkeletonStatus label="Loading menu…" />
        ) : items.length === 0 ? (
          <p className="muted">
            {partnerName} has nothing on its menu yet.{' '}
            <Link href={`/partners/${partnerId}/prices`} className="inline-link">Choose items and prices</Link>.
          </p>
        ) : (
          <>
            <ul className="order-hint-list">
              <li><strong>Items</strong> — type 2–3 letters, <strong>Enter</strong> to pick, <strong>Enter</strong> again to add. Type a number in between for more than one.</li>
              <li><strong>Only {partnerName}’s menu</strong> is offered here, at {partnerName}’s prices.</li>
              <li><strong>Qty / Discount</strong> — edit any row, then press Enter or click away.</li>
            </ul>

            <div className="table-scroll">
              <table className="order-lines-table table-cards">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Size</th>
                    <th>Flavour</th>
                    <th>Category</th>
                    <th>Each</th>
                    <th>Disc/item</th>
                    <th>Disc (row)</th>
                    <th>Line</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const extras = formatItemExtras(line)
                    return (
                      <tr key={line.id}>
                        <td className="cell-card-title">
                          <span className="line-cell-name">{line.name}{extras ? ` · ${extras}` : ''}</span>
                        </td>
                        <td className="cell-card-field" data-label="Qty">
                          <input
                            className="input-table qty-input order-line-qty"
                            type="number"
                            min={1}
                            step={1}
                            value={lineQtyDisplay(line)}
                            onChange={(e) => setQtyDraftByLine((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            onBlur={() => commitLineQty(line)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitLineQty(line); e.target.blur() }
                            }}
                            aria-label={`Quantity for ${line.name}`}
                          />
                        </td>
                        <td className="cell-readonly" data-label="Size">{line.size || '—'}</td>
                        <td className="cell-readonly" data-label="Flavour">{line.flavour || '—'}</td>
                        <td className="cell-readonly muted" data-label="Category">{categoryLabel(line.category, data.categories)}</td>
                        <td className="cell-readonly" data-label="Each">{money(line.unitPrice)}</td>
                        {['unitDiscount', 'lineDiscount'].map((field) => {
                          const locked = discountLockedBy(line, field)
                          return (
                            <td key={field} className="cell-card-field" data-label={field === 'unitDiscount' ? 'Disc/item' : 'Disc (row)'}>
                              <input
                                className="input-table discount-input order-line-discount"
                                type="number"
                                min={0}
                                step={1}
                                inputMode="decimal"
                                placeholder={locked ? '—' : '0'}
                                value={lineDiscountDisplay(line, field)}
                                disabled={locked}
                                title={locked
                                  ? (field === 'unitDiscount'
                                      ? 'Clear the row discount to use a per-item discount instead.'
                                      : 'Clear the per-item discount to use a row discount instead.')
                                  : undefined}
                                onChange={(e) => setDiscountDraftByLine((prev) => ({ ...prev, [draftKey(line.id, field)]: e.target.value }))}
                                onBlur={() => commitLineDiscount(line, field)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitLineDiscount(line, field); e.target.blur() }
                                }}
                                aria-label={field === 'unitDiscount' ? `Discount per item for ${line.name}` : `Discount on the whole ${line.name} row`}
                              />
                            </td>
                          )
                        })}
                        <td className="cell-readonly" data-label="Line">
                          {money(previewLineTotal(line))}
                          {(line.discount ?? 0) > 0 ? <span className="line-discount-badge">−{money(line.discount)}</span> : null}
                        </td>
                        <td className="cell-card-action">
                          <button type="button" className="ghost danger sm" onClick={() => removeLine(line.id)}>Remove</button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="order-entry-row">
                    <td className="cell-card-field" data-label="Item">
                      <ItemAutocomplete
                        items={items}
                        searchValue={entrySearch}
                        onSearchChange={(v) => {
                          setEntrySearch(v)
                          setEntryItem((prev) => (prev && v.trim() !== prev.name.trim() ? null : prev))
                        }}
                        onSelectItem={(item) => setEntryItem(item)}
                        onPicked={() => qtyInputRef.current?.focus()}
                        onRequestNextField={() => { if (entryItem) qtyInputRef.current?.focus() }}
                        inputRef={searchInputRef}
                        noMatchHint={<>Not on {partnerName}’s menu. Add it on the <strong>Menu &amp; prices</strong> page first.</>}
                      />
                    </td>
                    <td className="cell-card-field" data-label="Qty">
                      <input
                        ref={qtyInputRef}
                        className="input-table qty-input"
                        type="number"
                        min={1}
                        step={1}
                        value={entryQty}
                        disabled={!entryItem}
                        onChange={(e) => setEntryQty(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEntryRow() } }}
                      />
                    </td>
                    <td className="cell-readonly" data-label="Size">{entryItem?.size || '—'}</td>
                    <td className="cell-readonly" data-label="Flavour">{entryItem?.flavour || '—'}</td>
                    <td className="cell-readonly muted" data-label="Category">{entryItem ? categoryLabel(entryItem.category, data.categories) : '—'}</td>
                    <td className="cell-readonly" data-label="Each">{entryItem ? money(entryItem.price) : '—'}</td>
                    <td className="cell-card-field" data-label="Disc/item">
                      <input
                        className="input-table discount-input"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        placeholder="0"
                        value={entryUnitDiscount}
                        disabled={!entryItem || entryUnitLocked}
                        onChange={(e) => setEntryUnitDiscount(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEntryRow() } }}
                        aria-label="Discount per item for new line"
                      />
                    </td>
                    <td className="cell-card-field" data-label="Disc (row)">
                      <input
                        className="input-table discount-input"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        placeholder="0"
                        value={entryLineDiscount}
                        disabled={!entryItem || entryLineLocked}
                        onChange={(e) => setEntryLineDiscount(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEntryRow() } }}
                        aria-label="Discount on the whole new line"
                      />
                    </td>
                    <td className="cell-readonly" data-label="Line">{entryLinePreview != null ? money(entryLinePreview) : '—'}</td>
                    <td className="cell-card-action">
                      <button type="button" className="primary sm" disabled={!canCommitLine} onClick={commitEntryRow}>Add line</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {dc > 0 || tax.taxTotal > 0 ? (
              <>
                <div className="total-row subtotal-row">
                  <span>Subtotal</span>
                  <span>{money(tax.inclusive ? roundMoney(subtotal - tax.taxTotal) : subtotal)}</span>
                </div>
                {dc > 0 ? (
                  <div className="total-row subtotal-row"><span>🛵 Delivery charge</span><span>{money(dc)}</span></div>
                ) : null}
                {tax.lines.map((t) => (
                  <div key={t.id} className="total-row subtotal-row tax-total-row">
                    <span>{t.name} ({t.rate}%){tax.inclusive ? ' · included' : ''}</span>
                    <span>{money(t.amount)}</span>
                  </div>
                ))}
              </>
            ) : null}
            <div className="total-row">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>

            <div className="order-type-block">
              <p className="order-type-label">Order type</p>
              <p className="partner-order-type"><span aria-hidden="true">{typeMeta.icon}</span> {typeMeta.label} <span className="muted small">— every {partnerName} order goes out for delivery</span></p>
            </div>

            <label className="field delivery-charge-field">
              <span>🛵 Delivery charge</span>
              <input type="number" min={0} step={1} inputMode="decimal" placeholder="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
            </label>

            <label className="field">
              <span>Note on invoice (optional)</span>
              <input value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder="Allergy, pickup time, etc." maxLength={200} />
            </label>

            <button type="button" className="primary wide" disabled={!lines.length || checkingOut} onClick={() => void checkout()}>
              {checkingOut ? 'Creating invoice…' : `Create invoice · ${typeMeta?.icon} ${typeMeta?.label}`}
            </button>
          </>
        )}
      </section>
    </main>
  )
}
