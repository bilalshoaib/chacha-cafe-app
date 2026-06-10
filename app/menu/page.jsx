'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import MenuItemFormFields from '@/components/MenuItemFormFields.jsx'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'
import { itemBusinessType } from '@/constants/businessTypes.js'
import { clearAddMenuItemHash } from '@/utils/hashNavigation.js'
import { buildCategoryTabs, categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import { useOrders } from '@/context/OrdersContext.jsx'

export default function MenuItemsPage() {
  const { menu, refreshAll, setError } = useOrders()
  const deleteDialogRef = useRef(null)
  const editDialogRef = useRef(null)
  const addDialogRef = useRef(null)
  const selectAllRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [editingItem, setEditingItem] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSize, setEditSize] = useState('')
  const [editFlavour, setEditFlavour] = useState('')
  const [editBusinessType, setEditBusinessType] = useState('cafe')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addCategory, setAddCategory] = useState('pizza')
  const [addSize, setAddSize] = useState('')
  const [addFlavour, setAddFlavour] = useState('')
  const [addBusinessType, setAddBusinessType] = useState('cafe')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const categoryTabs = useMemo(() => buildCategoryTabs(menu.items), [menu.items])

  useEffect(() => {
    const valid = new Set(menu.items.map((i) => i.id))
    setSelectedIds((prev) => prev.filter((id) => valid.has(id)))
  }, [menu.items])

  useEffect(() => {
    const el = deleteDialogRef.current
    if (!el) return
    if (pendingDelete) { if (!el.open) el.showModal() }
    else if (el.open) { el.close() }
  }, [pendingDelete])

  useEffect(() => {
    const el = editDialogRef.current
    if (!el) return
    if (editingItem) { if (!el.open) el.showModal() }
    else if (el.open) { el.close() }
  }, [editingItem])

  useEffect(() => {
    const el = addDialogRef.current
    if (!el) return
    if (addOpen) { if (!el.open) el.showModal() }
    else if (el.open) { el.close() }
  }, [addOpen])

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

  const allSelected = sortedItems.length > 0 && selectedIds.length === sortedItems.length

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = selectedIds.length > 0 && !allSelected
  }, [selectedIds.length, allSelected])

  function toggleSelected(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds([])
    else setSelectedIds(sortedItems.map((i) => i.id))
  }

  function openEditDialog(item) {
    setEditError('')
    setEditingItem(item)
    setEditName(item.name ?? '')
    setEditPrice(String(item.price ?? ''))
    setEditCategory(item.category ?? 'other')
    setEditSize(item.size ?? '')
    setEditFlavour(item.flavour ?? '')
    setEditBusinessType(item.businessType === 'both' ? 'both' : itemBusinessType(item))
  }

  function closeEditDialog() {
    editDialogRef.current?.close()
  }

  function openAddDialog() {
    setAddError('')
    setAddName('')
    setAddPrice('')
    setAddCategory(categoryTabs[0]?.key ?? 'pizza')
    setAddSize('')
    setAddFlavour('')
    setAddBusinessType('cafe')
    setAddOpen(true)
  }

  function closeAddDialog() {
    addDialogRef.current?.close()
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
        businessType: addBusinessType,
        ...(addSize.trim() ? { size: addSize.trim() } : {}),
        ...(addFlavour.trim() ? { flavour: addFlavour.trim() } : {}),
      })
      await refreshAll()
      setAddOpen(false)
      closeAddDialog()
    } catch (err) {
      setAddError(err.message || 'Could not add item')
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
        size: editSize.trim(),
        flavour: editFlavour.trim(),
        businessType: editBusinessType,
      })
      await refreshAll()
      closeEditDialog()
    } catch (err) {
      setEditError(err.message || 'Could not save changes')
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
      } else {
        const ids = pendingDelete.items.map((i) => i.id)
        await api.deleteMenuItems(ids)
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
      }
      await refreshAll()
      deleteDialogRef.current?.close()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <main className="grid menu-manage menu-manage-list-only">
        <section className="card menu-items-list-card">
          <div className="menu-items-section-head">
            <h2>All items ({menu.items.length})</h2>
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
          {sortedItems.length === 0 ? (
            <p className="muted">
              No items yet.{' '}
              <button type="button" className="inline-link-button" onClick={openAddDialog}>
                Add a menu item
              </button>
              .
            </p>
          ) : (
            <ul className="menu-item-admin-list">
              {sortedItems.map((item) => {
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
                      <span className="menu-item-admin-price">{formatMoney(item.price)}</span>
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

      <dialog
        ref={addDialogRef}
        className="confirm-dialog add-menu-item-dialog"
        aria-labelledby="add-menu-item-page-title"
        onClose={() => {
          setAddOpen(false)
          clearAddMenuItemHash()
        }}
        onCancel={(e) => { if (addSaving) e.preventDefault() }}
      >
        <div className="confirm-dialog-inner">
          <h2 id="add-menu-item-page-title" className="confirm-dialog-title">Add menu item</h2>
          <p className="muted small add-menu-item-intro">
            Saved on the server immediately. Choose Cafe, Burger, or Both if the item is shared across menus.
          </p>
          <form className="deal-form add-menu-item-form" onSubmit={(e) => void submitAdd(e)}>
            <MenuItemFormFields
              name={addName} setName={setAddName}
              price={addPrice} setPrice={setAddPrice}
              category={addCategory} setCategory={setAddCategory}
              businessType={addBusinessType} setBusinessType={setAddBusinessType}
              size={addSize} setSize={setAddSize}
              flavour={addFlavour} setFlavour={setAddFlavour}
              categoryTabs={categoryTabs}
              disabled={addSaving}
              categoryListId="menu-page-add-category-dl"
            />
            {addError ? <p className="banner error" role="alert">{addError}</p> : null}
            <div className="confirm-dialog-actions add-menu-item-form-actions">
              <button type="button" className="ghost" onClick={closeAddDialog} disabled={addSaving}>Cancel</button>
              <button type="submit" className="primary" disabled={addSaving}>
                {addSaving ? 'Saving…' : 'Add to menu'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog
        ref={editDialogRef}
        className="confirm-dialog add-menu-item-dialog"
        aria-labelledby="edit-menu-item-title"
        onClose={() => setEditingItem(null)}
        onCancel={(e) => { if (editSaving) e.preventDefault() }}
      >
        {editingItem ? (
          <div className="confirm-dialog-inner">
            <h2 id="edit-menu-item-title" className="confirm-dialog-title">Edit menu item</h2>
            <p className="muted small add-menu-item-intro">
              Update <strong>{editingItem.name}</strong> ({editingItem.id}). Existing orders and invoices keep their
              saved line prices.
            </p>
            <form className="deal-form add-menu-item-form" onSubmit={(e) => void submitEdit(e)}>
              <MenuItemFormFields
                name={editName} setName={setEditName}
                price={editPrice} setPrice={setEditPrice}
                category={editCategory} setCategory={setEditCategory}
                businessType={editBusinessType} setBusinessType={setEditBusinessType}
                size={editSize} setSize={setEditSize}
                flavour={editFlavour} setFlavour={setEditFlavour}
                categoryTabs={categoryTabs}
                disabled={editSaving}
                categoryListId="edit-menu-item-category-dl"
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

      <dialog
        ref={deleteDialogRef}
        className="confirm-dialog"
        aria-labelledby="confirm-remove-title"
        onClose={() => setPendingDelete(null)}
        onCancel={(e) => { if (deleting) e.preventDefault() }}
      >
        {pendingDelete ? (
          <div className="confirm-dialog-inner">
            <h2 id="confirm-remove-title" className="confirm-dialog-title">
              {pendingDelete.mode === 'bulk' ? `Remove ${pendingDelete.items.length} items?` : 'Remove from menu?'}
            </h2>
            {pendingDelete.mode === 'single' ? (
              <p className="confirm-dialog-body">
                Remove <strong>{pendingDelete.item.name}</strong> from the menu? This cannot be undone.
              </p>
            ) : (
              <>
                <p className="confirm-dialog-body">These items will be removed from the menu. This cannot be undone.</p>
                <ul className="confirm-dialog-list">
                  {pendingDelete.items.map((it) => (
                    <li key={it.id}><strong>{it.name}</strong> <span className="muted small">{it.id}</span></li>
                  ))}
                </ul>
              </>
            )}
            <div className="confirm-dialog-actions">
              <button type="button" className="ghost" onClick={() => deleteDialogRef.current?.close()} disabled={deleting}>Cancel</button>
              <button type="button" className="danger-solid" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Removing…' : pendingDelete.mode === 'bulk' ? 'Remove all' : 'Remove'}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
