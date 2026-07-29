'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ItemAutocomplete from '@/components/ItemAutocomplete.jsx'
import DealPicker from '@/components/DealPicker.jsx'
import { categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { discountPartsOf, priceLine } from '@/lib/pricing.js'
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
    loading,
    customerNote,
    setCustomerNote,
    orderType,
    setOrderType,
    deliveryCharge,
    setDeliveryCharge,
    checkingOut,
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
  const entryRowRef = useRef(null)
  const [entrySearch, setEntrySearch] = useState('')
  const [entryItem, setEntryItem] = useState(null)
  const [entryQty, setEntryQty] = useState('1')
  const [entryCustomPrice, setEntryCustomPrice] = useState('')
  const [entryUnitDiscount, setEntryUnitDiscount] = useState('')
  const [entryLineDiscount, setEntryLineDiscount] = useState('')
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
  // Only one kind of discount per line — whichever is filled in locks the other.
  const entryUnitAmt = Number(entryUnitDiscount) || 0
  const entryLineAmt = Number(entryLineDiscount) || 0
  const entryUnitLocked = entryLineAmt > 0 && entryUnitAmt === 0
  const entryLineLocked = entryUnitAmt > 0 && entryLineAmt === 0
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
    setEntryUnitDiscount('')
    setEntryLineDiscount('')
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
    setEntryUnitDiscount('')
    setEntryLineDiscount('')
    setEntryNewCategory(categoryTabs[0]?.key ?? 'other')
    queueMicrotask(() => {
      entryRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      searchInputRef.current?.focus({ preventScroll: true })
    })
  }

  async function commitEntryRow() {
    if (!activeOrder || addingLine || !canCommitLine) return
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return
    const discounts = {
      unitDiscount: Math.max(0, Number(entryUnitDiscount) || 0),
      lineDiscount: Math.max(0, Number(entryLineDiscount) || 0),
    }
    setAddingLine(true)
    setError('')
    try {
      let ok = false
      if (entryItem) {
        ok = await onAddItem(entryItem.id, q, discounts)
      } else {
        ok = await onCreateItemAndAddLine({
          name: entrySearch.trim(),
          category: entryNewCategory,
          price: customUnit,
          qty: q,
          discounts,
        })
      }
      if (ok) resetEntryRow()
    } finally {
      setAddingLine(false)
    }
  }

  // Live preview of the not-yet-added row, priced the same way the saved
  // lines are.
  const entryLinePreview = (() => {
    const q = Number(entryQty)
    if (!Number.isFinite(q) || q < 1) return null
    let unitPrice = null
    if (entryItem) unitPrice = entryItem.price
    else if (isCustomEntry && customPriceOk) unitPrice = customUnit
    if (unitPrice === null) return null
    return priceLine({
      unitPrice,
      qty: q,
      unitDiscount: Number(entryUnitDiscount) || 0,
      lineDiscount: Number(entryLineDiscount) || 0,
    }).lineTotal
  })()

  function lineQtyDisplay(line) {
    const d = qtyDraftByLine[line.id]
    return d !== undefined ? d : String(line.qty)
  }

  // Drafts are keyed per field so the two discount boxes edit independently.
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

  async function commitLineDiscount(line, field) {
    const key = draftKey(line.id, field)
    const clearDraft = () => setDiscountDraftByLine((prev) => { const next = { ...prev }; delete next[key]; return next })
    const raw = discountDraftByLine[key]
    if (raw === undefined) return
    const d = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(d) || d < 0) { clearDraft(); return }
    if (d === discountPartsOf(line)[field]) { clearDraft(); return }
    setLineDiscountSaving(line.id)
    try {
      await onUpdateLineDiscount(line.id, field, d)
      clearDraft()
    } catch {
      clearDraft()
    } finally {
      setLineDiscountSaving(null)
    }
  }

  const openOrders = useMemo(() => orders.filter((o) => o.status === 'open'), [orders])

  const itemLabelById = useMemo(() => {
    const m = {}
    for (const i of menuItems) {
      const x = formatItemExtras(i)
      m[i.id] = x ? `${i.name} · ${x}` : i.name
    }
    return m
  }, [menuItems])

  return (
    <main className="order-flow theme-chacha">
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
              disabled={loading}
            >
              {loading ? 'Loading menu…' : 'New order'}
            </button>
            {openOrders.length > 0 ? (
              <p className="muted small business-type-resume-hint">
                Or pick an open order from the dropdown above to continue.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="order-hint-list">
              <li><strong>Items</strong> — search in the last row, set qty, then <strong>Add line</strong>.</li>
              <li><strong>Deals</strong> — use the <strong>Add a deal</strong> dropdown, not the item search.</li>
              <li><strong>Qty / Discount</strong> — edit any row, then press Enter or click away.</li>
            </ul>

            {deals.length > 0 ? (
              <div className="field deal-add-field deal-add-field-top">
                <span>Add a deal to this order</span>
                <DealPicker
                  deals={deals}
                  itemLabelById={itemLabelById}
                  onSelect={(id) => void onAddDeal(id)}
                />
              </div>
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
                    <th>Disc/item</th>
                    <th>Disc (row)</th>
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
                        {['unitDiscount', 'lineDiscount'].map((field) => {
                          const locked = discountLockedBy(line, field)
                          return (
                          <td key={field}>
                            <input
                              className="input-table discount-input order-line-discount"
                              type="number"
                              min={0}
                              step={1}
                              inputMode="decimal"
                              placeholder={locked ? '—' : '0'}
                              value={lineDiscountDisplay(line, field)}
                              disabled={isSaving || locked}
                              title={locked
                                ? (field === 'unitDiscount'
                                    ? 'Clear the row discount to use a per-item discount instead.'
                                    : 'Clear the per-item discount to use a row discount instead.')
                                : undefined}
                              onChange={(e) =>
                                setDiscountDraftByLine((prev) => ({ ...prev, [draftKey(line.id, field)]: e.target.value }))
                              }
                              onBlur={() => void commitLineDiscount(line, field)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  void commitLineDiscount(line, field)
                                  e.target.blur()
                                }
                              }}
                              aria-label={
                                field === 'unitDiscount'
                                  ? `Discount per item for ${line.name}`
                                  : `Discount on the whole ${line.name} row`
                              }
                            />
                          </td>
                          )
                        })}
                        <td className="cell-readonly">
                          {formatMoney(previewLineTotal(line))}
                          {(line.discount ?? 0) > 0 ? (
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
                  <tr className="order-entry-row" ref={entryRowRef}>
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
                        value={entryUnitDiscount}
                        disabled={!qtyEnabled || entryUnitLocked}
                        title={entryUnitLocked ? 'Clear the row discount to use a per-item discount instead.' : undefined}
                        onChange={(e) => setEntryUnitDiscount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEntryRow()
                          }
                        }}
                        aria-label="Discount per item for new line"
                      />
                    </td>
                    <td>
                      <input
                        className="input-table discount-input"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        placeholder="0"
                        value={entryLineDiscount}
                        disabled={!qtyEnabled || entryLineLocked}
                        title={entryLineLocked ? 'Clear the per-item discount to use a row discount instead.' : undefined}
                        onChange={(e) => setEntryLineDiscount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEntryRow()
                          }
                        }}
                        aria-label="Discount on the whole new line"
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

            {orderType === 'delivery' && Number(deliveryCharge) > 0 ? (
              <>
                <div className="total-row subtotal-row">
                  <span>Subtotal</span>
                  <span>{formatMoney(orderTotal)}</span>
                </div>
                <div className="total-row subtotal-row">
                  <span>🛵 Delivery charge</span>
                  <span>{formatMoney(Number(deliveryCharge))}</span>
                </div>
                <div className="total-row">
                  <span>Total</span>
                  <strong>{formatMoney(Math.round((orderTotal + Number(deliveryCharge)) * 100) / 100)}</strong>
                </div>
              </>
            ) : (
              <div className="total-row">
                <span>Total</span>
                <strong>{formatMoney(orderTotal)}</strong>
              </div>
            )}

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

            {orderType === 'delivery' ? (
              <label className="field delivery-charge-field">
                <span>🛵 Delivery charge (PKR)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  placeholder="0"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                />
              </label>
            ) : null}

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
              disabled={!activeOrder.lines.length || checkingOut}
              onClick={() => void onCheckout()}
            >
              {checkingOut
                ? 'Creating invoice…'
                : `Create invoice · ${ORDER_TYPES.find((t) => t.value === orderType)?.icon} ${ORDER_TYPES.find((t) => t.value === orderType)?.label}`}
            </button>
          </>
        )}
      </section>
    </main>
  )
}
