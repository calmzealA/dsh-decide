import test from 'node:test'
import assert from 'node:assert/strict'
import * as systemone from '../lib/adapters/systemone.js'
import * as openai from '../lib/adapters/openai-decisions.js'
import { validateRequest, normalizeQuestion } from '../lib/normalize.js'
import { DecideError } from '../lib/errors.js'

const provider = {
  id: 'typesafe',
  displayName: 'TypeSafe Jev',
  dialect: 'systemone',
  baseURL: 'https://api.typesafe.ai',
  path: '/v1/systemone',
  model: 'jev-latest',
  limits: { maxQuestions: 8, maxChoice: 255, minScore: 1, maxScore: 10, maxStateChars: 120000, maxBodyBytes: 1024 * 1024, supportsBox: false },
  price: { perMTokInput: 0.042, currency: 'USD' },
}

const request = {
  state: 'I was charged twice.',
  questions: [
    { name: 'billing', type: 'yesno', instructions: 'Is this billing?', criteria: { true: 'money', false: 'not money' } },
    { name: 'team', type: 'choice', choices: [{ label: 'billing', description: 'payments' }, { label: 'bug' }] },
    { name: 'urgency', type: 'score', levels: [{ label: 'low' }, { label: 'high', description: 'today' }] },
  ],
}

