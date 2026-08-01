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
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Mango lassi"
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>Selling price (PKR)</span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          inputMode="decimal"
          placeholder="250"
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>Cost price (PKR) <span className="muted small">— optional</span></span>
        <input
          value={costPrice ?? ''}
          onChange={(e) => setCostPrice(e.target.value)}
          inputMode="decimal"
          placeholder="What it costs you"
          disabled={disabled}
        />
        {hasBoth ? (
          <span className={`field-hint ${profit < 0 ? 'menu-margin-bad' : 'menu-margin-good'}`}>
            {profit < 0
              ? `⚠ Selling below cost — losing ${formatMoney(Math.abs(profit))} per unit`
              : `Profit ${formatMoney(profit)} per unit (${marginPct}% margin)`}
          </span>
        ) : (
          <span className="field-hint muted small">Leave blank if you don’t track cost for this item.</span>
        )}
      </label>
      <label className="field">
        <span>Business</span>
        <select className="select" value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={disabled}>
          {MENU_ITEM_BUSINESS_OPTIONS.map((bt) => (
            <option key={bt.id} value={bt.id}>
              {bt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Category</span>
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
      </label>
      <label className="field">
        <span>Size (optional)</span>
        <input
          value={size}
          onChange={(e) => setSize(e.target.value)}
          placeholder="e.g. Large, 12 inch"
          maxLength={60}
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>Flavour (optional)</span>
        <input
          value={flavour}
          onChange={(e) => setFlavour(e.target.value)}
          placeholder="e.g. BBQ, Mango"
          maxLength={80}
          disabled={disabled}
        />
      </label>
    </>
  )
}
