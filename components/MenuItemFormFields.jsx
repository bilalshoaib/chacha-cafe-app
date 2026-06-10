'use client'
import { MENU_ITEM_BUSINESS_OPTIONS } from '@/constants/businessTypes.js'

export default function MenuItemFormFields({
  name,
  setName,
  price,
  setPrice,
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
        <span>Price (PKR)</span>
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
