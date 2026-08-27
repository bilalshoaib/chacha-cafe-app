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

/**
 * Records that the platform looked at a café's books, at most once an hour per
 * person per café.
 *
 * The trail is the promise the console makes to customers — "every time we
 * open your café is written down and you can see it" — and reading their sales
 * figures is opening their café, whether or not impersonation was used to do
 * it. So it has to be logged.
 *
 * But a reports screen with four tabs and a date range fires a request every
 * time either is touched, and a trail with forty identical lines in it is one
 * nobody reads. The window collapses a sitting into a single entry, in one
 * statement so it still costs a single round trip: the INSERT simply finds no
 * row to insert when a recent one exists.
 */
export async function recordReportAccess({ actorId, actorEmail, tenantId, detail }) {
  try {
    await pool.query(
      // Cast explicitly: $2 and $4 appear both in the SELECT list, where their
      // type comes from the target column, and in the NOT EXISTS below, where
      // it comes from the comparison — and Postgres refuses to deduce two
      // types for one parameter rather than picking one.
      `INSERT INTO audit_log (id, actor_id, actor_email, tenant_id, action, detail)
       SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, 'reports_viewed', $5::varchar
        WHERE NOT EXISTS (
              SELECT 1 FROM audit_log
               WHERE tenant_id = $4 AND actor_id = $2 AND action = 'reports_viewed'
                 AND created_at > NOW() - INTERVAL '1 hour')`,
      [`aud-${randomUUID().slice(0, 12)}`, actorId, actorEmail, tenantId,
       detail ? String(detail).slice(0, 500) : null],
    )
  } catch (err) {
    console.error('[audit] could not record reports_viewed', err.message)
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
