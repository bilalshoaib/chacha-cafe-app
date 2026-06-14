'use client'
export default function RoleBadge({ role }) {
  if (role === 'super_admin') {
    return <span className="badge-role badge-role-super">Super admin</span>
  }
  if (role === 'admin') {
    return <span className="badge-role badge-role-admin-mid">Admin</span>
  }
  if (role === 'counter_cashier') {
    return <span className="badge-role badge-role-cashier">Counter cashier</span>
  }
  return <span className="badge-role badge-role-staff">Staff</span>
}
