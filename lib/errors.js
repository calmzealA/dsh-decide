/**
 * Stable error codes shared by the adapters, tools, and settings page.
 * The model sees the message; the page and logs can branch on the code.
 */

export class DecideError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'DecideError'
    this.code = code
    this.provider = options.provider
    this.dialect = options.dialect
    this.status = options.status
    this.retryable = options.retryable === true
    this.traceId = options.traceId
    this.detail = options.detail
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529])

export function statusCode(status) {
  const numeric = Number(status)
  return Number.isFinite(numeric) ? numeric : 0
}

export function classifyStatus(status) {
  switch (statusCode(status)) {
    case 400:
    case 422:
      return { code: 'INVALID_REQUEST', retryable: false }
    case 401:
      return { code: 'AUTH', retryable: false }
    case 403:
      return { code: 'FORBIDDEN', retryable: false }
    case 402:
      return { code: 'QUOTA', retryable: false }
    case 413:
      return { code: 'LIMIT', retryable: false }
    case 429:
      return { code: 'RATE_LIMIT', retryable: true }
    case 451:
      return { code: 'REGION_BLOCKED', retryable: false }
    default:
      return RETRYABLE_STATUS.has(statusCode(status))
        ? { code: 'SERVER', retryable: true }
        : { code: 'SERVER', retryable: false }
  }
}

export function truncate(value, limit = 400) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return ''
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

/** Pull a readable message out of the three error envelopes we meet. */
export function errorMessage(json, text) {
  if (json && typeof json === 'object') {
    if (typeof json.detail === 'string' && json.detail) return truncate(json.detail)
    if (Array.isArray(json.detail)) {
      const parts = json.detail.map(item => {
        if (!item || typeof item !== 'object') return String(item)
        const where = Array.isArray(item.loc) ? item.loc.join('.') : ''
        return (where ? where + ': ' : '') + (item.msg ?? item.type ?? '')
      })
      return truncate(parts.join('; '))
    }
    if (json.error && typeof json.error === 'object' && json.error.message) {
      return truncate(json.error.message)
    }
    if (typeof json.message === 'string' && json.message) return truncate(json.message)
  }
  if (text) return truncate(String(text))
  return 'request failed'
}

export function errorFromResponse(provider, status, json, text) {
  const classification = classifyStatus(status)
  const message = errorMessage(json, text)
  const traceId = json?.traceId ?? json?.trace_id ?? json?.request_id ?? json?.requestId
  return new DecideError(classification.code, `${provider.displayName}: ${message}`, {
    provider: provider.id,
    dialect: provider.dialect,
    status: statusCode(status),
    retryable: classification.retryable,
    traceId,
  })
}

export function asDecideError(error, provider) {
  if (error instanceof DecideError) return error
  if (error?.name === 'AbortError') {
    return new DecideError('ABORTED', 'request was cancelled', { provider: provider?.id })
  }
  return new DecideError('UNEXPECTED', error?.message ?? String(error), { provider: provider?.id })
}
