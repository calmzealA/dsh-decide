import test from 'node:test'
import assert from 'node:assert/strict'
import { createTransport } from '../lib/transport.js'

const provider = {
  id: 'tokenrhythm',
  displayName: 'TokenRhythm',
  dialect: 'systemone',
}

function adapter() {
  return {
    parseError(providerValue, status, json) {
      const error = new Error('status ' + status)
      error.code = status === 429 ? 'RATE_LIMIT' : status === 422 ? 'INVALID_REQUEST' : 'SERVER'
      error.retryable = status === 429 || status === 503
      return error
    },
  }
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

test('retries a retryable status and then succeeds', async () => {
  let calls = 0
  const sleeps = []
  const transport = createTransport({
    fetchImpl: async () => {
      calls += 1
      return calls === 1 ? response(429, { detail: 'slow down' }) : response(200, { ok: true })
    },
    sleep: async ms => { sleeps.push(ms) },
  })
  const json = await transport({
    url: 'http://x', headers: {}, body: {}, provider, adapter: adapter(), timeoutMs: 1000, maxRetries: 2,
  })
  assert.deepEqual(json, { ok: true })
  assert.equal(calls, 2)
  assert.equal(sleeps.length, 1)
  assert.ok(sleeps[0] > 0)
})

test('does not retry a validation failure', async () => {
  let calls = 0
  const transport = createTransport({
    fetchImpl: async () => { calls += 1; return response(422, { detail: 'bad' }) },
    sleep: async () => {},
  })
  await assert.rejects(
    transport({ url: 'http://x', headers: {}, body: {}, provider, adapter: adapter(), timeoutMs: 1000, maxRetries: 2 }),
    /status 422/,
  )
  assert.equal(calls, 1)
})

test('does not retry a network failure', async () => {
  let calls = 0
  const transport = createTransport({
    fetchImpl: async () => { calls += 1; throw new TypeError('fetch failed') },
    sleep: async () => {},
  })
  await assert.rejects(
    transport({ url: 'http://x', headers: {}, body: {}, provider, adapter: adapter(), timeoutMs: 1000, maxRetries: 2 }),
    error => error.code === 'NETWORK',
  )
  assert.equal(calls, 1)
})

test('reports a timeout without retrying', async () => {
  let calls = 0
  const transport = createTransport({
    fetchImpl: async (_url, init) => {
      calls += 1
      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    },
    sleep: async () => {},
  })
  await assert.rejects(
    transport({ url: 'http://x', headers: {}, body: {}, provider, adapter: adapter(), timeoutMs: 10, maxRetries: 2 }),
    error => error.code === 'TIMEOUT',
  )
  assert.equal(calls, 1)
})

test('rejects non-JSON success bodies', async () => {
  const transport = createTransport({
    fetchImpl: async () => response(200, '<html>'),
    sleep: async () => {},
  })
  await assert.rejects(
    transport({ url: 'http://x', headers: {}, body: {}, provider, adapter: adapter(), timeoutMs: 1000, maxRetries: 0 }),
    error => error.code === 'RESPONSE',
  )
})
