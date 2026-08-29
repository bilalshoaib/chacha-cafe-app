'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { categoryLabel, formatItemExtras } from '@/utils/formatting.js'
import { useMoney } from '@/context/BrandingContext.jsx'

/**
 * Ranks a match, lowest first — a plain `includes` filter left the wanted item
 * buried under earlier menu rows, so "type two letters and press Enter" landed
 * on the wrong line. Returns -1 for no match.
 */
function matchScore(item, q) {
  const name = item.name.toLowerCase()
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  const words = name.split(/\s+/).filter(Boolean)
  if (words.some((w) => w.startsWith(q))) return 2
  // Initials, so "cb" finds "Chicken Burger".
  if (words.length > 1 && words.map((w) => w[0]).join('').startsWith(q)) return 3
  if (name.includes(q)) return 4
  const extras = [item.category, item.size, item.flavour]
  if (extras.some((x) => x && String(x).toLowerCase().includes(q))) return 5
  return -1
}

export default function ItemAutocomplete({
  items,
  searchValue,
  onSearchChange,
  onSelectItem,
  onPicked,
  onRequestNextField,
  disabled,
  inputRef,
}) {
  const money = useMoney()
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [listPos, setListPos] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    if (!q) return items.slice(0, 40)
    return items
      .map((item) => ({ item, score: matchScore(item, q) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
      .slice(0, 40)
      .map((x) => x.item)
  }, [items, searchValue])

  useEffect(() => {
    setHighlight(0)
  }, [searchValue])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  useLayoutEffect(() => {
    if (!open) {
      setListPos(null)
      return
    }
    function updatePosition() {
      const input = inputRef?.current
      if (!input) return
      const r = input.getBoundingClientRect()
      const margin = 8
      const vw = window.innerWidth
      const vh = window.innerHeight

      // The list used to be exactly as wide as the input, which is fine on a
      // desktop and useless on a phone: the input sits in the Item column of a
      // table that scrolls sideways, so at 414px it is squeezed to a couple of
      // characters and every result wrapped to one word per line. The list is
      // its own element on top of the page, so it can be wider than the thing
      // it belongs to — never narrower than is readable, never wider than the
      // screen.
      const width = Math.max(r.width, Math.min(280, vw - margin * 2))
      const left = Math.min(Math.max(margin, r.left), Math.max(margin, vw - margin - width))

      // Flip above the input when there is no room below it. On a phone the
      // keyboard takes the bottom half of the screen the moment this opens,
      // which is exactly when the results would otherwise be off-screen.
      const below = vh - r.bottom - margin
      const above = r.top - margin
      const flip = below < 160 && above > below
      const maxHeight = Math.max(120, Math.min(240, flip ? above - 4 : below))

      setListPos({
        left,
        width,
        maxHeight,
        ...(flip ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, searchValue, filtered.length, inputRef])

  useEffect(() => {
    function docClick(e) {
      const t = e.target
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', docClick)
    return () => document.removeEventListener('mousedown', docClick)
  }, [])

  function pick(item) {
    onSelectItem(item)
    onSearchChange(item.name)
    setOpen(false)
    queueMicrotask(() => onPicked?.())
  }

  return (
    <div className="item-autocomplete" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        value={searchValue}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          onSearchChange(v)
          onSelectItem(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key === 'Enter') {
            if (open && filtered.length > 0) {
              e.preventDefault()
              pick(filtered[highlight])
            } else if (open && !filtered.length && searchValue.trim() && onRequestNextField) {
              e.preventDefault()
              setOpen(false)
              onRequestNextField()
            } else if (!open && onRequestNextField) {
              e.preventDefault()
              onRequestNextField()
            }
            return
          }
          if (!filtered.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setHighlight((h) => Math.min(h + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          }
        }}
        placeholder="Type to search items…"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {mounted && open && (filtered.length > 0 || searchValue.trim()) && listPos
        ? createPortal(
            <ul
              ref={listRef}
              className="item-autocomplete-list"
              role="listbox"
              style={{
                position: 'fixed',
                // One of the two, never both — which it is depends on whether
                // the list opens downwards or flips above the input.
                ...(listPos.top != null ? { top: listPos.top } : { bottom: listPos.bottom }),
                left: listPos.left,
                width: listPos.width,
                maxHeight: listPos.maxHeight,
                zIndex: 2000,
              }}
            >
              {filtered.map((item, i) => {
                const extras = formatItemExtras(item)
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={i === highlight}
                    className={i === highlight ? 'active' : ''}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(item)}
                  >
                    <div className="ac-name">{item.name}</div>
                    <div className="muted small ac-meta">
                      {extras ? `${extras} · ` : ''}
                      {categoryLabel(item.category)} · {money(item.price)}
                    </div>
                  </li>
                )
              })}
              {searchValue.trim() && filtered.length === 0 ? (
                <li className="item-autocomplete-hint" role="presentation">
                  <span className="muted small">
                    No menu match. Choose <strong>category</strong>, enter <strong>unit price</strong> in{' '}
                    <strong>Each</strong>, set <strong>Qty</strong>, then <strong>Add line</strong> — it will
                    be saved to the menu.
                  </span>
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
