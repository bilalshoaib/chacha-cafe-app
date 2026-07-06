'use client'
import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '@/utils/formatting.js'

export default function DealPicker({ deals, itemLabelById, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

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
        <ul className="deal-picker-list" role="listbox">
          {deals.map((d) => {
            const includesLabel = (d.includes || [])
              .map((inc) => `${inc.qty}× ${itemLabelById[inc.itemId] || inc.itemId}`)
              .join(' · ')
            return (
              <li key={d.id} role="option" aria-selected={false}>
                <button type="button" className="deal-picker-item" onClick={() => pick(d)}>
                  <div className="deal-picker-item-row">
                    <span className="deal-picker-item-name">{d.name}</span>
                    <span className="deal-picker-item-price">{formatMoney(d.price)}</span>
                  </div>
                  {includesLabel ? <div className="deal-picker-item-includes">{includesLabel}</div> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
