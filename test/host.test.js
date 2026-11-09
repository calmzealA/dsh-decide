import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-decide-host-'))
process.env.DSH_HOME = home
process.env.TOKENRHYTHM_API_KEY = 'sk-host-test'
delete process.env.TYPESAFE_API_KEY

const registrations = []
const routes = []
let fetchCalls = 0

globalThis.fetch = async () => {
  fetchCalls += 1
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({
      model: 'NeoHorse-Jev-4B',
      answers: {
        refund: { type: 'noul', noul: 0.88 },
        topic: { type: 'choice', choice: 'billing', confidence: 0.9, probabilities: { billing: 0.9, bug: 0.1 } },
        verdict: { type: 'noul', noul: 0.88 },
      },
      usage: { input_tokens: 42, output_tokens: 3 },
    }),
  }
}

const credentials = {
  describe: async ref => ({ configured: true, source: 'store', writable: true }),
  resolve: async ref => ({ value: 'sk-host-test', source: 'store' }),
  set: async () => {},
  unset: async () => {},
}

const webServer = {
  register(route) {
    routes.push(route)
    return () => {}
  },
}

function makeCtx() {
  const ctx = {
    get(name) {
      if (name === 'tools') return { register(definition) { registrations.push(definition); return () => {} } }
      if (name === 'credentials') return credentials
      if (name === 'webServer') return webServer
      return undefined
    },
    effect(fn) {
      const disposer = fn()
      return disposer ?? (() => {})
    },
    on(_event, _listener) {
      return () => {}
    },
    logger: { warn() {}, info() {}, debug() {} },
    inject(_deps, callback) {
      callback({
        get: name => (name === 'webServer' ? webServer : ctx.get(name)),
        effect: ctx.effect,
        webServer,
      })
    },
  }
  return ctx
}

const plugin = await import('../index.js')

test('host registers both tools and the settings API', () => {
  registrations.length = 0
  routes.length = 0
  plugin.apply(makeCtx(), {
    defaultProvider: 'tokenrhythm',
    providers: { tokenrhythm: { enabled: true } },
  })
  assert.deepEqual(registrations.map(item => item.name), ['decide', 'decide_gate', 'decide_rerank', 'decide_judge'])
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/dsh-decide/api')
  assert.equal(typeof routes[0].handler, 'function')
  for (const definition of registrations) {
    assert.equal(typeof definition.output.render, 'function')
    assert.equal(definition.parameters.type, 'object')
    assert.equal(definition.parameters.additionalProperties, false)
  }
})

test('the decide tool executes through the fake host', async () => {
  registrations.length = 0
  plugin.apply(makeCtx(), {
    defaultProvider: 'tokenrhythm',
    providers: { tokenrhythm: { enabled: true } },
  })
  const decide = registrations.find(item => item.name === 'decide')
  const value = await decide.execute({
    state: 'I was charged twice.',
    questions: [
      { name: 'refund', type: 'yesno' },
      { name: 'topic', type: 'choice', choices: [{ label: 'billing' }, { label: 'bug' }] },
    ],
  }, { signal: undefined })
  assert.equal(value.provider, 'tokenrhythm')
  assert.equal(value.answers[0].probability, 0.88)
  assert.equal(value.answers[1].choice, 'billing')
  assert.equal(fetchCalls, 1)
})

test('the gate tool maps the probability to a verdict', async () => {
  registrations.length = 0
  plugin.apply(makeCtx(), {
    defaultProvider: 'tokenrhythm',
    providers: { tokenrhythm: { enabled: true } },
  })
  const gate = registrations.find(item => item.name === 'decide_gate')
  const value = await gate.execute({ action: 'rm -rf build' }, { signal: undefined })
  assert.equal(value.verdict, 'deny')
  assert.equal(value.probability, 0.88)
})

test('the settings API lists providers without exposing secrets', async () => {
  registrations.length = 0
  routes.length = 0
  plugin.apply(makeCtx(), {
    defaultProvider: 'tokenrhythm',
    providers: { tokenrhythm: { enabled: true } },
  })
  const handler = routes[0].handler
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers },
    end(body) { this.body = body },
  }
  const request = { method: 'GET', url: '/dsh-decide/api/providers', headers: { host: '127.0.0.1:1' } }
  await handler(request, response)
  assert.equal(response.statusCode, 200)
  const payload = JSON.parse(response.body)
  assert.ok(Array.isArray(payload.providers))
  assert.equal(payload.providers.find(item => item.id === 'tokenrhythm').key.configured, true)
  assert.equal(JSON.stringify(payload).includes('sk-host-test'), false)
})
