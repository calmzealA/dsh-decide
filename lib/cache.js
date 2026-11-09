/** Small, bounded result cache keyed by the exact outbound request. */

import { createHash } from 'node:crypto'

export function cacheKey(provider, request, includeProbabilities) {
  const material = JSON.stringify({
    provider: provider.id,
    dialect: provider.dialect,
    model: provider.model,
    baseURL: provider.baseURL,
    path: provider.path,
    state: request.state,
    questions: request.questions,
    includeProbabilities: includeProbabilities === true,
  })
  return createHash('sha256').update(material).digest('hex')
}

export function createCache(options = {}) {
  const ttlMs = options.ttlMs ?? 300000
  const maxEntries = options.maxEntries ?? 256
  const now = options.now ?? Date.now
  const store = new Map()

  function prune() {
    const current = now()
    for (const [key, entry] of store) {
      if (entry.expiresAt <= current) store.delete(key)
    }
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  return {
    get(key) {
      if (ttlMs <= 0 || maxEntries <= 0) return undefined
      const entry = store.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        store.delete(key)
        return undefined
      }
      return structuredClone(entry.value)
    },
    set(key, value) {
      if (ttlMs <= 0 || maxEntries <= 0) return
      store.set(key, { value: structuredClone(value), expiresAt: now() + ttlMs })
      prune()
    },
    clear() {
      store.clear()
    },
    size() {
      return store.size
    },
  }
}
