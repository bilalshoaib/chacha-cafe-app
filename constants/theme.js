/**
 * ══════════════════════════════════════════════════════════════════════════
 * THEME SOURCE — the entire palette of the app is these two values.
 *
 * Change them here and nothing else needs touching:
 *   • the stylesheets build every ramp, surface, border and shadow from the
 *     two CSS custom properties that app/layout.jsx injects from this file
 *   • app/icon/route.js paints the favicon from these
 *   • app/layout.jsx sets the mobile browser-chrome colour from these
 *
 * No .css file declares --brand-primary or --brand-secondary, and no
 * stylesheet may hardcode a brand hex — a hex written anywhere else is a bug
 * that will survive the next re-skin.
 *
 * Pick a PRIMARY dark enough for white text (~4.5:1 on white): solid buttons
 * put #fff on it and there is no per-button override.
 * Pick a SECONDARY bright enough to read on the dark poster surfaces.
 *
 * Current theme: Teal & Gold — deep teal + warm gold.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const BRAND_PRIMARY = '#0d9488'
export const BRAND_SECONDARY = '#f0a830'



// // slate blue + sand
// export const BRAND_PRIMARY = '#4a5a6a'
// export const BRAND_SECONDARY = '#d9c4a3'

/**
 * Mirrors CSS `color-mix(in srgb, <a> <pct>%, <b>)`.
 *
 * The favicon is an image, not a document, so CSS variables cannot reach
 * inside it — its shades have to be computed here instead. Keep these
 * percentages in step with the derived ramps in app/styles/01-base.css.
 */
export function mix(a, b, pct) {
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  const f = pct / 100
  const ch = (x, y) => Math.round(x * f + y * (1 - f)).toString(16).padStart(2, '0')
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`
}

/** The handful of derived shades that non-CSS consumers need. */
export const BRAND_DEEP = mix(BRAND_PRIMARY, '#000000', 43)
export const BRAND_BG = mix(BRAND_SECONDARY, '#ffffff', 7)

/** Injected into :root by app/layout.jsx — the bridge from JS to the CSS. */
export const themeCssVars =
  `:root{--brand-primary:${BRAND_PRIMARY};--brand-secondary:${BRAND_SECONDARY}}`
