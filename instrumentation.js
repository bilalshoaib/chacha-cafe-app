export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/migrate.js')
    const { ensureSuperAdminSeed } = await import('./lib/repositories/usersRepository.js')
    try {
      await runMigrations()
      await ensureSuperAdminSeed()
    } catch (err) {
      console.error('[startup] DB init error:', err)
    }
  }
}
