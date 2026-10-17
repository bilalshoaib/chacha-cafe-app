'use client'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { useMoney } from '@/context/BrandingContext.jsx'
import { SkeletonStatus } from '@/components/Skeleton.jsx'
import { categoryLabel, formatItemExtras } from '@/utils/formatting.js'
import { roundMoney } from '@/lib/pricing.js'

/**
 * A partner kitchen's menu: which of the café's items it sells, and at what
 * price (lib/partners.js).
 *
 * Every café item is listed, because the partner chooses from the café's
 * menu. Each row shows what the café charges, what the partner owes the café
 * for one (the café's price less the partner's discount), and what the partner
 * keeps at the price it has set — so a price below what it owes shows up as a
 * loss before it is saved, not at settlement.
 *
 * "Hidden" keeps the price but takes the item off the till for now. "Website
 * name" is what the partner's public menu calls the item; the till, receipts
 * and reports keep the café's name.
 *
 * Above them sit the partner's own items (OwnItemsCard): food it makes itself,
 * which owes the café nothing.
 */
export default function PartnerPricesPage({ params }) {
  const { id } = use(params)
  const money = useMoney()
  const [data, setData] = useState(null)
  // itemId → { sell, price (string, as typed), visible, displayName (as typed) }
  const [draft, setDraft] = useState({})
  const [filter, setFilter] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.getPartner(id)
      setData(res)
      const next = {}
      for (const i of res.items) {
        next[i.id] = {
          sell: i.price != null,
          price: i.price != null ? String(i.price) : '',
          visible: i.price != null ? i.visible : true,
          displayName: i.displayName ?? '',
        }
      }
      setDraft(next)
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const canManage = Boolean(data?.canManage)
  const pct = data?.partner?.supplyDiscountPct ?? 0

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const byCat = new Map()
    for (const i of data?.items ?? []) {
      if (onlyMine && !draft[i.id]?.sell) continue
      if (q && !`${i.name} ${draft[i.id]?.displayName ?? ''} ${formatItemExtras(i)}`.toLowerCase().includes(q)) continue
      if (!byCat.has(i.category)) byCat.set(i.category, [])
      byCat.get(i.category).push(i)
    }
    return [...byCat.entries()]
      .map(([key, rows]) => ({ key, label: categoryLabel(key, data?.categories), rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [data, draft, filter, onlyMine])

  const sellingCount = Object.values(draft).filter((d) => d.sell).length
  const dirty = useMemo(() => {
    if (!data) return false
    return data.items.some((i) => {
      const d = draft[i.id]
      if (!d) return false
      if (d.sell !== (i.price != null)) return true
      if (!d.sell) return false
      return Number(d.price) !== i.price || d.visible !== i.visible || d.displayName.trim() !== (i.displayName ?? '')
    })
  }, [data, draft])

  function change(itemId, patch) {
    setNotice('')
    setDraft((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
  }

  /** Starts a newly ticked item at the café's own price, which is the usual first guess. */
  function toggleSell(item) {
    const d = draft[item.id]
    change(item.id, { sell: !d.sell, price: d.price === '' ? String(item.menuPrice) : d.price })
  }

  async function save() {
    setError('')
    setNotice('')
    const prices = []
    for (const i of data.items) {
      const d = draft[i.id]
      if (!d?.sell) continue
      const n = Number(d.price)
      if (d.price === '' || !Number.isFinite(n) || n < 0) {
        setError(`Enter a price for ${i.name}.`)
        return
      }
      prices.push({ itemId: i.id, price: n, visible: d.visible, displayName: d.displayName.trim() || null })
    }
    setSaving(true)
    try {
      const { saved } = await api.savePartnerPrices(id, prices)
      setNotice(`Saved — ${saved} item${saved === 1 ? '' : 's'} on ${data.partner.name}'s menu.`)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return (
      <main className="settings-page settings-subpage">
        {error ? <p className="banner error" role="alert">{error}</p> : <SkeletonStatus label="Loading menu…" />}
      </main>
    )
  }

  return (
    <main className="settings-page settings-subpage partner-prices">
      <div className="settings-subpage-head">
        <div>
          <h2>{data.partner.name} — menu &amp; prices</h2>
          <p className="muted small">
            Choose which items {data.partner.name} sells, set its prices and, if you like, the name each goes by on
            {' '}{data.partner.name}’s website. For every item sold,
            {' '}{data.partner.name} pays the café its menu price less {pct}%; it keeps whatever its own price is above that.
          </p>
        </div>
        <div className="settings-subpage-actions">
          <Link href={`/partners/${id}`} className="ghost sm">← Take order</Link>
          {data.isOwner ? <Link href="/settings/partners" className="ghost sm">Partner settings</Link> : null}
        </div>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {notice ? <p className="banner success" role="status">{notice}</p> : null}
      {!canManage ? <p className="banner info" role="note">Only the café’s owner or {data.partner.name} can change these prices.</p> : null}

      <section className="card partner-prices-toolbar">
        <label className="field partner-search">
          <span className="sr-only">Search items</span>
          <input
            type="search"
            placeholder="🔍  Search items"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="partner-prices-only">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <span>Only items on {data.partner.name}’s menu ({sellingCount})</span>
        </label>
        {canManage ? (
          <button type="button" className="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save menu'}
          </button>
        ) : null}
      </section>

      <OwnItemsCard partnerId={id} data={data} canManage={canManage} onChanged={load} />

      {groups.length === 0 ? <p className="muted">No items match.</p> : groups.map((g) => (
        <section key={g.key} className="card partner-prices-group">
          <h3 className="sub">{g.label}</h3>
          <table className="partner-prices-table table-cards">
            <thead>
              <tr>
                <th>Sell</th>
                <th>Item</th>
                <th>Website name</th>
                <th className="num">Café price</th>
                <th className="num">Pays café</th>
                <th className="num">{data.partner.name} price</th>
                <th className="num">Keeps</th>
                <th>Hidden</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((i) => {
                const d = draft[i.id] ?? { sell: false, price: '', visible: true, displayName: '' }
                const n = Number(d.price)
                const keeps = d.sell && d.price !== '' && Number.isFinite(n) ? roundMoney(n - i.supplyPrice) : null
                const extras = formatItemExtras(i)
                return (
                  <tr key={i.id} className={d.sell ? 'is-on' : ''}>
                    <td data-label="Sell">
                      <input
                        type="checkbox"
                        checked={d.sell}
                        disabled={!canManage}
                        onChange={() => toggleSell(i)}
                        aria-label={`${data.partner.name} sells ${i.name}`}
                      />
                    </td>
                    <td className="cell-card-title">
                      {i.name}{extras ? <span className="muted small"> · {extras}</span> : null}
                    </td>
                    <td data-label="Website name" className="cell-card-field">
                      <input
                        className="partner-web-name"
                        value={d.displayName}
                        maxLength={120}
                        placeholder={i.name}
                        disabled={!canManage || !d.sell}
                        onChange={(e) => change(i.id, { displayName: e.target.value })}
                        aria-label={`${data.partner.name} website name for ${i.name}`}
                      />
                    </td>
                    <td data-label="Café price" className="num">{money(i.menuPrice)}</td>
                    <td data-label="Pays café" className="num">{money(i.supplyPrice)}</td>
                    <td data-label={`${data.partner.name} price`} className="num cell-card-field">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="decimal"
                        value={d.price}
                        disabled={!canManage || !d.sell}
                        onChange={(e) => change(i.id, { price: e.target.value })}
                        aria-label={`${data.partner.name} price for ${i.name}`}
                      />
                    </td>
                    <td data-label="Keeps" className={`num${keeps != null && keeps < 0 ? ' partner-loss' : ''}`}>
                      {keeps == null ? '—' : money(keeps)}
                    </td>
                    <td data-label="Hidden">
                      <input
                        type="checkbox"
                        checked={d.sell && !d.visible}
                        disabled={!canManage || !d.sell}
                        onChange={(e) => change(i.id, { visible: !e.target.checked })}
                        aria-label={`Hide ${i.name} for now`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  )
}

/**
 * A category as typed: the café's key when it matches one of the café's
 * categories by label or key, otherwise the name as typed.
 */
function categoryFromInput(text, categories) {
  const t = String(text ?? '').trim()
  if (!t) return 'other'
  const lower = t.toLowerCase()
  const hit = (categories ?? []).find((c) => c.label.toLowerCase() === lower || c.key.toLowerCase() === lower)
  return hit ? hit.key : t
}

/** Items the partner makes itself — the café supplies nothing for them, so the whole price is the partner's. */
function OwnItemsCard({ partnerId, data, canManage, onChanged }) {
  const money = useMoney()
  const partnerName = data.partner.name
  const ownItems = data.ownItems ?? []
  // itemId → { name, category, price, visible } as typed.
  const [edits, setEdits] = useState({})
  const [adding, setAdding] = useState({ name: '', category: '', price: '' })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const listId = `partner-cats-${partnerId}`

  useEffect(() => {
    const next = {}
    for (const i of ownItems) {
      next[i.id] = { name: i.name, category: categoryLabel(i.category, data.categories), price: String(i.price), visible: i.visible }
    }
    setEdits(next)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  function edit(itemId, patch) {
    setEdits((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
  }

  function isDirty(item) {
    const e = edits[item.id]
    if (!e) return false
    return e.name.trim() !== item.name
      || categoryFromInput(e.category, data.categories) !== item.category
      || Number(e.price) !== item.price
      || e.visible !== item.visible
  }

  async function run(key, fn) {
    setError('')
    setBusy(key)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  function add(e) {
    e.preventDefault()
    void run('add', async () => {
      await api.createPartnerItem(partnerId, {
        name: adding.name,
        category: categoryFromInput(adding.category, data.categories),
        price: adding.price,
      })
      setAdding({ name: '', category: adding.category, price: '' })
    })
  }

  function save(item) {
    const e = edits[item.id]
    void run(item.id, () => api.updatePartnerItem(partnerId, item.id, {
      name: e.name,
      category: categoryFromInput(e.category, data.categories),
      price: e.price,
      visible: e.visible,
    }))
  }

  function remove(item) {
    if (!window.confirm(`Remove "${item.name}" from ${partnerName}'s items? Sales already made keep it.`)) return
    void run(item.id, () => api.deletePartnerItem(partnerId, item.id))
  }

  return (
    <section className="card partner-prices-group partner-own-items">
      <div className="partner-own-head">
        <h3 className="sub">{partnerName}’s own items</h3>
        <p className="muted small">
          Food {partnerName} makes itself. The café supplies nothing for these, so {partnerName} keeps the whole price.
        </p>
      </div>
      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <datalist id={listId}>
        {(data.categories ?? []).map((c) => <option key={c.key} value={c.label} />)}
      </datalist>

      {ownItems.length ? (
        <table className="partner-prices-table partner-own-table table-cards">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="num">Price</th>
              <th>Hidden</th>
              {canManage ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {ownItems.map((item) => {
              const e = edits[item.id] ?? { name: item.name, category: item.category, price: String(item.price), visible: item.visible }
              return (
                <tr key={item.id} className="is-on">
                  <td data-label="Item" className="cell-card-field">
                    <input value={e.name} disabled={!canManage} maxLength={120} onChange={(ev) => edit(item.id, { name: ev.target.value })} aria-label="Item name" />
                  </td>
                  <td data-label="Category" className="cell-card-field">
                    <input value={e.category} disabled={!canManage} maxLength={60} list={listId} onChange={(ev) => edit(item.id, { category: ev.target.value })} aria-label={`Category of ${item.name}`} />
                  </td>
                  <td data-label="Price" className={`num${canManage ? ' cell-card-field' : ''}`}>
                    {canManage ? (
                      <input type="number" min={0} step={1} inputMode="decimal" value={e.price} onChange={(ev) => edit(item.id, { price: ev.target.value })} aria-label={`Price of ${item.name}`} />
                    ) : money(item.price)}
                  </td>
                  <td data-label="Hidden">
                    <input type="checkbox" checked={!e.visible} disabled={!canManage} onChange={(ev) => edit(item.id, { visible: !ev.target.checked })} aria-label={`Hide ${item.name} for now`} />
                  </td>
                  {canManage ? (
                    <td className="partner-own-actions cell-card-action">
                      <button type="button" className="primary sm" disabled={!isDirty(item) || busy === item.id} onClick={() => save(item)}>Save</button>
                      <button type="button" className="ghost danger sm" disabled={busy === item.id} onClick={() => remove(item)}>Remove</button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted small">None yet.</p>
      )}

      {canManage ? (
        <form className="partner-own-add" onSubmit={add}>
          <label className="field">
            <span>New item</span>
            <input value={adding.name} maxLength={120} placeholder="e.g. Chicken Karahi" onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} required />
          </label>
          <label className="field">
            <span>Category</span>
            <input value={adding.category} maxLength={60} list={listId} placeholder="Pick or type one" onChange={(e) => setAdding((a) => ({ ...a, category: e.target.value }))} />
          </label>
          <label className="field">
            <span>Price</span>
            <input type="number" min={0} step={1} inputMode="decimal" value={adding.price} placeholder="0" onChange={(e) => setAdding((a) => ({ ...a, price: e.target.value }))} required />
          </label>
          <button type="submit" className="primary" disabled={busy === 'add' || !adding.name.trim() || adding.price === ''}>
            {busy === 'add' ? 'Adding…' : '＋ Add item'}
          </button>
        </form>
      ) : null}
    </section>
  )
}
