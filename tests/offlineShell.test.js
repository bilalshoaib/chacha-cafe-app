import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

/**
 * The service worker is the thing standing between a disconnected till and the
 * browser's own error page, and it runs in a context node does not have. So it
 * is loaded here into a stub of that context — which also means this test
 * fails if the file stops parsing, which is worth having on its own: a syntax
 * error in sw.js is invisible until a real browser refuses to register it, and
 * by then the till is back to losing the app when the wifi goes.
 */
async function loadWorker() {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  const listeners = {}
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn },
    location: { origin: 'https://app.chachacafe.com' },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  }
  const context = vm.createContext({ self, caches: undefined, fetch: async () => {}, Response, URL, console })
  vm.runInContext(source, context)
  return { context, listeners, evaluate: (expr) => vm.runInContext(expr, context) }
}

test('the worker parses and registers the handlers a till depends on', async () => {
  const { listeners } = await loadWorker()
  for (const type of ['install', 'activate', 'fetch', 'message']) {
    assert.equal(typeof listeners[type], 'function', `no ${type} handler`)
  }
})

test('every invoice shares one cached copy of the receipt screen', async () => {
  const { evaluate } = await loadWorker()
  // The point of the whole exercise: a receipt for a sale rung up offline
  // opens on a till that has never loaded that URL, because the screen the
  // server renders is the same skeleton whatever the id.
  const template = evaluate("shellKey('/invoices/inv-5183')")
  assert.equal(evaluate("shellKey('/invoices/inv-1')"), template)
  assert.equal(evaluate("shellKey('/invoices/inv-99999')"), template)
  assert.equal(evaluate("shellKey('/invoices/inv-5183/')"), template)
})

test('the invoice list is not swallowed by the invoice template', async () => {
  const { evaluate } = await loadWorker()
  const template = evaluate("shellKey('/invoices/inv-5183')")
  // /invoices is a real screen of its own with real rows on it. Serving the
  // receipt skeleton for it would be a blank page where the day's sales are.
  assert.notEqual(evaluate("shellKey('/invoices')"), template)
  assert.equal(evaluate("shellKey('/invoices')"), '/invoices')
  assert.notEqual(evaluate("shellKey('/invoices/inv-5183/edit')"), template)
})

test('ordinary screens are cached under their own address', async () => {
  const { evaluate } = await loadWorker()
  assert.equal(evaluate("shellKey('/orders')"), '/orders')
  assert.equal(evaluate("shellKey('/orders/')"), '/orders')
  assert.equal(evaluate("shellKey('/settings/team')"), '/settings/team')
  assert.equal(evaluate("shellKey('/')"), '/')
})

test('route payload requests are recognised so they can be left to fail', async () => {
  const { evaluate } = await loadWorker()
  // Next answers a failed payload fetch with a full document navigation, which
  // is the request the worker can actually serve. Catching these instead would
  // hand the router a tree built for whichever URL happened to be cached.
  const rsc = (query, header) =>
    evaluate(`isRscRequest({ headers: { get: () => ${JSON.stringify(header)} } }, new URL('https://app.chachacafe.com/invoices/inv-1${query}'))`)
  assert.equal(rsc('?_rsc=abc', null), true)
  assert.equal(rsc('', '1'), true)
  assert.equal(rsc('', null), false)
})
