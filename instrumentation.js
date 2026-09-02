/**
 * How long the process waits for database start-up work before serving anyway.
 *
 * Next holds this instance's first request until register() returns, so
 * anything that can hang in here hangs the instance: no page, no error, a tab
 * spinning until somebody gives up and reloads. Every step below has its own
 * deadline, and this is the backstop for the case none of them anticipated.
 *
 * Serving without having finished is safe in the case that actually happens —
 * another instance is applying the same migrations — and in the case where it
 * would not be, a half-migrated schema, the requests fail loudly and visibly
 * rather than silently not being answered at all.
 */
const INIT_BUDGET_MS = 45_000

export async function register() {
  // The runtime check has to be a block wrapping the imports, not an early
  // return above them. Next replaces process.env.NEXT_RUNTIME with a literal at
  // build time and compiles this file for the edge runtime as well as node, so
  // written this way the whole branch folds to nothing in the edge bundle and
  // pg is never pulled in. Behind an early return the imports stay reachable,
  // webpack follows them, and the edge build dies on pg reaching for `fs` —
  // taking every page with it.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const init = (async () => {
      const { runMigrations } = await import('./lib/migrate.js')
      const { bootstrapNeeded, ensureSuperAdminSeed, ensurePlatformOwner } =
        await import('./lib/repositories/usersRepository.js')

      await runMigrations()

      // One question, then usually nothing. See bootstrapNeeded().
      const needed = await bootstrapNeeded()
      if (needed.superAdmin) await ensureSuperAdminSeed()
      if (needed.platformOwner) await ensurePlatformOwner()
    })().catch((err) => {
      console.error('[startup] DB init error:', err)
    })

    let timer
    const budget = new Promise((resolve) => {
      timer = setTimeout(() => {
        console.error(`[startup] DB init still running after ${INIT_BUDGET_MS}ms — serving anyway.`)
        resolve()
      }, INIT_BUDGET_MS)
    })

    try {
      await Promise.race([init, budget])
    } finally {
      clearTimeout(timer)
    }
  }
}
