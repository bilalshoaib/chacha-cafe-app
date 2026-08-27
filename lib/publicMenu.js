/**
 * Strips everything that reveals what the business pays, leaving the menu as a
 * customer may see it.
 *
 * `costPrice` on an item and `unitPrice` inside a deal are both internal: taken
 * together with the selling price they give away the margin on every line.
 * /api/menu-public is unauthenticated and served with CORS `*`, so its payload
 * has to be built from this rather than returned from loadMenu() directly.
 *
 * Kept out of the repository so it stays importable — and testable — without
 * a database connection.
 */
export function toPublicMenu(menu) {
  return {
    categories: menu?.categories ?? [],
    items: (menu?.items ?? []).map(({ costPrice, ...publicFields }) => publicFields),
    deals: (menu?.deals ?? []).map((deal) => ({
      ...deal,
      includes: (deal.includes ?? []).map(({ unitPrice, ...publicFields }) => publicFields),
    })),
  }
}
