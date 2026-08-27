import Skeleton, { SkeletonStatus } from '@/components/Skeleton.jsx'

/**
 * What a screen looks like between being asked for and arriving.
 *
 * Every screen here renders dynamically — the root layout resolves the café
 * from the session cookie — so without a Suspense boundary the router has
 * nowhere to put the wait: it held the old screen on display until the new one
 * was ready, and the press looked ignored. Each route segment has a
 * `loading.jsx` re-exporting this, which is what lets a press land at once —
 * the address changes, the tab goes current, this stands in for the body, and
 * the screen fills in underneath. The header never flickers; it is rendered by
 * the layout above these boundaries and never leaves the page.
 *
 * One file per segment rather than a single `app/loading.jsx`, and that detail
 * is the whole thing working or not. A boundary at the root is the same
 * boundary on every route, and React will not re-hide content it has already
 * revealed during a transition — so the root one never fired once, and clicks
 * felt exactly as dead as before. A boundary inside the segment is new to the
 * page being opened, so it shows. `app/(home)/` is a route group for this
 * reason alone: it gives `/` a segment of its own to hang a boundary on
 * without changing the address.
 *
 * Deliberately shapeless: it sits in front of the till, the invoice list, the
 * café console and every other screen, so it suggests a page arriving rather
 * than imitating any one of them and being wrong most of the time.
 */
export default function RouteSkeleton() {
  return (
    <div className="route-loading">
      <SkeletonStatus />
      <Skeleton className="route-loading-title" />
      <Skeleton className="route-loading-sub" />
      <div className="route-loading-body">
        <Skeleton className="route-loading-row" />
        <Skeleton className="route-loading-row" />
        <Skeleton className="route-loading-row" />
      </div>
    </div>
  )
}
