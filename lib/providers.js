/**
 * Provider presets and their capability metadata.
 *
 * A preset is only a default configuration. Users may override any field in
 * `cordis.patch.yml` or in the plugin's settings file, and may add their own
 * provider ids. The dialect determines the wire format; the preset id is just
 * a label and a source of defaults.
 */

export const PRESET_ORDER = ['typesafe', 'tokenrhythm', 'openai', 'local']

export const DIALECTS = ['systemone', 'openai-decisions']

const COMMON_LIMITS = {
  maxChoice: 255,
  maxQuestions: 8,
  minScore: 2,
  maxScore: 10,
  maxStateChars: 120000,
  supportsBox: false,
  supportsImages: false,
  supportsLongContext: false,
  maxBodyBytes: 4 * 1024 * 1024,
}

export const PRESETS = {
  typesafe: {
    id: 'typesafe',
    displayName: 'TypeSafe Jev',
    dialect: 'systemone',
    baseURL: 'https://api.typesafe.ai',
    path: '/v1/systemone',
    apiKeyEnv: 'TYPESAFE_API_KEY',
    model: 'jev-latest',
    enabled: true,
    homepage: 'https://typesafe.ai/',
    docs: 'https://docs.typesafe.ai/api/system-one.md',
    limits: {
      ...COMMON_LIMITS,
      maxQuestions: 64,
      maxStateChars: 120000,
      longContextChars: 1000000,
      supportsBox: false,
      supportsImages: true,
      supportsLongContext: true,
      maxBodyBytes: 32 * 1024 * 1024,
    },
    price: { perMTokInput: 0.042, currency: 'USD' },
    note: 'confidence is a normalisation of the top probability; threshold on probabilities.',
  },
  tokenrhythm: {
    id: 'tokenrhythm',
    displayName: 'TokenRhythm NeoHorse-Jev',
    dialect: 'systemone',
    baseURL: 'https://tokenrhythm.studio/v1',
    path: '/systemone',
    apiKeyEnv: 'TOKENRHYTHM_API_KEY',
    model: 'NeoHorse-Jev-4B',
    enabled: true,
    homepage: 'https://tokenrhythm.studio/',
    docs: 'https://tokenrhythm.studio/docs/api-integration',
    limits: {
      ...COMMON_LIMITS,
      maxQuestions: 16,
      minScore: 2,
      maxStateChars: 200000,
      maxBodyBytes: 1024 * 1024,
      supportsImages: true,
    },
    price: { perMTokInput: null, currency: 'CNY' },
    note: 'Decision access is gated by an account allow-list; HTTP 403 means the key has no permission.',
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI Decisions',
    dialect: 'openai-decisions',
    baseURL: 'https://api.openai.com',
    path: '/v1/decisions',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-6-luna',
    enabled: false,
    homepage: 'https://openai.com/',
    docs: 'https://developers.openai.com/api/docs/guides/decisions',
    limits: {
      ...COMMON_LIMITS,
      maxQuestions: 64,
      minScore: 2,
      maxScore: 10,
      supportsImages: true,
    },
    price: { perMTokInput: null, currency: 'USD' },
    note: 'Beta API: model names, fields, and availability may change.',
  },
  local: {
    id: 'local',
    displayName: 'Local System One',
    dialect: 'systemone',
    baseURL: 'http://localhost:8888',
    path: '/v1/systemone',
    apiKeyEnv: '',
    model: 'laya',
    enabled: false,
    homepage: 'https://unsloth.ai/docs/models/decision-laya',
    docs: 'https://unsloth.ai/docs/models/decision-laya',
    limits: {
      ...COMMON_LIMITS,
      maxQuestions: 64,
      minScore: 2,
      maxScore: 10,
      // Laya reads about 1024 tokens; leave room for the questions.
      maxStateChars: 4000,
      supportsImages: false,
    },
    price: { perMTokInput: 0, currency: 'USD' },
    note: 'Laya reads roughly 1024 tokens; long state must go to another provider.',
  },
}

/** Return a preset without sharing mutable nested objects with callers. */
export function presetDefaults(id) {
  const preset = PRESETS[id]
  if (!preset) return undefined
  return {
    ...preset,
    limits: { ...preset.limits },
    price: { ...preset.price },
  }
}

