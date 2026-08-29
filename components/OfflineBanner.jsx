'use client'
import { useOrders } from '@/context/OrdersContext.jsx'

/**
 * What the till says when it is selling without a connection.
 *
 * The bar exists because offline selling is only trustworthy if it is
 * visible. A cashier who does not know the connection went down finds out at
 * the end of the day, from a takings figure that does not match the drawer;
 * one who can see it knows to expect the sync and to keep the device on.
 *
 * It shows how many more sales this device can ring up, because that is the
 * one hard limit — the till holds a finite block of invoice numbers and
 * genuinely has to stop when they run out, so a café needs warning rather
 * than a refusal at the counter.
 *
 * Nothing renders when the till is connected and has nothing queued, which is
 * almost always. A permanent "you are online" strip is noise on a screen whose
 * entire job is taking orders quickly.
 */
export default function OfflineBanner() {
  const { online, queuedCount, numbersLeft, menuCachedAt, syncing, syncNow } = useOrders()

  if (online && !queuedCount) return null

  const low = numbersLeft <= 5

  return (
    <div className={`offline-banner ${online ? 'offline-banner-syncing' : 'offline-banner-offline'}`} role="status">
      <span className="offline-banner-dot" aria-hidden="true" />
      <div className="offline-banner-text">
        {online ? (
          <strong>Back online</strong>
        ) : (
          <strong>No connection — still selling</strong>
        )}
        <span className="offline-banner-detail">
          {!online && (
            numbersLeft > 0
              ? `${numbersLeft} more ${numbersLeft === 1 ? 'sale' : 'sales'} can be rung up on this device.`
              : 'No invoice numbers left — reconnect before the next sale.'
          )}
          {online && queuedCount > 0 && (
            `${queuedCount} offline ${queuedCount === 1 ? 'sale' : 'sales'} still to send.`
          )}
          {!online && queuedCount > 0 && ` ${queuedCount} waiting to send.`}
          {!online && menuCachedAt && (
            ` Prices as of ${new Date(menuCachedAt).toLocaleString()}.`
          )}
        </span>
      </div>
      {!online && low && numbersLeft > 0 ? (
        <span className="offline-banner-warn">Running low</span>
      ) : null}
      {online && queuedCount > 0 ? (
        <button type="button" className="btn btn-sm" onClick={syncNow} disabled={syncing}>
          {syncing ? 'Sending…' : 'Send now'}
        </button>
      ) : null}
    </div>
  )
}
