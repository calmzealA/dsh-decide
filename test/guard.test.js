import test from 'node:test'
import assert from 'node:assert/strict'
import { registerGuard } from '../lib/guard.js'

function makeCtx() {
  let handler
  const ctx = {
    on(event, listener) {
      if (event === 'tools/pre-execute') handler = listener
      return () => {}
    },
    logger: { warn() {} },
    get() {
      return undefined
    },
  }
  return { ctx, handler: (...args) => handler(...args) }
}

function stateWith(guard = {}) {
  return {
    guard: {
      enabled: true,
      tools: ['bash'],
      provider: 'tokenrhythm',
      low: 0.35,
      high: 0.65,
      onError: 'allow',
      ...guard,
    },
  }
}

test('guard is inert when disabled or for other tools', async () => {
  const { ctx, handler } = makeCtx()
  let nextCalls = 0
  const next = () => { nextCalls += 1; return { kind: 'default' } }
  registerGuard(ctx, async () => stateWith({ enabled: false }), { executeGate: async () => ({ verdict: 'deny' }) })
  assert.deepEqual(await handler({ name: 'bash', arguments: { command: 'rm -rf x' } }, next), { kind: 'default' })
  assert.equal(nextCalls, 1)

  registerGuard(ctx, async () => stateWith(), { executeGate: async () => ({ verdict: 'deny' }) })
  assert.deepEqual(await handler({ name: 'read', arguments: { path: 'x' } }, next), { kind: 'default' })
  assert.equal(nextCalls, 2)
})

test('allow delegates, deny blocks, review asks', async () => {
  for (const [verdict, expected] of [
    ['allow', 'default'],
    ['deny', 'deny'],
    ['review', 'ask'],
  ]) {
    const { ctx, handler } = makeCtx()
    const next = () => ({ kind: 'default' })
    registerGuard(ctx, async () => stateWith(), {
      executeGate: async () => ({ verdict, probability: 0.8, provider: 'tokenrhythm', providerLabel: 'TokenRhythm' }),
    })
    const decision = await handler({ name: 'bash', arguments: { command: 'rm -rf x' } }, next)
    assert.equal(decision.kind, expected)
    if (verdict !== 'allow') assert.match(decision.reason, /decision guard/i)
  }
})

test('guard reads a JSON-encoded argument bag', async () => {
  const { ctx, handler } = makeCtx()
  let seen
  registerGuard(ctx, async () => stateWith(), {
    executeGate: async (_state, _ctx, input) => {
      seen = input.action
      return { verdict: 'deny', probability: 0.9, provider: 'tokenrhythm', providerLabel: 'TokenRhythm' }
    },
  })
  await handler({ name: 'bash', arguments: JSON.stringify({ command: 'git push --force' }) }, () => ({ kind: 'default' }))
  assert.equal(seen, 'git push --force')
})

test('guard fails open or closed according to onError', async () => {
  const { ctx, handler } = makeCtx()
  const next = () => ({ kind: 'default' })
  registerGuard(ctx, async () => stateWith({ onError: 'allow' }), {
    executeGate: async () => { throw new Error('provider down') },
  })
  assert.deepEqual(await handler({ name: 'bash', arguments: { command: 'ls' } }, next), { kind: 'default' })

  const closed = makeCtx()
  registerGuard(closed.ctx, async () => stateWith({ onError: 'deny' }), {
    executeGate: async () => { throw new Error('provider down') },
  })
  const decision = await closed.handler({ name: 'bash', arguments: { command: 'ls' } }, next)
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /unavailable/)
})
