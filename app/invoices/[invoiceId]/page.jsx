'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import { businessTypeLabel, invoiceBusinessType } from '@/constants/businessTypes.js'
import { categoryLabel, formatItemExtras, formatMoney, formatShortDateTime } from '@/utils/formatting.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useAuth } from '@/context/AuthContext.jsx'
import { useToast } from '@/context/ToastContext.jsx'

const ORDER_TYPE_META = {
  dine_in:  { label: 'Dine In',  icon: '🍽️', cls: 'badge-order-type-dine' },
  takeaway: { label: 'Takeaway', icon: '🛍️', cls: 'badge-order-type-take' },
  delivery: { label: 'Delivery', icon: '🛵', cls: 'badge-order-type-delivery' },
}

function OrderTypeBadge({ type }) {
  if (!type) return null
  const meta = ORDER_TYPE_META[type] ?? { label: type, icon: '', cls: '' }
  return (
    <span className={`badge-order-type ${meta.cls}`}>
      {meta.icon} {meta.label}
    </span>
  )
}

function buildReceiptHtml(invoice, itemLabelById) {
  const businessName = invoiceBusinessType(invoice) === 'burger' ? 'Chacha Burger' : 'Chacha Cafe'
  const orderTypeLabels = { dine_in: '*** DINE IN ***', takeaway: '*** TAKEAWAY ***', delivery: '*** DELIVERY ***' }
  const orderTypeLine = invoice.orderType ? (orderTypeLabels[invoice.orderType] ?? invoice.orderType.toUpperCase()) : ''
  const paymentLine = invoice.paymentMethod === 'cash' ? 'Payment: Cash' : invoice.paymentMethod === 'online' ? 'Payment: Online / Card' : ''
  const lineRows = invoice.lines.map((line) => {
    const extras = formatItemExtras(line)
    const label = (line.kind === 'deal' ? 'Deal: ' : '') + line.name + (extras ? ` (${extras})` : '')
    const lineTotal = formatMoney(line.lineTotal)
    const each = line.qty > 1 ? `${line.qty} x ${formatMoney(line.unitPrice)}` : ''
    const discRow = (line.discount ?? 0) > 0 ? `<div class="item-disc">Disc: -${formatMoney(line.discount)}</div>` : ''
    const includes = line.kind === 'deal' && line.dealIncludes?.length
      ? line.dealIncludes.map((inc) => `<div class="inc-line">&nbsp;&nbsp;${inc.qty}x ${itemLabelById[inc.itemId] || inc.itemId}</div>`).join('')
      : ''
    return `<tr><td class="item-col"><div class="item-name">${label}</div>${each ? `<div class="item-each">${each}</div>` : ''}${discRow}${includes}</td><td class="amt-col">${lineTotal}</td></tr>`
  }).join('')
  const totalDiscountAmt = invoice.lines.reduce((s, l) => s + (l.discount ?? 0), 0)
  const deliveryCharge = invoice.deliveryCharge ?? 0
  const discountSummary = totalDiscountAmt > 0
    ? `<div class="total-row" style="font-size:10px;font-weight:normal;"><span>Subtotal</span><span>${formatMoney(invoice.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0))}</span></div><div class="total-row" style="font-size:10px;font-weight:normal;"><span>Total Discount</span><span>-${formatMoney(totalDiscountAmt)}</span></div>`
    : ''
  const deliveryChargeLine = deliveryCharge > 0
    ? `<div class="total-row" style="font-size:10px;font-weight:normal;"><span>Subtotal</span><span>${formatMoney(invoice.subtotal ?? (invoice.total - deliveryCharge))}</span></div><div class="total-row" style="font-size:10px;font-weight:normal;"><span>Delivery Charge</span><span>${formatMoney(deliveryCharge)}</span></div>`
    : ''
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Receipt ${invoice.id}</title><style>@page{size:72mm auto;margin:0}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',Courier,monospace;font-size:10px;color:#000;width:72mm;padding:2mm 5mm;background:#fff}.center{text-align:center}.right{text-align:right}.bold{font-weight:bold}.dashed{border-top:1px dashed #000;margin:4px 0}.solid{border-top:1px solid #000;margin:4px 0}.shop-name{font-size:16px;font-weight:bold;text-align:center;letter-spacing:1px;margin-bottom:2px}.shop-sub{text-align:center;font-size:9px;margin-bottom:3px}.meta-row{display:flex;justify-content:space-between;font-size:9px;margin:1px 0}.order-type-banner{text-align:center;font-size:14px;font-weight:bold;letter-spacing:1.5px;margin:5px 0;padding:4px 0;border-top:2px solid #000;border-bottom:2px solid #000}table{width:100%;border-collapse:collapse;margin:2px 0}th{font-size:9px;text-align:left;border-bottom:1px solid #000;padding:1px 0}th.amt-col{text-align:right}td{vertical-align:top;padding:2px 0;font-size:10px}.item-col{width:80%}.amt-col{width:20%;text-align:right;white-space:nowrap}.item-name{font-weight:bold}.item-each{font-size:9px;color:#333}.item-disc{font-size:9px;color:#555}.inc-line{font-size:9px}.total-row{display:flex;justify-content:space-between;font-size:13px;font-weight:bold;margin:3px 0}.status-row{text-align:center;font-size:10px;margin:2px 0}.footer{text-align:center;font-size:9px;margin-top:6px}.note-box{font-size:9px;margin:2px 0}.returned-notice{text-align:center;font-weight:bold;font-size:11px;border:1px solid #000;padding:2px 4px;margin:3px 0}</style></head><body><div class="shop-name">${businessName}</div><div class="shop-sub">Chacha Burger Cafe</div><div class="dashed"></div><div class="meta-row"><span>Invoice:</span><span>${invoice.id}</span></div><div class="meta-row"><span>Date:</span><span>${new Date(invoice.createdAt).toLocaleString()}</span></div>${invoice.orderId ? `<div class="meta-row"><span>Order:</span><span>${invoice.orderId}</span></div>` : ''}${orderTypeLine ? `<div class="order-type-banner">${orderTypeLine}</div>` : '<div class="dashed"></div>'}<table><thead><tr><th class="item-col">Item</th><th class="amt-col">Amt</th></tr></thead><tbody>${lineRows}</tbody></table><div class="solid"></div>${discountSummary}${!discountSummary ? deliveryChargeLine : (deliveryCharge > 0 ? `<div class="total-row" style="font-size:10px;font-weight:normal;"><span>Delivery Charge</span><span>${formatMoney(deliveryCharge)}</span></div>` : '')}<div class="total-row"><span>${invoice.paid || invoice.returned ? 'TOTAL' : 'TOTAL DUE'}</span><span>${formatMoney(invoice.total)}</span></div><div class="dashed"></div>${paymentLine ? `<div class="status-row">${paymentLine}</div>` : ''}<div class="status-row">${invoice.returned ? '** RETURNED **' : invoice.paid ? 'PAID' : 'UNPAID'}</div>${invoice.returned ? `<div class="returned-notice">** REFUNDED / RETURNED **</div>` : ''}${invoice.returnNote ? `<div class="note-box">Return note: ${invoice.returnNote}</div>` : ''}${invoice.customerNote ? `<div class="note-box">Note: ${invoice.customerNote}</div>` : ''}<div class="dashed"></div><div class="footer">Thank you for visiting!</div><div class="footer">Chacha Burger Cafe</div></body></html>`
}

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const { menu } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const isCounterCashier = user?.role === 'counter_cashier'
  const [invoice, setInvoice] = useState(null)
  const [invoiceLoading, setInvoiceLoading] = useState(true)
  const [returnNoteDraft, setReturnNoteDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const confirmDialogRef = useRef(null)
  const returnDialogRef = useRef(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [showPayMethodModal, setShowPayMethodModal] = useState(false)

  const loadInvoice = useCallback(async () => {
    setInvoiceLoading(true)
    try {
      const inv = await api.getInvoice(invoiceId)
      setInvoice(inv)
    } catch { setInvoice(null) }
    finally { setInvoiceLoading(false) }
  }, [invoiceId])

  useEffect(() => { void loadInvoice() }, [loadInvoice])
  useEffect(() => { if (!invoice) return; setReturnNoteDraft(invoice.returnNote ?? '') }, [invoice])
  useEffect(() => {
    if (!confirmAction) return
    const el = confirmDialogRef.current
    if (el && !el.open) el.showModal()
  }, [confirmAction])

  const itemLabelById = useMemo(() => {
    const m = {}
    for (const i of menu.items) {
      const x = formatItemExtras(i)
      m[i.id] = x ? `${i.name} · ${x}` : i.name
    }
    return m
  }, [menu.items])

  function closeConfirm() { confirmDialogRef.current?.close(); setConfirmAction(null) }
  function openReturnDialog() {
    if (!invoice) return
    setReturnNoteDraft(invoice.returnNote ?? '')
    const el = returnDialogRef.current
    if (el && !el.open) el.showModal()
  }
  function closeReturnDialog() { returnDialogRef.current?.close() }

  async function executeConfirmed() {
    const action = confirmAction; const inv = invoice; closeConfirm()
    if (!action || !inv) return
    if (action === 'unpaid') { await runSetPaid(inv, false); return }
    if (action === 'clearReturn') { await runClearReturn(inv) }
  }

  async function submitReturnFromDialog() {
    if (!invoice) return
    setSaving(true); setError('')
    try {
      await api.updateInvoice(invoice.id, { returned: true, returnNote: returnNoteDraft.trim() })
      await loadInvoice()
      closeReturnDialog()
      toast.success('Return recorded')
    } catch (e) { setError(e.message); toast.error(e.message || 'Could not record return') }
    finally { setSaving(false) }
  }

  async function runSetPaid(inv, paid, paymentMethod) {
    setSaving(true); setError('')
    try {
      const patch = { paid }
      if (paid && paymentMethod) patch.paymentMethod = paymentMethod
      await api.updateInvoice(inv.id, patch)
      await loadInvoice()
      toast.success(paid ? `Invoice marked as paid${paymentMethod ? ` (${paymentMethod})` : ''}` : 'Invoice marked as unpaid')
    }
    catch (e) { setError(e.message); toast.error(e.message || 'Could not update invoice') }
    finally { setSaving(false) }
  }

  async function runClearReturn(inv) {
    setSaving(true); setError('')
    try {
      await api.updateInvoice(inv.id, { returned: false })
      await loadInvoice()
      toast.success('Return status cleared')
    }
    catch (e) { setError(e.message); toast.error(e.message || 'Could not clear return') }
    finally { setSaving(false) }
  }

  const confirmCopy = {
    unpaid: { title: 'Mark this invoice as unpaid?', body: 'The paid timestamp will be removed. Use this if payment was marked by mistake.', confirm: 'Mark as unpaid' },
    clearReturn: { title: 'Clear return status?', body: 'Only use this if the return was recorded by mistake. Lines will become editable again on the edit screen.', confirm: 'Clear return status' },
  }
  const confirmConfig = confirmAction ? confirmCopy[confirmAction] : null

  function printReceipt() {
    if (!invoice) return
    const html = buildReceiptHtml(invoice, itemLabelById)
    const win = window.open('', '_blank', 'width=340,height=600,toolbar=0,menubar=0,location=0')
    if (!win) return
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => { win.print() }, 300)
  }

  if (invoiceLoading) {
    return <main className="invoice-detail-page invoice-detail-view"><p className="muted">Loading invoice…</p></main>
  }

  if (!invoice) {
    return (
      <main className="invoice-detail-page invoice-detail-view">
        <nav className="invoice-detail-nav"><Link href="/invoices" className="invoice-return-button">← Back to all invoices</Link></nav>
        <section className="card">
          <h2>Invoice not found</h2>
          <p className="muted">No invoice with id {invoiceId}.</p>
          <Link href="/invoices" className="inline-link">Return to invoice list</Link>
        </section>
      </main>
    )
  }

  return (
    <>
      <main className="invoice-detail-page invoice-detail-view">
        {error ? <p className="banner error" role="alert">{error}</p> : null}
        <header className="invoice-view-toolbar">
          <nav className="invoice-detail-nav"><Link href="/invoices" className="invoice-return-button invoice-toolbar-link">← All invoices</Link></nav>
          <div className="invoice-view-actions">
            <button type="button" className="ghost sm" onClick={printReceipt}>🖨 Print receipt</button>
            {!invoice.returned ? (
              <Link href={`/invoices/${invoice.id}/edit`} className="invoice-edit-link">Edit invoice</Link>
            ) : (
              <span className="muted small invoice-edit-disabled-hint">Returned — not editable</span>
            )}
          </div>
        </header>

        <article className="card invoice-sheet invoice-view-document">
          <div className="invoice-header invoice-view-header">
            <div>
              <p className="invoice-view-kicker muted small">Invoice</p>
              <h1 className="invoice-view-title">{invoice.id}</h1>
              <div className="invoice-status-badges">
                <BusinessTypeBadge type={invoiceBusinessType(invoice)} />
                <OrderTypeBadge type={invoice.orderType} />
                {invoice.paid ? <span className="badge-paid">Paid</span> : <span className="badge-unpaid">Unpaid</span>}
                {invoice.returned ? <span className="badge-returned">Returned</span> : null}
                {invoice.paymentMethod === 'cash' ? <span className="badge-payment-method">💵 Cash</span> : invoice.paymentMethod === 'online' ? <span className="badge-payment-method">💳 Online / Card</span> : null}
              </div>
              {invoice.paid && invoice.paidAt ? (
                <p className="muted small invoice-meta-line">Paid · {formatShortDateTime(invoice.paidAt)}{invoice.paymentMethod ? ` · ${invoice.paymentMethod === 'cash' ? 'Cash' : 'Online / Card'}` : ''}</p>
              ) : null}
              {invoice.returned && invoice.returnedAt ? <p className="muted small invoice-meta-line">Return recorded · {formatShortDateTime(invoice.returnedAt)}</p> : null}
              <p className="muted small invoice-meta-line">{businessTypeLabel(invoiceBusinessType(invoice))}</p>
            </div>
            <div className="text-right invoice-view-dates">
              <p className="muted small">Issued</p>
              <p className="invoice-view-date-main">{formatShortDateTime(invoice.createdAt)}</p>
            </div>
          </div>

          {invoice.returned && invoice.returnNote ? (
            <div className="invoice-return-reason invoice-view-callout">
              <span className="muted">Return note</span>
              <p>{invoice.returnNote}</p>
            </div>
          ) : null}

          {invoice.customerNote ? (
            <div className="invoice-view-note">
              <span className="muted small">Note</span>
              <p>{invoice.customerNote}</p>
            </div>
          ) : null}

          <p className="muted small invoice-order-ref">Order reference · {invoice.orderId}</p>
          <h2 className="sub invoice-lines-heading">Line items</h2>
          {(() => {
            const hasLineDiscount = invoice.lines.some((l) => (l.discount ?? 0) > 0)
            const totalDiscount = invoice.lines.reduce((s, l) => s + (l.discount ?? 0), 0)
            return (
              <>
                <div className="table-scroll invoice-view-table-wrap">
                  <table className="inv-table inv-table-view">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Each</th>
                        {hasLineDiscount ? <th className="num">Discount</th> : null}
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lines.map((line) => {
                        const extras = formatItemExtras(line)
                        const isCombinedInvoice = invoiceBusinessType(invoice) === 'combined'
                        return (
                          <tr key={line.id}>
                            <td>
                              <div className="invoice-line-title">
                                {line.kind === 'deal' ? 'Deal · ' : ''}
                                {line.name}
                                {extras ? ` · ${extras}` : ''}
                                {isCombinedInvoice && line.lineBusinessType ? (
                                  <BusinessTypeBadge
                                    type={line.lineBusinessType}
                                    className="invoice-line-business-badge"
                                  />
                                ) : null}
                              </div>
                              {line.kind === 'item' ? <div className="muted small">{categoryLabel(line.category)}</div> : null}
                              {line.kind === 'deal' && line.dealIncludes?.length ? (
                                <ul className="includes">
                                  {line.dealIncludes.map((inc, i) => (
                                    <li key={`${line.id}-inc-${i}`}>{inc.qty}× {itemLabelById[inc.itemId] || inc.itemId}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                            <td>{line.qty}</td>
                            <td>{formatMoney(line.unitPrice)}</td>
                            {hasLineDiscount ? (
                              <td className="num invoice-discount-cell">
                                {(line.discount ?? 0) > 0 ? (
                                  <span className="invoice-line-discount-badge">−{formatMoney(line.discount)}</span>
                                ) : '—'}
                              </td>
                            ) : null}
                            <td>{formatMoney(line.lineTotal)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {hasLineDiscount || (invoice.deliveryCharge > 0) ? (
                  <div className="invoice-totals-block">
                    {hasLineDiscount ? (
                      <>
                        <div className="total-row subtotal-row">
                          <span>Subtotal (before discounts)</span>
                          <span>{formatMoney(invoice.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0))}</span>
                        </div>
                        <div className="total-row discount-summary-row">
                          <span>Total discount</span>
                          <span>− {formatMoney(totalDiscount)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="total-row subtotal-row">
                        <span>Subtotal</span>
                        <span>{formatMoney(invoice.subtotal ?? invoice.total)}</span>
                      </div>
                    )}
                    {(invoice.deliveryCharge > 0) ? (
                      <div className="total-row subtotal-row">
                        <span>🛵 Delivery charge</span>
                        <span>{formatMoney(invoice.deliveryCharge)}</span>
                      </div>
                    ) : null}
                    <div className="total-row big invoice-view-total">
                      <span>{invoice.paid || invoice.returned ? 'Total' : 'Total due'}</span>
                      <strong>{formatMoney(invoice.total)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="total-row big invoice-view-total">
                    <span>{invoice.paid || invoice.returned ? 'Total' : 'Total due'}</span>
                    <strong>{formatMoney(invoice.total)}</strong>
                  </div>
                )}
              </>
            )
          })()}
        </article>

        <section className="card invoice-detail-actions">
          {!invoice.returned ? (
            <>
              <h2 className="sub">Payment</h2>
              <div className="invoice-actions invoice-payment-actions">
                {invoice.paid ? (
                  !isCounterCashier ? (
                    <button type="button" className="ghost sm" disabled={saving} onClick={() => setConfirmAction('unpaid')}>Mark as unpaid</button>
                  ) : null
                ) : (
                  <button type="button" className="primary sm" disabled={saving} onClick={() => setShowPayMethodModal(true)}>Mark as paid</button>
                )}
                <button type="button" className="ghost danger sm" disabled={saving} onClick={openReturnDialog}>Return or refund</button>
              </div>
            </>
          ) : (
            <div className="invoice-returned-actions">
              <h2 className="sub">Returned invoice</h2>
              <p className="muted small">This invoice is locked for editing. Clear the return status only if it was recorded by mistake.</p>
              <button type="button" className="ghost sm" disabled={saving} onClick={() => setConfirmAction('clearReturn')}>Clear return status (admin)</button>
            </div>
          )}
        </section>

        <nav className="invoice-detail-nav invoice-detail-nav-bottom">
          <Link href="/invoices" className="invoice-return-button">← Back to all invoices</Link>
        </nav>
      </main>

      <dialog ref={confirmDialogRef} className="confirm-dialog" aria-labelledby="invoice-detail-confirm-title" onClose={() => setConfirmAction(null)} onCancel={(e) => { if (saving) e.preventDefault() }}>
        {confirmConfig ? (
          <div className="confirm-dialog-inner">
            <h2 id="invoice-detail-confirm-title" className="confirm-dialog-title">{confirmConfig.title}</h2>
            <p className="confirm-dialog-body">{confirmConfig.body}</p>
            <div className="confirm-dialog-actions">
              <button type="button" className="ghost" onClick={closeConfirm} disabled={saving}>Cancel</button>
              <button type="button" className="primary" disabled={saving} onClick={() => void executeConfirmed()}>{saving ? '…' : confirmConfig.confirm}</button>
            </div>
          </div>
        ) : null}
      </dialog>

      {showPayMethodModal ? (
        <div className="pay-modal-overlay" role="dialog" aria-modal="true" aria-label="Select payment method">
          <div className="pay-modal">
            <h3 className="pay-modal-title">How was this paid?</h3>
            <p className="muted small pay-modal-sub">Choose the payment method to record with this invoice.</p>
            <div className="pay-modal-options">
              <button
                type="button"
                className="pay-method-btn"
                disabled={saving}
                onClick={() => { setShowPayMethodModal(false); void runSetPaid(invoice, true, 'cash') }}
              >
                <span className="pay-method-icon">💵</span>
                <span className="pay-method-label">Cash</span>
              </button>
              <button
                type="button"
                className="pay-method-btn"
                disabled={saving}
                onClick={() => { setShowPayMethodModal(false); void runSetPaid(invoice, true, 'online') }}
              >
                <span className="pay-method-icon">💳</span>
                <span className="pay-method-label">Online / Card</span>
              </button>
            </div>
            <button
              type="button"
              className="ghost sm pay-modal-cancel"
              onClick={() => setShowPayMethodModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <dialog ref={returnDialogRef} className="confirm-dialog invoice-return-dialog" aria-labelledby="invoice-return-dialog-title" onCancel={(e) => { if (saving) e.preventDefault() }}>
        <div className="confirm-dialog-inner">
          <h2 id="invoice-return-dialog-title" className="confirm-dialog-title">Record return or refund</h2>
          <p className="muted small confirm-dialog-body">The invoice will be marked Returned and locked. It stays in your history for records. You can add an optional note below.</p>
          <label className="field invoice-return-dialog-field">
            <span>Return note (optional)</span>
            <textarea rows={3} value={returnNoteDraft} onChange={(e) => setReturnNoteDraft(e.target.value)} placeholder="Reason, items returned, how refund was given…" maxLength={300} />
          </label>
          <div className="confirm-dialog-actions">
            <button type="button" className="ghost" onClick={closeReturnDialog} disabled={saving}>Cancel</button>
            <button type="button" className="danger-solid" disabled={saving} onClick={() => void submitReturnFromDialog()}>{saving ? '…' : 'Record return / refund'}</button>
          </div>
        </div>
      </dialog>
    </>
  )
}
