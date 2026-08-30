'use client'
import { useState } from 'react'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useMoney } from '@/context/BrandingContext.jsx'

/**
 * The tabs this café is currently holding open.
 *
 * A tab lives on the server, so this is the one part of the till that shows
 * work done on another device — the handheld that took table four's order, the
 * second register at the other end of the counter. That is the whole reason it
 * is a strip across the top rather than a page of its own: a server coming
 * back to the till needs to see what is open without going to look for it.
 *
 * Each card shows what is on the tab and what it comes to, because "Table 4"
 * on its own does not tell a cashier which of two parties is which.
 */
export default function TabStrip() {
  const money = useMoney()
  const {
    tabs, activeTab, tabSaving, online,
    startTab, openTabById, saveActiveTab, abandonTabById, refreshTabs,
  } = useOrders()

  const [naming, setNaming] = useState(false)
  const [label, setLabel] = useState('')
  const [confirmDrop, setConfirmDrop] = useState(null)

  async function create(e) {
    e.preventDefault()
    const tab = await startTab(label)
    if (tab) { setLabel(''); setNaming(false) }
  }

  if (!tabs.length && !naming && !activeTab) {
    return (
      <div className="tab-strip tab-strip--empty">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setNaming(true)}
          disabled={!online}
          title={online ? undefined : 'Tabs are held on the server, so they need a connection.'}
        >
          + Start a tab
        </button>
        <span className="muted small">
          Hold an order open for a table, and pick it up on any device.
        </span>
      </div>
    )
  }

  return (
    <div className="tab-strip">
      <div className="tab-strip-head">
        <strong className="tab-strip-title">Open tabs</strong>
        <button type="button" className="linklike" onClick={refreshTabs}>Refresh</button>
        {activeTab ? (
          <span className="tab-strip-active">
            Working on <strong>{activeTab.label}</strong>
            <button
              type="button"
              className="btn btn-sm"
              onClick={saveActiveTab}
              disabled={tabSaving || !online}
            >
              {tabSaving ? 'Saving…' : 'Save to tab'}
            </button>
          </span>
        ) : null}
      </div>

      <div className="tab-cards">
        {tabs.map((t) => (
          <div key={t.id} className={`tab-card${activeTab?.id === t.id ? ' tab-card--active' : ''}`}>
            <button type="button" className="tab-card-open" onClick={() => openTabById(t.id)}>
              <strong className="tab-card-label">{t.label}</strong>
              <span className="muted small">
                {t.lines.length
                  ? `${t.lines.length} line${t.lines.length === 1 ? '' : 's'} · ${money(t.lines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0))}`
                  : 'nothing on it yet'}
              </span>
            </button>
            {confirmDrop === t.id ? (
              <span className="tab-card-confirm">
                <button type="button" className="linklike danger" onClick={() => { setConfirmDrop(null); void abandonTabById(t.id) }}>
                  Drop it
                </button>
                <button type="button" className="linklike" onClick={() => setConfirmDrop(null)}>Keep</button>
              </span>
            ) : (
              <button
                type="button"
                className="tab-card-drop"
                onClick={() => setConfirmDrop(t.id)}
                aria-label={`Abandon ${t.label}`}
                title="Walked out, or opened by mistake"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {naming ? (
          <form className="tab-card tab-card--new" onSubmit={create}>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Table 4"
              maxLength={60}
              aria-label="Tab name"
            />
            <button type="submit" className="btn btn-sm primary">Start</button>
            <button type="button" className="linklike" onClick={() => { setNaming(false); setLabel('') }}>Cancel</button>
          </form>
        ) : (
          <button
            type="button"
            className="tab-card tab-card--add"
            onClick={() => setNaming(true)}
            disabled={!online}
            title={online ? undefined : 'Tabs are held on the server, so they need a connection.'}
          >
            + Start a tab
          </button>
        )}
      </div>
    </div>
  )
}
