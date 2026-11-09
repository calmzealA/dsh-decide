import test from 'node:test'
import assert from 'node:assert/strict'

let captured
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec
    },
  },
  __DSH_BOOT__: { connection: { origin: 'http://127.0.0.1:1' } },
}

await import('../client.js')

let hookQueue = []
let hookIndex = 0

function withHooks(queue, fn) {
  hookQueue = queue
  hookIndex = 0
  try {
    return fn()
  } finally {
    hookQueue = []
    hookIndex = 0
  }
}

const React = {
  createElement(type, props, ...children) {
    return { type, props, children }
  },
  useState(initial) {
    const has = hookIndex < hookQueue.length
    const value = has ? hookQueue[hookIndex] : initial
    hookIndex += 1
    return [value, () => {}]
  },
  useEffect() {},
  useMemo(fn) {
    return fn()
  },
}

const sections = []
const ctx = {
  effect(fn) {
    return fn()
  },
  locale: {
    bind: () => key => key,
    register: () => {},
  },
  slots: {
    inject: (_name, callback) => callback(),
    register: (definition, component) => sections.push({ definition, component }),
  },
}

const exports = captured.factory(name => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
exports.apply(ctx)
const Page = sections[0].component

function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

function findComponent(tree, name) {
  let found
  walk(tree, node => {
    if (typeof node.type === 'function' && node.type.name === name) found = node
  })
  return found
}

function texts(tree) {
  const out = []
  walk(tree, node => {
    for (const child of node.children ?? []) {
      if (typeof child === 'string') out.push(child)
    }
    if (typeof node.props?.className === 'string') out.push(node.props.className)
  })
  return out.join(' ')
}

const provider = {
  id: 'tokenrhythm',
  displayName: 'TokenRhythm NeoHorse-Jev',
  dialect: 'systemone',
  enabled: true,
  model: 'NeoHorse-Jev-4B',
  baseURL: 'https://tokenrhythm.studio/v1',
  path: '/systemone',
  apiKeyEnv: 'TOKENRHYTHM_API_KEY',
  key: { configured: true, source: 'file', writable: true },
  limits: {},
  price: {},
  thresholds: {},
  isDefault: true,
  problem: undefined,
  note: 'decision access is gated',
}

const settings = {
  defaultProvider: 'tokenrhythm',
  maxQuestions: 8,
  timeoutMs: 20000,
  maxRetries: 2,
  thresholds: { choice: 0.7, score: 0.7, yesnoLow: 0.35, yesnoHigh: 0.65 },
  cache: { enabled: true, ttlMs: 300000, maxEntries: 256 },
  audit: { enabled: true, path: 'x', maxBytes: 1000, storeState: 'hash' },
  guard: { enabled: false, provider: '', tools: ['bash'], timeoutMs: 1800, low: 0.35, high: 0.65, onError: 'allow' },
  experimental: { triage: { enabled: false, provider: '' } },
}

const stats = {
  today: { date: '2026-11-09', providers: {}, total: { requests: 0, inputTokens: 0, outputTokens: 0, errors: 0, cost: null } },
  last7: {
    providers: { tokenrhythm: { requests: 2, inputTokens: 10, outputTokens: 5, errors: 0, cost: null } },
    total: { requests: 2, inputTokens: 10, outputTokens: 5, errors: 0, cost: null },
  },
}

test('the providers page builds without a render error', () => {
  const page = withHooks(['providers'], Page)
  const view = findComponent(page, 'ProvidersView')
  assert.ok(view, 'ProvidersView was not rendered')
  const queue = [
    { providers: [provider], defaultProvider: 'tokenrhythm' },
    '', '', {}, {}, {}, {}, '', { id: '', displayName: '', dialect: 'systemone', baseURL: '', path: '', model: '', apiKeyEnv: '', enabled: true },
  ]
  const tree = withHooks(queue, view.type)
  const text = texts(tree)
  assert.match(text, /TokenRhythm NeoHorse-Jev/)
  assert.match(text, /dec-provider/)
  assert.match(text, /dec-avatar/)
})

test('the examples page builds with copyable prompts', () => {
  const page = withHooks(['examples'], Page)
  const view = findComponent(page, 'ExamplesView')
  assert.ok(view, 'ExamplesView was not rendered')
  const tree = withHooks([''], view.type)
  const text = texts(tree)
  assert.match(text, /dec-code/)
  assert.match(text, /exampleRoutingPrompt/)
  assert.match(text, /exampleGatePrompt/)
})

test('the behavior page builds with the guard card', () => {
  const page = withHooks(['behavior'], Page)
  const view = findComponent(page, 'BehaviorView')
  assert.ok(view, 'BehaviorView was not rendered')
  const tree = withHooks([settings, '', '', '', [provider]], view.type)
  const text = texts(tree)
  assert.match(text, /guardTitle/)
  assert.match(text, /guardWarning/)
  assert.match(text, /thresholds/)
})

test('the usage page builds with stat tiles and the recent table', () => {
  const page = withHooks(['usage'], Page)
  const view = findComponent(page, 'UsageView')
  assert.ok(view, 'UsageView was not rendered')
  const tree = withHooks([stats, [{
    ts: '2026-11-09T00:00:00.000Z',
    provider: 'tokenrhythm',
    tool: 'decide',
    outcome: 'ok',
    usage: { inputTokens: 4, outputTokens: 2 },
    uncertainCount: 0,
  }], ''], view.type)
  const text = texts(tree)
  assert.match(text, /dec-stats/)
  assert.match(text, /dec-table/)
  assert.match(text, /requests/)
})
