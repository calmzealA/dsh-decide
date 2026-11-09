/**
 * HTTP transport for one decision request.
 *
 * Retries only when the provider answered with a retryable status (429, 5xx,
 * 529) — never after a timeout or a network failure, because the decision API
 * has no documented idempotency key and a blind retry could bill twice.
 */

import { DecideError } from './errors.js'

const DEFAULT_TIMEOUT_MS = 20000
const MAX_RETRY_DELAY_MS = 5000

function retryAfterMs(headers) {
  const raw = headers?.get?.('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_DELAY_MS, seconds * 1000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - Date.now()))
  return undefined
}

function sleepFor(random, attempt) {
  const base = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** attempt)
  return base + Math.floor(random() * 250)
}

export function createTransport(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const random = options.random ?? Math.random

  return async function requestJSON(input) {
    const {
      url,
      headers,
      body,
      provider,
      adapter,
      signal,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxRetries = 2,
    } = input
    if (signal?.aborted) {
      throw new DecideError('ABORTED', 'request was cancelled', { provider: provider?.id })
    }
    const text = JSON.stringify(body)
    let attempt = 0

    for (;;) {
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      const relayAbort = () => controller.abort()
      if (signal) signal.addEventListener('abort', relayAbort, { once: true })
      let response
      let raw
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers,
          body: text,
          signal: controller.signal,
        })
        raw = await response.text()
      } catch (error) {
        if (signal?.aborted) {
          throw new DecideError('ABORTED', 'request was cancelled', { provider: provider?.id })
        }
        if (timedOut || error?.name === 'TimeoutError') {
          throw new DecideError(
            'TIMEOUT',
            `${provider.displayName} did not answer within ${timeoutMs} ms`,
            { provider: provider.id, dialect: provider.dialect },
          )
        }
        if (error?.name === 'AbortError') {
          throw new DecideError('ABORTED', 'request was cancelled', { provider: provider?.id })
        }
        throw new DecideError(
          'NETWORK',
          `cannot reach ${provider.displayName}: ${error?.message ?? String(error)}`,
          { provider: provider.id, dialect: provider.dialect },
        )
      } finally {
        clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', relayAbort)
      }

      let json
      let parseFailed = false
      if (raw && raw.trim()) {
        try {
          json = JSON.parse(raw)
        } catch {
          parseFailed = true
        }
      }

      if (!response.ok) {
        const error = adapter.parseError(provider, response.status, json, raw)
        if (error.retryable && attempt < maxRetries) {
          const delay = retryAfterMs(response.headers) ?? sleepFor(random, attempt)
          attempt += 1
          await sleep(delay)
          continue
        }
        throw error
      }

      if (parseFailed || json === undefined) {
        throw new DecideError(
          'RESPONSE',
          `${provider.displayName} returned a response that is not JSON`,
          { provider: provider.id, dialect: provider.dialect, status: response.status },
        )
      }
      return json
    }
  }
}

export const requestJSON = createTransport()
