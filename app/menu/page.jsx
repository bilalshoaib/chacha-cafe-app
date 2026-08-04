'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import MenuItemFormFields from '@/components/MenuItemFormFields.jsx'
import Modal, { ConfirmActions, FormActions } from '@/components/Modal.jsx'
import Skeleton, { SkeletonStatus } from '@/components/Skeleton.jsx'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'
import { itemBusinessType } from '@/constants/businessTypes.js'
import { clearAddMenuItemHash } from '@/utils/hashNavigation.js'
import { buildCategoryTabs, categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useToast } from '@/context/ToastContext.jsx'

export default function MenuItemsPage() {
  const { menu, loading, refreshAll, setError } = useOrders()
  const toast = useToast()
  const selectAllRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [editingItem, setEditingItem] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCostPrice, setEditCostPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSize, setEditSize] = useState('')
  const [editFlavour, setEditFlavour] = useState('')
  const [editBusinessType, setEditBusinessType] = useState('cafe')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addCostPrice, setAddCostPrice] = useState('')
  const [addCategory, setAddCategory] = useState('pizza')
  const [addSize, setAddSize] = useState('')
  const [addFlavour, setAddFlavour] = useState('')
  const [addBusinessType, setAddBusinessType] = useState('cafe')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [businessFilter, setBusinessFilter] = useState('all')

  const categoryTabs = useMemo(() => buildCategoryTabs(menu.items), [menu.items])

  useEffect(() => {
    const valid = new Set(menu.items.map((i) => i.id))
    setSelectedIds((prev) => prev.filter((id) => valid.has(id)))
  }, [menu.items])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === ADD_MENU_ITEM_HASH) {
      openAddDialog()
    }
  }, [])

  const sortedItems = useMemo(
    () =>
      [...menu.items].sort((a, b) => {
        const byCat = a.category.localeCompare(b.category)
        return byCat !== 0 ? byCat : a.name.localeCompare(b.name)
      }),
    [menu.items],
  )

  const filteredItems = useMemo(() => {
    let items = sortedItems
    if (businessFilter === 'cafe') items = items.filter((i) => i.businessType === 'cafe' || i.businessType === 'both')
    else if (businessFilter === 'burger') items = items.filter((i) => i.businessType === 'burger' || i.businessType === 'both')
    const q = searchQuery.trim().toLowerCase()
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q))
    return items
  }, [sortedItems, businessFilter, searchQuery])

  const allSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.includes(i.id))

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    const someSelected = filteredItems.some((i) => selectedIds.includes(i.id))
    el.indeterminate = someSelected && !allSelected
  }, [selectedIds, filteredItems, allSelected])

  function toggleSelected(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds((prev) => prev.filter((id) => !filteredItems.some((i) => i.id === id)))
    else setSelectedIds((prev) => [...new Set([...prev, ...filteredItems.map((i) => i.id)])])
  }

  function openEditDialog(item) {
    setEditError('')
    setEditingItem(item)
    setEditName(item.name ?? '')
    setEditPrice(String(item.price ?? ''))
    setEditCostPrice(item.costPrice == null ? '' : String(item.costPrice))
    setEditCategory(item.category ?? 'other')
    setEditSize(item.size ?? '')
    setEditFlavour(item.flavour ?? '')
    setEditBusinessType(item.businessType === 'both' ? 'both' : itemBusinessType(item))
  }

  function closeEditDialog() {
    setEditingItem(null)
  }

  function openAddDialog() {
    setAddError('')
    setAddName('')
    setAddPrice('')
    setAddCostPrice('')
    setAddCategory(categoryTabs[0]?.key ?? 'pizza')
    setAddSize('')
    setAddFlavour('')
    setAddBusinessType('cafe')
    setAddOpen(true)
  }

  function closeAddDialog() {
    setAddOpen(false)
  }

  async function submitAdd(e) {
    e.preventDefault()
    const p = Number(addPrice)
    if (!addName.trim() || !Number.isFinite(p) || p <= 0) {
      setAddError('Enter a name and a valid price.')
      return
    }
    if (!addCategory.trim()) { setAddError('Enter a category.'); return }
    setAddSaving(true)
    setAddError('')
    setError('')
    try {
      await api.createMenuItem({
        name: addName.trim(),
        category: addCategory.trim(),
        price: p,
        costPrice: addCostPrice,
        businessType: addBusinessType,
        ...(addSize.trim() ? { size: addSize.trim() } : {}),
        ...(addFlavour.trim() ? { flavour: addFlavour.trim() } : {}),
      })
      await refreshAll()
      setAddOpen(false)
      closeAddDialog()
      toast.success('Menu item added')
    } catch (err) {
      setAddError(err.message || 'Could not add item')
      toast.error(err.message || 'Could not add item')
    } finally {
      setAddSaving(false)
    }
  }

  async function submitEdit(e) {
    e.preventDefault()
    if (!editingItem || editSaving) return
    const p = Number(editPrice)
    if (!editName.trim() || !Number.isFinite(p) || p <= 0) {
      setEditError('Enter a name and a valid price.')
      return
    }
    if (!editCategory.trim()) { setEditError('Enter a category.'); return }
    setEditSaving(true)
    setEditError('')
    setError('')
    try {
      await api.updateMenuItem(editingItem.id, {
        name: editName.trim(),
        category: editCategory.trim(),
        price: p,
        costPrice: editCostPrice,
        size: editSize.trim(),
        flavour: editFlavour.trim(),
        businessType: editBusinessType,
      })
      await refreshAll()
      closeEditDialog()
      toast.success('Menu item updated')
    } catch (err) {
      setEditError(err.message || 'Could not save changes')
      toast.error(err.message || 'Could not save changes')
    } finally {
      setEditSaving(false)
    }
  }

  function openDeleteDialog(item) {
    setPendingDelete({ mode: 'single', item: { id: item.id, name: item.name } })
  }

  function openBulkDeleteDialog() {
    const items = sortedItems
      .filter((i) => selectedIds.includes(i.id))
      .map((i) => ({ id: i.id, name: i.name }))
    if (!items.length) return
    setPendingDelete({ mode: 'bulk', items })
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    setError('')
    try {
      if (pendingDelete.mode === 'single') {
        await api.deleteMenuItem(pendingDelete.item.id)
        setSelectedIds((prev) => prev.filter((id) => id !== pendingDelete.item.id))
        toast.success(`"${pendingDelete.item.name}" removed from menu`)
      } else {
        const ids = pendingDelete.items.map((i) => i.id)
        await api.deleteMenuItems(ids)
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
        toast.success(`${ids.length} items removed from menu`)
      }
      await refreshAll()
      setPendingDelete(null)
    } catch (err) {
      toast.error(err.message || 'Could not remove item')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-deco" aria-hidden="true">🍕 🍔 🌯</div>
        <div className="page-hero-body">
          <div className="page-hero-icon">🍽️</div>
          <div>
            <h1 className="page-hero-title">Menu Items</h1>
            <p className="page-hero-sub">Add, edit, and manage items across your cafe &amp; burger menu.</p>
          </div>
        </div>
        <Link href="/menu/board" className="page-hero-action">
          🖼️ View menu board
        </Link>
      </div>
      <main className="grid menu-manage menu-manage-list-only">
        <section className="card menu-items-list-card">
          <div className="menu-items-section-head">
            <h2>
              All items{loading ? '' : ` (${filteredItems.length}${filteredItems.length !== menu.items.length ? ` of ${menu.items.length}` : ''})`}
            </h2>
            <div className="menu-items-toolbar">
              <button type="button" className="link-add-menu-item" onClick={openAddDialog}>
                Add menu item
              </button>
              {sortedItems.length > 0 ? (
                <>
                  <label className="select-all-label">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    className="ghost danger sm"
                    disabled={selectedIds.length === 0}
                    onClick={openBulkDeleteDialog}
                  >
                    Delete selected{selectedIds.length ? ` (${selectedIds.length})` : ''}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <p className="muted small menu-items-lede">
            Use <strong>Edit</strong> to change name, price, category, size, or flavour. Changes apply to new orders
            immediately.
          </p>
          <div className="menu-filter-bar">
            <div className="invoices-filter-tabs">
              <button type="button" className={businessFilter === 'all' ? 'primary sm' : 'ghost sm'} onClick={() => setBusinessFilter('all')}>All</button>
              <button type="button" className={businessFilter === 'cafe' ? 'primary sm' : 'ghost sm'} onClick={() => setBusinessFilter('cafe')}>Cafe</button>
              <button type="button" className={businessFilter === 'burger' ? 'primary sm' : 'ghost sm'} onClick={() => setBusinessFilter('burger')}>Burger</button>
            </div>
            <input
              type="search"
              className="menu-search-input"
              placeholder="Search items…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search menu items"
            />
          </div>
          {loading ? (
            <ul className="menu-item-admin-list" aria-busy="true">
              <SkeletonStatus label="Loading menu items…" />
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="skeleton-menu-row">
                  <Skeleton width="1rem" height="1rem" />
                  <div className="skeleton-menu-row-main">
                    <Skeleton width={`${45 + ((i * 13) % 35)}%`} height="0.95rem" />
                    <Skeleton width={`${25 + ((i * 7) % 20)}%`} height="0.7rem" />
                  </div>
                  <Skeleton width="4rem" height="0.95rem" />
                </li>
              ))}
            </ul>
          ) : sortedItems.length === 0 ? (
            <p className="muted">
              No items yet.{' '}
              <button type="button" className="inline-link-button" onClick={openAddDialog}>
                Add a menu item
              </button>
              .
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="muted">No items match your search or filter.</p>
          ) : (
            <ul className="menu-item-admin-list">
              {filteredItems.map((item) => {
                const extras = formatItemExtras(item)
                return (
                  <li key={item.id} className="menu-item-admin-row">
                    <label className="menu-item-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                    </label>
                    <div className="menu-item-admin-main">
                      <strong className="menu-item-admin-name">{item.name}</strong>
                      <BusinessTypeBadge type={itemBusinessType(item)} className="menu-item-business-badge" />
                      {extras ? <span className="muted small"> · {extras}</span> : null}
                      <span className="muted small">
                        {' '}
                        · {categoryLabel(item.category)} · {item.id}
                      </span>
                    </div>
                    <div className="menu-item-admin-actions">
                      <span className="menu-item-admin-price">
                        {formatMoney(item.price)}
                        {item.costPrice != null ? (
                          <span className={`menu-item-margin ${item.price - item.costPrice < 0 ? 'menu-margin-bad' : 'menu-margin-good'}`}>
                            cost {formatMoney(item.costPrice)} · {item.price > 0
                              ? `${Math.round(((item.price - item.costPrice) / item.price) * 100)}%`
                              : '—'}
                          </span>
                        ) : (
                          <span className="menu-item-margin muted small">no cost set</span>
                        )}
                      </span>
                      <button type="button" className="ghost sm" onClick={() => openEditDialog(item)}>
                        Edit
                      </button>
                      <button type="button" className="ghost danger sm" onClick={() => openDeleteDialog(item)}>
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); clearAddMenuItemHash() }}
        busy={addSaving}
        title="Add menu item"
        subtitle="Saved straight away and available on the next order."
        onSubmit={(e) => void submitAdd(e)}
        actions={<FormActions onCancel={closeAddDialog} busy={addSaving} submitLabel="Add to menu" />}
      >
        <MenuItemFormFields
          name={addName} setName={setAddName}
          price={addPrice} setPrice={setAddPrice}
          costPrice={addCostPrice} setCostPrice={setAddCostPrice}
          category={addCategory} setCategory={setAddCategory}
          businessType={addBusinessType} setBusinessType={setAddBusinessType}
          size={addSize} setSize={setAddSize}
          flavour={addFlavour} setFlavour={setAddFlavour}
          categoryTabs={categoryTabs}
          disabled={addSaving}
          categoryListId="menu-page-add-category-dl"
        />
        {addError ? <p className="banner error" role="alert">{addError}</p> : null}
      </Modal>

      <Modal
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        busy={editSaving}
        title="Edit menu item"
        subtitle={
          editingItem ? <><strong>{editingItem.name}</strong> · past invoices keep their saved prices.</> : null
        }
        onSubmit={(e) => void submitEdit(e)}
        actions={<FormActions onCancel={closeEditDialog} busy={editSaving} submitLabel="Save changes" />}
      >
        {editingItem ? (
          <>
            <MenuItemFormFields
              name={editName} setName={setEditName}
              price={editPrice} setPrice={setEditPrice}
              costPrice={editCostPrice} setCostPrice={setEditCostPrice}
              category={editCategory} setCategory={setEditCategory}
              businessType={editBusinessType} setBusinessType={setEditBusinessType}
              size={editSize} setSize={setEditSize}
              flavour={editFlavour} setFlavour={setEditFlavour}
              categoryTabs={categoryTabs}
              disabled={editSaving}
              categoryListId="edit-menu-item-category-dl"
            />
            {editError ? <p className="banner error" role="alert">{editError}</p> : null}
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        busy={deleting}
        size="compact"
        title={
          pendingDelete?.mode === 'bulk'
            ? `Remove ${pendingDelete.items.length} items?`
            : 'Remove from menu?'
        }
        actions={
          <ConfirmActions
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
            busy={deleting}
            busyLabel="Removing…"
            confirmLabel={pendingDelete?.mode === 'bulk' ? 'Remove all' : 'Remove'}
          />
        }
      >
        {pendingDelete?.mode === 'single' ? (
          <p className="confirm-dialog-body">
            Remove <strong>{pendingDelete.item.name}</strong> from the menu? This cannot be undone.
          </p>
        ) : pendingDelete ? (
          <>
            <p className="confirm-dialog-body">These items will be removed from the menu. This cannot be undone.</p>
            <ul className="confirm-dialog-list">
              {pendingDelete.items.map((it) => (
                <li key={it.id}><strong>{it.name}</strong> <span className="muted small">{it.id}</span></li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>
    </>
  )
}
