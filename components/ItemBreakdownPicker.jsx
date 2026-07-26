'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Searchable item picker for the top-sellers breakdown. Each row previews how
 * the item sold (alone vs inside deals) so a choice can be made from the list.
 */
export default function ItemBreakdownPicker({ items, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const searchRef = useRef(null)

  const selected = items.find((i) => i.refId === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.label.toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => { setHighlight(0) }, [query])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  useEffect(() => {
    if (open) queueMicrotask(() => searchRef.current?.focus())
    else setQuery('')
  }, [open])

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function pick(item) {
    onChange(item.refId)
    setOpen(false)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!filtered.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(filtered[highlight])
    }
  }

  return (
    <div className="item-picker" ref={wrapRef}>
      <button
        type="button"
        className={`item-picker-trigger${selected ? ' has-value' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="item-picker-trigger-label">
          {selected ? selected.label : 'Choose an item…'}
        </span>
        {selected ? (
          <span className="item-picker-trigger-count">{selected.totalQty}</span>
        ) : null}
        <span className="item-picker-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {selected ? (
        <button
          type="button"
          className="item-picker-clear"
          onClick={() => onChange('')}
          aria-label="Clear selected item"
        >
          ✕
        </button>
      ) : null}

      {open ? (
        <div className="item-picker-pop">
          <input
            ref={searchRef}
            type="search"
            className="item-picker-search"
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search items"
          />
          {filtered.length === 0 ? (
            <p className="muted small item-picker-empty">No item matches “{query}”.</p>
          ) : (
            <ul className="item-picker-list" role="listbox" ref={listRef}>
              {filtered.map((item, i) => (
                <li
                  key={item.refId}
                  role="option"
                  aria-selected={item.refId === value}
                  className={`item-picker-option${i === highlight ? ' active' : ''}${item.refId === value ? ' selected' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                >
                  <span className="item-picker-option-name">{item.label}</span>
                  <span className="item-picker-option-meta">
                    <span className="item-picker-chip">{item.standaloneQty} alone</span>
                    <span className="item-picker-chip">{item.inDealQty} in deals</span>
                    <span className="item-picker-chip item-picker-chip-total">{item.totalQty} total</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
