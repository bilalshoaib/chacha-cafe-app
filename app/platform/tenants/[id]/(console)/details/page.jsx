'use client'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'
import { formatHour, tradingDayLabel } from '@/lib/tradingDay.js'

/** Every hour of the clock, named the way somebody would say it. */
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour(h) }))

/**
 * What the business is called, the name it appears under in its address, and
 * the hours it trades.
 *
 * Currency used to be a third card here and is now its own tab: this console
 * is the only place it can be changed, and a tab labelled "Name and web
 * address" was not a findable place to keep the only copy of that control.
 */
export default function TenantDetailsPage() {
  const { tenant, details, setDetails, save, saving } = useTenantConsole()

  const nameDirty = details.name !== (tenant.name ?? '') || details.slug !== (tenant.slug ?? '')
  const dayDirty = details.dayStartHour !== tenant.dayStartHour || details.dayEndHour !== tenant.dayEndHour

  return (
    <div className="tenant-tab-stack">
      <form
        className="pf-card pf-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save({ name: details.name, slug: details.slug }, 'Café details saved.')
        }}
      >
        <h2>Details</h2>
        <p>What the business is called, and the name it appears under in its web address.</p>

        <label className="pf-field">
          <span>Business name</span>
          <input
            value={details.name}
            required
            maxLength={120}
            disabled={saving}
            onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
          />
          <span className="pf-hint">Shown in their app header, on their receipts and in their browser tab.</span>
        </label>

        <label className="pf-field">
          <span>URL name</span>
          <input
            value={details.slug}
            required
            disabled={saving}
            onChange={(e) => setDetails((d) => ({ ...d, slug: e.target.value }))}
          />
          {/* Worth spelling out: their public menu is reached by this, so
              changing it breaks a link somebody may have printed. */}
          <span className="pf-hint">
            Used in their public menu address. Changing it stops the old address working.
          </span>
        </label>

        <div className="pf-actions">
          <button type="submit" className="primary" disabled={saving || !nameDirty}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
          {nameDirty ? (
            <button
              type="button"
              className="ghost"
              disabled={saving}
              onClick={() => setDetails((d) => ({ ...d, name: tenant.name ?? '', slug: tenant.slug ?? '' }))}
            >
              Discard
            </button>
          ) : null}
        </div>
      </form>

      {/*
        A card of its own, below the name, because it is a different kind of
        decision. A name is cosmetic; this moves the line between one day's
        takings and the next — and it used to be the number 18 written into
        two files, so every café on the platform traded on a burger shop's
        night shift whether or not they opened in the morning.
      */}
      <form
        className="pf-card pf-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save(
            { dayStartHour: details.dayStartHour, dayEndHour: details.dayEndHour },
            `Trading day set to ${tradingDayLabel(details)}.`,
          )
        }}
      >
        <h2>Trading day</h2>
        <p>
          When their day opens and closes. A café that shuts at 5 PM the next afternoon is still
          working on last night’s day until then, so a sale rung up at 2 AM counts towards the
          evening it started in — which is what their staff, and their books, expect.
        </p>

        <div className="pf-row">
          <label className="pf-field">
            <span>Day opens</span>
            <select
              value={details.dayStartHour}
              disabled={saving}
              onChange={(e) => setDetails((d) => ({ ...d, dayStartHour: Number(e.target.value) }))}
            >
              {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </label>

          <label className="pf-field">
            <span>Day closes</span>
            <select
              value={details.dayEndHour}
              disabled={saving}
              onChange={(e) => setDetails((d) => ({ ...d, dayEndHour: Number(e.target.value) }))}
            >
              {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </label>
        </div>

        {/* Read back in full, because "6 PM" and "5 PM" in two boxes do not by
            themselves say that the second one is tomorrow. */}
        <p className="pf-quoted">Their day runs {tradingDayLabel(details)}.</p>

        <p className="pf-hint">
          Changes three things for them: which day a sale is counted against, when the short order
          numbers on their receipts reset to 1, and what “today” covers on their reports. Sales
          already rung up keep the day they were stamped with — this is not backdated. Takes effect
          at their till within a minute.
        </p>

        <div className="pf-actions">
          <button type="submit" className="primary" disabled={saving || !dayDirty}>
            {saving ? 'Saving…' : 'Save trading day'}
          </button>
          {dayDirty ? (
            <button
              type="button"
              className="ghost"
              disabled={saving}
              onClick={() => setDetails((d) => ({
                ...d,
                dayStartHour: tenant.dayStartHour,
                dayEndHour: tenant.dayEndHour,
              }))}
            >
              Discard
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
