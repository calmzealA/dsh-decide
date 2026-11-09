/**
 * Configuration: defaults, merge order, validation, and the settings file.
 *
 * Precedence is: profile config (cordis.patch.yml) > settings.json > defaults.
 * The settings file holds only non-secret values; API keys live in the
 * credentials service (or the process environment).
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildProviders, providerMeta, providerOrder } from './providers.js'

export const DEFAULTS = {
  defaultProvider: '',
  maxQuestions: 8,
  timeoutMs: 20000,
  maxRetries: 2,
  thresholds: {
    choice: 0.7,
    score: 0.7,
    yesnoLow: 0.35,
    yesnoHigh: 0.65,
  },
  cache: {
    enabled: true,
    ttlMs: 300000,
    maxEntries: 256,
  },
  audit: {
    enabled: true,
    path: '',
    maxBytes: 4 * 1024 * 1024,
    storeState: 'hash',
  },
  guard: {
    enabled: false,
    provider: '',
    tools: ['bash', 'pwsh'],
    timeoutMs: 1800,
    low: 0.35,
    high: 0.65,
    onError: 'allow',
  },
  experimental: {
    triage: {
      enabled: false,
      provider: '',
    },
  },
  providers: {},
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override
  }
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    out[key] = isPlainObject(value) && isPlainObject(base[key])
      ? deepMerge(base[key], value)
      : value
  }
  return out
}

function omit(object, key) {
  const out = { ...object }
  delete out[key]
  return out
}

function number(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function ratio(value, fallback) {
  return number(value, fallback, 0, 1)
}

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function stateDir() {
  return path.join(dshHome(), 'decide')
}

export function settingsPath() {
  return path.join(stateDir(), 'settings.json')
}

export function defaultAuditPath() {
  return path.join(stateDir(), 'decisions.jsonl')
}

/** Merge defaults, the settings file, and the profile entry into one state. */
export function normalizeState(pluginConfig = {}, fileSettings = {}) {
  const config = isPlainObject(pluginConfig) ? pluginConfig : {}
  const file = isPlainObject(fileSettings) ? fileSettings : {}

  const base = deepMerge(DEFAULTS, omit(file, 'providers'))
  const merged = deepMerge(base, omit(config, 'providers'))

  const thresholds = {
    choice: ratio(merged.thresholds?.choice, DEFAULTS.thresholds.choice),
    score: ratio(merged.thresholds?.score, DEFAULTS.thresholds.score),
    yesnoLow: ratio(merged.thresholds?.yesnoLow, DEFAULTS.thresholds.yesnoLow),
    yesnoHigh: ratio(merged.thresholds?.yesnoHigh, DEFAULTS.thresholds.yesnoHigh),
  }
  if (thresholds.yesnoLow > thresholds.yesnoHigh) {
    const low = thresholds.yesnoHigh
    thresholds.yesnoHigh = thresholds.yesnoLow
    thresholds.yesnoLow = low
  }

  const providerOverrides = deepMerge(file.providers ?? {}, config.providers ?? {})
  const providers = buildProviders(providerOverrides)

  const state = {
    ...merged,
    defaultProvider: typeof merged.defaultProvider === 'string' ? merged.defaultProvider : '',
    maxQuestions: number(merged.maxQuestions, DEFAULTS.maxQuestions, 1, 64),
    timeoutMs: number(merged.timeoutMs, DEFAULTS.timeoutMs, 1000, 300000),
    maxRetries: number(merged.maxRetries, DEFAULTS.maxRetries, 0, 5),
    thresholds,
    cache: {
      enabled: merged.cache?.enabled !== false,
      ttlMs: number(merged.cache?.ttlMs, DEFAULTS.cache.ttlMs, 0, 3600000),
      maxEntries: number(merged.cache?.maxEntries, DEFAULTS.cache.maxEntries, 0, 4096),
    },
    audit: {
      enabled: merged.audit?.enabled !== false,
      path: typeof merged.audit?.path === 'string' && merged.audit.path
        ? merged.audit.path
        : defaultAuditPath(),
      maxBytes: number(merged.audit?.maxBytes, DEFAULTS.audit.maxBytes, 65536, 256 * 1024 * 1024),
      storeState: ['hash', 'full', 'none'].includes(merged.audit?.storeState)
        ? merged.audit.storeState
        : 'hash',
    },
    guard: {
      enabled: merged.guard?.enabled === true,
      provider: typeof merged.guard?.provider === 'string' ? merged.guard.provider : '',
      tools: Array.isArray(merged.guard?.tools)
        ? merged.guard.tools.filter(item => typeof item === 'string')
        : [...DEFAULTS.guard.tools],
      timeoutMs: number(merged.guard?.timeoutMs, DEFAULTS.guard.timeoutMs, 200, 60000),
      low: ratio(merged.guard?.low, DEFAULTS.guard.low),
      high: ratio(merged.guard?.high, DEFAULTS.guard.high),
      onError: merged.guard?.onError === 'deny' ? 'deny' : 'allow',
    },
    experimental: {
      triage: {
        enabled: merged.experimental?.triage?.enabled === true,
        provider: typeof merged.experimental?.triage?.provider === 'string'
          ? merged.experimental.triage.provider
          : '',
      },
    },
    providers,
  }

  for (const [id, provider] of Object.entries(providers)) {
    const problem = validateProvider(id, provider)
    if (problem) {
      state.providerProblems = state.providerProblems ?? {}
      state.providerProblems[id] = problem
    }
  }

  return state
}

