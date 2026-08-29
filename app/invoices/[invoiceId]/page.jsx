'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api, isOfflineError } from '@/api.js'
import { findQueuedSale } from '@/lib/offline/store.js'
import Modal, { ConfirmActions } from '@/components/Modal.jsx'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import Skeleton, { SkeletonStatus } from '@/components/Skeleton.jsx'
import { businessTypeLabel, invoiceBusinessType } from '@/constants/businessTypes.js'
import { categoryLabel, formatItemExtras, moneyFormatter } from '@/utils/formatting.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding, useMoney, useLocale } from '@/context/BrandingContext.jsx'
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

const RECEIPT_STYLES = `@page{size:72mm auto;margin:0}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:bold;color:#000;width:72mm;padding:2mm 5mm;background:#fff}.center{text-align:center}.right{text-align:right}.bold{font-weight:bold}.dashed{border-top:1px dashed #000;margin:4px 0}.solid{border-top:1px solid #000;margin:4px 0}.order-num-banner{text-align:center;font-size:22px;font-weight:bold;letter-spacing:1px;border:2px solid #000;padding:3px 0;margin-bottom:4px}.shop-name{font-size:16px;font-weight:bold;text-align:center;letter-spacing:1px;margin-bottom:2px}.shop-sub{text-align:center;font-size:10px;margin-bottom:3px}.meta-row{display:flex;justify-content:space-between;font-size:10px;margin:1.5px 0}.order-type-banner{text-align:center;font-size:14px;font-weight:bold;letter-spacing:1.5px;margin:5px 0;padding:4px 0;border-top:2px solid #000;border-bottom:2px solid #000}table{width:100%;border-collapse:collapse;margin:2px 0}th{font-size:10px;font-weight:bold;text-align:left;border-bottom:1px solid #000;padding:1px 0}th.amt-col{text-align:right}td{vertical-align:top;padding:2px 0;font-size:11px}.item-col{width:80%}.amt-col{width:20%;text-align:right;white-space:nowrap}.item-name{font-weight:bold}.item-each{font-size:10px;font-weight:bold;color:#000}.item-disc{font-size:10px;font-weight:bold;color:#000}.inc-line{font-size:10px;font-weight:bold;color:#000}.total-row{display:flex;justify-content:space-between;font-size:13px;font-weight:bold;margin:3px 0}.status-row{text-align:center;font-size:10px;margin:2px 0}.footer{text-align:center;font-size:9px;margin-top:6px}.note-box{font-size:9px;margin:2px 0}.returned-notice{text-align:center;font-weight:bold;font-size:11px;border:1px solid #000;padding:2px 4px;margin:3px 0}`

const orderTypeBanner = (invoice) => {
  const orderTypeLabels = { dine_in: '*** DINE IN ***', takeaway: '*** TAKEAWAY ***', delivery: '*** DELIVERY ***' }
  const line = invoice.orderType ? (orderTypeLabels[invoice.orderType] ?? invoice.orderType.toUpperCase()) : ''
  return line ? `<div class="order-type-banner">${line}</div>` : '<div class="dashed"></div>'
}

/**
 * The printed receipt. Everything naming the café comes from `branding` — the
 * shop name, the line under it and the footer — so a white-labelled install
 * prints its own identity rather than the first customer's.
 *
 * `businessLabel` names the counter the order came from, which for a café with
 * a single brand is the café's own name and so reads as no distinction at all.
 */
/**
 * Which counter an order came from. Still keyed to the cafe/burger pair while
 * the app reads business_type; once it reads brands this becomes the brand's
 * own name, and a single-brand café stops seeing a distinction at all.
 */
function businessLabel(invoice, branding) {
  const type = invoiceBusinessType(invoice)
  if (type === 'burger') return 'Burger'
  if (type === 'cafe') return 'Cafe'
  return branding?.name ?? ''
}

