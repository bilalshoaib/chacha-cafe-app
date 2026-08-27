import { getTenantLogo } from '@/lib/repositories/tenantsRepository'

/**
 * Serves a café's uploaded logo.
 *
 * Public, and deliberately so. This is fetched by an <img> on the login page
 * before anybody has signed in and on the public menu board, where there is no
 * session to read a tenant from. A logo is the one part of a café's data whose
 * whole purpose is to be shown to strangers.
 *
 * The URL stored on the tenant carries the upload's timestamp, so a path
 * identifies one specific picture forever. That is what makes the immutable
 * cache below correct rather than merely fast: replacing the logo changes the
 * URL, and no cache anywhere has to be told anything.
 */
export async function GET(_request, { params }) {
  const { tenantId } = await params
  const logo = await getTenantLogo(tenantId)
  if (!logo) return new Response('Not found', { status: 404 })

  return new Response(logo.bytes, {
    headers: {
      'Content-Type': logo.mime,
      'Content-Length': String(logo.bytes.length),
      // A year, immutable — see above. Shared caches may hold it: it is public.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // An SVG served from this origin is a document, and a document from this
      // origin can read this origin's cookies. These two headers are what make
      // accepting SVG uploads safe: nothing inside one may load, run or reach
      // anything, and the browser may not second-guess the declared type into
      // something scriptable.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
