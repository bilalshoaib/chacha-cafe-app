'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { categoryLabel, formatItemExtras, formatMoney } from '@/utils/formatting.js'

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
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [listPos, setListPos] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    let list = items
    if (q) {
      list = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.size && String(i.size).toLowerCase().includes(q)) ||
          (i.flavour && String(i.flavour).toLowerCase().includes(q)),
      )
    }
    return list.slice(0, 40)
  }, [items, searchValue])

  useEffect(() => {
    setHighlight(0)
  }, [searchValue])

  useLayoutEffect(() => {
    if (!open) {
      setListPos(null)
      return
    }
    function updatePosition() {
      const input = inputRef?.current
      if (!input) return
      const r = input.getBoundingClientRect()
      setListPos({ top: r.bottom + 4, left: r.left, width: r.width })
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
                top: listPos.top,
                left: listPos.left,
                width: listPos.width,
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
                      {categoryLabel(item.category)} · {formatMoney(item.price)}
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
