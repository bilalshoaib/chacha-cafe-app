import { getSession } from '@/lib/session'
import { getTenantBranding } from '@/lib/tenantBranding'
import { mix } from '@/constants/theme.js'

/**
 * The favicon, painted from the café's own two brand colours rather than
 * checked in as a file — an .svg on disk cannot read them, so it was the one
 * thing that stayed the old colour after a re-skin.
 *
 * It used to draw a burger: a bun, lettuce and a patty, with a comment saying
 * the food was fixed because it was food and not brand. That reasoning only
 * held while every customer sold burgers. A coffee house cannot have a patty
 * in its browser tab, so the mark is now the café's own initial on a tile in
 * its own colours — which is honest for any kind of café and needs nothing
 * uploaded before it looks right.
 *
 * Served at /icon and pointed at by the layout's metadata. middleware.js lets
 * any /icon* path through without a session so the login page shows it too.
 */

// Per-request: the answer depends on who is signed in.
export const dynamic = 'force-dynamic'

/** The first letter of the café's name, for the tile. */
function initialOf(name) {
  const letter = String(name ?? '').trim().match(/\p{L}/u)?.[0] ?? '·'
  return letter.toUpperCase()
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ))
}

export async function GET() {
  let branding
  try {
    const session = await getSession()
    // The impersonated café first, matching app/layout.jsx: while a support
    // session is open the app is wearing that café's name and colours, and a
    // tab icon still showing the platform owner's own is the one part of the
    // page that disagrees about whose account is on screen.
    branding = await getTenantBranding(session?.impersonatedTenantId || session?.tenantId)
  } catch {
    const { DEFAULT_BRANDING } = await import('@/lib/tenantBranding')
    branding = DEFAULT_BRANDING
  }

  const deep = mix(branding.primary, '#000000', 43)
  const initial = escapeXml(initialOf(branding.name))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${escapeXml(branding.name)}">
  <rect width="64" height="64" rx="14" fill="${deep}"/>
  <circle cx="32" cy="32" r="21" fill="none" stroke="${branding.secondary}" stroke-width="2.5" opacity="0.55"/>
  <text x="32" y="33" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="700"
        fill="${branding.secondary}">${initial}</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Private, because one café's mark must never be served to another from
      // a shared cache. Held briefly all the same: the browser asks for this
      // on every navigation, and each miss was a session read and a query for
      // a mark that changes about never.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
