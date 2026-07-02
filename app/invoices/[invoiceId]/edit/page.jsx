'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ItemAutocomplete from '@/components/ItemAutocomplete.jsx'
import { api } from '@/api.js'
import { categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { cloneInvoiceLines, lineFromDeal, lineFromMenuItem, removeLineById, updateLineQty } from '@/utils/invoiceLines.js'
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
  useEffect(() => { if (!invoice) return; setNoteDraft(invoice.customerNote ?? ''); setEditedLines(cloneInvoiceLines(invoice.lines)) }, [invoice])
  useEffect(() => { setEntrySearch(''); setEntryItem(null); setEntryQty('1') }, [invoiceId])

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
    return Math.round(entryItem.price * q * 100) / 100
  })()

  const canAddLine = Boolean(entryItem) && Number(entryQty) >= 1 && Number.isFinite(Number(entryQty)) && invoice && !invoice.returned

  function resetEntryRow() {
    setEntrySearch(''); setEntryItem(null); setEntryQty('1')
    queueMicrotask(() => searchInputRef.current?.focus())
  }

  function commitEntryLine() {
    if (!invoice || invoice.returned || !entryItem || !canAddLine) return
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return
    setEditedLines((prev) => [...prev, lineFromMenuItem(entryItem, entryQty)])
    resetEntryRow()
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
          <label className="field deal-add-field deal-add-field-top">
            <span>Add a deal (bundle)</span>
            <select className="select deal-select" value="" onChange={(e) => {
              const id = e.target.value; if (!id) return
              const deal = menu.deals.find((d) => d.id === id)
              if (deal) setEditedLines((prev) => [...prev, lineFromDeal(deal, '1')])
              e.target.value = ''
            }} aria-label="Add a deal bundle as a line">
              <option value="">Choose a deal…</option>
              {menu.deals.map((d) => <option key={d.id} value={d.id}>{d.name} — {formatMoney(d.price)}</option>)}
            </select>
          </label>
        ) : <p className="muted small deal-add-missing">No deals — add bundles from the Deals screen if you use bundle pricing.</p>}

        <p className="muted small order-table-hint invoice-edit-table-hint"><strong>Items:</strong> search below, set quantity, then <strong>Add line</strong>. Deals use the dropdown above.</p>

        <div className="table-scroll">
          <table className="inv-table inv-table-edit">
            <thead><tr><th>Item</th><th>Qty</th><th>Each</th><th>Line</th><th aria-label="Actions" /></tr></thead>
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
                    <td>{formatMoney(line.lineTotal)}</td>
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
