import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { pool, withTenant } from '../db.js'

const BCRYPT_ROUNDS = 10

export function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 120)
}

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name ?? undefined,
    role: row.role,
    // null for the platform owner, who sits above every tenant and belongs to
    // none. Every other account has exactly one.
    tenantId: row.tenant_id ?? null,
    platformOwner: Boolean(row.platform_owner),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    createdBy: row.created_by ?? null,
  }
}

export function toPublicUser(u) {
  if (!u) return null
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName ?? null,
    role: u.role,
    tenantId: u.tenantId ?? null,
    createdAt: u.createdAt,
    createdBy: u.createdBy ?? null,
  }
}

/** If the users table is empty, seed the super admin. */
export async function ensureSuperAdminSeed() {
  const res = await pool.query('SELECT COUNT(*) FROM users')
  if (Number(res.rows[0].count) > 0) return

  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL || 'superadmin@cafe.local')
  const password = process.env.SUPER_ADMIN_PASSWORD || 'changeme'
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const id = `usr-${randomUUID().slice(0, 8)}`

  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, created_at)
     VALUES ($1, $2, $3, 'super_admin', NOW())`,
    [id, email, passwordHash],
  )
  console.warn(
    `[auth] Seeded super admin ${email}. Default password from env or "changeme". ` +
      `Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD before first run in production.`,
  )
}

/**
 * Looks an account up by email, across every tenant.
 *
 * The one deliberately unscoped read in this file, and it has to be: login is
 * what *establishes* which tenant the caller belongs to, so it cannot already
 * know. Email is globally unique, so this returns at most one account and the
 * caller learns the tenant from it rather than supplying it.
 *
 * Nothing else may use this. Every other lookup goes through getUserById with
 * a context.
 */
export async function getUserByEmail(email) {
  const norm = normalizeEmail(email)
  const res = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [norm])
  return rowToUser(res.rows[0] ?? null)
}

export async function getUserById(ctx, id) {
  const res = await pool.query(
    'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [id, ctx.tenantId],
  )
  return rowToUser(res.rows[0] ?? null)
}

export async function listPublicUsers(ctx) {
  const res = await pool.query(
    'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at',
    [ctx.tenantId],
  )
  return res.rows.map(rowToUser).map(toPublicUser)
}

export async function updateMyProfile(ctx, userId, fields) {
  const res = await pool.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [userId, ctx.tenantId])
  if (!res.rows.length) return { error: 'User not found.' }
  const u = rowToUser(res.rows[0])

  const sets = []
  const vals = []
  let idx = 1

  if (fields.email !== undefined) {
    const norm = normalizeEmail(fields.email)
    if (!norm.includes('@')) return { error: 'Enter a valid email address.' }
    const dup = await pool.query('SELECT id FROM users WHERE email=$1 AND id<>$2', [norm, userId])
    if (dup.rows.length) return { error: 'This email is already in use.' }
    sets.push(`email = $${idx++}`)
    vals.push(norm)
    u.email = norm
  }

  if (fields.displayName !== undefined) {
    const t = String(fields.displayName).trim().slice(0, 80)
    sets.push(`display_name = $${idx++}`)
    vals.push(t || null)
    u.displayName = t || undefined
  }

  if (sets.length) {
    vals.push(userId)
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
  }
  return { user: toPublicUser(u) }
}

export async function changeMyPassword(ctx, userId, currentPassword, newPassword) {
  const np = String(newPassword ?? '')
  if (np.length < 8) return { error: 'New password must be at least 8 characters.' }

  const res = await pool.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [userId, ctx.tenantId])
  if (!res.rows.length) return { error: 'User not found.' }
  const u = rowToUser(res.rows[0])

  if (!(await bcrypt.compare(String(currentPassword ?? ''), u.passwordHash))) {
    return { error: 'Current password is incorrect.' }
  }

  const hash = await bcrypt.hash(np, BCRYPT_ROUNDS)
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId])
  return { ok: true }
}

const MANAGED_ROLES = ['admin', 'staff', 'counter_cashier']

export async function createManagedUser(ctx, input) {
  const role = MANAGED_ROLES.includes(input.role) ? input.role : null
  if (!role) return { error: 'Role must be staff, admin, or counter cashier.' }

  const email = normalizeEmail(input.email)
  if (!email || !email.includes('@')) return { error: 'Enter a valid email address.' }

  const password = String(input.password ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const dup = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (dup.rows.length) return { error: 'An account with this email already exists.' }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const id = `usr-${randomUUID().slice(0, 8)}`
  const displayName = input.displayName ? String(input.displayName).trim().slice(0, 80) || null : null

  // The account and its membership are written together: a user with no
  // membership can log in but has no role anywhere, which is a worse state
  // than not existing. location_id NULL means every branch of the tenant —
  // there is only one today, and this is the answer that stays right when
  // there are more.
  const MEMBERSHIP_ROLE = { admin: 'location_manager', staff: 'staff', counter_cashier: 'cashier' }
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `INSERT INTO users (id, email, password_hash, role, display_name, created_at, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
       RETURNING *`,
      [id, email, hash, role, displayName, input.createdBy ?? null, ctx.tenantId],
    )
    await client.query(
      `INSERT INTO memberships (id, user_id, tenant_id, location_id, role)
       VALUES ($1,$2,$3,NULL,$4) ON CONFLICT DO NOTHING`,
      [`mem-${randomUUID().slice(0, 8)}`, id, ctx.tenantId, MEMBERSHIP_ROLE[role] ?? 'staff'],
    )
    return { user: toPublicUser(rowToUser(res.rows[0])) }
  })
}

export async function updateManagedUser(ctx, targetId, fields) {
  const res = await pool.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [targetId, ctx.tenantId])
  if (!res.rows.length) return { error: 'User not found.' }
  const u = rowToUser(res.rows[0])

  const sets = []
  const vals = []
  let idx = 1

  if (u.role === 'super_admin' && fields.role != null && fields.role !== 'super_admin') {
    return { error: 'Super admin role cannot be changed here.' }
  }
  if (u.role !== 'super_admin' && fields.role !== undefined) {
    if (!MANAGED_ROLES.includes(fields.role)) return { error: 'Role must be staff, admin, or counter cashier.' }
    sets.push(`role = $${idx++}`)
    vals.push(fields.role)
  }

  if (fields.email !== undefined) {
    const norm = normalizeEmail(fields.email)
    if (!norm.includes('@')) return { error: 'Enter a valid email address.' }
    const dup = await pool.query('SELECT id FROM users WHERE email=$1 AND id<>$2', [norm, targetId])
    if (dup.rows.length) return { error: 'This email is already in use.' }
    sets.push(`email = $${idx++}`)
    vals.push(norm)
  }

  if (fields.displayName !== undefined) {
    const t = String(fields.displayName).trim().slice(0, 80)
    sets.push(`display_name = $${idx++}`)
    vals.push(t || null)
  }

  if (fields.newPassword != null && String(fields.newPassword).length > 0) {
    const np = String(fields.newPassword)
    if (np.length < 8) return { error: 'New password must be at least 8 characters.' }
    const hash = await bcrypt.hash(np, BCRYPT_ROUNDS)
    sets.push(`password_hash = $${idx++}`)
    vals.push(hash)
  }

  if (sets.length) {
    vals.push(targetId)
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
  }

  const updated = await pool.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [targetId, ctx.tenantId])
  return { user: toPublicUser(rowToUser(updated.rows[0])) }
}

export async function verifyPassword(plain, passwordHash) {
  return bcrypt.compare(plain, passwordHash)
}
