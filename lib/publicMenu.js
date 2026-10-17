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

/**
 * A partner kitchen's menu as its own customers may see it (lib/partners.js):
 * the items it sells right now, at its prices, and the categories they fall
 * under. For the partner's own website.
 *
 * Built field by field rather than by stripping, because the item rows a
 * partner sells from carry the café's menu price and cost — what the café
 * charges and pays is not the partner's customers' business, and a field added
 * to menu items later must not start appearing here by default. Hidden items
 * are left out, as they are on the partner's till. A café item is listed under
 * the name and description the partner gave it, when it gave them, and
 * otherwise the café's.
 */
export function toPublicPartnerMenu(menu, partner) {
  const byId = new Map((menu?.items ?? []).map((i) => [i.id, i]))
  const items = []
  for (const row of partner?.prices ?? []) {
    if (!row.visible) continue
    const item = byId.get(row.itemId)
    if (!item) continue
    items.push({
      id: item.id,
      name: row.displayName || item.name,
      category: item.category,
      price: Number(row.price),
      ...(item.size ? { size: item.size } : {}),
      ...(item.flavour ? { flavour: item.flavour } : {}),
      description: row.description || item.description || null,
    })
  }
  // Its own items, which have no café price to keep out.
  for (const own of partner?.ownItems ?? []) {
    if (!own.visible) continue
    items.push({ id: own.id, name: own.name, category: own.category, price: Number(own.price), description: own.description ?? null })
  }
  items.sort((a, b) => a.name.localeCompare(b.name))

  // An own item may sit under a category of the partner's own naming, which
  // the café's list does not have; it is listed under that name as it stands.
  const used = new Set(items.map((i) => i.category))
  const cafeCategories = (menu?.categories ?? [])
    .filter((c) => used.has(c.key))
    .map(({ key, label, icon, color }) => ({ key, label, icon, color }))
  const known = new Set(cafeCategories.map((c) => c.key))
  const ownCategories = [...used].filter((k) => !known.has(k)).sort().map((key) => ({ key, label: key }))
  return {
    partner: { name: partner.name, slug: partner.slug },
    categories: [...cafeCategories, ...ownCategories],
    items,
  }
}
