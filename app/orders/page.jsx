'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ItemAutocomplete from '@/components/ItemAutocomplete.jsx'
import { categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { useOrders } from '@/context/OrdersContext.jsx'

export default function OrdersPage() {
  const {
    orderMenuItems: menuItems,
    orderCategoryTabs: categoryTabs,
    orderDeals: deals,
    orders,
    activeOrderId,
    setActiveOrderId,
    activeOrder,
    orderTotal,
    customerNote,
    setCustomerNote,
    orderType,
    setOrderType,
    setError,
    refreshAll,
    startNewOrder,
    addItemToOrder: onAddItem,
    createMenuItemAndAddLine: onCreateItemAndAddLine,
    addDealToOrder: onAddDeal,
    removeLine: onRemoveLine,
    updateLineQty: onUpdateLineQty,
    updateLineDiscount: onUpdateLineDiscount,
    doCheckout: onCheckout,
  } = useOrders()

  const ORDER_TYPES = [
    { value: 'dine_in',   label: 'Dine In',   icon: '🍽️' },
    { value: 'takeaway',  label: 'Takeaway',  icon: '🛍️' },
    { value: 'delivery',  label: 'Delivery',  icon: '🛵' },
  ]

  const searchInputRef = useRef(null)
  const categorySelectRef = useRef(null)
  const customPriceRef = useRef(null)
  const qtyInputRef = useRef(null)
  const entryDiscountRef = useRef(null)
  const [entrySearch, setEntrySearch] = useState('')
  const [entryItem, setEntryItem] = useState(null)
  const [entryQty, setEntryQty] = useState('1')
  const [entryCustomPrice, setEntryCustomPrice] = useState('')
  const [entryDiscount, setEntryDiscount] = useState('')
  const [entryNewCategory, setEntryNewCategory] = useState(() => categoryTabs[0]?.key ?? 'other')
  const [addingLine, setAddingLine] = useState(false)
  const [qtyDraftByLine, setQtyDraftByLine] = useState({})
  const [discountDraftByLine, setDiscountDraftByLine] = useState({})
  const [lineQtySaving, setLineQtySaving] = useState(null)
  const [lineDiscountSaving, setLineDiscountSaving] = useState(null)


  const isCustomEntry = Boolean(!entryItem && entrySearch.trim())
  const customUnit = Number(entryCustomPrice)
  const customPriceOk = Number.isFinite(customUnit) && customUnit > 0
  const qtyEnabled = !addingLine && (entryItem ? true : isCustomEntry && customPriceOk)
  const canCommitLine =
    !addingLine &&
    Number(entryQty) >= 1 &&
    Number.isFinite(Number(entryQty)) &&
    (entryItem || (isCustomEntry && customPriceOk))

  useEffect(() => {
    setEntrySearch('')
    setEntryItem(null)
    setEntryQty('1')
    setEntryCustomPrice('')
    setEntryDiscount('')
    setEntryNewCategory(categoryTabs[0]?.key ?? 'other')
    setQtyDraftByLine({})
    setDiscountDraftByLine({})
    setLineQtySaving(null)
    setLineDiscountSaving(null)
  }, [activeOrderId])

  useEffect(() => {
    if (!categoryTabs.some((t) => t.key === entryNewCategory)) {
      setEntryNewCategory(categoryTabs[0]?.key ?? 'other')
    }
  }, [categoryTabs, entryNewCategory])

  function resetEntryRow() {
    setEntrySearch('')
    setEntryItem(null)
    setEntryQty('1')
    setEntryCustomPrice('')
    setEntryDiscount('')
    setEntryNewCategory(categoryTabs[0]?.key ?? 'other')
    queueMicrotask(() => searchInputRef.current?.focus())
  }

  async function commitEntryRow() {
    if (!activeOrder || addingLine || !canCommitLine) return
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return
    const disc = Number(entryDiscount)
    const discountVal = Number.isFinite(disc) && disc > 0 ? disc : 0
    setAddingLine(true)
    setError('')
    try {
      let ok = false
      if (entryItem) {
        ok = await onAddItem(entryItem.id, q, discountVal)
      } else {
        ok = await onCreateItemAndAddLine({
          name: entrySearch.trim(),
          category: entryNewCategory,
          price: customUnit,
          qty: q,
          discount: discountVal,
        })
      }
      if (ok) resetEntryRow()
    } finally {
      setAddingLine(false)
    }
  }

  // Compute entry row line preview (gross - discount)
  const entryLinePreview = (() => {
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return null
    let gross = null
    if (entryItem) gross = Math.round(entryItem.price * q * 100) / 100
    else if (isCustomEntry && customPriceOk) gross = Math.round(customUnit * q * 100) / 100
    if (gross === null) return null
    const disc = Number(entryDiscount)
    const discVal = Number.isFinite(disc) && disc > 0 ? Math.min(disc, gross) : 0
    return Math.round(Math.max(0, gross - discVal) * 100) / 100
  })()

  function lineQtyDisplay(line) {
    const d = qtyDraftByLine[line.id]
    return d !== undefined ? d : String(line.qty)
  }

  function lineDiscountDisplay(line) {
    const d = discountDraftByLine[line.id]
    return d !== undefined ? d : String(line.discount ?? '')
  }

  function previewLineTotal(line) {
    const rawQty = qtyDraftByLine[line.id]
    const q = rawQty !== undefined && rawQty !== '' ? Math.floor(Number(rawQty)) : line.qty
    if (!Number.isFinite(q) || q < 1) return line.lineTotal
    const gross = Math.round(line.unitPrice * q * 100) / 100
    const rawDisc = discountDraftByLine[line.id]
    const discVal = rawDisc !== undefined
      ? (Number.isFinite(Number(rawDisc)) && Number(rawDisc) >= 0 ? Math.min(Number(rawDisc), gross) : (line.discount ?? 0))
      : (line.discount ?? 0)
    return Math.round(Math.max(0, gross - discVal) * 100) / 100
  }

  async function commitLineQty(line) {
    const raw = qtyDraftByLine[line.id]
    if (raw === undefined) return
    const q = Math.floor(Number(raw))
    if (!Number.isFinite(q) || q < 1) {
      setQtyDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
      return
    }
    if (q === line.qty) {
      setQtyDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
      return
    }
    setLineQtySaving(line.id)
    try {
      await onUpdateLineQty(line.id, q)
      setQtyDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
    } catch {
      setQtyDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
    } finally {
      setLineQtySaving(null)
    }
  }

  async function commitLineDiscount(line) {
    const raw = discountDraftByLine[line.id]
    if (raw === undefined) return
    const d = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(d) || d < 0) {
      setDiscountDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
      return
    }
    const current = line.discount ?? 0
    if (d === current) {
      setDiscountDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
      return
    }
    setLineDiscountSaving(line.id)
    try {
      await onUpdateLineDiscount(line.id, d)
      setDiscountDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
    } catch {
      setDiscountDraftByLine((prev) => { const next = { ...prev }; delete next[line.id]; return next })
    } finally {
      setLineDiscountSaving(null)
    }
  }

  const openOrders = useMemo(() => orders.filter((o) => o.status === 'open'), [orders])

  return (
    <main className="order-flow">
      <section className="card order-card">
        <div className="card-head">
          <h2>Take order</h2>
          <div className="row">
            {openOrders.length > 0 ? (
              <select
                className="select"
                value={activeOrderId || ''}
                onChange={(e) => setActiveOrderId(e.target.value || null)}
                aria-label="Select open order"
              >
                <option value="">Select open order…</option>
                {openOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} · {new Date(o.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className="ghost sm" onClick={refreshAll}>
              Refresh menu
            </button>
          </div>
        </div>

        {!activeOrder ? (
          <div className="business-type-picker">
            <p className="muted">Start a new order to add items from both Chacha Cafe and Chacha Burger.</p>
            <button
              type="button"
              className="primary"
              onClick={() => void startNewOrder()}
            >
              New order
            </button>
            {openOrders.length > 0 ? (
              <p className="muted small business-type-resume-hint">
                Or pick an open order from the dropdown above to continue.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <p className="muted small order-table-hint">
              <strong>Items:</strong> search below, set quantity, then <strong>Add line</strong>.{' '}
              <strong>Deals:</strong> use <strong>Add a deal to this order</strong> (above the table) to add a
              bundle in one line — not via the item search.{' '}
              <strong>Qty / Discount:</strong> edit in any row and press Enter or click away to save.
            </p>

            {deals.length > 0 ? (
              <label className="field deal-add-field deal-add-field-top">
                <span>Add a deal to this order</span>
                <select
                  className="select deal-select"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) return
                    void onAddDeal(id)
                  }}
                  aria-label="Add a deal bundle to this order"
                >
                  <option value="">Choose a deal…</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {formatMoney(d.price)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="muted small deal-add-missing">
                No deals saved yet —{' '}
                <Link href="/deals" className="inline-link">
                  create a deal
                </Link>{' '}
                first, then refresh or pick it here.
              </p>
            )}

            <div className="table-scroll">
              <table className="order-lines-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Size</th>
                    <th>Flavour</th>
                    <th>Category</th>
                    <th>Each</th>
                    <th>Disc (PKR)</th>
                    <th>Line</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {activeOrder.lines.map((line) => {
                    const extras = formatItemExtras(line)
                    const isSaving = lineQtySaving === line.id || lineDiscountSaving === line.id
                    return (
                      <tr key={line.id}>
                        <td>
                          <span className="line-cell-name">
                            {line.kind === 'deal' ? 'Deal · ' : ''}
                            {line.name}
                            {line.kind === 'item' && extras ? ` · ${extras}` : ''}
                          </span>
                        </td>
                        <td>
                          <input
                            className="input-table qty-input order-line-qty"
                            type="number"
                            min={1}
                            step={1}
                            value={lineQtyDisplay(line)}
                            disabled={isSaving}
                            onChange={(e) =>
                              setQtyDraftByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                            onBlur={() => void commitLineQty(line)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void commitLineQty(line)
                                e.target.blur()
                              }
                            }}
                            aria-label={`Quantity for ${line.name}`}
                          />
                        </td>
                        <td className="cell-readonly">{line.kind === 'item' ? line.size || '—' : '—'}</td>
                        <td className="cell-readonly">{line.kind === 'item' ? line.flavour || '—' : '—'}</td>
                        <td className="cell-readonly muted">
                          {line.kind === 'item' ? categoryLabel(line.category) : '—'}
                        </td>
                        <td className="cell-readonly">{formatMoney(line.unitPrice)}</td>
                        <td>
                          <input
                            className="input-table discount-input order-line-discount"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="decimal"
                            placeholder="0"
                            value={lineDiscountDisplay(line)}
                            disabled={isSaving}
                            onChange={(e) =>
                              setDiscountDraftByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                            onBlur={() => void commitLineDiscount(line)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void commitLineDiscount(line)
                                e.target.blur()
                              }
                            }}
                            aria-label={`Discount for ${line.name}`}
                          />
                        </td>
                        <td className="cell-readonly">
                          {formatMoney(previewLineTotal(line))}
                          {(line.discount ?? 0) > 0 && discountDraftByLine[line.id] === undefined ? (
                            <span className="line-discount-badge">−{formatMoney(line.discount)}</span>
                          ) : null}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ghost danger sm"
                            onClick={() => onRemoveLine(line.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="order-entry-row">
                    <td>
                      <ItemAutocomplete
                        items={menuItems}
                        searchValue={entrySearch}
                        onSearchChange={(v) => {
                          setEntrySearch(v)
                          setEntryItem((prev) => {
                            if (prev && v.trim() !== prev.name.trim()) {
                              queueMicrotask(() => setEntryCustomPrice(''))
                              return null
                            }
                            return prev
                          })
                        }}
                        onSelectItem={(item) => {
                          setEntryItem(item)
                          if (item) setEntryCustomPrice('')
                        }}
                        onPicked={() => qtyInputRef.current?.focus()}
                        onRequestNextField={() => {
                          if (entryItem) qtyInputRef.current?.focus()
                          else if (entrySearch.trim()) categorySelectRef.current?.focus()
                        }}
                        disabled={addingLine}
                        inputRef={searchInputRef}
                      />
                    </td>
                    <td>
                      <input
                        ref={qtyInputRef}
                        className="input-table qty-input"
                        type="number"
                        min={1}
                        step={1}
                        value={entryQty}
                        disabled={!qtyEnabled}
                        onChange={(e) => setEntryQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEntryRow()
                          }
                        }}
                      />
                    </td>
                    <td className="cell-readonly">{entryItem?.size || '—'}</td>
                    <td className="cell-readonly">{entryItem?.flavour || '—'}</td>
                    <td className={isCustomEntry ? 'cell-entry-cat' : 'cell-readonly muted'}>
                      {isCustomEntry ? (
                        <select
                          ref={categorySelectRef}
                          className="select compact-cat"
                          value={entryNewCategory}
                          onChange={(e) => setEntryNewCategory(e.target.value)}
                          aria-label="Category for new item"
                        >
                          {categoryTabs.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      ) : entryItem ? (
                        categoryLabel(entryItem.category)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={isCustomEntry ? 'cell-entry-price' : 'cell-readonly'}>
                      {isCustomEntry ? (
                        <input
                          ref={customPriceRef}
                          className="input-table wide-price"
                          type="number"
                          min={0.01}
                          step={0.01}
                          inputMode="decimal"
                          placeholder="PKR"
                          value={entryCustomPrice}
                          onChange={(e) => setEntryCustomPrice(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              qtyInputRef.current?.focus()
                            }
                          }}
                          aria-label="Unit price for new item"
                        />
                      ) : entryItem ? (
                        formatMoney(entryItem.price)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <input
                        ref={entryDiscountRef}
                        className="input-table discount-input"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        placeholder="0"
                        value={entryDiscount}
                        disabled={!qtyEnabled}
                        onChange={(e) => setEntryDiscount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEntryRow()
                          }
                        }}
                        aria-label="Discount for new line"
                      />
                    </td>
                    <td className="cell-readonly">
                      {entryLinePreview != null ? formatMoney(entryLinePreview) : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="primary sm"
                        disabled={!canCommitLine}
                        onClick={commitEntryRow}
                      >
                        {addingLine ? '…' : 'Add line'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="total-row">
              <span>Total</span>
              <strong>{formatMoney(orderTotal)}</strong>
            </div>

            <div className="order-type-block">
              <p className="order-type-label">Order type</p>
              <div className="order-type-options" role="group" aria-label="Order type">
                {ORDER_TYPES.map(({ value, label, icon }) => (
                  <label
                    key={value}
                    className={`order-type-option${orderType === value ? ' order-type-option--active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="orderType"
                      value={value}
                      checked={orderType === value}
                      onChange={() => setOrderType(value)}
                      className="order-type-radio"
                    />
                    <span className="order-type-icon">{icon}</span>
                    <span className="order-type-text">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="field">
              <span>Note on invoice (optional)</span>
              <input
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Table name, pickup, etc."
                maxLength={200}
              />
            </label>
            <button
              type="button"
              className="primary wide"
              disabled={!activeOrder.lines.length}
              onClick={() => void onCheckout()}
            >
              Create invoice · {ORDER_TYPES.find((t) => t.value === orderType)?.icon} {ORDER_TYPES.find((t) => t.value === orderType)?.label}
            </button>
          </>
        )}
      </section>
    </main>
  )
}
