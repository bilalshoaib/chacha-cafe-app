import { BRAND_PRIMARY, BRAND_SECONDARY, BRAND_DEEP, BRAND_BG } from '@/constants/theme.js'

/**
 * The favicon, painted from the theme source rather than checked in as a
 * static file — a .svg on disk cannot read CSS variables, so it was the one
 * thing that stayed the old colour after a re-skin.
 *
 * Served at /icon and pointed at by `metadata.icons` in app/layout.jsx.
 * middleware.js lets any /icon* path through without a session, so the login
 * page shows the icon too.
 *
 * The lettuce and patty are deliberately fixed: they are food, not brand.
 */
export const dynamic = 'force-static'

export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Chacha Burger &amp; Cafe">
  <rect width="64" height="64" rx="14" fill="${BRAND_DEEP}"/>

  <!-- Top bun -->
  <path d="M13 27a19 13 0 0 1 38 0Z" fill="${BRAND_SECONDARY}"/>
  <circle cx="25" cy="20" r="1.7" fill="${BRAND_BG}"/>
  <circle cx="34" cy="17" r="1.7" fill="${BRAND_BG}"/>
  <circle cx="42" cy="21" r="1.7" fill="${BRAND_BG}"/>

  <!-- Lettuce -->
  <path d="M12 29h40l-3.5 4.2-4.6-2.2-4.6 2.6-4.6-2.6-4.6 2.6-4.6-2.6-4.6 2.2Z" fill="#7aa05a"/>

  <!-- Patty -->
  <rect x="12" y="34" width="40" height="7" rx="3.5" fill="#5c3320"/>

  <!-- Cheese -->
  <path d="M14 34h36l-4 5H18Z" fill="${BRAND_SECONDARY}" opacity="0.6"/>

  <!-- Bottom bun -->
  <path d="M13 42h38a12 12 0 0 1-38 0Z" fill="${BRAND_PRIMARY}"/>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
