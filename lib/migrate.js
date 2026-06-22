import { readFile } from 'fs/promises'
import path from 'path'
import { pool } from './db.js'

const MIGRATIONS = ['001_initial.sql', '002_payment_method.sql', '003_combined_deals.sql', '004_deal_status.sql', '005_invoice_sequences.sql', '006_order_type.sql']

export async function runMigrations() {
  for (const file of MIGRATIONS) {
    const sqlPath = path.join(process.cwd(), 'migrations', file)
    const sql = await readFile(sqlPath, 'utf8')
    await pool.query(sql)
  }
  console.log('[db] Migrations applied.')
}
