/**
 * HTTP JSON API behind the Settings page. Every route is same-origin,
 * read-only where it says so, and never returns a secret value.
 */

import path from 'node:path'
import { getProvider, listProviders, normalizeState, readSettings, writeSettings } from './config.js'
import { originURL, taggedHomepage } from './providers.js'
import { readDecisions } from './audit.js'

const ROUTE = '/dsh-decide/api'
const MAX_BODY_BYTES = 1024 * 1024
const PROVIDER_FIELDS = [
  'enabled',
  'displayName',
  'dialect',
  'baseURL',
  'path',
  'apiKeyEnv',
  'model',
  'homepage',
  'timeoutMs',
  'maxRetries',
  'thresholds',
  'limits',
  'price',
]
const SETTINGS_FIELDS = [
  'defaultProvider',
  'maxQuestions',
  'timeoutMs',
  'maxRetries',
  'thresholds',
  'cache',
  'audit',
  'guard',
  'experimental',
]

function httpError(status, message, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function sendJSON(res, status, value) {
  const payload = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

async function readJSON(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw httpError(413, 'request body is too large', 'body-too-large')
    chunks.push(chunk)
  }
  if (!size) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw httpError(400, 'request body is not valid JSON', 'body-invalid')
  }
}

function originAllowed(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function pick(object, fields) {
  const out = {}
  for (const field of fields) {
    if (object?.[field] !== undefined) out[field] = object[field]
  }
  return out
}

function providerPatch(patch) {
  const out = pick(patch, PROVIDER_FIELDS)
  if (out.dialect !== undefined && !['systemone', 'openai-decisions'].includes(out.dialect)) {
    throw httpError(400, 'unsupported dialect', 'invalid-dialect')
  }
  if (out.baseURL !== undefined) {
    try {
      const url = new URL(String(out.baseURL))
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
    } catch {
      throw httpError(400, 'baseURL must be an http(s) URL', 'invalid-base-url')
    }
  }
  if (out.path !== undefined && (typeof out.path !== 'string' || !out.path.startsWith('/'))) {
    throw httpError(400, 'path must start with /', 'invalid-path')
  }
  if (out.model !== undefined && (typeof out.model !== 'string' || !out.model.trim())) {
    throw httpError(400, 'model is required', 'invalid-model')
  }
  if (out.homepage !== undefined && out.homepage !== '') {
    try {
      const url = new URL(String(out.homepage))
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
    } catch {
      throw httpError(400, 'homepage must be an http(s) URL', 'invalid-homepage')
    }
  }
  if (out.apiKeyEnv !== undefined && out.apiKeyEnv !== '' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(out.apiKeyEnv)) {
    throw httpError(400, 'apiKeyEnv must look like an environment variable', 'invalid-key-ref')
  }
  if (out.enabled !== undefined) out.enabled = out.enabled === true
  return out
}

function settingsPatch(patch) {
  const out = pick(patch, SETTINGS_FIELDS)
  if (out.defaultProvider !== undefined && typeof out.defaultProvider !== 'string') {
    throw httpError(400, 'defaultProvider must be a string', 'invalid-default-provider')
  }
  return out
}

async function providerSummary(ctx, runtime, state) {
  const list = listProviders(state)
  const providers = []
  for (const provider of list) {
    const status = await runtime.credentialStatus(ctx, provider)
    providers.push({
      id: provider.id,
      displayName: provider.displayName,
      dialect: provider.dialect,
      enabled: provider.enabled,
      model: provider.model,
      baseURL: provider.baseURL,
      path: provider.path,
      apiKeyEnv: provider.apiKeyEnv,
      homepage: taggedHomepage(provider.homepage || originURL(provider.baseURL)),
      key: status,
      limits: provider.limits,
      price: provider.price,
      thresholds: provider.thresholds,
      docs: provider.docs,
      note: provider.note,
      problem: provider.problem,
      isDefault: state.defaultProvider === provider.id,
    })
  }
  return providers
}

export function createRoutes({ ctx, getState, runtime }) {
  async function credentialsService() {
    const service = ctx.get('credentials')
    if (!service?.set || !service?.unset) {
      throw httpError(
        503,
        'the DSH credentials service is not mounted; export the key as an environment variable instead',
        'credentials-unavailable',
      )
    }
    return service
  }

  async function saveSettings(mutate) {
    const settings = await readSettings()
    await mutate(settings)
    await writeSettings(settings)
    const raw = (await getState()).pluginConfig ?? {}
    return normalizeState(raw, settings)
  }

  const routes = [
    ['GET', /^\/providers$/, async () => {
      const state = await getState()
      return {
        providers: await providerSummary(ctx, runtime, state),
        defaultProvider: state.defaultProvider,
        generatedAt: new Date().toISOString(),
      }
    }],
    ['POST', /^\/providers$/, async (_query, body) => {
      const id = String(body.id ?? '').trim()
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
        throw httpError(400, 'provider id must be kebab-case', 'invalid-provider-id')
      }
      if (['typesafe', 'tokenrhythm', 'openai', 'local'].includes(id)) {
        throw httpError(409, 'use the preset card to edit this provider', 'preset-provider')
      }
      const patch = providerPatch(body)
      await saveSettings(settings => {
        settings.providers = settings.providers ?? {}
        settings.providers[id] = { ...(settings.providers[id] ?? {}), ...patch }
      })
      return { ok: true, id }
    }],
    ['POST', /^\/providers\/([^/]+)$/, async (_query, body, match) => {
      const id = decodeURIComponent(match[1])
      const state = await getState()
      if (!getProvider(state, id)) throw httpError(404, 'unknown provider', 'unknown-provider')
      const patch = providerPatch(body)
      await saveSettings(settings => {
        settings.providers = settings.providers ?? {}
        settings.providers[id] = { ...(settings.providers[id] ?? {}), ...patch }
      })
      return { ok: true, id }
    }],
    ['DELETE', /^\/providers\/([^/]+)$/, async (_query, _body, match) => {
      const id = decodeURIComponent(match[1])
      if (['typesafe', 'tokenrhythm', 'openai', 'local'].includes(id)) {
        throw httpError(409, 'preset providers cannot be deleted; disable them instead', 'preset-provider')
      }
      await saveSettings(settings => {
        if (settings.providers) delete settings.providers[id]
      })
      return { ok: true, id }
    }],
    ['POST', /^\/providers\/([^/]+)\/key$/, async (_query, body, match) => {
      const id = decodeURIComponent(match[1])
      const provider = getProvider(await getState(), id)
      if (!provider) throw httpError(404, 'unknown provider', 'unknown-provider')
      if (!provider.apiKeyEnv) throw httpError(400, 'this provider has no key reference', 'key-ref-missing')
      const value = typeof body.value === 'string' ? body.value.trim() : ''
      if (!value) throw httpError(400, 'value is required', 'value-required')
      const credentials = await credentialsService()
      await credentials.set(provider.apiKeyEnv, value)
      return { ok: true, id, ref: provider.apiKeyEnv }
    }],
    ['DELETE', /^\/providers\/([^/]+)\/key$/, async (_query, _body, match) => {
      const id = decodeURIComponent(match[1])
      const provider = getProvider(await getState(), id)
      if (!provider) throw httpError(404, 'unknown provider', 'unknown-provider')
      if (!provider.apiKeyEnv) throw httpError(400, 'this provider has no key reference', 'key-ref-missing')
      const credentials = await credentialsService()
      await credentials.unset(provider.apiKeyEnv)
      return { ok: true, id, ref: provider.apiKeyEnv }
    }],
    ['GET', /^\/providers\/([^/]+)\/models$/, async (_query, _body, match) => {
      const id = decodeURIComponent(match[1])
      return await runtime.listModels(await getState(), ctx, id)
    }],
    ['POST', /^\/providers\/([^/]+)\/test$/, async (_query, _body, match) => {
      const id = decodeURIComponent(match[1])
      return await runtime.testProvider(await getState(), ctx, id)
    }],
    ['GET', /^\/settings$/, async () => {
      const state = await getState()
      return {
        defaultProvider: state.defaultProvider,
        maxQuestions: state.maxQuestions,
        timeoutMs: state.timeoutMs,
        maxRetries: state.maxRetries,
        thresholds: state.thresholds,
        cache: state.cache,
        audit: { ...state.audit, path: path.normalize(state.audit.path) },
        guard: state.guard,
        experimental: state.experimental,
      }
    }],
    ['POST', /^\/settings$/, async (_query, body) => {
      const patch = settingsPatch(body)
      await saveSettings(settings => {
        Object.assign(settings, patch)
        if (patch.thresholds) settings.thresholds = { ...(settings.thresholds ?? {}), ...patch.thresholds }
        if (patch.cache) settings.cache = { ...(settings.cache ?? {}), ...patch.cache }
        if (patch.audit) settings.audit = { ...(settings.audit ?? {}), ...patch.audit }
        if (patch.guard) settings.guard = { ...(settings.guard ?? {}), ...patch.guard }
        if (patch.experimental) {
          settings.experimental = {
            ...(settings.experimental ?? {}),
            ...patch.experimental,
            triage: {
              ...(settings.experimental?.triage ?? {}),
              ...(patch.experimental.triage ?? {}),
            },
          }
        }
      })
      return { ok: true }
    }],
    ['GET', /^\/decisions$/, async query => {
      const state = await getState()
      return {
        decisions: await readDecisions(state, {
          limit: Number(query.get('limit') ?? 50),
          provider: query.get('provider') ?? undefined,
        }),
      }
    }],
    ['GET', /^\/stats$/, async () => await runtime.stats(await getState())],
  ]

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const suffix = url.pathname.slice(ROUTE.length) || '/'
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    if (!originAllowed(req)) {
      sendJSON(res, 403, { error: 'origin not allowed' })
      return
    }
    const method = req.method ?? 'GET'
    let matched
    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue
      const match = pattern.exec(suffix)
      if (match) {
        matched = { handler, match }
        break
      }
    }
    if (!matched) {
      sendJSON(res, 404, { error: 'unknown endpoint', endpoint: `${method} ${suffix}` })
      return
    }
    try {
      const body = method === 'GET' || method === 'DELETE' ? {} : await readJSON(req)
      const value = await matched.handler(url.searchParams, body, matched.match)
      sendJSON(res, 200, value ?? { ok: true })
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      sendJSON(res, status, { error: error?.message ?? String(error), code: error?.code })
    }
  }

  return { path: ROUTE, handle }
}
