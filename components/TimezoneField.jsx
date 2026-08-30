'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  TIMEZONES, TIMEZONE_REGIONS, currentTimeIn, parseTimezone, timezoneInfo,
} from '@/constants/timezones.js'
import { formatHour } from '@/lib/tradingDay.js'

/**
 * Where a café is, which is what decides when its day ends.
 *
 * The companion to `CurrencyField` and deliberately shaped like it, because
 * the two are set together on the same forms. What it is *not* is derivable
 * from the currency the way the locale is: `en-US` spans six zones, so a
 * dollar café could be in New York or Los Angeles and nothing about the money
 * says which. See `constants/timezones.js`.
 *
 * The card shows the live local time rather than a UTC offset. An offset is a
 * number somebody has to convert in their head, and it is wrong for half the
 * year in any zone that observes daylight saving; the clock is the thing a
 * person can check against their own knowledge of where their café is.
 *
 * `shiftStartHour` is optional. When the caller knows the café's trading-day
 * boundary — the console does, sitting next to the hour selects — the preview
 * says when the day currently rolls over, because that is the consequence of
 * this field and the reason it is being set at all.
 *
 * `fieldClass` exists for the same reason it does on `CurrencyField`: the
 * café's screens style a field as `.field` and the console styles it as
 * `.pf-field`, and this renders inside both.
 */
export default function TimezoneField({
  timezone,
  onTimezoneChange,
  shiftStartHour = null,
  disabled = false,
  fieldClass = 'field',
  label = 'Timezone',
}) {
  const [query, setQuery] = useState('')
  // Ticks the clocks. A minute is the resolution being displayed, so anything
  // faster is work nobody can see. Cleared on unmount so a closed form is not
  // still re-rendering in the background.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const selected = parseTimezone(timezone)

  const needle = query.trim().toLowerCase()
  const shown = useMemo(() => {
    if (!needle) return TIMEZONES
    return TIMEZONES.filter((z) =>
      z.city.toLowerCase().includes(needle) ||
      z.region.toLowerCase().includes(needle) ||
      z.id.toLowerCase().replace(/_/g, ' ').includes(needle))
  }, [needle])

  const regions = TIMEZONE_REGIONS.filter((r) => shown.some((z) => z.region === r))

  // The zone the person is sitting in, offered as a shortcut. Setting up a
  // café from its own counter is the common case, and it saves scrolling to
  // the city you are already in.
  const localZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return null }
  }, [])
  const offerLocal = localZone && localZone !== selected

  const chosen = timezoneInfo(selected)

  return (
    <div className={`${fieldClass} timezone-field`}>
      <div className="currency-field-head">
        <span>{label}</span>
        <input
          type="search"
          className="currency-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cities…"
          aria-label="Search timezones"
          disabled={disabled}
        />
      </div>

      {offerLocal ? (
        <button
          type="button"
          className="btn btn-sm timezone-use-local"
          onClick={() => onTimezoneChange(localZone)}
          disabled={disabled}
        >
          Use this device’s timezone ({timezoneInfo(localZone).city} · {currentTimeIn(localZone, now)})
        </button>
      ) : null}

      <div className="timezone-groups" role="radiogroup" aria-label={label}>
        {regions.map((region) => (
          <div key={region} className="timezone-group">
            <p className="timezone-group-title muted small">{region}</p>
            <div className="timezone-grid">
              {shown.filter((z) => z.region === region).map((z) => (
                <label
                  key={z.id}
                  className={`timezone-option${selected === z.id ? ' timezone-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="timezone"
                    value={z.id}
                    checked={selected === z.id}
                    disabled={disabled}
                    onChange={() => onTimezoneChange(z.id)}
                  />
                  <span className="timezone-option-body">
                    <strong className="timezone-option-city">{z.city}</strong>
                    <span className="timezone-option-id">{z.id}</span>
                  </span>
                  <span className="timezone-option-clock">{currentTimeIn(z.id, now)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 ? (
          <p className="muted small currency-empty">
            No city matches “{query.trim()}”. The list is deliberately short — ask for one to be
            added if a café needs it.
          </p>
        ) : null}
      </div>

      <div className="locale-preview" aria-live="polite">
        <span className="muted small">This café’s clock</span>
        <div className="locale-preview-row">
          <strong>{currentTimeIn(selected, now)}</strong>
          <span className="muted">·</span>
          <span className="muted small">{chosen.city} ({selected})</span>
        </div>
        <span className="muted small currency-locale-note">
          {shiftStartHour == null
            ? 'Decides which trading day a sale counts towards, and when order numbers start again.'
            : `Its trading day rolls over at ${formatHour(shiftStartHour)} ${chosen.city} time — that is when a sale starts counting towards the next day and order numbers restart at 1.`}
        </span>
      </div>
    </div>
  )
}
