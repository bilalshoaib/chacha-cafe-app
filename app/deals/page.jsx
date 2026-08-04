'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import DealFormFields from '@/components/DealFormFields.jsx'
import Modal, { FormActions } from '@/components/Modal.jsx'
import Skeleton, { SkeletonStatus } from '@/components/Skeleton.jsx'
import { BUSINESS_TYPES, DEAL_BUSINESS_TYPE_OPTIONS, dealBusinessType, itemMatchesBusiness } from '@/constants/businessTypes.js'
import { buildCategoryTabs, categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { dealMatchesQuery } from '@/utils/dealSearch.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useToast } from '@/context/ToastContext.jsx'

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

function includesFromQtyMap(qtyById, unitPriceById = {}) {
  return Object.entries(qtyById)
    .filter(([, q]) => q >= 1)
    .map(([itemId, qty]) => ({ itemId, qty, unitPrice: unitPriceById[itemId] ?? '' }))
}

export default function DealsPage() {
  const { menu, loading, refreshAll, setError } = useOrders()
  const toast = useToast()
  const [listFilter, setListFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [archivingIds, setArchivingIds] = useState(new Set())

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cafeSplit, setCafeSplit] = useState('')
  const [burgerSplit, setBurgerSplit] = useState('')
  const [dealBusiness, setDealBusiness] = useState('cafe')
  const [qtyById, setQtyById] = useState({})
  const [unitPriceById, setUnitPriceById] = useState({})
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [editingDeal, setEditingDeal] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCafeSplit, setEditCafeSplit] = useState('')
  const [editBurgerSplit, setEditBurgerSplit] = useState('')
  const [editBusiness, setEditBusiness] = useState('cafe')
  const [editQtyById, setEditQtyById] = useState({})
  const [editUnitPriceById, setEditUnitPriceById] = useState({})
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

  // Same lookup the picker uses, so searching here matches the same things.
  const labelForItem = useCallback(
    (itemId) => {
      const item = itemById.get(itemId)
      if (!item) return itemId
      return [item.name, formatItemExtras(item), categoryLabel(item.category)].filter(Boolean).join(' · ')
    },
    [itemById],
  )

  const dealsForTab = useMemo(() => {
    if (listFilter === 'archived') return archivedDeals
    const base = activeDeals
    if (listFilter === 'all') return base
    if (listFilter === 'combined') return base.filter((d) => dealBusinessType(d, menu.items) === 'combined')
    return base.filter((d) => dealBusinessType(d, menu.items) === listFilter)
  }, [activeDeals, archivedDeals, menu.items, listFilter])

  const filteredDeals = useMemo(
    () => dealsForTab.filter((d) => dealMatchesQuery(d, search, labelForItem)),
    [dealsForTab, search, labelForItem],
  )
  const searching = search.trim().length > 0

  const createCategorySections = useMemo(() => buildDealCategorySections(menu.items, dealBusiness), [menu.items, dealBusiness])
  const editCategorySections = useMemo(() => buildDealCategorySections(menu.items, editBusiness), [menu.items, editBusiness])

  function openAddDialog() {
    setCreateError('')
    setName('')
    setPrice('')
    setCafeSplit('')
    setBurgerSplit('')
    setDealBusiness('cafe')
    setQtyById({})
    setUnitPriceById({})
    setAddOpen(true)
  }

  function closeAddDialog() { setAddOpen(false) }

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
    const p = {}
    for (const inc of deal.includes ?? []) {
      if (inc.qty >= 1) {
        q[inc.itemId] = inc.qty
        if (inc.unitPrice != null) p[inc.itemId] = String(inc.unitPrice)
      }
    }
    setEditQtyById(q)
    setEditUnitPriceById(p)
  }

  function closeEditDialog() { setEditingDeal(null) }

  async function submitDeal(e) {
    e.preventDefault()
    const includes = includesFromQtyMap(qtyById, unitPriceById)
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
        toast.success('Deal created')
      } catch (err) { setCreateError(err.message); toast.error(err.message || 'Could not create deal') }
      finally { setCreating(false) }
    } else {
      const p = Number(price)
      if (!Number.isFinite(p) || p <= 0) { setCreateError('Enter a valid price.'); return }
      setCreateError(''); setCreating(true)
      try {
        await api.createDeal({ name: name.trim(), price: p, includes, businessType: dealBusiness })
        await refreshAll()
        setAddOpen(false)
        toast.success('Deal created')
      } catch (err) { setCreateError(err.message); toast.error(err.message || 'Could not create deal') }
      finally { setCreating(false) }
    }
  }

  async function handleArchive(deal) {
    setArchivingIds((prev) => new Set(prev).add(deal.id))
    try {
      await api.archiveDeal(deal.id)
      await refreshAll()
      toast.success(`"${deal.name}" archived`)
    } catch (err) {
      toast.error(err.message || 'Could not archive deal')
    } finally {
      setArchivingIds((prev) => { const s = new Set(prev); s.delete(deal.id); return s })
    }
  }

  async function handleRestore(deal) {
    setArchivingIds((prev) => new Set(prev).add(deal.id))
    try {
      await api.restoreDeal(deal.id)
      await refreshAll()
      toast.success(`"${deal.name}" restored`)
    } catch (err) {
      toast.error(err.message || 'Could not restore deal')
    } finally {
      setArchivingIds((prev) => { const s = new Set(prev); s.delete(deal.id); return s })
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingDeal || editSaving) return
    const includes = includesFromQtyMap(editQtyById, editUnitPriceById)
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
      toast.success('Deal updated')
    } catch (err) {
      setEditError(err.message || 'Could not save deal')
      toast.error(err.message || 'Could not save deal')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-deco" aria-hidden="true">🎁 💰 ⭐</div>
        <div className="page-hero-body">
          <div className="page-hero-icon">🔥</div>
          <div>
            <h1 className="page-hero-title">Special Deals</h1>
            <p className="page-hero-sub">Create and manage bundle deals shown on the order screen.</p>
          </div>
        </div>
        <Link href="/menu/board" className="page-hero-action">
          🖼️ View menu board
        </Link>
      </div>
      <main className="grid single deals-page">
        <section className="card saved-deals-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>
              Saved deals{loading ? '' : ` (${activeDeals.length})`}
              {!loading && archivedDeals.length > 0 && (
                <span className="muted" style={{ fontSize: '0.85em', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                  · {archivedDeals.length} archived
                </span>
              )}
            </h2>
            <button
              type="button"
              className="primary sm"
              onClick={openAddDialog}
              disabled={loading || menu.items.length === 0}
              title={menu.items.length === 0 && !loading ? 'Add menu items first — a deal is built from them.' : undefined}
            >
              + Add deal
            </button>
          </div>
          <p className="muted small saved-deals-lede">
            These appear on <strong>Take order</strong> in <strong>Add a deal to this order</strong>. Filter by
            business or use <strong>Edit</strong> to change name, price, items, or business. Archived deals are hidden
            from orders.
          </p>
          <div className="deals-filter-bar">
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
            <input
              type="search"
              className="menu-search-input deals-search-input"
              placeholder="Search by name, price, or item inside…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading}
              aria-label="Search deals"
            />
          </div>
          {searching && !loading ? (
            <p className="muted small deals-search-count" role="status">
              {filteredDeals.length} of {dealsForTab.length} {dealsForTab.length === 1 ? 'deal' : 'deals'} match
              {' “'}{search.trim()}{'”'}
            </p>
          ) : null}
          {!loading && menu.items.length === 0 ? (
            <p className="banner info deals-needs-items">
              A deal is a bundle of menu items, so add some items first.{' '}
              <Link href="/menu" className="inline-link">Go to Menu items →</Link>
            </p>
          ) : null}
          {loading ? (
            <ul className="saved-deals-list" aria-busy="true">
              <SkeletonStatus label="Loading deals…" />
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="skeleton-deal-block">
                  <div className="skeleton-deal-head">
                    <Skeleton width={`${35 + ((i * 11) % 25)}%`} height="1.05rem" />
                    <Skeleton width="5rem" height="1.05rem" />
                  </div>
                  <Skeleton width="4.5rem" height="0.7rem" />
                  <Skeleton width={`${55 + ((i * 9) % 25)}%`} height="0.8rem" />
                  <Skeleton width={`${40 + ((i * 17) % 30)}%`} height="0.8rem" />
                </li>
              ))}
            </ul>
          ) : filteredDeals.length === 0 && searching ? (
            <p className="muted">
              No deals match “{search.trim()}”.{' '}
              <button type="button" className="inline-link-button" onClick={() => setSearch('')}>
                Clear search
              </button>
            </p>
          ) : filteredDeals.length === 0 ? (
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

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        busy={creating}
        size="wide"
        title="Create a new deal"
        subtitle="Bundle price is what the customer pays. For combined deals the total is the sum of both portions."
        onSubmit={(e) => void submitDeal(e)}
        actions={<FormActions onCancel={closeAddDialog} busy={creating} submitLabel="Save deal to menu" />}
      >
        <DealFormFields
          business={dealBusiness} setBusiness={setDealBusiness}
          onBusinessChange={() => { setQtyById({}); setUnitPriceById({}) }}
          name={name} setName={setName}
          price={price} setPrice={setPrice}
          cafeSplit={cafeSplit} setCafeSplit={setCafeSplit}
          burgerSplit={burgerSplit} setBurgerSplit={setBurgerSplit}
          qtyById={qtyById} setQty={(id, q) => setQty(setQtyById, id, q)}
          unitPriceById={unitPriceById} setUnitPrice={(id, v) => setUnitPriceById((prev) => ({ ...prev, [id]: v }))}
          categorySections={createCategorySections}
          disabled={creating}
          showMenuHint={false}
        />
        {createError ? <p className="banner error" role="alert">{createError}</p> : null}
      </Modal>

      <Modal
        open={Boolean(editingDeal)}
        onClose={() => setEditingDeal(null)}
        busy={editSaving}
        size="wide"
        title="Edit deal"
        subtitle={
          editingDeal ? <><strong>{editingDeal.name}</strong> · past invoices keep their saved prices.</> : null
        }
        onSubmit={(e) => void submitEdit(e)}
        actions={<FormActions onCancel={closeEditDialog} busy={editSaving} submitLabel="Save changes" />}
      >
        {editingDeal ? (
          <>
            <DealFormFields
              business={editBusiness} setBusiness={setEditBusiness}
              onBusinessChange={() => { setEditQtyById({}); setEditUnitPriceById({}) }}
              name={editName} setName={setEditName}
              price={editPrice} setPrice={setEditPrice}
              cafeSplit={editCafeSplit} setCafeSplit={setEditCafeSplit}
              burgerSplit={editBurgerSplit} setBurgerSplit={setEditBurgerSplit}
              qtyById={editQtyById} setQty={(id, q) => setQty(setEditQtyById, id, q)}
              unitPriceById={editUnitPriceById} setUnitPrice={(id, v) => setEditUnitPriceById((prev) => ({ ...prev, [id]: v }))}
              categorySections={editCategorySections}
              disabled={editSaving}
              showMenuHint={false}
            />
            {editError ? <p className="banner error" role="alert">{editError}</p> : null}
          </>
        ) : null}
      </Modal>
    </>
  )
}
