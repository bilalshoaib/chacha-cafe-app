'use client'

// Builds a compact page list like [1, '…', 4, 5, 6, '…', 12], always keeping
// the first/last page and a window around the current page visible.
function getPageList(current, total) {
  const delta = 1
  const pages = []
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i)
    }
  }
  const withDots = []
  let prev = 0
  for (const p of pages) {
    if (prev) {
      if (p - prev === 2) withDots.push(prev + 1)
      else if (p - prev > 2) withDots.push('…')
    }
    withDots.push(p)
    prev = p
  }
  return withDots
}

export default function Pagination({
  page,
  totalPages,
  onChange,
  disabled = false,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}) {
  const showSizeControl = Array.isArray(pageSizeOptions) && typeof onPageSizeChange === 'function'
  const showNav = totalPages > 1
  if (!showSizeControl && !showNav) return null

  const pages = showNav ? getPageList(page, totalPages) : []

  return (
    <div className="pagination-bar">
      {showSizeControl ? (
        <div className="pagination-size">
          <span className="muted small">Rows per page</span>
          <div className="pagination-size-options">
            {pageSizeOptions.map((n) => (
              <button
                key={n}
                type="button"
                className={`pagination-size-btn${n === pageSize ? ' active' : ''}`}
                aria-current={n === pageSize ? 'true' : undefined}
                disabled={disabled}
                onClick={() => onPageSizeChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showNav ? (
        <nav className="pagination" aria-label="Pagination">
          <button
            type="button"
            className="pagination-btn pagination-nav"
            disabled={disabled || page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`dots-${i}`} className="pagination-ellipsis" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`pagination-btn${p === page ? ' active' : ''}`}
                aria-current={p === page ? 'page' : undefined}
                disabled={disabled}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            className="pagination-btn pagination-nav"
            disabled={disabled || page >= totalPages}
            onClick={() => onChange(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      ) : null}
    </div>
  )
}
