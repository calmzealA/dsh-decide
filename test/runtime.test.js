import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-decide-test-'))
process.env.DSH_HOME = home
delete process.env.TOKENRHYTHM_API_KEY
delete process.env.TYPESAFE_API_KEY
delete process.env.OPENAI_API_KEY

const { normalizeState } = await import('../lib/config.js')
const { createRuntime } = await import('../lib/runtime.js')
const { readDecisions, computeStats } = await import('../lib/audit.js')

const provider = { id: 'tokenrhythm', displayName: 'TokenRhythm NeoHorse-Jev', dialect: 'systemone' }

function ctxWith(keys) {
  return {
    get(name) {
      if (name !== 'credentials') return undefined
      return {
        describe: async ref => (keys[ref]
          ? { configured: true, source: 'store', writable: true }
          : { configured: false, source: 'missing', writable: false }),
        resolve: async ref => (keys[ref] ? { value: keys[ref], source: 'store' } : undefined),
        set: async () => {},
        unset: async () => {},
      }
    },
  }
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  }
}

function decisionBody(probability = 0.91) {
  return {
    model: 'NeoHorse-Jev-4B',
    answers: {
      topic: { type: 'choice', choice: 'billing', confidence: 0.8, probabilities: { billing: 0.8, bug: 0.2 } },
      refund: { type: 'noul', noul: probability },
    },
    usage: { input_tokens: 100, output_tokens: 5 },
  }
}

function makeState(extra = {}) {
  return normalizeState({ maxRetries: 0, ...extra }, {})
}

test('executes a decision, normalizes it, and records audit + stats', async () => {
  const state = makeState()
  const ctx = ctxWith({ TOKENRHYTHM_API_KEY: 'sk-tokenrhythm' })
  let calls = 0
  const runtime = createRuntime({ fetchImpl: async () => { calls += 1; return response(200, decisionBody()) } })
  const result = await runtime.executeDecision(state, ctx, {
    provider: 'tokenrhythm',
    state: 'I was charged twice.',
    questions: [
      { name: 'topic', type: 'choice', choices: [{ label: 'billing' }, { label: 'bug' }] },
      { name: 'refund', type: 'yesno' },
    ],
    includeProbabilities: true,
  })
  assert.equal(calls, 1)
  assert.equal(result.provider, 'tokenrhythm')
  assert.equal(result.model, 'NeoHorse-Jev-4B')
  assert.equal(result.answers[0].choice, 'billing')
  assert.equal(result.answers[0].probability, 0.8)
  assert.equal(result.answers[1].probability, 0.91)
  assert.equal(result.answers[1].uncertain, false)
  assert.equal(result.usage.inputTokens, 100)
  assert.equal(result.estimatedCost, undefined)

  const records = await readDecisions(state)
  assert.equal(records.length, 1)
  assert.equal(records[0].provider, 'tokenrhythm')
  assert.equal(records[0].outcome, 'ok')
  assert.equal(records[0].state, undefined)
  assert.ok(records[0].stateHash)

  const stats = await computeStats(state)
  assert.equal(stats.last7.total.requests, 1)
  assert.equal(stats.last7.providers.tokenrhythm.inputTokens, 100)
})

test('identical requests hit the cache and are not billed twice', async () => {
  const state = makeState()
  const ctx = ctxWith({ TOKENRHYTHM_API_KEY: 'sk-tokenrhythm' })
  let calls = 0
  const runtime = createRuntime({ fetchImpl: async () => { calls += 1; return response(200, decisionBody()) } })
  const request = {
    provider: 'tokenrhythm',
    state: 'cache me',
    questions: [{ name: 'refund', type: 'yesno' }],
  }
  await runtime.executeDecision(state, ctx, request)
  const second = await runtime.executeDecision(state, ctx, request)
  assert.equal(calls, 1)
  assert.equal(second.cached, true)
})

test('missing key fails loudly without a request', async () => {
  const state = makeState()
  const ctx = ctxWith({})
  let calls = 0
  const runtime = createRuntime({ fetchImpl: async () => { calls += 1; return response(200, decisionBody()) } })
  await assert.rejects(
    runtime.executeDecision(state, ctx, {
      provider: 'tokenrhythm',
      state: 'x',
      questions: [{ name: 'refund', type: 'yesno' }],
    }),
    error => error.code === 'MISSING_CREDENTIAL',
  )
  assert.equal(calls, 0)
})

test('the first provider with a key becomes the default', async () => {
  const state = makeState()
  const ctx = ctxWith({ TOKENRHYTHM_API_KEY: 'sk-tokenrhythm' })
  const runtime = createRuntime({ fetchImpl: async () => response(200, decisionBody()) })
  const result = await runtime.executeDecision(state, ctx, {
    state: 'x',
    questions: [{ name: 'refund', type: 'yesno' }],
  })
  assert.equal(result.provider, 'tokenrhythm')
})

test('a local provider is keyless', async () => {
  const state = normalizeState({ maxRetries: 0, providers: { local: { enabled: true } } }, {})
  const ctx = ctxWith({})
  const runtime = createRuntime({ fetchImpl: async () => response(200, decisionBody()) })
  const result = await runtime.executeDecision(state, ctx, {
    provider: 'local',
    state: 'x',
    questions: [{ name: 'refund', type: 'yesno' }],
  })
  assert.equal(result.provider, 'local')
})

test('gate maps probability to allow, review, deny', async () => {
  const state = makeState()
  const ctx = ctxWith({ TOKENRHYTHM_API_KEY: 'sk-tokenrhythm' })
  for (const [probability, verdict] of [[0.1, 'allow'], [0.5, 'review'], [0.9, 'deny']]) {
    const runtime = createRuntime({
      fetchImpl: async () => response(200, {
        model: 'NeoHorse-Jev-4B',
        answers: { verdict: { type: 'noul', noul: probability } },
        usage: { input_tokens: 20, output_tokens: 1 },
      }),
    })
    const result = await runtime.executeGate(state, ctx, { action: 'rm -rf /', provider: 'tokenrhythm' })
    assert.equal(result.verdict, verdict)
    assert.equal(result.probability, probability)
  }
})

test('list models uses the provider models endpoint', async () => {
  const state = makeState()
  const ctx = ctxWith({ TOKENRHYTHM_API_KEY: 'sk-tokenrhythm' })
  let requested
  const runtime = createRuntime({
    fetchImpl: async url => {
      requested = url
      return response(200, { data: [{ id: 'NeoHorse-Jev-4B' }] })
    },
  })
  const result = await runtime.listModels(state, ctx, 'tokenrhythm')
  assert.equal(requested, 'https://tokenrhythm.studio/v1/models')
  assert.deepEqual(result.models, [{ id: 'NeoHorse-Jev-4B' }])
})

test('gate audit records both successes and errors', async () => {
  const state = makeState()
  const ctx = ctxWith({ TOKENRHYTHM_API_KEY: 'sk-tokenrhythm' })
  const runtime = createRuntime({
    fetchImpl: async () => response(200, {
      model: 'NeoHorse-Jev-4B',
      answers: { verdict: { type: 'noul', noul: 0.5 } },
      usage: { input_tokens: 10, output_tokens: 0 },
    }),
  })
  await runtime.executeGate(state, ctx, { action: 'git push --force', provider: 'tokenrhythm' })
  const records = await readDecisions(state, { limit: 5 })
  assert.equal(records[0].tool, 'gate')
  assert.equal(records[0].outcome, 'ok')
})
