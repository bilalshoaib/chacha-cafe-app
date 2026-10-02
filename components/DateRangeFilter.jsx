'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  tradingDayRange,
  tradingDayShortLabel,
  currentTradingDay,
} from '@/lib/tradingDay.js'

/**
 * The date range picker the reports screen opened with: the range said in
 * words, day and month arrows, the presets and a custom range. It lives here
 * rather than inside ReportsWorkbench so the expenses list can offer the same
 * one — two pickers that drift apart are two sets of dates to explain.
 *
 * `useDateRange` holds the state; `DateRangeFilter` draws it. The page keeps
 * the card around it and decides what to fetch with `fromIso` and `toIso`.
 */

function toISOStart(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

function toISOEnd(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }

/** As a "HH:MM" value for the custom range's <input type="time"> fields. */
const timeInputValue = (hour) => `${String(hour).padStart(2, '0')}:00`

/**
 * The presets, built for one café's trading day.
 *
 * A function rather than a constant, which is the whole point of this change:
 * "Today" used to mean 6 PM to 5 PM for everybody, because those two hours
 * were written into this file. They now come from the café being reported on,
 * so a breakfast place reads its own morning and the button says so.
 *
 * `allTime` adds an open-ended preset with no dates at all. The expenses list
 * wants it; a sales report over every invoice ever written does not.
 */
function presetsFor(hours, { allTime = false } = {}) {
  const dayLabel = tradingDayShortLabel(hours)
  return [
    { id: 'last_day', label: `Last day (${dayLabel})`, range: () => tradingDayRange(-1, hours) },
    { id: 'today', label: `Today (${dayLabel})`, range: () => tradingDayRange(0, hours) },
    { id: '7d', label: 'Last 7 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 6); return [toISOStart(start), toISOEnd(end)] } },
    { id: '30d', label: 'Last 30 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return [toISOStart(start), toISOEnd(end)] } },
    { id: 'this_month', label: 'This month', range: () => { const n = new Date(); return [toISOStart(startOfMonth(n)), toISOEnd(n)] } },
    { id: 'last_month', label: 'Last month', range: () => { const n = new Date(); const first = startOfMonth(new Date(n.getFullYear(), n.getMonth() - 1, 1)); const last = endOfMonth(first); return [toISOStart(first), toISOEnd(last)] } },
    { id: 'this_year', label: 'This year', range: () => { const n = new Date(); const start = new Date(n.getFullYear(), 0, 1); return [toISOStart(start), toISOEnd(n)] } },
    ...(allTime ? [{ id: 'all', label: 'All time', range: () => ['', ''] }] : []),
  ]
}

function dateInputValue(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** A Date's wall-clock time as the "HH:MM" an <input type="time"> wants. */
function clockValue(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseDateInput(s) {
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/**
 * Moves a "YYYY-MM-DD" value by whole months, keeping the day of the month.
 *
 * The day is clamped to the target month's length so stepping back from the
 * 31st lands on the 28th/30th rather than rolling over into the next month,
 * which is what plain `setMonth` would do.
 */
function shiftMonths(dateStr, delta) {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr
  const targetMonthStart = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  const daysInTarget = endOfMonth(targetMonthStart).getDate()
  targetMonthStart.setDate(Math.min(d.getDate(), daysInTarget))
  return dateInputValue(targetMonthStart)
}

/**
 * Moves a "YYYY-MM-DD" value by whole days. Month and year ends look after
 * themselves — Date does the carrying.
 */
function shiftDays(dateStr, delta) {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr
  d.setDate(d.getDate() + delta)
  return dateInputValue(d)
}

// Build an ISO string from a date string ("YYYY-MM-DD") + time string ("HH:MM").
function buildISO(dateStr, timeStr) {
  const d = parseDateInput(dateStr)
  if (!d) return null
  const [h, m] = (timeStr || '00:00').split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toISOString()
}

/**
 * Default custom range: the business month *currently running*. It covers the
 * business days that open on the 6th through the 5th, and since the business
 * day opening on the 5th does not close until 5 PM on the 6th, the range ends
 * on the 6th — e.g. 6 Aug 6 PM → 6 Sep 5 PM. Ending it on the 5th would drop
 * the cycle's last night of trade.
 *
 * The cycle turns over when the café's day opens on the 6th, not at midnight,
 * so the anchor is the business day in progress rather than the calendar date.
 * Without that, the hours of the 6th before opening would default to a range
 * that has not started yet and the report would read zero.
 */
function defaultBusinessMonth(hours, now = new Date()) {
  const anchor = currentTradingDay(hours, now)
  const anchorMonth = anchor.getDate() >= 6 ? anchor.getMonth() : anchor.getMonth() - 1
  // Month -1 / +1 roll across the year boundary on their own.
  const from = new Date(anchor.getFullYear(), anchorMonth, 6)
  const to = new Date(anchor.getFullYear(), anchorMonth + 1, 6)
  return [dateInputValue(from), dateInputValue(to)]
}

/**
 * The range state. `hours` is the café's trading day (from `tradingDay()`),
 * and `formatDateTime` is how the page prints a date — passed in because the
 * console prints a café's dates in that café's locale, not its own.
 *
 * `fromIso` and `toIso` start empty and fill on the first effect, so the
 * server render and the browser's agree. `ready` says when they have — or
 * when "All time" was picked, where empty is the answer rather than a gap.
 */
export function useDateRange({ hours, formatDateTime, initialPreset = 'today', allTime = false }) {
  const presets = useMemo(() => presetsFor(hours, { allTime }), [hours, allTime])
  const [presetId, setPresetId] = useState(initialPreset)
  // Custom defaults to the trading day's boundaries, not midnight — a range
  // that started at 00:00 cut the previous evening's shift in half and counted
  // the tail of it against the wrong day.
  const [customFrom, setCustomFrom] = useState(() => defaultBusinessMonth(hours)[0])
  const [customFromTime, setCustomFromTime] = useState(timeInputValue(hours.startHour))
  const [customTo, setCustomTo] = useState(() => defaultBusinessMonth(hours)[1])
  const [customToTime, setCustomToTime] = useState(timeInputValue(hours.endHour))
  const [fromIso, setFromIso] = useState('')
  const [toIso, setToIso] = useState('')

  /**
   * Steps the whole range, both ends together, by a day or by a month — so a
   * range of 6 Aug → 5 Sep becomes 6 Jul → 5 Aug, and last night becomes the
   * night before. The times are left alone, which keeps a stepped range on the
   * café's own opening and closing hours.
   *
   * It works from a preset as well as from a custom range, and that is the
   * point of it. "Last day" answers what happened yesterday, and the next
   * question is nearly always the day before that; before this, answering it
   * meant finding the Custom button and typing two dates. Pressing an arrow on
   * a preset converts the range that preset produced into a custom one and
   * steps that, so the arrows walk backwards from wherever you already are.
   *
   * The converted range lands on the minute, because that is the resolution
   * the custom range's time inputs work in — a preset that ran to the last
   * millisecond of the day now ends at 23:59.
   */
  const stepRange = useCallback((unit, delta) => {
    const move = unit === 'month' ? shiftMonths : shiftDays

    if (presetId === 'custom') {
      setCustomFrom((f) => move(f, delta))
      setCustomTo((t) => move(t, delta))
      return
    }

    if (!fromIso || !toIso) return
    const from = new Date(fromIso)
    const to = new Date(toIso)
    setCustomFrom(move(dateInputValue(from), delta))
    setCustomFromTime(clockValue(from))
    setCustomTo(move(dateInputValue(to), delta))
    setCustomToTime(clockValue(to))
    setPresetId('custom')
  }, [presetId, fromIso, toIso])

  /** Opens Custom on the running business month, unless it is already open. */
  const openCustom = useCallback(() => {
    if (presetId !== 'custom') {
      const [f, t] = defaultBusinessMonth(hours)
      setCustomFrom(f); setCustomTo(t)
      setCustomFromTime(timeInputValue(hours.startHour))
      setCustomToTime(timeInputValue(hours.endHour))
    }
    setPresetId('custom')
  }, [presetId, hours])

  const applyPreset = useCallback((id) => {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    const [from, to] = p.range()
    setFromIso(from); setToIso(to)
  }, [presets])

  useEffect(() => {
    if (presetId === 'custom') {
      const from = buildISO(customFrom, customFromTime)
      const to = buildISO(customTo, customToTime)
      if (from && to) { setFromIso(from); setToIso(to) }
    } else { applyPreset(presetId) }
  }, [presetId, customFrom, customFromTime, customTo, customToTime, applyPreset])

  const isAllTime = presetId === 'all'
  const ready = isAllTime ? !fromIso && !toIso : Boolean(fromIso && toIso)

  const rangeLabel = useMemo(() => {
    if (isAllTime) return 'All time'
    if (!fromIso || !toIso) return ''
    try { return `${formatDateTime(new Date(fromIso))} → ${formatDateTime(new Date(toIso))}` }
    catch { return '' }
  }, [isAllTime, fromIso, toIso, formatDateTime])

  return {
    presets, presetId, setPresetId, openCustom, stepRange,
    customFrom, setCustomFrom, customFromTime, setCustomFromTime,
    customTo, setCustomTo, customToTime, setCustomToTime,
    fromIso, toIso, ready, isAllTime, rangeLabel,
  }
}

/** Draws a `useDateRange` result. Sits inside the page's own filter card. */
export default function DateRangeFilter({ range }) {
  const {
    presets, presetId, setPresetId, openCustom, stepRange,
    customFrom, setCustomFrom, customFromTime, setCustomFromTime,
    customTo, setCustomTo, customToTime, setCustomToTime,
    fromIso, toIso, isAllTime, rangeLabel,
  } = range

  return (
    <>
      {/* The range the page is actually showing, named at the top of the
          card rather than buried under the buttons. It used to sit below
          the presets, so the answer to "what am I looking at?" was the last
          thing on the card instead of the first. */}
      <div className="reports-range-head">
        <span className="reports-filter-label">Range</span>
        <span className="reports-range-line">
          {rangeLabel || (fromIso && toIso ? 'Loading range…' : '—')}
        </span>
        {/* Outside the custom block on purpose. These used to appear only
            once somebody had opened Custom, which is the one place a person
            looking at yesterday and wanting the day before would never
            think to go. All time has no ends to move, so they go quiet. */}
        <div className="reports-range-steppers">
          {[
            { unit: 'day', label: 'day' },
            { unit: 'month', label: 'month' },
          ].map(({ unit, label }) => (
            <div
              key={unit}
              className="reports-month-step"
              role="group"
              aria-label={`Shift the range by a ${unit}`}
            >
              <button
                type="button"
                className="month-step-btn"
                disabled={isAllTime}
                onClick={() => stepRange(unit, -1)}
                aria-label={`Shift the range back one ${unit}`}
              >
                <span className="month-step-chevron" aria-hidden="true">‹</span>
              </button>
              <span className="month-step-label" aria-hidden="true">{label}</span>
              <button
                type="button"
                className="month-step-btn"
                disabled={isAllTime}
                onClick={() => stepRange(unit, 1)}
                aria-label={`Shift the range forward one ${unit}`}
              >
                <span className="month-step-chevron" aria-hidden="true">›</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="reports-presets">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`reports-preset${presetId === p.id ? ' is-active' : ''}`}
            aria-pressed={presetId === p.id}
            onClick={() => setPresetId(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`reports-preset${presetId === 'custom' ? ' is-active' : ''}`}
          aria-pressed={presetId === 'custom'}
          onClick={openCustom}
        >
          Custom
        </button>
      </div>

      {presetId === 'custom' ? (
        <div className="reports-custom-dates">
          <label className="field reports-date-field">
            <span>From date</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label className="field reports-date-field reports-time-field">
            <span>Start time</span>
            <input type="time" value={customFromTime} onChange={(e) => e.target.value && setCustomFromTime(e.target.value)} />
          </label>
          <label className="field reports-date-field">
            <span>To date</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
          <label className="field reports-date-field reports-time-field">
            <span>End time</span>
            <input type="time" value={customToTime} onChange={(e) => e.target.value && setCustomToTime(e.target.value)} />
          </label>
        </div>
      ) : null}
    </>
  )
}
