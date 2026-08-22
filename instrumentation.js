export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/migrate.js')
    const { ensureSuperAdminSeed, ensurePlatformOwner } = await import('./lib/repositories/usersRepository.js')
    try {
      await runMigrations()
      await ensureSuperAdminSeed()
      await ensurePlatformOwner()
    } catch (err) {
      console.error('[startup] DB init error:', err)
    }
  }
}