/** The ordered list of provider ids: known presets first, then custom ids. */
export function providerOrder(providers) {
  const known = PRESET_ORDER.filter(id => providers[id] !== undefined)
  const custom = Object.keys(providers).filter(id => !PRESET_ORDER.includes(id))
  return [...known, ...custom]
}

/** Merge preset metadata with a provider's own configuration. */
export function providerMeta(providers, id) {
  const provider = providers[id]
  if (!provider) return undefined
  const preset = PRESETS[id]
  return {
    id,
    dialect: provider.dialect ?? preset?.dialect ?? 'systemone',
    displayName: provider.displayName ?? preset?.displayName ?? id,
    baseURL: provider.baseURL ?? preset?.baseURL ?? '',
    path: provider.path ?? preset?.path ?? (provider.dialect === 'openai-decisions' ? '/v1/decisions' : '/v1/systemone'),
    apiKeyEnv: provider.apiKeyEnv ?? preset?.apiKeyEnv ?? '',
    model: provider.model ?? preset?.model ?? '',
    enabled: provider.enabled ?? preset?.enabled ?? false,
    homepage: provider.homepage ?? preset?.homepage ?? '',
    limits: { ...(preset?.limits ?? COMMON_LIMITS), ...(provider.limits ?? {}) },
    price: { ...(preset?.price ?? { perMTokInput: null, currency: 'USD' }), ...(provider.price ?? {}) },
    docs: provider.docs ?? preset?.docs,
    note: provider.note ?? preset?.note,
  }
}

/** Build the full provider map: every preset is present, custom ids are kept. */
export function buildProviders(overrides = {}) {
  const providers = {}
  for (const id of PRESET_ORDER) {
    const preset = presetDefaults(id)
    providers[id] = {
      ...preset,
      ...(overrides[id] ?? {}),
      limits: { ...preset.limits, ...(overrides[id]?.limits ?? {}) },
      price: { ...preset.price, ...(overrides[id]?.price ?? {}) },
    }
  }
  for (const [id, value] of Object.entries(overrides)) {
    if (providers[id]) continue
    if (!value || typeof value !== 'object') continue
    providers[id] = {
      id,
      displayName: value.displayName ?? id,
      dialect: value.dialect ?? 'systemone',
      baseURL: value.baseURL ?? '',
      path: value.path ?? (value.dialect === 'openai-decisions' ? '/v1/decisions' : '/v1/systemone'),
      apiKeyEnv: value.apiKeyEnv ?? '',
      model: value.model ?? '',
      enabled: value.enabled ?? false,
      homepage: value.homepage ?? '',
      limits: { ...COMMON_LIMITS, ...(value.limits ?? {}) },
      price: { perMTokInput: null, currency: 'USD', ...(value.price ?? {}) },
      note: value.note,
    }
  }
  return providers
}

export function joinURL(baseURL, path) {
  const base = String(baseURL ?? '').replace(/\/+$/, '')
  const suffix = String(path ?? '')
  if (!suffix) return base
  return base + (suffix.startsWith('/') ? suffix : '/' + suffix)
}

/** Model-listing URL for a provider, tolerant of a base URL that ends in /v1. */
export function modelsURL(provider) {
  const base = String(provider.baseURL ?? '').replace(/\/+$/, '')
  if (/\/v1$/.test(base)) return base + '/models'
  return base + '/v1/models'
}

/** True when the base URL is an http(s) URL; localhost http is allowed. */
export function validBaseURL(value) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function validPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.includes('://')
}

/** The referral tag appended to every provider homepage link. */
export const AFFILIATE_TAG = 'aichen'

/** Append the referral tag without rewriting the provider's own query string. */
export function taggedHomepage(url, tag = AFFILIATE_TAG) {
  if (!url || !tag) return url ?? ''
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    const base = parsed.toString()
    return base + (base.includes('?') ? '&' : '?') + tag
  } catch {
    return ''
  }
}

/** Best-effort homepage for a custom provider: its origin. */
export function originURL(baseURL) {
  try {
    const parsed = new URL(baseURL)
    return parsed.origin + '/'
  } catch {
    return ''
  }
}
