'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api.js'
import { useMoney } from '@/context/BrandingContext.jsx'
import { useOrders } from '@/context/OrdersContext.jsx'
import { formatShortDateTime } from '@/utils/formatting.js'
import { useLocale } from '@/context/BrandingContext.jsx'

/**
 * Counting the drawer and closing the day.
 *
 * The screen is built around one number — the variance — and everything above
 * it exists to make that number trustworthy. The expected figure is shown
 * broken into the parts it is made of, because a manager who is short twenty
 * needs to see whether it is twenty of cash sales, a refund, or a payout
 * before they can do anything about it.
 *
 * The counted figure is deliberately entered before the expected one is
 * emphasised, and the variance appears only once something has been typed.
 * Showing "you should have £412.60" beside an empty box invites the number to
 * be copied into it, which is exactly the check this screen is supposed to be.
 */
export default function ShiftClose() {
  const money = useMoney()
  const locale = useLocale()
  // Queued offline sales have not reached the server, so they are not in the
  // report. Closing on top of them would file a variance against a day the
  // server has only seen part of.
  const { queuedCount, online, syncNow, syncing } = useOrders()

  const [shiftDate, setShiftDate] = useState(null)
  const [history, setHistory] = useState([])
  const [state, setState] = useState({ closed: false, close: null, report: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [countedCash, setCountedCash] = useState('')
  const [openingFloat, setOpeningFloat] = useState('')
  const [note, setNote] = useState('')

  const loadIndex = useCallback(async () => {
    const { today, closes } = await api.getShifts()
    setHistory(closes ?? [])
    return today
  }, [])

  const loadShift = useCallback(async (date) => {
    setLoading(true)
    setError('')
    try {
      setState(await api.getShift(date))
    } catch (e) {
      setError(e.message)
      setState({ closed: false, close: null, report: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const today = await loadIndex()
        if (cancelled) return
        setShiftDate(today)
        await loadShift(today)
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [loadIndex, loadShift])

  async function close(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await api.closeShift(shiftDate, {
        countedCash,
        openingFloat: openingFloat === '' ? 0 : openingFloat,
        note,
      })
      setState({ closed: true, close: res.close, report: res.report })
      setCountedCash(''); setOpeningFloat(''); setNote('')
      await loadIndex()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="muted">Adding up the day…</p>

  const report = state.report
  const closed = state.closed
  // Live preview of the variance as the manager types, from the same
  // arithmetic the server will run — the figure on screen is the figure that
  // gets recorded.
  const typed = countedCash === '' ? null : Number(countedCash)
  const previewExpected = report
    ? round(report.expectedCash - report.openingFloat + (openingFloat === '' ? 0 : Number(openingFloat) || 0))
    : 0
  const previewVariance = typed == null || !Number.isFinite(typed) ? null : round(typed - previewExpected)

  return (
    <div className="shift-close">
      {error ? <p className="banner-error">{error}</p> : null}

      {queuedCount > 0 ? (
        <div className="banner-warn shift-close-queued">
          <strong>{queuedCount} sale{queuedCount > 1 ? 's' : ''} still on this device.</strong>{' '}
          They were rung up offline and have not reached the server, so they are not in the figures
          below. Send them before closing, or the day will be counted short by their value.
          {online ? (
            <button type="button" className="btn btn-sm" onClick={syncNow} disabled={syncing}>
              {syncing ? 'Sending…' : 'Send now'}
            </button>
          ) : null}
        </div>
      ) : null}

      <header className="shift-close-head">
        <div>
          <p className="muted small">Trading day</p>
          <h2>{shiftDate}</h2>
        </div>
        {closed ? (
          <span className="badge-closed">Closed</span>
        ) : (
          <span className="badge-open">Open</span>
        )}
      </header>

      {report ? <ZReportBody report={report} money={money} /> : null}

      {closed && state.close ? (
        <section className="pf-card shift-close-signed">
          <h3>Signed off</h3>
          <p className="muted small">
            Closed {formatShortDateTime(new Date(state.close.closedAt), { locale })}
            {state.close.closedByEmail ? ` by ${state.close.closedByEmail}` : ''}.
          </p>
          <dl className="shift-figures">
            <Figure label="Expected in the drawer" value={money(state.close.expectedCash)} />
            <Figure label="Counted" value={money(state.close.countedCash)} />
            <Figure
              label="Variance"
              value={money(state.close.variance)}
              tone={state.close.variance === 0 ? 'ok' : state.close.variance > 0 ? 'over' : 'short'}
            />
          </dl>
          {state.close.note ? <p className="pf-quoted">{state.close.note}</p> : null}
          <p className="muted small">
            These figures are the ones recorded on the night and do not change afterwards, even if
            an invoice from this day is later edited or refunded.
          </p>
        </section>
      ) : (
        <form className="pf-card pf-form shift-close-form" onSubmit={close}>
          <h3>Count the drawer</h3>
          <p>
            What is physically in the till, counted by hand. The system’s own figure is above; the
            point of writing this one down separately is that the two were arrived at independently.
          </p>

          <div className="pf-row">
            <label className="pf-field">
              <span>Opening float</span>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                placeholder="0.00"
                disabled={saving}
              />
              <span className="pf-hint">What the drawer started the day with. Not takings.</span>
            </label>

            <label className="pf-field">
              <span>Counted cash</span>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0.00"
                required
                disabled={saving}
              />
              <span className="pf-hint">Everything in the drawer, float included.</span>
            </label>
          </div>

          {previewVariance != null ? (
            <p className={`shift-variance shift-variance--${previewVariance === 0 ? 'ok' : previewVariance > 0 ? 'over' : 'short'}`}>
              {previewVariance === 0
                ? 'The drawer balances.'
                : `The drawer is ${money(Math.abs(previewVariance))} ${previewVariance > 0 ? 'over' : 'short'}.`}
            </p>
          ) : null}

          <label className="pf-field">
            <span>Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="New starter on the till"
              maxLength={300}
              disabled={saving}
            />
            <span className="pf-hint">
              Usually the only thing that explains a variance. Worth a line even when it balances.
            </span>
          </label>

          <div className="pf-actions">
            <button type="submit" className="primary" disabled={saving || countedCash === ''}>
              {saving ? 'Closing…' : 'Close the day'}
            </button>
            <span className="pf-hint">A day is closed once, and these figures are then fixed.</span>
          </div>
        </form>
      )}

      {history.length ? (
        <section className="pf-card">
          <h3>Earlier days</h3>
          <table className="shift-history table-cards">
            <thead>
              <tr><th>Day</th><th>Expected</th><th>Counted</th><th>Variance</th></tr>
            </thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id}>
                  <td className="cell-card-title">
                    <button type="button" className="linklike" onClick={() => { setShiftDate(c.shiftDate); void loadShift(c.shiftDate) }}>
                      {c.shiftDate}
                    </button>
                  </td>
                  <td data-label="Expected">{money(c.expectedCash)}</td>
                  <td data-label="Counted">{money(c.countedCash)}</td>
                  <td data-label="Variance" className={`shift-variance-cell shift-variance--${c.variance === 0 ? 'ok' : c.variance > 0 ? 'over' : 'short'}`}>
                    {c.variance === 0 ? '—' : money(c.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  )
}

/** The takings, in the order somebody reconciling reads them. */
function ZReportBody({ report, money }) {
  return (
    <section className="pf-card shift-z">
      <h3>What the till took</h3>

      <dl className="shift-figures">
        <Figure label="Sales" value={money(report.grossSales)} sub={`${report.saleCount} invoice${report.saleCount === 1 ? '' : 's'}`} />
        <Figure label="Net of tax" value={money(report.netSales)} />
        <Figure label="Tax collected" value={money(report.taxCollected)} />
      </dl>

      {report.taxByRate?.length ? (
        <ul className="shift-tax-rates">
          {report.taxByRate.map((t) => (
            <li key={t.id ?? t.name}>
              <span>{t.name} ({t.rate}%)</span>
              <strong>{money(t.amount)}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      <h4>How it was paid</h4>
      <ul className="shift-methods">
        {report.byMethod.map((m) => (
          <li key={m.method}>
            <span>{m.method === 'cash' ? '💵 Cash' : '💳 Card / online'}</span>
            <span className="muted small">{m.count}</span>
            <strong>{money(m.total)}</strong>
          </li>
        ))}
        {report.unpaidCount > 0 ? (
          <li className="shift-unpaid">
            <span>Unpaid</span>
            <span className="muted small">{report.unpaidCount}</span>
            <strong>{money(report.unpaidTotal)}</strong>
          </li>
        ) : null}
      </ul>

      {report.refundCount > 0 || report.discountsGiven > 0 || report.deliveryCharges > 0 ? (
        <dl className="shift-figures shift-figures--minor">
          {report.refundCount > 0 ? <Figure label="Refunded" value={money(report.refundTotal)} sub={`${report.refundCount}`} /> : null}
          {report.discountsGiven > 0 ? <Figure label="Discounts given" value={money(report.discountsGiven)} /> : null}
          {report.deliveryCharges > 0 ? <Figure label="Delivery charges" value={money(report.deliveryCharges)} /> : null}
        </dl>
      ) : null}

      {/* The drawer arithmetic, spelled out. A manager who is short needs to
          see which part of it moved, not just the total. */}
      <h4>What should be in the drawer</h4>
      <ul className="shift-drawer">
        <li><span>Opening float</span><strong>{money(report.openingFloat)}</strong></li>
        <li><span>Cash taken</span><strong>+ {money(report.cashTaken)}</strong></li>
        {report.cashRefunds > 0 ? <li><span>Cash refunded</span><strong>− {money(report.cashRefunds)}</strong></li> : null}
        {report.cashPaidOut > 0 ? <li><span>Paid out of the drawer</span><strong>− {money(report.cashPaidOut)}</strong></li> : null}
        <li className="shift-drawer-total"><span>Expected</span><strong>{money(report.expectedCash)}</strong></li>
      </ul>
    </section>
  )
}

function Figure({ label, value, sub, tone }) {
  return (
    <div className={`shift-figure${tone ? ` shift-variance--${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>{value}{sub ? <span className="muted small"> · {sub}</span> : null}</dd>
    </div>
  )
}

function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
