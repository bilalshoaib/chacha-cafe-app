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
  getUser: (userId) => request(`/api/auth/users/${encodeURIComponent(userId)}`),
  createUser: (body) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (userId, body) =>
    request(`/api/auth/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getInvoiceReport: (fromIso, toIso) => {
    const q = new URLSearchParams({ from: fromIso, to: toIso })
    return request(`/api/reports/invoices?${q}`)
  },
  getMenu: () => request('/api/menu'),
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
  getOrders: () => request('/api/orders'),
  createOrder: (businessType) =>
    request('/api/orders', { method: 'POST', body: JSON.stringify({ businessType }) }),
  addLine: (orderId, body) =>
    request(`/api/orders/${orderId}/lines`, { method: 'POST', body: JSON.stringify(body) }),
  updateOrderLine: (orderId, lineId, patch) =>
    request(`/api/orders/${orderId}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeLine: (orderId, lineId) =>
    request(`/api/orders/${orderId}/lines/${lineId}`, { method: 'DELETE' }),
  checkout: (orderId, customerNote, paymentMethod) =>
    request(`/api/orders/${orderId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ customerNote: customerNote || '', paymentMethod: paymentMethod ?? null }),
    }),
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
