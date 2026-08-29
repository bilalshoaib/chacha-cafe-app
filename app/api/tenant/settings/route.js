import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import { getTenant, updateTenant } from '@/lib/repositories/tenantsRepository'
import { recordAudit } from '@/lib/audit'
import { CURRENCIES, LANGUAGES, currencyInfo } from '@/constants/locales.js'

/**
 * A café's own regional settings — the currency it trades in and the language
 * it reads in.
 *
 * A route of its own rather than a branch in the console's PATCH, because the
 * two have different rules about who may call them and what may be changed.
 * The console route is the platform owner's and reaches the whole tenant row,
 * plan and access included; this one belongs to the café's own owner and can
 * reach exactly two fields. Sharing it and filtering the body afterwards would
 * put "which keys is a customer allowed to send" in a place where forgetting
 * to update it hands them their own billing plan.
 *
 * Owner-only, not staff. A cashier changing the currency mid-shift would
 * reprice the entire menu on the screen in front of them.
 */
export async function GET() {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await getTenant(ctx.tenantId)
  if (!tenant) return NextResponse.json({ error: 'Café not found' }, { status: 404 })

  // The lists travel with the answer so the picker cannot offer a choice the
  // server would refuse.
  return NextResponse.json({
    currency: tenant.currency,
    locale: tenant.locale,
    currencies: CURRENCIES,
    languages: LANGUAGES,
  })
}

export async function PATCH(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  // Only the two fields, picked out by name. Whatever else the body carries is
  // not passed on — the repository would accept a plan or a status from it.
  const fields = {}
  if (body.currency !== undefined) fields.currency = body.currency
  if (body.locale !== undefined) fields.locale = body.locale
  if (!Object.keys(fields).length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const result = await updateTenant(ctx.tenantId, fields)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  const said = []
  if (fields.currency !== undefined) said.push(`currency to ${currencyInfo(result.tenant.currency).name}`)
  if (fields.locale !== undefined) said.push(`language to ${result.tenant.locale}`)
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    tenantName: result.tenant?.name,
    action: 'tenant_updated',
    detail: `Set ${said.join(' and ')}`,
  })

  return NextResponse.json({
    currency: result.tenant.currency,
    locale: result.tenant.locale,
  })
}
