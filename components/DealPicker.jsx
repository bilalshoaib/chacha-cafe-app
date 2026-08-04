'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '@/utils/formatting.js'
import { dealMatchesQuery } from '@/utils/dealSearch.js'

export default function DealPicker({ deals, itemLabelById, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

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
    setHighlight(0)
    queueMicrotask(() => searchRef.current?.focus())
  }, [open])

  const filtered = useMemo(
    () => deals.filter((d) => dealMatchesQuery(d, query, (id) => itemLabelById[id])),
    [deals, query, itemLabelById],
  )

  // Narrowing the list can strand the highlight past the end of it.
  useEffect(() => {
    setHighlight((h) => (h > filtered.length - 1 ? 0 : h))
  }, [filtered.length])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function pick(deal) {
    onSelect(deal.id)
    setOpen(false)
  }

  /** Arrow keys walk the list and Enter takes the highlighted deal, matching
   *  the item search so both pickers work the same way without the mouse. */
  function onSearchKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setHighlight(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setHighlight(Math.max(0, filtered.length - 1))
      return
    }
    if (e.key === 'Enter' && filtered[highlight]) {
      e.preventDefault()
      pick(filtered[highlight])
    }
  }

  return (
    <div className="deal-picker" ref={wrapRef}>
      <button
        type="button"
        className="deal-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
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
            onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
            onKeyDown={onSearchKeyDown}
            aria-label="Search deals"
            aria-autocomplete="list"
            aria-activedescendant={filtered[highlight] ? `deal-option-${filtered[highlight].id}` : undefined}
          />
          {filtered.length === 0 ? (
            <p className="deal-picker-empty muted small">No deals match “{query.trim()}”.</p>
          ) : (
            <ul className="deal-picker-list" role="listbox" ref={listRef}>
              {filtered.map((d, i) => {
                const includes = d.includes || []
                return (
                  <li key={d.id} id={`deal-option-${d.id}`} role="option" aria-selected={i === highlight}>
                    <button
                      type="button"
                      className={`deal-picker-item${i === highlight ? ' active' : ''}`}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(d)}
                    >
                      <div className="deal-picker-item-row">
                        <span className="deal-picker-item-name">{d.name}</span>
                        <span className="deal-picker-item-price">{formatMoney(d.price)}</span>
                      </div>
                      {includes.length > 0 ? (
                        <ul className="deal-picker-item-includes">
                          {includes.map((inc, idx) => (
                            <li key={idx}>
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
