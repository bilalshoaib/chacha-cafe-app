'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'
import { categoryLabel, formatItemExtras } from '@/utils/formatting.js'
import { useMoney } from '@/context/BrandingContext.jsx'

export default function DealFormFields({
  business,
  setBusiness,
  onBusinessChange,
  brands = [],
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
  unitPriceById,
  setUnitPrice,
  categorySections,
  disabled = false,
  showMenuHint = true,
}) {
  const money = useMoney()
  const isCombined = business === 'combined'

  // The counters this café actually has, not the product's founding two.
  // Chacha's brand slugs are 'cafe' and 'burger', which is why its deals keep
  // reading and writing exactly the values they always have.
  const businessOptions = useMemo(() => {
    const opts = brands.map((b) => ({ id: b.slug, label: b.name }))
    // Splitting a deal across counters needs two counters to split it between.
    if (opts.length > 1) opts.push({ id: 'combined', label: 'Combined' })
    return opts
  }, [brands])

  const currentBusinessLabel =
    businessOptions.length > 1
      ? businessOptions.find((b) => b.id === business)?.label
      : null
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

  // What the per-item in-deal prices add up to. Only meaningful once every
  // selected item has been given one — a partial total would look like a
  // mismatch when it is really just incomplete.
  const pricedCount = selected.filter(
    (i) => String(unitPriceById?.[i.id] ?? '').trim() !== '',
  ).length
  const allPriced = selected.length > 0 && pricedCount === selected.length
  const statedTotal = useMemo(
    () =>
      Math.round(
        selected.reduce((s, i) => s + (Number(unitPriceById?.[i.id]) || 0) * i.qty, 0) * 100,
      ) / 100,
    [selected, unitPriceById],
  )
  const statedGap = allPriced && hasPrice ? Math.round((bundlePrice - statedTotal) * 100) / 100 : 0

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
      {/* Only asked where there is something to choose between. A café with
          one counter puts every deal on that counter by definition, and
          "Combined" is meaningless without a second counter to combine with —
          so a single-counter café was being shown Chacha's own two businesses
          and asked to pick between them. */}
      {businessOptions.length > 1 ? (
      <div className="field">
        <span className="field-label">Counter</span>
        {/* Segmented control, matching the menu-item form: the options are
            worth seeing at once, and switching counter resets the item picker. */}
        <div className="segmented" role="group" aria-label="Counter">
          {businessOptions.map((bt) => (
            <button
              key={bt.id}
              type="button"
              className={`segmented-option${business === bt.id ? ' is-active' : ''}`}
              onClick={() => {
                if (business === bt.id) return
                setBusiness(bt.id)
                onBusinessChange?.(bt.id)
              }}
              disabled={disabled}
              aria-pressed={business === bt.id}
            >
              {bt.label}
            </button>
          ))}
        </div>
      </div>
      ) : null}

      <label className="field">
        <span className="field-label">Deal name</span>
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
              <span className="field-label">Cafe portion</span>
              <span className="input-money">
                <span className="input-money-prefix" aria-hidden="true">Rs</span>
                <input
                  value={cafeSplit ?? ''}
                  onChange={(e) => handleCafeSplitChange(e.target.value)}
                  placeholder="600"
                  inputMode="decimal"
                  disabled={disabled}
                />
              </span>
            </label>
            <label className="field deal-split-field">
              <span className="field-label">Burger portion</span>
              <span className="input-money">
                <span className="input-money-prefix" aria-hidden="true">Rs</span>
                <input
                  value={burgerSplit ?? ''}
                  onChange={(e) => handleBurgerSplitChange(e.target.value)}
                  placeholder="400"
                  inputMode="decimal"
                  disabled={disabled}
                />
              </span>
            </label>
          </div>
          <label className="field">
            <span className="field-label">
              Bundle price <span className="field-optional">auto-calculated</span>
            </span>
            <span className="input-money">
              <span className="input-money-prefix" aria-hidden="true">Rs</span>
              <input
                className="input-readonly"
                value={price}
                readOnly
                tabIndex={-1}
                placeholder="Sum of portions"
              />
            </span>
          </label>
        </div>
      ) : (
        <label className="field">
          <span className="field-label">Bundle price</span>
          <span className="input-money">
            <span className="input-money-prefix" aria-hidden="true">Rs</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1200"
              inputMode="decimal"
              disabled={disabled}
            />
          </span>
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
          <table className="deal-selected-table table-cards">
            <thead>
              <tr>
                <th scope="col">In this deal</th>
                <th scope="col" className="num">Qty</th>
                <th scope="col" className="num">Price each</th>
                <th scope="col" className="num">Line</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {selected.map((item) => {
                const raw = unitPriceById?.[item.id] ?? ''
                const each = Number(raw)
                const lineTotal =
                  String(raw).trim() !== '' && Number.isFinite(each) ? Math.round(each * item.qty * 100) / 100 : null
                return (
                  <tr key={item.id}>
                    <td className="cell-card-title">
                      {item.name}
                      <span className="muted small"> · menu {money(item.price)}</span>
                    </td>
                    <td className="num" data-label="Qty">{item.qty}</td>
                    <td className="num" data-label="Price each">
                      <input
                        className="input-table discount-input"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        placeholder={String(item.price)}
                        value={raw}
                        disabled={disabled}
                        onChange={(e) => setUnitPrice?.(item.id, e.target.value)}
                        aria-label={`Price of one ${item.name} inside this deal`}
                      />
                    </td>
                    <td className="num" data-label="Line">{lineTotal == null ? '—' : money(lineTotal)}</td>
                    <td className="cell-card-action">
                      <button
                        type="button"
                        className="deal-chip-remove"
                        onClick={() => setQty(item.id, '')}
                        disabled={disabled}
                        aria-label={`Remove ${item.name} from this deal`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="deal-summary-value">
            <span className="muted small">
              {selected.length} item{selected.length === 1 ? '' : 's'} · worth{' '}
              <strong>{money(itemsValue)}</strong> bought separately
            </span>
            {hasPrice ? (
              savings > 0 ? (
                <span className="deal-savings-good">
                  Bundle {money(bundlePrice)} — customer saves {money(savings)} ({savingsPct}%)
                </span>
              ) : savings < 0 ? (
                <span className="deal-savings-bad">
                  ⚠ Bundle {money(bundlePrice)} costs {money(Math.abs(savings))} more than buying
                  the items separately.
                </span>
              ) : (
                <span className="muted small">Bundle price matches the item total — no saving for the customer.</span>
              )
            ) : null}
            {allPriced && hasPrice ? (
              statedGap === 0 ? (
                <span className="deal-savings-good">
                  Item prices add up to {money(statedTotal)} — matches the bundle price ✓
                </span>
              ) : (
                <span className="deal-savings-bad">
                  ⚠ Item prices add up to {money(statedTotal)}, bundle is {money(bundlePrice)} —{' '}
                  {money(Math.abs(statedGap))} {statedGap > 0 ? 'unaccounted for' : 'over'}. You can still save;
                  reports will scale the prices to fit.
                </span>
              )
            ) : selected.length > 0 && pricedCount > 0 ? (
              <span className="muted small">
                {pricedCount} of {selected.length} items priced — price them all to check against the bundle price.
              </span>
            ) : (
              <span className="muted small">
                Optional: set what each item is worth inside this deal, so reports can credit them accurately.
              </span>
            )}
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
            {isCombined || !currentBusinessLabel
              ? 'Add menu items first, then bundle them here.'
              : `Add menu items for ${currentBusinessLabel} first, then bundle them here.`}
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
                      <small className="deal-row-price"> {money(item.price)}</small>
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
