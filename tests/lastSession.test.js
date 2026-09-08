import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The rule this file exists to hold: a server that cannot be reached is not a
 * server that said no. Getting it wrong is what turned a disconnected till
 * into a signed-out browser with a queued sale it could no longer show.
 */
function withStorage(run) {
  const store = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  }
  try {
    return run(store)
  } finally {
    delete globalThis.window
  }
}

const load = async () => import(`../utils/lastSession.js?t=${Math.random()}`)

test('the till remembers who was signed in, and hands them back', async () => {
  const { rememberSession, readRememberedSession } = await load()
  await withStorage(() => {
    rememberSession({ id: 'u1', role: 'counter_cashier', effectiveTenantId: 't1' })
    assert.deepEqual(readRememberedSession(), {
      id: 'u1', role: 'counter_cashier', effectiveTenantId: 't1',
    })
  })
})

test('signing out is remembered too', async () => {
  const { rememberSession, forgetSession, readRememberedSession } = await load()
  await withStorage(() => {
    rememberSession({ id: 'u1' })
    forgetSession()
    assert.equal(readRememberedSession(), null)
  })
})

test('a session older than a week is not woken up', async () => {
  const { readRememberedSession } = await load()
  await withStorage((store) => {
    const eightDays = Date.now() - 8 * 24 * 60 * 60 * 1000
    store.set('cafe.lastSession', JSON.stringify({ at: eightDays, user: { id: 'u1' } }))
    assert.equal(readRememberedSession(), null)
    // And dropped, so it is not re-read on every page for the rest of time.
    assert.equal(store.has('cafe.lastSession'), false)
  })
})

test('a session from six days ago still counts, so a closed weekend is survivable', async () => {
  const { readRememberedSession } = await load()
  await withStorage((store) => {
    const sixDays = Date.now() - 6 * 24 * 60 * 60 * 1000
    store.set('cafe.lastSession', JSON.stringify({ at: sixDays, user: { id: 'u1' } }))
    assert.deepEqual(readRememberedSession(), { id: 'u1' })
  })
})

test('nonsense in storage is ignored rather than thrown', async () => {
  const { readRememberedSession } = await load()
  await withStorage((store) => {
    store.set('cafe.lastSession', 'not json')
    assert.equal(readRememberedSession(), null)
    store.set('cafe.lastSession', JSON.stringify({ user: { id: 'u1' } }))
    assert.equal(readRememberedSession(), null, 'no timestamp means no way to age it out')
  })
})

test('storage that throws does not take the till down with it', async () => {
  const { rememberSession, readRememberedSession, forgetSession } = await load()
  globalThis.window = {
    localStorage: {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    },
  }
  try {
    assert.doesNotThrow(() => rememberSession({ id: 'u1' }))
    assert.equal(readRememberedSession(), null)
    assert.doesNotThrow(() => forgetSession())
  } finally {
    delete globalThis.window
  }
})

test('nothing is remembered on the server, where there is no browser to remember it', async () => {
  const { rememberSession, readRememberedSession } = await load()
  assert.doesNotThrow(() => rememberSession({ id: 'u1' }))
  assert.equal(readRememberedSession(), null)
})
