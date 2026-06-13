'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import DealFormFields from '@/components/DealFormFields.jsx'
import { BUSINESS_TYPES, DEAL_BUSINESS_TYPE_OPTIONS, dealBusinessType, itemMatchesBusiness } from '@/constants/businessTypes.js'
import { buildCategoryTabs, categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { useOrders } from '@/context/OrdersContext.jsx'

function buildDealCategorySections(menuItems, business) {
  const byCat = new Map()
  for (const item of menuItems) {
    if (business !== 'combined' && !itemMatchesBusiness(item, business)) continue
    const k = item.category || 'other'
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k).push(item)
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  const tabs = buildCategoryTabs([...byCat.values()].flat())
  return tabs
    .map(({ key, label }) => {
      const items = byCat.get(key)
      return items?.length ? { key, label, items } : null
    })
    .filter(Boolean)
}

function includesFromQtyMap(qtyById) {
  return Object.entries(qtyById)
    .filter(([, q]) => q >= 1)
    .map(([itemId, qty]) => ({ itemId, qty }))
}

export default function DealsPage() {
  const { menu, refreshAll, setError } = useOrders()
  const addDialogRef = useRef(null)
  const editDialogRef = useRef(null)
  const [listFilter, setListFilter] = useState('all')
  const [archivingIds, setArchivingIds] = useState(new Set())

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cafeSplit, setCafeSplit] = useState('')
  const [burgerSplit, setBurgerSplit] = useState('')
  const [dealBusiness, setDealBusiness] = useState('cafe')
  const [qtyById, setQtyById] = useState({})
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [editingDeal, setEditingDeal] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCafeSplit, setEditCafeSplit] = useState('')
  const [editBurgerSplit, setEditBurgerSplit] = useState('')
  const [editBusiness, setEditBusiness] = useState('cafe')
  const [editQtyById, setEditQtyById] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  function setQty(setter, id, q) {
    const n = Number(q)
    setter((prev) => {
      const next = { ...prev }
      if (!Number.isFinite(n) || n < 1) delete next[id]
      else next[id] = Math.floor(n)
      return next
    })
  }

  const itemById = useMemo(() => new Map(menu.items.map((i) => [i.id, i])), [menu.items])
  const activeDeals = useMemo(() => menu.deals.filter((d) => d.status !== 'archived'), [menu.deals])
  const archivedDeals = useMemo(() => menu.deals.filter((d) => d.status === 'archived'), [menu.deals])

  const filteredDeals = useMemo(() => {
    if (listFilter === 'archived') return archivedDeals
    const base = activeDeals
    if (listFilter === 'all') return base
    if (listFilter === 'combined') return base.filter((d) => dealBusinessType(d, menu.items) === 'combined')
    return base.filter((d) => dealBusinessType(d, menu.items) === listFilter)
  }, [activeDeals, archivedDeals, menu.items, listFilter])

  const createCategorySections = useMemo(() => buildDealCategorySections(menu.items, dealBusiness), [menu.items, dealBusiness])
  const editCategorySections = useMemo(() => buildDealCategorySections(menu.items, editBusiness), [menu.items, editBusiness])

  useEffect(() => {
    const el = addDialogRef.current
    if (!el) return
    if (addOpen) { if (!el.open) el.showModal() }
    else if (el.open) { el.close() }
  }, [addOpen])

  useEffect(() => {
    const el = editDialogRef.current
    if (!el) return
    if (editingDeal) { if (!el.open) el.showModal() }
    else if (el.open) { el.close() }
  }, [editingDeal])

  function openAddDialog() {
    setCreateError('')
    setName('')
    setPrice('')
    setCafeSplit('')
    setBurgerSplit('')
    setDealBusiness('cafe')
    setQtyById({})
    setAddOpen(true)
  }

  function closeAddDialog() { addDialogRef.current?.close() }

  function openEditDialog(deal) {
    setEditError('')
    setEditingDeal(deal)
    setEditName(deal.name ?? '')
    setEditBusiness(dealBusinessType(deal, menu.items))
    if (deal.businessType === 'combined') {
      setEditCafeSplit(String(deal.cafeSplit ?? ''))
      setEditBurgerSplit(String(deal.burgerSplit ?? ''))
      setEditPrice(String(deal.price ?? ''))
    } else {
      setEditPrice(String(deal.price ?? ''))
      setEditCafeSplit('')
      setEditBurgerSplit('')
    }
    const q = {}
    for (const inc of deal.includes ?? []) {
      if (inc.qty >= 1) q[inc.itemId] = inc.qty
    }
    setEditQtyById(q)
  }

  function closeEditDialog() { editDialogRef.current?.close() }

  async function submitDeal(e) {
    e.preventDefault()
    const includes = includesFromQtyMap(qtyById)
    if (!name.trim()) { setCreateError('Enter a deal name.'); return }
    if (!includes.length) { setCreateError('Select at least one menu item with quantity ≥ 1.'); return }
    if (dealBusiness === 'combined') {
      const c = Number(cafeSplit); const b = Number(burgerSplit)
      if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(b) || b <= 0) {
        setCreateError('Enter valid Cafe and Burger portion amounts.'); return
      }
      const total = Math.round((c + b) * 100) / 100
      setCreateError(''); setCreating(true)
      try {
        await api.createDeal({ name: name.trim(), price: total, cafeSplit: c, burgerSplit: b, includes, businessType: 'combined' })
        await refreshAll()
        setAddOpen(false)
      } catch (err) { setCreateError(err.message) }
      finally { setCreating(false) }
    } else {
      const p = Number(price)
      if (!Number.isFinite(p) || p <= 0) { setCreateError('Enter a valid price.'); return }
      setCreateError(''); setCreating(true)
      try {
        await api.createDeal({ name: name.trim(), price: p, includes, businessType: dealBusiness })
        await refreshAll()
        setAddOpen(false)
      } catch (err) { setCreateError(err.message) }
      finally { setCreating(false) }
    }
  }

  async function handleArchive(deal) {
    setArchivingIds((prev) => new Set(prev).add(deal.id))
    try {
      await api.archiveDeal(deal.id)
      await refreshAll()
    } catch (err) {
      setError(err.message || 'Could not archive deal')
    } finally {
      setArchivingIds((prev) => { const s = new Set(prev); s.delete(deal.id); return s })
    }
  }

  async function handleRestore(deal) {
    setArchivingIds((prev) => new Set(prev).add(deal.id))
    try {
      await api.restoreDeal(deal.id)
      await refreshAll()
    } catch (err) {
      setError(err.message || 'Could not restore deal')
    } finally {
      setArchivingIds((prev) => { const s = new Set(prev); s.delete(deal.id); return s })
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingDeal || editSaving) return
    const includes = includesFromQtyMap(editQtyById)
    if (!editName.trim()) { setEditError('Enter a deal name.'); return }
    if (!includes.length) { setEditError('Select at least one menu item with quantity ≥ 1.'); return }
    setEditSaving(true); setEditError(''); setError('')
    try {
      if (editBusiness === 'combined') {
        const c = Number(editCafeSplit); const b = Number(editBurgerSplit)
        if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(b) || b <= 0) {
          setEditError('Enter valid Cafe and Burger portion amounts.')
          setEditSaving(false); return
        }
        const total = Math.round((c + b) * 100) / 100
        await api.updateDeal(editingDeal.id, { name: editName.trim(), price: total, cafeSplit: c, burgerSplit: b, includes, businessType: 'combined' })
      } else {
        const p = Number(editPrice)
        if (!Number.isFinite(p) || p <= 0) {
          setEditError('Enter a valid price.'); setEditSaving(false); return
        }
        await api.updateDeal(editingDeal.id, { name: editName.trim(), price: p, includes, businessType: editBusiness })
      }
      await refreshAll()
      closeEditDialog()
    } catch (err) {
      setEditError(err.message || 'Could not save deal')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <>
      <main className="grid single deals-page">
        <section className="card saved-deals-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>
              Saved deals ({activeDeals.length})
              {archivedDeals.length > 0 && (
                <span className="muted" style={{ fontSize: '0.85em', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                  · {archivedDeals.length} archived
                </span>
              )}
            </h2>
            <button type="button" className="primary sm" onClick={openAddDialog}>+ Add deal</button>
          </div>
          <p className="muted small saved-deals-lede">
            These appear on <strong>Take order</strong> in <strong>Add a deal to this order</strong>. Filter by
            business or use <strong>Edit</strong> to change name, price, items, or business. Archived deals are hidden
            from orders.
          </p>
          <div className="invoices-filter-tabs">
            <button type="button" className={listFilter === 'all' ? 'primary sm' : 'ghost sm'} onClick={() => setListFilter('all')}>All</button>
            {BUSINESS_TYPES.map((bt) => (
              <button key={bt.id} type="button" className={listFilter === bt.id ? 'primary sm' : 'ghost sm'} onClick={() => setListFilter(bt.id)}>{bt.shortLabel}</button>
            ))}
            <button type="button" className={listFilter === 'combined' ? 'primary sm' : 'ghost sm'} onClick={() => setListFilter('combined')}>Combined</button>
            <button type="button" className={listFilter === 'archived' ? 'primary sm' : 'ghost sm'} onClick={() => setListFilter('archived')}>
              Archived {archivedDeals.length > 0 && `(${archivedDeals.length})`}
            </button>
          </div>
          {filteredDeals.length === 0 ? (
            <p className="muted">
              {listFilter === 'archived' ? 'No archived deals.' : menu.deals.length === 0 ? 'No deals yet — click \u201c+ Add deal\u201d to create one.' : 'No deals for this filter.'}
            </p>
          ) : (
            <ul className="saved-deals-list">
              {filteredDeals.map((deal) => {
                const bt = dealBusinessType(deal, menu.items)
                const isArchived = deal.status === 'archived'
                const isBusy = archivingIds.has(deal.id)
                return (
                  <li key={deal.id} className={`saved-deal-block${isArchived ? ' saved-deal-archived' : ''}`}>
                    <div className="saved-deal-head">
                      <div className="saved-deal-head-main">
                        <span className="saved-deal-name">{deal.name}</span>
                        <BusinessTypeBadge type={bt} />
                        {isArchived && <span className="badge badge-muted">Archived</span>}
                      </div>
                      <div className="saved-deal-head-actions">
                        <div className="saved-deal-price-info">
                          <span className="saved-deal-price">{formatMoney(deal.price)}</span>
                          {bt === 'combined' ? (
                            <span className="saved-deal-split muted small">
                              Cafe {formatMoney(deal.cafeSplit ?? 0)} · Burger {formatMoney(deal.burgerSplit ?? 0)}
                            </span>
                          ) : null}
                        </div>
                        {isArchived ? (
                          <button type="button" className="ghost sm" disabled={isBusy} onClick={() => handleRestore(deal)}>
                            {isBusy ? 'Restoring…' : 'Restore'}
                          </button>
                        ) : (
                          <>
                            <button type="button" className="ghost sm" onClick={() => openEditDialog(deal)}>Edit</button>
                            <button type="button" className="ghost sm danger-ghost" disabled={isBusy} onClick={() => handleArchive(deal)}>
                              {isBusy ? 'Archiving…' : 'Archive'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="saved-deal-includes-label muted small">Includes</p>
                    <ul className="saved-deal-includes">
                      {deal.includes.map((inc, idx) => {
                        const item = itemById.get(inc.itemId)
                        const bits = item ? [item.name, formatItemExtras(item)].filter(Boolean).join(' · ') : inc.itemId
                        return (
                          <li key={`${deal.id}-${idx}`}>
                            <strong>{inc.qty}×</strong> {bits}
                            {item ? <span className="muted small"> · {categoryLabel(item.category)}</span> : <span className="muted small"> (removed from menu?)</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

      </main>

      <dialog
        ref={addDialogRef}
        className="confirm-dialog add-menu-item-dialog deal-edit-dialog"
        aria-labelledby="add-deal-title"
        onClose={() => setAddOpen(false)}
        onCancel={(e) => { if (creating) e.preventDefault() }}
      >
        <div className="confirm-dialog-inner">
          <h2 id="add-deal-title" className="confirm-dialog-title">Create a new deal</h2>
          <p className="muted small add-menu-item-intro">
            Bundle price is what the customer pays. For combined deals, set how much goes to each business — the total is the sum of both portions.
          </p>
          <form className="deal-form" onSubmit={(e) => void submitDeal(e)}>
            <DealFormFields
              business={dealBusiness} setBusiness={setDealBusiness}
              onBusinessChange={() => setQtyById({})}
              name={name} setName={setName}
              price={price} setPrice={setPrice}
              cafeSplit={cafeSplit} setCafeSplit={setCafeSplit}
              burgerSplit={burgerSplit} setBurgerSplit={setBurgerSplit}
              qtyById={qtyById} setQty={(id, q) => setQty(setQtyById, id, q)}
              categorySections={createCategorySections}
              disabled={creating}
              showMenuHint={false}
            />
            {createError ? <p className="banner error" role="alert">{createError}</p> : null}
            <div className="confirm-dialog-actions add-menu-item-form-actions">
              <button type="button" className="ghost" onClick={closeAddDialog} disabled={creating}>Cancel</button>
              <button type="submit" className="primary" disabled={creating}>
                {creating ? 'Saving…' : 'Save deal to menu'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog
        ref={editDialogRef}
        className="confirm-dialog add-menu-item-dialog deal-edit-dialog"
        aria-labelledby="edit-deal-title"
        onClose={() => setEditingDeal(null)}
        onCancel={(e) => { if (editSaving) e.preventDefault() }}
      >
        {editingDeal ? (
          <div className="confirm-dialog-inner">
            <h2 id="edit-deal-title" className="confirm-dialog-title">Edit deal</h2>
            <p className="muted small add-menu-item-intro">
              Update <strong>{editingDeal.name}</strong> ({editingDeal.id}). Existing orders and invoices keep their saved line prices.
            </p>
            <form className="deal-form" onSubmit={(e) => void submitEdit(e)}>
              <DealFormFields
                business={editBusiness} setBusiness={setEditBusiness}
                onBusinessChange={() => setEditQtyById({})}
                name={editName} setName={setEditName}
                price={editPrice} setPrice={setEditPrice}
                cafeSplit={editCafeSplit} setCafeSplit={setEditCafeSplit}
                burgerSplit={editBurgerSplit} setBurgerSplit={setEditBurgerSplit}
                qtyById={editQtyById} setQty={(id, q) => setQty(setEditQtyById, id, q)}
                categorySections={editCategorySections}
                disabled={editSaving}
                showMenuHint={false}
              />
              {editError ? <p className="banner error" role="alert">{editError}</p> : null}
              <div className="confirm-dialog-actions add-menu-item-form-actions">
                <button type="button" className="ghost" onClick={closeEditDialog} disabled={editSaving}>Cancel</button>
                <button type="submit" className="primary" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
