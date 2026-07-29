'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ItemAutocomplete from '@/components/ItemAutocomplete.jsx'
import DealPicker from '@/components/DealPicker.jsx'
import { api } from '@/api.js'
import { categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { cloneInvoiceLines, lineFromDeal, lineFromMenuItem, removeLineById, updateLineDiscount, updateLineQty } from '@/utils/invoiceLines.js'
import { discountPartsOf, priceLine } from '@/lib/pricing.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useToast } from '@/context/ToastContext.jsx'

export default function InvoiceEditPage() {
  const { invoiceId } = useParams()
  const router = useRouter()
  const { menu } = useOrders()
  const toast = useToast()
  const [invoice, setInvoice] = useState(null)
  const [invoiceLoading, setInvoiceLoading] = useState(true)
  const [noteDraft, setNoteDraft] = useState('')
  const [editedLines, setEditedLines] = useState([])
  const [saving, setSaving] = useState(false)
  const [entrySearch, setEntrySearch] = useState('')
  const [entryItem, setEntryItem] = useState(null)
  const [entryQty, setEntryQty] = useState('1')
  const [entryUnitDiscount, setEntryUnitDiscount] = useState('')
  const [entryLineDiscount, setEntryLineDiscount] = useState('')
  // Raw text per line, so a half-typed discount ("" or "1.") stays on screen
  // while editedLines keeps the parsed value.
  const [discountDraftByLine, setDiscountDraftByLine] = useState({})
  const searchInputRef = useRef(null)
  const qtyInputRef = useRef(null)

  const loadInvoice = useCallback(async () => {
    setInvoiceLoading(true)
    try {
      const inv = await api.getInvoice(invoiceId)
      setInvoice(inv)
    } catch { setInvoice(null) }
    finally { setInvoiceLoading(false) }
  }, [invoiceId])

  useEffect(() => { void loadInvoice() }, [loadInvoice])
  useEffect(() => { if (!invoice) return; setNoteDraft(invoice.customerNote ?? ''); setEditedLines(cloneInvoiceLines(invoice.lines)); setDiscountDraftByLine({}) }, [invoice])
  useEffect(() => { setEntrySearch(''); setEntryItem(null); setEntryQty('1'); setEntryUnitDiscount(''); setEntryLineDiscount('') }, [invoiceId])

  const itemLabelById = useMemo(() => {
    const m = {}
    for (const i of menu.items) {
      const x = formatItemExtras(i)
      m[i.id] = x ? `${i.name} · ${x}` : i.name
    }
    return m
  }, [menu.items])

  const draftTotal = useMemo(() => Math.round(editedLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100, [editedLines])
  const linesDirty = invoice != null && JSON.stringify(editedLines) !== JSON.stringify(invoice.lines)
  const noteDirty = invoice != null && (invoice.customerNote ?? '') !== noteDraft
  const saveDirty = (linesDirty || noteDirty) && invoice && !invoice.returned

  const entryLinePreview = (() => {
    if (!entryItem) return null
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return null
    return priceLine({
      unitPrice: entryItem.price,
      qty: q,
      unitDiscount: Number(entryUnitDiscount) || 0,
      lineDiscount: Number(entryLineDiscount) || 0,
    }).lineTotal
  })()

  const entryUnitAmt = Number(entryUnitDiscount) || 0
  const entryLineAmt = Number(entryLineDiscount) || 0
  const entryUnitLocked = entryLineAmt > 0 && entryUnitAmt === 0
  const entryLineLocked = entryUnitAmt > 0 && entryLineAmt === 0

  const canAddLine = Boolean(entryItem) && Number(entryQty) >= 1 && Number.isFinite(Number(entryQty)) && invoice && !invoice.returned

  function resetEntryRow() {
    setEntrySearch(''); setEntryItem(null); setEntryQty('1'); setEntryUnitDiscount(''); setEntryLineDiscount('')
    queueMicrotask(() => searchInputRef.current?.focus())
  }

  function commitEntryLine() {
    if (!invoice || invoice.returned || !entryItem || !canAddLine) return
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return
    setEditedLines((prev) => [...prev, lineFromMenuItem(entryItem, entryQty, { unitDiscount: Number(entryUnitDiscount) || 0, lineDiscount: Number(entryLineDiscount) || 0 })])
    resetEntryRow()
  }

  function draftKey(lineId, field) {
    return `${lineId}:${field}`
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

  /**
   * The two discounts are mutually exclusive: entering one locks the other.
   * If a line somehow carries both, neither is locked so it can be corrected.
   */
  function discountLockedBy(line, field) {
    const other = field === 'unitDiscount' ? 'lineDiscount' : 'unitDiscount'
    return draftedAmount(line, other) > 0 && draftedAmount(line, field) === 0
  }

  // Applied straight to editedLines on every keystroke, so nothing is left
  // uncommitted when Save is pressed.
  function setLineDiscount(line, field, raw) {
    setDiscountDraftByLine((prev) => ({ ...prev, [draftKey(line.id, field)]: raw }))
    setEditedLines((prev) => updateLineDiscount(prev, line.id, field, raw === '' ? 0 : raw))
  }

  async function saveInvoiceEdits() {
    if (!invoice || invoice.returned) return
    setSaving(true)
    try {
      await api.updateInvoice(invoice.id, { customerNote: noteDraft, lines: editedLines })
      toast.success('Invoice saved')
      router.push(`/invoices/${invoice.id}`)
    } catch (e) { toast.error(e.message || 'Could not save invoice') }
    finally { setSaving(false) }
  }

  if (invoiceLoading) return <main className="invoice-detail-page invoice-edit-page"><p className="muted">Loading invoice…</p></main>

  if (!invoice) {
    return (
      <main className="invoice-detail-page invoice-edit-page">
        <nav className="invoice-edit-top-nav"><Link href="/invoices" className="inline-link">← All invoices</Link></nav>
        <section className="card"><h2>Invoice not found</h2><p className="muted">No invoice with id {invoiceId}.</p></section>
      </main>
    )
  }

  if (invoice.returned) {
    router.replace(`/invoices/${invoice.id}`)
    return null
  }

  return (
    <main className="invoice-detail-page invoice-edit-page">
      <header className="invoice-edit-header card">
        <div className="invoice-edit-header-row">
          <div>
            <p className="muted small invoice-edit-kicker">Editing</p>
            <h1 className="invoice-edit-title">Invoice {invoice.id}</h1>
          </div>
          <div className="invoice-edit-header-links">
            <Link href={`/invoices/${invoice.id}`} className="ghost sm">View invoice</Link>
            <Link href="/invoices" className="ghost sm">All invoices</Link>
          </div>
        </div>
        <p className="muted small invoice-edit-sub">Search for a menu item, set quantity, then Add line — same as building an order. Save when you are done.</p>
      </header>

      <section className="card invoice-sheet invoice-view-card">
        <h2 className="sub">Line items</h2>
        {invoice.orderId ? (
          <p className="muted small invoice-order-ref">Order: {invoice.orderId}</p>
        ) : null}

        {menu.deals.length > 0 ? (
          <div className="field deal-add-field deal-add-field-top">
            <span>Add a deal to this invoice</span>
            <DealPicker
              deals={menu.deals}
              itemLabelById={itemLabelById}
              onSelect={(id) => {
                const deal = menu.deals.find((d) => d.id === id)
                if (deal) setEditedLines((prev) => [...prev, lineFromDeal(deal, '1')])
              }}
            />
          </div>
        ) : (
          <p className="muted small deal-add-missing">No deals — add bundles from the Deals screen if you use bundle pricing.</p>
        )}

        <p className="muted small order-table-hint invoice-edit-table-hint"><strong>Items:</strong> search below, set quantity, then <strong>Add line</strong>. Deals use the dropdown above.</p>

        <div className="table-scroll">
          <table className="inv-table inv-table-edit">
            <thead><tr><th>Item</th><th>Qty</th><th>Each</th><th>Disc/item</th><th>Disc (row)</th><th>Line</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {editedLines.map((line) => {
                const extras = formatItemExtras(line)
                return (
                  <tr key={line.id}>
                    <td>
                      <div>{line.kind === 'deal' ? 'Deal · ' : ''}{line.name}{extras ? ` · ${extras}` : ''}</div>
                      {line.kind === 'item' ? <div className="muted small">{categoryLabel(line.category)}</div> : null}
                      {line.kind === 'deal' && line.dealIncludes?.length ? (
                        <ul className="includes">
                          {line.dealIncludes.map((inc, i) => <li key={`${line.id}-inc-${i}`}>{inc.qty}× {itemLabelById[inc.itemId] || inc.itemId}</li>)}
                        </ul>
                      ) : null}
                    </td>
                    <td>
                      <input className="input-table inv-qty-input" type="number" min={1} step={1} value={line.qty}
                        onChange={(e) => setEditedLines((prev) => updateLineQty(prev, line.id, e.target.value))}
                        aria-label="Quantity" />
                    </td>
                    <td>{formatMoney(line.unitPrice)}</td>
                    {['unitDiscount', 'lineDiscount'].map((field) => {
                      const locked = discountLockedBy(line, field)
                      return (
                        <td key={field}>
                          <input className="input-table discount-input" type="number" min={0} step={1} inputMode="decimal"
                            placeholder={locked ? '—' : '0'}
                            value={lineDiscountDisplay(line, field)}
                            disabled={locked}
                            title={locked
                              ? (field === 'unitDiscount'
                                  ? 'Clear the row discount to use a per-item discount instead.'
                                  : 'Clear the per-item discount to use a row discount instead.')
                              : undefined}
                            onChange={(e) => setLineDiscount(line, field, e.target.value)}
                            aria-label={field === 'unitDiscount' ? `Discount per item for ${line.name}` : `Discount on the whole ${line.name} row`} />
                        </td>
                      )
                    })}
                    <td>
                      {formatMoney(line.lineTotal)}
                      {(line.discount ?? 0) > 0 ? <span className="line-discount-badge">−{formatMoney(line.discount)}</span> : null}
                    </td>
                    <td><button type="button" className="ghost danger sm" onClick={() => setEditedLines((prev) => removeLineById(prev, line.id))}>Remove</button></td>
                  </tr>
                )
              })}
              <tr className="order-entry-row invoice-add-line-row">
                <td>
                  <ItemAutocomplete
                    items={menu.items}
                    searchValue={entrySearch}
                    onSearchChange={(v) => { setEntrySearch(v); setEntryItem((prev) => { if (prev && v.trim() !== prev.name.trim()) return null; return prev }) }}
                    onSelectItem={(item) => setEntryItem(item)}
                    onPicked={() => qtyInputRef.current?.focus()}
                    onRequestNextField={() => qtyInputRef.current?.focus()}
                    inputRef={searchInputRef}
                  />
                </td>
                <td>
                  <input ref={qtyInputRef} className="input-table inv-qty-input" type="number" min={1} step={1} value={entryQty} disabled={!entryItem}
                    onChange={(e) => setEntryQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEntryLine() } }}
                    aria-label="Quantity for new line" />
                </td>
                <td className="cell-readonly">{entryItem ? formatMoney(entryItem.price) : '—'}</td>
                <td>
                  <input className="input-table discount-input" type="number" min={0} step={1} inputMode="decimal" placeholder="0"
                    value={entryUnitDiscount} disabled={!entryItem || entryUnitLocked}
                    title={entryUnitLocked ? 'Clear the row discount to use a per-item discount instead.' : undefined}
                    onChange={(e) => setEntryUnitDiscount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEntryLine() } }}
                    aria-label="Discount per item for new line" />
                </td>
                <td>
                  <input className="input-table discount-input" type="number" min={0} step={1} inputMode="decimal" placeholder="0"
                    value={entryLineDiscount} disabled={!entryItem || entryLineLocked}
                    title={entryLineLocked ? 'Clear the per-item discount to use a row discount instead.' : undefined}
                    onChange={(e) => setEntryLineDiscount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEntryLine() } }}
                    aria-label="Discount on the whole new line" />
                </td>
                <td className="cell-readonly">{entryLinePreview != null ? formatMoney(entryLinePreview) : '—'}</td>
                <td><button type="button" className="primary sm" disabled={!canAddLine} onClick={commitEntryLine}>Add line</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="total-row big">
          <span>{invoice.paid ? 'Total' : 'Total due'}</span>
          <strong>{formatMoney(draftTotal)}</strong>
        </div>

        <label className="field invoice-note-edit">
          <span>Note (shown on invoice)</span>
          <textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Table name, pickup, payment reference…" maxLength={200} />
        </label>

        <div className="invoice-edit-save-row">
          <button type="button" className="primary" disabled={saving || !saveDirty || editedLines.length === 0} onClick={() => void saveInvoiceEdits()}>
            {saving ? 'Saving…' : 'Save and return to invoice'}
          </button>
          {!saveDirty ? <span className="muted small invoice-save-hint">Change lines or note to enable save.</span> : null}
        </div>
      </section>
    </main>
  )
}
