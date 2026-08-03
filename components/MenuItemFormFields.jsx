'use client'
import { MENU_ITEM_BUSINESS_OPTIONS } from '@/constants/businessTypes.js'
import { formatMoney } from '@/utils/formatting.js'

export default function MenuItemFormFields({
  name,
  setName,
  price,
  setPrice,
  costPrice,
  setCostPrice,
  category,
  setCategory,
  businessType,
  setBusinessType,
  size,
  setSize,
  flavour,
  setFlavour,
  categoryTabs,
  disabled = false,
  categoryListId = 'menu-item-category-dl',
}) {
  // Live margin readout, so the person typing sees straight away whether the
  // selling price actually covers the cost.
  const sell = Number(price)
  const cost = Number(costPrice)
  const hasBoth =
    String(price ?? '').trim() !== '' && String(costPrice ?? '').trim() !== '' &&
    Number.isFinite(sell) && Number.isFinite(cost) && sell > 0 && cost >= 0
  const profit = hasBoth ? Math.round((sell - cost) * 100) / 100 : null
  const marginPct = hasBoth && sell > 0 ? Math.round((profit / sell) * 100) : null

  return (
    <>
      <section className="form-section">
        <h3 className="form-section-title">
          <span className="form-section-icon" aria-hidden="true">🍽️</span>
          What is it?
        </h3>
        <div className="form-grid">
          <label className="field field-wide">
            <span className="field-label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Mango lassi"
              disabled={disabled}
              autoFocus
            />
          </label>

          <div className="field field-wide">
            <span className="field-label">Business</span>
            {/* Segmented control instead of a dropdown: three options that are
                always worth seeing at a glance, and a bigger tap target. */}
            <div className="segmented" role="group" aria-label="Business">
              {MENU_ITEM_BUSINESS_OPTIONS.map((bt) => (
                <button
                  key={bt.id}
                  type="button"
                  className={`segmented-option${businessType === bt.id ? ' is-active' : ''}`}
                  onClick={() => setBusinessType(bt.id)}
                  disabled={disabled}
                  aria-pressed={businessType === bt.id}
                >
                  {bt.shortLabel ?? bt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="field field-wide">
            <span className="field-label">Category</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list={categoryListId}
              placeholder="e.g. pizza, drinks"
              autoComplete="off"
              disabled={disabled}
            />
            <datalist id={categoryListId}>
              {categoryTabs.map((c) => (
                <option key={c.key} value={c.key} label={c.label} />
              ))}
            </datalist>
            {categoryTabs.length > 0 ? (
              <div className="chip-row">
                {categoryTabs.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`chip${category === c.key ? ' is-active' : ''}`}
                    onClick={() => setCategory(c.key)}
                    disabled={disabled}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-title">
          <span className="form-section-icon" aria-hidden="true">💰</span>
          Pricing
        </h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Selling price</span>
            <span className="input-money">
              <span className="input-money-prefix" aria-hidden="true">Rs</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                inputMode="decimal"
                placeholder="250"
                disabled={disabled}
              />
            </span>
          </label>

          <label className="field">
            <span className="field-label">
              Cost price <span className="field-optional">optional</span>
            </span>
            <span className="input-money">
              <span className="input-money-prefix" aria-hidden="true">Rs</span>
              <input
                value={costPrice ?? ''}
                onChange={(e) => setCostPrice(e.target.value)}
                inputMode="decimal"
                placeholder="What it costs you"
                disabled={disabled}
              />
            </span>
          </label>
        </div>

        {hasBoth ? (
          <p className={`margin-callout ${profit < 0 ? 'is-bad' : 'is-good'}`} role="status">
            <strong>{profit < 0 ? '⚠' : '✓'}</strong>
            {profit < 0
              ? ` Selling below cost — losing ${formatMoney(Math.abs(profit))} per unit`
              : ` Profit ${formatMoney(profit)} per unit · ${marginPct}% margin`}
          </p>
        ) : (
          <p className="field-hint muted small">
            Add a cost price to see profit per unit. Leave blank if you don’t track cost for this item.
          </p>
        )}
      </section>

      <section className="form-section">
        <h3 className="form-section-title">
          <span className="form-section-icon" aria-hidden="true">🏷️</span>
          Variants <span className="form-section-note">optional</span>
        </h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Size</span>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="e.g. Large, 12 inch"
              maxLength={60}
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span className="field-label">Flavour</span>
            <input
              value={flavour}
              onChange={(e) => setFlavour(e.target.value)}
              placeholder="e.g. BBQ, Mango"
              maxLength={80}
              disabled={disabled}
            />
          </label>
        </div>
      </section>
    </>
  )
}