/** Return a human-readable problem string, or undefined when the provider is usable. */
export function validateProvider(id, provider) {
  if (!provider || typeof provider !== 'object') return 'provider is not an object'
  if (!['systemone', 'openai-decisions'].includes(provider.dialect)) {
    return `unsupported dialect "${provider.dialect}"`
  }
  if (!provider.baseURL) return 'baseURL is required'
  try {
    const url = new URL(provider.baseURL)
    if (!['http:', 'https:'].includes(url.protocol)) return 'baseURL must be http(s)'
  } catch {
    return 'baseURL is not a valid URL'
  }
  if (!provider.path || !provider.path.startsWith('/')) return 'path must start with /'
  if (!provider.model) return 'model is required'
  if (provider.apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(provider.apiKeyEnv)) {
    return 'apiKeyEnv must look like an environment variable name'
  }
  if (id.length === 0) return 'provider id is empty'
  return undefined
}

export function listProviders(state) {
  return providerOrder(state.providers).map(id => {
    const meta = providerMeta(state.providers, id)
    return {
      ...meta,
      enabled: state.providers[id]?.enabled === true,
      problem: state.providerProblems?.[id],
      thresholds: providerThresholds(state, id),
    }
  })
}

export function getProvider(state, id) {
  const meta = providerMeta(state.providers, id)
  if (!meta) return undefined
  return {
    ...meta,
    enabled: state.providers[id]?.enabled === true,
    problem: state.providerProblems?.[id],
  }
}

export function providerThresholds(state, id) {
  const own = state.providers?.[id]?.thresholds
  const merged = { ...state.thresholds, ...(isPlainObject(own) ? own : {}) }
  return {
    choice: ratio(merged.choice, state.thresholds.choice),
    score: ratio(merged.score, state.thresholds.score),
    yesnoLow: ratio(merged.yesnoLow, state.thresholds.yesnoLow),
    yesnoHigh: ratio(merged.yesnoHigh, state.thresholds.yesnoHigh),
  }
}

export async function readSettings() {
  try {
    const text = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(text)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function writeSettings(settings) {
  const file = settingsPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = file + '.' + process.pid + '.tmp'
  await fs.writeFile(temp, JSON.stringify(settings, null, 2), 'utf8')
  try {
    await fs.chmod(temp, 0o600)
  } catch {
    /* Windows has no POSIX mode; ignore. */
  }
  await fs.rename(temp, file)
  return file
}
