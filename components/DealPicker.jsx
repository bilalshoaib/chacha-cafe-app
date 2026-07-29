'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '@/utils/formatting.js'

/**
 * Matches a deal against one search term. A term can be part of the deal's
 * name, its price ("1000" or "1,000"), or the name of any item inside it —
 * so staff can find a bundle by whatever they happen to remember about it.
 */
function dealMatches(deal, needle, itemLabelById) {
  if (deal.name?.toLowerCase().includes(needle)) return true

  const digits = needle.replace(/[^0-9.]/g, '')
  if (digits && String(deal.price).includes(digits)) return true
  if (formatMoney(deal.price).toLowerCase().includes(needle)) return true

  return (deal.includes || []).some((inc) =>
    String(itemLabelById[inc.itemId] || inc.itemId || '').toLowerCase().includes(needle),
  )
}

export default function DealPicker({ deals, itemLabelById, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Start each visit to the list from a clean slate, ready to type.
  useEffect(() => {
    if (!open) { setQuery(''); return }
    queueMicrotask(() => searchRef.current?.focus())
  }, [open])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return deals
    // Every whitespace-separated term must match, so "zinger 1000" narrows.
    const terms = needle.split(/\s+/)
    return deals.filter((d) => terms.every((t) => dealMatches(d, t, itemLabelById)))
  }, [deals, query, itemLabelById])

  function pick(deal) {
    onSelect(deal.id)
    setOpen(false)
  }

  return (
    <div className="deal-picker" ref={wrapRef}>
      <button
        type="button"
        className="deal-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Add a deal bundle to this order"
      >
        <span className="deal-picker-trigger-icon" aria-hidden="true">🎁</span>
        <span className="deal-picker-trigger-label">Choose a deal…</span>
        <span className="deal-picker-trigger-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="deal-picker-panel">
          <input
            ref={searchRef}
            type="search"
            className="deal-picker-search"
            placeholder="Search by name, price, or item inside…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // One match left? Enter picks it, so search-then-Enter works.
              if (e.key === 'Enter' && filtered.length === 1) {
                e.preventDefault()
                pick(filtered[0])
              }
            }}
            aria-label="Search deals"
          />
          {filtered.length === 0 ? (
            <p className="deal-picker-empty muted small">No deals match “{query.trim()}”.</p>
          ) : (
            <ul className="deal-picker-list" role="listbox">
              {filtered.map((d) => {
                const includes = d.includes || []
                return (
                  <li key={d.id} role="option" aria-selected={false}>
                    <button type="button" className="deal-picker-item" onClick={() => pick(d)}>
                      <div className="deal-picker-item-row">
                        <span className="deal-picker-item-name">{d.name}</span>
                        <span className="deal-picker-item-price">{formatMoney(d.price)}</span>
                      </div>
                      {includes.length > 0 ? (
                        <ul className="deal-picker-item-includes">
                          {includes.map((inc, i) => (
                            <li key={i}>
                              <span className="deal-picker-item-qty">{inc.qty}×</span>
                              {itemLabelById[inc.itemId] || inc.itemId}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
