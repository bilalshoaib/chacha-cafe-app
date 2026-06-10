'use client'
import Link from 'next/link'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'
import { BUSINESS_TYPES, DEAL_BUSINESS_TYPE_OPTIONS } from '@/constants/businessTypes.js'
import { categoryLabel, formatItemExtras } from '@/utils/formatting.js'

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
      <div className="deal-grid">
        {categorySections.length === 0 ? (
          <p className="muted small deal-empty-cats">
            {isCombined
              ? 'Add menu items first, then bundle them here.'
              : `Add menu items for ${BUSINESS_TYPES.find((b) => b.id === business)?.label} first, then bundle them here.`}
          </p>
        ) : (
          categorySections.map(({ key, label, items }) => (
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
