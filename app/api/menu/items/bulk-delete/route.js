import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { loadMenu, saveMenu } from '@/lib/repositories/menuRepository'

export async function POST(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await request.json().catch(() => ({}))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
  }
  const uniq = [...new Set(ids.map(String))]
  const menu = await loadMenu()
  const itemMap = new Map(menu.items.map((i) => [i.id, i]))
  const notFound = uniq.filter((id) => !itemMap.has(id))
  if (notFound.length) {
    return NextResponse.json({ error: `Unknown item id(s): ${notFound.join(', ')}` }, { status: 400 })
  }
  const blocked = new Set()
  for (const id of uniq) {
    for (const d of menu.deals) {
      if (d.includes?.some((inc) => inc.itemId === id)) {
        blocked.add(itemMap.get(id).name)
        break
      }
    }
  }
  if (blocked.size) {
    return NextResponse.json({
      error: `Some items are used in deals. Edit or remove those deals first: ${[...blocked].join(', ')}`,
    }, { status: 400 })
  }
  const removeSet = new Set(uniq)
  menu.items = menu.items.filter((i) => !removeSet.has(i.id))
  await saveMenu(menu)
  return NextResponse.json({ ok: true, removed: uniq.length })
}
