import { withTenant } from '../db.js'
import { forgetTenantBranding } from '../tenantBranding.js'
import { parseNewOrderPayment } from '../newOrderPayment.js'

/**
 * How checkout treats a new order: whether it is rung up already paid.
 *
 * The till reads this with the menu (see loadMenu), so it arrives in the same
 * round trip and is cached for offline selling with everything else. This
 * module is the settings screen's read and the write path.
 */
export async function getCheckoutSettings(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query('SELECT new_order_payment FROM tenants WHERE id = $1', [ctx.tenantId])
    return { newOrderPayment: parseNewOrderPayment(res.rows[0]?.new_order_payment) }
  })
}

/** Same cache rule as setPricesIncludeTax: the row is on the branding road. */
export async function setNewOrderPayment(ctx, value) {
  const next = parseNewOrderPayment(value)
  await withTenant(ctx, async (client) => {
    await client.query('UPDATE tenants SET new_order_payment = $2 WHERE id = $1', [ctx.tenantId, next])
  })
  forgetTenantBranding(ctx.tenantId)
  return next
}
