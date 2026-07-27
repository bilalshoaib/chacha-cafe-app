import { readFile } from 'fs/promises'
import path from 'path'
import { pool } from './db.js'

const MIGRATIONS = ['001_initial.sql', '002_payment_method.sql', '003_combined_deals.sql', '004_deal_status.sql', '005_invoice_sequences.sql', '006_order_type.sql', '007_delivery_charge.sql', '008_shift_number.sql']

export async function runMigrations() {
  const startedAll = performance.now()
  const marks = []
  for (const file of MIGRATIONS) {
    const started = performance.now()
    const sqlPath = path.join(process.cwd(), 'migrations', file)
    const sql = await readFile(sqlPath, 'utf8')
    await pool.query(sql)
    marks.push(`${file}=${Math.round(performance.now() - started)}ms`)
  }
  console.log(`[db] Migrations applied in ${Math.round(performance.now() - startedAll)}ms — ${marks.join(' ')}`)
}
