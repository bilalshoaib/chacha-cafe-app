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