test('system one builds the documented wire body', () => {
  const wire = systemone.buildRequest(provider, request, 'sk-test')
  assert.equal(wire.url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(wire.headers.authorization, 'Bearer sk-test')
  assert.equal(wire.body.model, 'jev-latest')
  assert.deepEqual(Object.keys(wire.body.questions), ['billing', 'team', 'urgency'])
  assert.deepEqual(wire.body.questions.billing, {
    type: 'noul',
    instructions: 'Is this billing?',
    criteria: { true: 'money', false: 'not money' },
  })
  assert.deepEqual(wire.body.questions.team.criteria, { billing: 'payments', bug: 'bug' })
  assert.deepEqual(wire.body.questions.urgency.criteria, ['low', 'high: today'])
})

test('system one parses choice, score, yesno and box answers', () => {
  const parsed = systemone.parseResponse(provider, request, {
    model: 'jev-1.14.0',
    answers: {
      billing: { type: 'noul', noul: 0.91 },
      team: { type: 'choice', choice: 'billing', confidence: 0.8, probabilities: { billing: 0.8, bug: 0.2 } },
      urgency: { type: 'score', score: 1.7, confidence: 0.55, legend: { '0': 'low', '1': 'high' }, probabilities: { '0': 0.1, '1': 0.9 } },
    },
    usage: { input_tokens: 120, output_tokens: 12 },
  }, { includeProbabilities: true })
  assert.equal(parsed.model, 'jev-1.14.0')
  assert.equal(parsed.answers[0].probability, 0.91)
  assert.equal(parsed.answers[1].choice, 'billing')
  assert.deepEqual(parsed.answers[1].probabilities, [
    { label: 'billing', probability: 0.8 },
    { label: 'bug', probability: 0.2 },
  ])
  assert.equal(parsed.answers[2].score, 1.7)
  assert.deepEqual(parsed.answers[2].levels, [{ label: 'low' }, { label: 'high' }])
  assert.deepEqual(parsed.usage, { inputTokens: 120, outputTokens: 12, totalTokens: 132 })

  const box = systemone.parseResponse(provider, {
    state: 'x',
    questions: [{ name: 'spot', type: 'box' }],
  }, {
    model: 'jev-1.14.0',
    answers: { spot: { type: 'box', box: { top: 0.1, bottom: 0.2, left: 0.3, right: 0.4 }, confidence: null } },
  })
  assert.equal(box.answers[0].type, 'box')
  assert.equal(box.answers[0].confidence, null)
})

test('system one maps the error envelopes', () => {
  const detail = systemone.parseError(provider, 422, { detail: [{ loc: ['body', 'state'], msg: 'Field required', type: 'missing' }] }, '')
  assert.equal(detail.code, 'INVALID_REQUEST')
  assert.match(detail.message, /body\.state: Field required/)

  const tokenrhythm = { ...provider, id: 'tokenrhythm', displayName: 'TokenRhythm' }
  const forbidden = systemone.parseError(tokenrhythm, 403, { code: 'forbidden', message: 'not graylisted' }, '')
  assert.equal(forbidden.code, 'FORBIDDEN')
  assert.match(forbidden.message, /allow-list/)

  const region = systemone.parseError(provider, 451, { detail: 'region' }, '')
  assert.equal(region.code, 'REGION_BLOCKED')
  assert.match(region.message, /egress/)
})

test('system one parses model listings defensively', () => {
  assert.deepEqual(systemone.parseModels({ data: [{ id: 'jev-latest' }, { name: 'alias' }] }), [
    { id: 'jev-latest' },
    { id: 'alias', name: 'alias' },
  ])
  assert.deepEqual(systemone.parseModels(['a', { model: 'b' }]), [{ id: 'a' }, { id: 'b' }])
})

test('openai decisions builds predicate, choice and score', () => {
  const wire = openai.buildRequest({ ...provider, dialect: 'openai-decisions', baseURL: 'https://api.openai.com', path: '/v1/decisions', model: 'gpt-6-luna' }, request, 'sk-openai')
  assert.equal(wire.url, 'https://api.openai.com/v1/decisions')
  assert.equal(wire.body.input, 'I was charged twice.')
  assert.deepEqual(wire.body.questions[0], { name: 'billing', type: 'predicate', instructions: 'Is this billing?' })
  assert.deepEqual(wire.body.questions[1].choices, { billing: 'payments', bug: 'bug' })
  assert.deepEqual(wire.body.questions[2].levels, ['low', { label: 'high', description: 'today' }])
})

test('openai decisions parses answers and refusals', () => {
  const parsed = openai.parseResponse(provider, request, {
    model: 'gpt-6-luna',
    answers: [
      { type: 'predicate', name: 'billing', probability: 0.9 },
      { type: 'choice', name: 'team', choice: 'bug', confidence: 0.7, probabilities: { billing: 0.2, bug: 0.8 } },
      { type: 'score', name: 'urgency', score: 1.5, confidence: 0.6, probabilities: [{ value: 0, label: 'low', probability: 0.4 }, { value: 1, label: 'high', probability: 0.6 }] },
    ],
    usage: { input_tokens: 100, output_tokens: 0, total_tokens: 100 },
  }, { includeProbabilities: true })
  assert.equal(parsed.answers[0].probability, 0.9)
  assert.equal(parsed.answers[1].choice, 'bug')
  assert.deepEqual(parsed.answers[2].probabilities, [
    { label: 'low', probability: 0.4 },
    { label: 'high', probability: 0.6 },
  ])
  assert.equal(parsed.usage.totalTokens, 100)

  const refusal = openai.parseResponse(provider, {
    state: 'x',
    questions: [{ name: 'q', type: 'yesno' }],
  }, {
    model: 'gpt-6-luna',
    answers: [{ type: 'refusal', name: 'q', reason: 'unsafe' }],
  })
  assert.equal(refusal.answers[0].type, 'refusal')
  assert.equal(refusal.answers[0].refused, true)
})

test('openai decisions rejects box questions', () => {
  assert.throws(
    () => openai.buildRequest(provider, { state: 'x', questions: [{ name: 'b', type: 'box' }] }, 'k'),
    error => error instanceof DecideError && error.code === 'UNSUPPORTED',
  )
})

test('validation rejects over-limit and duplicate questions locally', () => {
  const state = { maxQuestions: 8 }
  assert.throws(
    () => validateRequest(state, provider, { state: 'ok', questions: [{ name: 'a', type: 'choice', choices: [{ label: 'x' }] }, { name: 'a', type: 'yesno' }] }),
    /duplicate question name/,
  )
  assert.throws(
    () => validateRequest(state, { ...provider, limits: { ...provider.limits, minScore: 2 } }, {
      state: 'ok',
      questions: [{ name: 'a', type: 'score', levels: [{ label: 'one' }] }],
    }),
    /levels has 1 levels/,
  )
  assert.throws(
    () => normalizeQuestion({ name: '1bad', type: 'yesno' }, 0),
    /name must match/,
  )
})
