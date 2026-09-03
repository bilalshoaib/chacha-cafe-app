/**
 * Shimmering placeholder shown while data loads, so a page never renders a
 * misleading "nothing here yet" state before its data has arrived.
 */
export default function Skeleton({ width, height = '1rem', className = '', style }) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ''}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}

/** Screen-reader announcement to pair with a block of skeletons. */
export function SkeletonStatus({ label = 'Loading…' }) {
  return <span className="sr-only" role="status">{label}</span>
}

/**
 * A width that varies from row to row but never from render to render.
 *
 * Random widths would reshuffle on every re-render while the data is still
 * coming, which turns a calm placeholder into a flickering one. Derived from
 * the row and column instead, so a given cell is always the same size.
 */
function jitter(seed, min, spread) {
  return `${min + ((seed * 37) % spread)}%`
}

/**
 * A table waiting for its rows.
 *
 * Keeps the real headers, so the columns are already in their final places and
 * nothing jumps sideways when the data lands — the reason this is worth having
 * over a line of text, which is replaced by a full table and moves everything
 * below it down the page.
 *
 * That promise is why it carries `table-cards` and the per-cell `data-label`
 * too: below 640px the real table is a stack of cards (see
 * app/styles/08-table-cards.css), so a placeholder still shaped like a table
 * would be the sideways jump this exists to prevent. Pass `cards={false}` for
 * the rare table that stays a table on a phone.
 */
export function SkeletonTable({
  columns,
  rows = 5,
  label = 'Loading…',
  tableClassName = 'data-table',
  wrapClassName = '',
  cards = true,
}) {
  const titleIndex = columns.findIndex((c) => c.title)
  return (
    <div className={`table-scroll${wrapClassName ? ` ${wrapClassName}` : ''}`} aria-busy="true">
      <SkeletonStatus label={label} />
      <table className={`${tableClassName}${cards ? ' table-cards' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="skeleton-table-row">
              {columns.map((c, i) => {
                /* Whichever column names the record leads the card — the same
                   cell the real table marks up as the title. That is normally
                   the first, but a leaderboard leads with the rank and names
                   the record in the second, so a column can say so itself. A
                   spacer column has no heading worth repeating. */
                const isTitle = cards && (titleIndex === -1 ? i === 0 : i === titleIndex)
                return (
                  <td
                    key={c.key}
                    className={[c.num ? 'num' : '', isTitle ? 'cell-card-title' : ''].filter(Boolean).join(' ') || undefined}
                    data-label={cards && !isTitle && c.label?.trim() ? c.label : undefined}
                  >
                    <Skeleton
                      width={c.num ? '2.5rem' : jitter(r * 5 + i, 45, 40)}
                      height="0.95rem"
                      className={c.num ? 'skeleton-num' : undefined}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A stack of placeholder lines, for a list that is not a table. */
export function SkeletonLines({ rows = 4, label = 'Loading…', className = '' }) {
  return (
    <div className={`skeleton-lines${className ? ` ${className}` : ''}`} aria-busy="true">
      <SkeletonStatus label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-line-row">
          <div className="skeleton-line-main">
            <Skeleton width={jitter(i, 40, 35)} height="0.95rem" />
            <Skeleton width={jitter(i + 3, 25, 20)} height="0.7rem" />
          </div>
          <Skeleton width="4rem" height="0.95rem" />
        </div>
      ))}
    </div>
  )
}

/** A form waiting for the record it is about to edit. */
export function SkeletonFields({ fields = 3, label = 'Loading…' }) {
  return (
    <div className="skeleton-fields" aria-busy="true">
      <SkeletonStatus label={label} />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="skeleton-field">
          <Skeleton width={jitter(i, 20, 15)} height="0.75rem" />
          <Skeleton height="2.3rem" className="skeleton-field-input" />
        </div>
      ))}
      <Skeleton width="7rem" height="2.3rem" className="skeleton-field-button" />
    </div>
  )
}

/**
 * A record's fields waiting for the record — the placeholder for the
 * definition lists the detail screens are built from.
 */
export function SkeletonDetail({ rows = 4, label = 'Loading…', className = '' }) {
  return (
    <article className={`card team-detail-card${className ? ` ${className}` : ''}`} aria-busy="true">
      <SkeletonStatus label={label} />
      <dl className="team-detail-dl">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i}>
            <dt><Skeleton width={jitter(i, 45, 35)} height="0.75rem" /></dt>
            <dd><Skeleton width={jitter(i + 2, 50, 40)} height="0.95rem" /></dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
