import test from 'node:test'
import assert from 'node:assert/strict'
import { registerTriage } from '../lib/triage.js'

function makeCtx() {
  let handler
  const ctx = {
    on(event, listener) {
      if (event === 'agent/pre-step') handler = listener
      return () => {}
    },
    logger: { warn() {} },
    get() {
      return undefined
    },
  }
  return { ctx, handler: (...args) => handler(...args) }
}

function stateWith(enabled) {
  return { experimental: { triage: { enabled, provider: '' } } }
}

const payload = {
  step: 1,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] }],
}

test('triage appends a notice when enabled', async () => {
  const { ctx, handler } = makeCtx()
  registerTriage(ctx, async () => stateWith(true), {
    executeDecision: async () => ({
      provider: 'tokenrhythm',
      providerLabel: 'TokenRhythm',
      dialect: 'systemone',
      model: 'NeoHorse-Jev-4B',
      answers: [{ name: 'mode', type: 'choice', choice: 'quick', probability: 0.82, uncertain: false }],
      latencyMs: 5,
    }),
  })
  const decision = await handler(payload, async () => ({ kind: 'enter', messages: [] }))
  assert.equal(decision.kind, 'enter')
  assert.equal(decision.messages.length, 1)
  const notice = decision.messages[0]
  assert.equal(notice.role, 'user')
  assert.equal(notice.source.kind, 'plugin:dsh-decide')
  assert.match(notice.source.summary, /Decision triage: quick/)
  assert.match(notice.content[0].text, /Answer directly/)
})

test('triage is inert when disabled or not on step 1', async () => {
  const { ctx, handler } = makeCtx()
  let calls = 0
  registerTriage(ctx, async () => stateWith(false), {
    executeDecision: async () => { calls += 1; throw new Error('should not run') },
  })
  assert.deepEqual(await handler(payload, async () => ({ kind: 'enter', messages: [] })), { kind: 'enter', messages: [] })
  assert.equal(calls, 0)

  const enabled = makeCtx()
  registerTriage(enabled.ctx, async () => stateWith(true), {
    executeDecision: async () => {
      calls += 1
      return { answers: [{ name: 'mode', type: 'choice', choice: 'deep', probability: 0.9 }] }
    },
  })
  await enabled.handler({ ...payload, step: 2 }, async () => ({ kind: 'enter', messages: [] }))
  assert.equal(calls, 0)
})

test('a triage failure leaves the step untouched', async () => {
  const { ctx, handler } = makeCtx()
  registerTriage(ctx, async () => stateWith(true), {
    executeDecision: async () => { throw new Error('provider down') },
  })
  const decision = await handler(payload, async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(decision, { kind: 'enter', messages: [] })
})
