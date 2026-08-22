import { randomUUID } from 'crypto'
import { pool } from './db.js'

/**
 * Records something a person did that a customer may later ask about.
 *
 * Written outside withTenant(): an audit entry belongs to the platform, not to
 * the café it concerns, and must survive that café being deleted — which is
 * also why tenant_id carries no foreign key here.
 *
 * Never throws. A failure to write the log must not take down the action it
 * was describing, and a support session that cannot be logged is still better
 * than a customer left waiting; the console surfaces gaps instead.
 */
export async function recordAudit({ actorId, actorEmail, tenantId, tenantName, action, detail }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (id, actor_id, actor_email, tenant_id, tenant_name, action, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [`aud-${randomUUID().slice(0, 12)}`, actorId, actorEmail, tenantId ?? null,
       tenantName ?? null, action, detail ? String(detail).slice(0, 500) : null],
    )
  } catch (err) {
    console.error('[audit] could not record', action, err.message)
  }
}

/** The trail for one café, newest first. */
export async function listAuditForTenant(tenantId, limit = 50) {
  const res = await pool.query(
    `SELECT id, actor_email, action, detail, created_at FROM audit_log
      WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  )
  return res.rows.map((r) => ({
    id: r.id, actorEmail: r.actor_email, action: r.action, detail: r.detail,
    createdAt: r.created_at.toISOString(),
  }))
}
