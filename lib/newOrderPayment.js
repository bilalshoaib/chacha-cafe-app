/**
 * Whether a new order comes out of checkout already paid, and how.
 *
 * Pure, and shared by /api/checkout and the offline till, so a sale rung up
 * without a connection is marked exactly as the same sale rung up with one.
 */

export const NEW_ORDER_PAYMENTS = ['unpaid', 'cash', 'online']
export const DEFAULT_NEW_ORDER_PAYMENT = 'unpaid'

export function parseNewOrderPayment(value) {
  return NEW_ORDER_PAYMENTS.includes(value) ? value : DEFAULT_NEW_ORDER_PAYMENT
}

/**
 * The invoice fields the setting adds to a new sale: nothing when orders start
 * unpaid, otherwise paid at the moment of sale by the configured method.
 *
 * The configured method wins over one sent with the cart only when the cart
 * sent none — a till that knows how this customer paid is right about it.
 */
export function paymentFieldsForNewOrder(setting, createdAtIso, paymentMethod = null) {
  const mode = parseNewOrderPayment(setting)
  if (mode === 'unpaid') return {}
  return { paid: true, paidAt: createdAtIso, paymentMethod: paymentMethod || mode }
}