function buildReceiptHtml(invoice, itemLabelById, branding) {
  // The printed receipt is built as a string rather than rendered, so it
  // cannot reach the hook the rest of this file uses. It takes the same two
  // values off the branding it is already handed, which is what the hook reads
  // too — so the paper and the screen can never disagree about the currency.
  const money = moneyFormatter({ locale: branding?.locale, currency: branding?.currency })
  const receiptLocale = branding?.locale ?? undefined
  const tenantName = branding?.name ?? ''
  const receiptFooter = branding?.receiptFooter || tenantName
  const businessName = businessLabel(invoice, branding)
  const paymentLine = invoice.paymentMethod === 'cash' ? 'Payment: Cash' : invoice.paymentMethod === 'online' ? 'Payment: Online / Card' : ''
  const lineRows = invoice.lines.map((line) => {
    const extras = formatItemExtras(line)
    const label = (line.kind === 'deal' ? 'Deal: ' : '') + line.name + (extras ? ` (${extras})` : '')
    const lineTotal = money(line.lineTotal)
    const each = line.qty > 1 ? `${line.qty} x ${money(line.unitPrice)}` : ''
    const discRow = (line.discount ?? 0) > 0 ? `<div class="item-disc">Disc: -${money(line.discount)}</div>` : ''
    const includes = line.kind === 'deal' && line.dealIncludes?.length
      ? line.dealIncludes.map((inc) => `<div class="inc-line">&nbsp;&nbsp;${inc.qty}x ${itemLabelById[inc.itemId] || inc.itemId}</div>`).join('')
      : ''
    return `<tr><td class="item-col"><div class="item-name">${label}</div>${each ? `<div class="item-each">${each}</div>` : ''}${discRow}${includes}</td><td class="amt-col">${lineTotal}</td></tr>`
  }).join('')
  const totalDiscountAmt = invoice.lines.reduce((s, l) => s + (l.discount ?? 0), 0)
  const deliveryCharge = invoice.deliveryCharge ?? 0
  const discountSummary = totalDiscountAmt > 0
    ? `<div class="total-row" style="font-size:10px;"><span>Subtotal</span><span>${money(invoice.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0))}</span></div><div class="total-row" style="font-size:10px;"><span>Total Discount</span><span>-${money(totalDiscountAmt)}</span></div>`
    : ''
  const deliveryChargeLine = deliveryCharge > 0
    ? `<div class="total-row" style="font-size:10px;"><span>Subtotal</span><span>${money(invoice.subtotal ?? (invoice.total - deliveryCharge))}</span></div><div class="total-row" style="font-size:10px;"><span>Delivery Charge</span><span>${money(deliveryCharge)}</span></div>`
    : ''
  // Tax, broken out, one row per rate — which is the point of storing the
  // breakdown on the invoice rather than a single figure. A customer disputing
  // a charge, and an inspector checking one, both want to see which tax at
  // which rate, and this is the paper they are holding.
  //
  // Read from the invoice and never recomputed: this receipt may be reprinted
  // a year after the sale, by which time the café's rates have moved on.
  const taxLines = Array.isArray(invoice.taxLines) ? invoice.taxLines : []
  const taxRows = taxLines.map((t) =>
    `<div class="total-row" style="font-size:10px;"><span>${t.name} ${t.rate}%${invoice.taxInclusive ? ' (incl)' : ''}</span><span>${money(t.amount)}</span></div>`,
  ).join('')
  // Under inclusive pricing the tax is inside the total rather than added to
  // it, and a receipt that lists it without saying so reads as if it were
  // added twice.
  const taxIncludedNote = invoice.taxInclusive && (invoice.taxTotal ?? 0) > 0
    ? `<div class="status-row">Total includes ${money(invoice.taxTotal)} tax</div>`
    : ''
  const orderNumBanner = invoice.shiftNumber != null ? '<div class="order-num-banner">ORDER #' + invoice.shiftNumber + '</div>' : ''
  const body = orderNumBanner + `<div class="shop-name">${businessName}</div><div class="shop-sub">${tenantName}</div><div class="dashed"></div><div class="meta-row"><span>Invoice:</span><span>${invoice.id}</span></div><div class="meta-row"><span>Date:</span><span>${new Date(invoice.createdAt).toLocaleString(receiptLocale)}</span></div>${invoice.orderId ? `<div class="meta-row"><span>Order:</span><span>${invoice.orderId}</span></div>` : ''}${orderTypeBanner(invoice)}<table><thead><tr><th class="item-col">Item</th><th class="amt-col">Amt</th></tr></thead><tbody>${lineRows}</tbody></table><div class="solid"></div>${discountSummary}${!discountSummary ? deliveryChargeLine : (deliveryCharge > 0 ? `<div class="total-row" style="font-size:10px;"><span>Delivery Charge</span><span>${money(deliveryCharge)}</span></div>` : '')}${taxRows}<div class="total-row"><span>${invoice.paid || invoice.returned ? 'TOTAL' : 'TOTAL DUE'}</span><span>${money(invoice.total)}</span></div>${taxIncludedNote}<div class="dashed"></div>${paymentLine ? `<div class="status-row">${paymentLine}</div>` : ''}<div class="status-row">${invoice.returned ? '** RETURNED **' : invoice.paid ? 'PAID' : 'UNPAID'}</div>${invoice.returned ? `<div class="returned-notice">** REFUNDED / RETURNED **</div>` : ''}${invoice.returnNote ? `<div class="note-box">Return note: ${invoice.returnNote}</div>` : ''}${invoice.customerNote ? `<div class="note-box">Note: ${invoice.customerNote}</div>` : ''}<div class="dashed"></div><div class="footer">Thank you for visiting!</div><div class="footer">${receiptFooter}</div>`
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Receipt ${invoice.id}</title><style>${RECEIPT_STYLES}</style></head><body>${body}</body></html>`
}

export default function InvoiceDetailPage() {
  const branding = useBranding()
  const money = useMoney()
  const { formatDateTime } = useLocale()
  const { invoiceId } = useParams()
  const { menu } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const isCounterCashier = user?.role === 'counter_cashier'
  const tenantId = user?.effectiveTenantId ?? user?.tenantId ?? null
  const [invoice, setInvoice] = useState(null)
  const [invoiceLoading, setInvoiceLoading] = useState(true)
  const [returnNoteDraft, setReturnNoteDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [showPayMethodModal, setShowPayMethodModal] = useState(false)

  // A sale rung up offline is not in the database yet, and this page is where
  // checkout lands to print the receipt — so it reads the queue when the
  // server cannot be reached. Marked `pendingSync` so the screen can say the
  // sale is recorded on this device and not yet sent, which is the one thing
  // that is materially different about it.
  const loadInvoice = useCallback(async () => {
    setInvoiceLoading(true)
    try {
      const inv = await api.getInvoice(invoiceId)
      setInvoice(inv)
    } catch (e) {
      if (isOfflineError(e) && tenantId) {
        const queued = await findQueuedSale(tenantId, invoiceId)
        setInvoice(queued ? { ...queued, pendingSync: true } : null)
      } else {
        setInvoice(null)
      }
    }
    finally { setInvoiceLoading(false) }
  }, [invoiceId, tenantId])

  useEffect(() => { void loadInvoice() }, [loadInvoice])
  useEffect(() => { if (!invoice) return; setReturnNoteDraft(invoice.returnNote ?? '') }, [invoice])

  const itemLabelById = useMemo(() => {
    const m = {}
    for (const i of menu.items) {
      const x = formatItemExtras(i)
      m[i.id] = x ? `${i.name} · ${x}` : i.name
    }
    return m
  }, [menu.items])

  function closeConfirm() { setConfirmAction(null) }
  function openReturnDialog() {
    if (!invoice) return
    setReturnNoteDraft(invoice.returnNote ?? '')
    setReturnOpen(true)
  }
  function closeReturnDialog() { setReturnOpen(false) }

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
    const html = buildReceiptHtml(invoice, itemLabelById, branding)
    const win = window.open('', '_blank', 'width=340,height=600,toolbar=0,menubar=0,location=0')
    if (!win) return
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => { win.print() }, 300)
  }

  // Shaped like the sheet below it, so arriving here straight from checkout
  // shows the invoice settling into place rather than a bare line of text.
  if (invoiceLoading) {
    return (
      <main className="invoice-detail-page invoice-detail-view">
        <SkeletonStatus label="Loading invoice…" />
        <header className="invoice-view-toolbar">
          <Skeleton width="8rem" height="1.6rem" />
          <Skeleton width="11rem" height="1.6rem" />
        </header>
        <article className="card invoice-sheet invoice-view-document">
          <div className="invoice-header invoice-view-header">
            <div className="invoice-skeleton-stack">
              <Skeleton width="3.5rem" height="0.7rem" />
              <Skeleton width="12rem" height="1.5rem" />
              <Skeleton width="7rem" height="1.1rem" />
            </div>
            <div className="invoice-skeleton-stack text-right">
              <Skeleton width="3rem" height="0.7rem" />
              <Skeleton width="9rem" height="1rem" />
            </div>
          </div>
          <h2 className="sub invoice-lines-heading"><Skeleton width="6rem" height="1rem" /></h2>
          <div className="invoice-skeleton-lines">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="invoice-skeleton-line">
                <Skeleton width={`${40 + ((i * 11) % 30)}%`} height="0.95rem" />
                <Skeleton width="3.5rem" height="0.95rem" />
              </div>
            ))}
          </div>
          <div className="invoice-skeleton-total">
            <Skeleton width="5rem" height="1.15rem" />
            <Skeleton width="6rem" height="1.15rem" />
          </div>
        </article>
      </main>
    )
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
              {invoice.shiftNumber != null ? <p className="invoice-order-num">Order #{invoice.shiftNumber}</p> : null}
              <div className="invoice-status-badges">
                <BusinessTypeBadge type={invoiceBusinessType(invoice)} />
                <OrderTypeBadge type={invoice.orderType} />
                {invoice.paid ? <span className="badge-paid">Paid</span> : <span className="badge-unpaid">Unpaid</span>}
                {invoice.returned ? <span className="badge-returned">Returned</span> : null}
                {/* Rung up offline and still only on this device. The number
                    and the figures are final — see §2.4 — so the receipt
                    prints normally; what this says is that the sale has not
                    reached the books yet, which is the one thing a manager
                    reconciling a drawer needs to know. */}
                {invoice.pendingSync ? <span className="badge-pending-sync">⚡ Not yet sent</span> : null}
                {invoice.paymentMethod === 'cash' ? <span className="badge-payment-method">💵 Cash</span> : invoice.paymentMethod === 'online' ? <span className="badge-payment-method">💳 Online / Card</span> : null}
              </div>
              {invoice.paid && invoice.paidAt ? (
                <p className="muted small invoice-meta-line">Paid · {formatDateTime(invoice.paidAt)}{invoice.paymentMethod ? ` · ${invoice.paymentMethod === 'cash' ? 'Cash' : 'Online / Card'}` : ''}</p>
              ) : null}
              {invoice.returned && invoice.returnedAt ? <p className="muted small invoice-meta-line">Return recorded · {formatDateTime(invoice.returnedAt)}</p> : null}
              <p className="muted small invoice-meta-line">{businessTypeLabel(invoiceBusinessType(invoice))}</p>
            </div>
            <div className="text-right invoice-view-dates">
              <p className="muted small">Issued</p>
              <p className="invoice-view-date-main">{formatDateTime(invoice.createdAt)}</p>
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

          {invoice.orderId ? (
            <p className="muted small invoice-order-ref">Order reference · {invoice.orderId}</p>
          ) : null}
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
                            <td>{money(line.unitPrice)}</td>
                            {hasLineDiscount ? (
                              <td className="num invoice-discount-cell">
                                {(line.discount ?? 0) > 0 ? (
                                  <span className="invoice-line-discount-badge">−{money(line.discount)}</span>
                                ) : '—'}
                              </td>
                            ) : null}
                            <td>{money(line.lineTotal)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {hasLineDiscount || (invoice.deliveryCharge > 0) || (invoice.taxTotal > 0) ? (
                  <div className="invoice-totals-block">
                    {hasLineDiscount ? (
                      <>
                        <div className="total-row subtotal-row">
                          <span>Subtotal (before discounts)</span>
                          <span>{money(invoice.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0))}</span>
                        </div>
                        <div className="total-row discount-summary-row">
                          <span>Total discount</span>
                          <span>− {money(totalDiscount)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="total-row subtotal-row">
                        <span>Subtotal</span>
                        {/* Net of tax when the price included it, so the rows
                            below add up to the total rather than overshooting
                            it by the tax. */}
                        <span>
                          {money(invoice.taxInclusive
                            ? Math.round(((invoice.subtotal ?? invoice.total) - (invoice.taxTotal ?? 0)) * 100) / 100
                            : (invoice.subtotal ?? invoice.total))}
                        </span>
                      </div>
                    )}
                    {(invoice.deliveryCharge > 0) ? (
                      <div className="total-row subtotal-row">
                        <span>🛵 Delivery charge</span>
                        <span>{money(invoice.deliveryCharge)}</span>
                      </div>
                    ) : null}
                    {/* The tax as it was charged, from the invoice's own record
                        of it — not recomputed from the café's current rates,
                        which may have changed since this sale. */}
                    {(invoice.taxLines ?? []).map((t) => (
                      <div key={t.id} className="total-row subtotal-row tax-total-row">
                        <span>{t.name} ({t.rate}%){invoice.taxInclusive ? ' · included' : ''}</span>
                        <span>{money(t.amount)}</span>
                      </div>
                    ))}
                    <div className="total-row big invoice-view-total">
                      <span>{invoice.paid || invoice.returned ? 'Total' : 'Total due'}</span>
                      <strong>{money(invoice.total)}</strong>
                    </div>
                    {invoice.taxInclusive && invoice.taxTotal > 0 ? (
                      <span className="muted small tax-included-note">
                        Total includes {money(invoice.taxTotal)} tax.
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="total-row big invoice-view-total">
                    <span>{invoice.paid || invoice.returned ? 'Total' : 'Total due'}</span>
                    <strong>{money(invoice.total)}</strong>
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

      <Modal
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        busy={saving}
        size="compact"
        title={confirmConfig?.title ?? ''}
        actions={
          <>
            <button type="button" className="ghost" onClick={closeConfirm} disabled={saving}>Cancel</button>
            <button type="button" className="primary" disabled={saving} onClick={() => void executeConfirmed()}>
              {saving ? '…' : confirmConfig?.confirm}
            </button>
          </>
        }
      >
        {confirmConfig ? <p className="confirm-dialog-body">{confirmConfig.body}</p> : null}
      </Modal>

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

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        busy={saving}
        title="Record return or refund"
        subtitle="The invoice will be marked Returned and locked. It stays in your history for records."
        actions={
          <ConfirmActions
            onCancel={closeReturnDialog}
            onConfirm={() => void submitReturnFromDialog()}
            busy={saving}
            busyLabel="…"
            confirmLabel="Record return / refund"
          />
        }
      >
        <label className="field invoice-return-dialog-field">
          <span className="field-label">Return note (optional)</span>
          <textarea rows={3} value={returnNoteDraft} onChange={(e) => setReturnNoteDraft(e.target.value)} placeholder="Reason, items returned, how refund was given…" maxLength={300} />
        </label>
      </Modal>
    </>
  )
}
