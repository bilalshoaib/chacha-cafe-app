let onUnauthorized = () => {}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }
  if (res.status === 401) {
    const isLoginAttempt = path.includes('/api/auth/login')
    if (!isLoginAttempt) {
      onUnauthorized()
    }
    throw new Error(data?.error || res.statusText || 'Request failed')
  }
  if (!res.ok) {
    throw new Error(data?.error || res.statusText || 'Request failed')
  }
  return data
}

/**
 * Builds the shared report query string (range + filters), omitting empty values.
 *
 * `tenantId` is set only when the platform console is reading a café's reports;
 * the café's own owner never sends it and the server then scopes to their
 * session. One query builder for both, so the two screens cannot drift.
 */
/** Range and filter for the platform's own finance endpoints. */
function financeQuery({ from, to, tenantId } = {}) {
  const q = new URLSearchParams()
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  if (tenantId) q.set('tenantId', tenantId)
  return q.toString()
}

function reportQuery({ from, to, businessType, paymentMethod, page, pageSize, sort, tenantId } = {}) {
  const q = new URLSearchParams()
  if (tenantId) q.set('tenantId', tenantId)
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  if (businessType && businessType !== 'all') q.set('businessType', businessType)
  if (paymentMethod && paymentMethod !== 'all') q.set('paymentMethod', paymentMethod)
  if (page != null) q.set('page', String(page))
  if (pageSize != null) q.set('pageSize', String(pageSize))
  if (sort) q.set('sort', sort)
  return q.toString()
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  updateProfile: (body) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changeMyPassword: (currentPassword, newPassword) =>
    request('/api/auth/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  listUsers: () => request('/api/auth/users'),

  // Sales tax. The GET carries the café's own categories and the order types
  // with it, so the picker can only offer rules the server would accept.
  taxSettings: () => request('/api/tenant/tax'),
  setPricesIncludeTax: (pricesIncludeTax) =>
    request('/api/tenant/tax', { method: 'PATCH', body: JSON.stringify({ pricesIncludeTax }) }),
  createTaxRate: (body) => request('/api/tenant/tax', { method: 'POST', body: JSON.stringify(body) }),
  updateTaxRate: (rateId, body) =>
    request(`/api/tenant/tax/${encodeURIComponent(rateId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTaxRate: (rateId) =>
    request(`/api/tenant/tax/${encodeURIComponent(rateId)}`, { method: 'DELETE' }),
  // Platform console — creating and governing cafés, not configuring them.
  listTenants: () => request('/api/platform/tenants'),
  platformActivity: (window = '30d') => request(`/api/platform/activity?window=${window}`),
  createTenant: (body) => request('/api/platform/tenants', { method: 'POST', body: JSON.stringify(body) }),
  getTenant: (id) => request(`/api/platform/tenants/${encodeURIComponent(id)}`),
  impersonate: (id, control = false) =>
    request(`/api/platform/tenants/${encodeURIComponent(id)}/impersonate`, {
      method: 'POST', body: JSON.stringify({ control }),
    }),
  stopImpersonating: (id) =>
    request(`/api/platform/tenants/${encodeURIComponent(id)}/impersonate`, { method: 'DELETE' }),
  impersonationStatus: () => request('/api/platform/impersonation'),
  resetOwnerPassword: (id) =>
    request(`/api/platform/tenants/${encodeURIComponent(id)}/owner-password`, { method: 'POST' }),
  updateTenant: (id, body) =>
    request(`/api/platform/tenants/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  uploadTenantLogo: (id, { mime, data }) =>
    request(`/api/platform/tenants/${encodeURIComponent(id)}/logo`, {
      method: 'POST',
      body: JSON.stringify({ mime, data }),
    }),
  removeTenantLogo: (id) =>
    request(`/api/platform/tenants/${encodeURIComponent(id)}/logo`, { method: 'DELETE' }),

  // The platform's own books — what the cafés pay it, and what it spends.
  // Nothing here is scoped to a tenant, and nothing here is reachable by one.
  platformFinance: (params = {}) => request(`/api/platform/finance/report?${financeQuery(params)}`),
  platformPayments: (params = {}) => request(`/api/platform/finance/payments?${financeQuery(params)}`),
  recordPlatformPayment: (body) =>
    request('/api/platform/finance/payments', { method: 'POST', body: JSON.stringify(body) }),
  deletePlatformPayment: (id) =>
    request(`/api/platform/finance/payments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  platformExpenses: (params = {}) => request(`/api/platform/finance/expenses?${financeQuery(params)}`),
  recordPlatformExpense: (body) =>
    request('/api/platform/finance/expenses', { method: 'POST', body: JSON.stringify(body) }),
  deletePlatformExpense: (id) =>
    request(`/api/platform/finance/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  planPrices: () => request('/api/platform/finance/prices'),
  setPlanPrice: (plan, price) =>
    request('/api/platform/finance/prices', { method: 'PATCH', body: JSON.stringify({ plan, price }) }),
  getUser: (userId) => request(`/api/auth/users/${encodeURIComponent(userId)}`),
  createUser: (body) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (userId, body) =>
    request(`/api/auth/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // Reports are split per tab so each view fetches only the data it renders.
  getReportSummary: (params) => request(`/api/reports/summary?${reportQuery(params)}`),
  getReportInvoices: (params) => request(`/api/reports/invoices?${reportQuery(params)}`),
  getReportTopSellers: (params) => request(`/api/reports/top-sellers?${reportQuery(params)}`),
  getReportExpenses: (params) => request(`/api/reports/expenses?${reportQuery(params)}`),
  getMenu: () => request('/api/menu'),
  // The home page is public, so it reads the menu that carries no cost prices.
  // The slug names which café to show; without one the route falls back to the
  // caller's own session, then to the single-café install.
  getPublicMenu: (slug) => request(`/api/menu-public${slug ? `?tenant=${encodeURIComponent(slug)}` : ''}`),
  createMenuItem: (body) => request('/api/menu/items', { method: 'POST', body: JSON.stringify(body) }),
  updateMenuItem: (id, body) =>
    request(`/api/menu/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMenuItem: (id) => request(`/api/menu/items/${id}`, { method: 'DELETE' }),
  deleteMenuItems: (ids) =>
    request('/api/menu/items/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  createDeal: (body) => request('/api/deals', { method: 'POST', body: JSON.stringify(body) }),
  updateDeal: (id, body) =>
    request(`/api/deals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveDeal: (id) =>
    request(`/api/deals/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }),
  restoreDeal: (id) =>
    request(`/api/deals/${encodeURIComponent(id)}/restore`, { method: 'PATCH' }),
  checkout: (body) => request('/api/checkout', { method: 'POST', body: JSON.stringify(body) }),
  getInvoices: (params = {}) => {
    const q = new URLSearchParams()
    if (params.from) q.set('from', params.from)
    if (params.to) q.set('to', params.to)
    if (params.businessType) q.set('businessType', params.businessType)
    if (params.page != null) q.set('page', String(params.page))
    if (params.pageSize != null) q.set('pageSize', String(params.pageSize))
    if (params.search) q.set('search', params.search)
    const qs = q.toString()
    return request(`/api/invoices${qs ? `?${qs}` : ''}`)
  },
  getInvoice: (id) => request(`/api/invoices/${id}`),
  updateInvoice: (id, body) =>
    request(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getExpenses: (params = {}) => {
    const q = new URLSearchParams()
    if (params.from) q.set('from', params.from)
    if (params.to) q.set('to', params.to)
    if (params.businessType) q.set('businessType', params.businessType)
    const qs = q.toString()
    return request(`/api/expenses${qs ? `?${qs}` : ''}`)
  },
  getExpense: (id) => request(`/api/expenses/${encodeURIComponent(id)}`),
  createExpense: (body) => request('/api/expenses', { method: 'POST', body: JSON.stringify(body) }),
  updateExpense: (id, body) =>
    request(`/api/expenses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteExpense: (id) => request(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
