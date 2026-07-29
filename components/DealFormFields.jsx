'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'
import { BUSINESS_TYPES, DEAL_BUSINESS_TYPE_OPTIONS } from '@/constants/businessTypes.js'
import { categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'

export default function DealFormFields({
  business,
  setBusiness,
  onBusinessChange,
  name,
  setName,
  price,
  setPrice,
  cafeSplit,
  setCafeSplit,
  burgerSplit,
  setBurgerSplit,
  qtyById,
  setQty,
  categorySections,
  disabled = false,
  showMenuHint = true,
}) {
  const isCombined = business === 'combined'
  const [itemSearch, setItemSearch] = useState('')

  // Everything the user has picked so far, flattened out of the category
  // sections — the long list below is easy to lose track of while scrolling.
  const selected = useMemo(() => {
    const out = []
    for (const section of categorySections) {
      for (const item of section.items) {
        const qty = Number(qtyById[item.id])
        if (Number.isFinite(qty) && qty >= 1) out.push({ ...item, qty })
      }
    }
    return out
  }, [categorySections, qtyById])

  // A bundle is only a deal if it costs less than buying the items one by one,
  // so show that comparison while the price is being set.
  const itemsValue = useMemo(
    () => Math.round(selected.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100,
    [selected],
  )
  const bundlePrice = Number(price)
  const hasPrice = Number.isFinite(bundlePrice) && bundlePrice > 0
  const savings = hasPrice ? Math.round((itemsValue - bundlePrice) * 100) / 100 : 0
  const savingsPct = hasPrice && itemsValue > 0 ? Math.round((savings / itemsValue) * 100) : 0

  const visibleSections = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return categorySections
    return categorySections
      .map((s) => ({ ...s, items: s.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0)
  }, [categorySections, itemSearch])

  function handleCafeSplitChange(val) {
    setCafeSplit?.(val)
    const c = Number(val)
    const b = Number(burgerSplit)
    if (Number.isFinite(c) && Number.isFinite(b)) setPrice?.(String(Math.round((c + b) * 100) / 100))
  }

  function handleBurgerSplitChange(val) {
    setBurgerSplit?.(val)
    const c = Number(cafeSplit)
    const b = Number(val)
    if (Number.isFinite(c) && Number.isFinite(b)) setPrice?.(String(Math.round((c + b) * 100) / 100))
  }

  return (
    <>
      <label className="field">
        <span>Business</span>
        <select
          className="select"
          value={business}
          onChange={(e) => {
            const next = e.target.value
            setBusiness(next)
            onBusinessChange?.(next)
          }}
          disabled={disabled}
        >
          {DEAL_BUSINESS_TYPE_OPTIONS.map((bt) => (
            <option key={bt.id} value={bt.id}>
              {bt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Deal name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lunch combo"
          disabled={disabled}
        />
      </label>

      {isCombined ? (
        <div className="deal-split-fields">
          <p className="muted small deal-split-hint">
            Set how much of the deal price belongs to each business. The bundle price is the sum of both.
          </p>
          <div className="deal-split-row">
            <label className="field deal-split-field">
              <span>Cafe portion (PKR)</span>
              <input
                value={cafeSplit ?? ''}
                onChange={(e) => handleCafeSplitChange(e.target.value)}
                placeholder="600"
                inputMode="decimal"
                disabled={disabled}
              />
            </label>
            <label className="field deal-split-field">
              <span>Burger portion (PKR)</span>
              <input
                value={burgerSplit ?? ''}
                onChange={(e) => handleBurgerSplitChange(e.target.value)}
                placeholder="400"
                inputMode="decimal"
                disabled={disabled}
              />
            </label>
          </div>
          <label className="field">
            <span>Bundle price (PKR) — auto-calculated</span>
            <input
              value={price}
              readOnly
              tabIndex={-1}
              style={{ background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'default' }}
              placeholder="Sum of portions"
            />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Bundle price (PKR)</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="19.99"
            inputMode="decimal"
            disabled={disabled}
          />
        </label>
      )}

      <h3 className="sub">What is included</h3>
      {showMenuHint ? (
        <p className="muted small deal-drinks-hint">
          Include cold drinks, sides, or anything else on your menu: add those products under{' '}
          <Link href={`/menu${ADD_MENU_ITEM_HASH}`} className="foot-link">
            Menu items
          </Link>{' '}
          (e.g. category <strong>Cold drinks</strong>), then set how many of each belong in this deal below.
        </p>
      ) : null}
      {selected.length > 0 ? (
        <div className="deal-summary">
          <div className="deal-summary-chips">
            {selected.map((item) => (
              <span key={item.id} className="deal-chip">
                <strong>{item.qty}×</strong> {item.name}
                <button
                  type="button"
                  className="deal-chip-remove"
                  onClick={() => setQty(item.id, '')}
                  disabled={disabled}
                  aria-label={`Remove ${item.name} from this deal`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="deal-summary-value">
            <span className="muted small">
              {selected.length} item{selected.length === 1 ? '' : 's'} · worth{' '}
              <strong>{formatMoney(itemsValue)}</strong> bought separately
            </span>
            {hasPrice ? (
              savings > 0 ? (
                <span className="deal-savings-good">
                  Bundle {formatMoney(bundlePrice)} — customer saves {formatMoney(savings)} ({savingsPct}%)
                </span>
              ) : savings < 0 ? (
                <span className="deal-savings-bad">
                  ⚠ Bundle {formatMoney(bundlePrice)} costs {formatMoney(Math.abs(savings))} more than buying
                  the items separately.
                </span>
              ) : (
                <span className="muted small">Bundle price matches the item total — no saving for the customer.</span>
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {categorySections.length > 0 ? (
        <input
          type="search"
          className="menu-search-input deal-item-search"
          placeholder="Search items to add…"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          disabled={disabled}
          aria-label="Search menu items to include in this deal"
        />
      ) : null}

      <div className="deal-grid">
        {categorySections.length === 0 ? (
          <p className="muted small deal-empty-cats">
            {isCombined
              ? 'Add menu items first, then bundle them here.'
              : `Add menu items for ${BUSINESS_TYPES.find((b) => b.id === business)?.label} first, then bundle them here.`}
          </p>
        ) : visibleSections.length === 0 ? (
          <p className="muted small deal-empty-cats">No items match “{itemSearch.trim()}”.</p>
        ) : (
          visibleSections.map(({ key, label, items }) => (
            <div key={key} className="deal-category-block">
              <h4 className="deal-category-title">{label}</h4>
              {items.map((item) => {
                const extras = formatItemExtras(item)
                return (
                  <label key={item.id} className="deal-row">
                    <span>
                      {item.name}
                      {extras ? <small className="muted"> · {extras}</small> : null}
                      <small className="muted"> · {categoryLabel(item.category)}</small>
                      <small className="deal-row-price"> {formatMoney(item.price)}</small>
                    </span>
                    <input
                      type="number"
                      min={1}
                      placeholder="qty"
                      value={qtyById[item.id] ?? ''}
                      onChange={(e) => setQty(item.id, e.target.value)}
                      disabled={disabled}
                    />
                  </label>
                )
              })}
            </div>
          ))
        )}
      </div>
    </>
  )
}
