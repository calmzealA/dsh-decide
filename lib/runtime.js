/**
 * The host-side decision runtime: provider selection, credential resolution,
 * request execution, cache, and audit.
 */

import { adapterFor, buildRequest, modelsRequest, parseModels, parseResponse } from './adapters/index.js'
import { providerThresholds, getProvider, listProviders } from './config.js'
import { appendRecord, computeStats, hashState } from './audit.js'
import { cacheKey, createCache } from './cache.js'
import { DecideError, asDecideError } from './errors.js'
import {
  estimateCost,
  finalizeAnswers,
  normalizeUsage,
  validateRequest,
} from './normalize.js'
import { createTransport } from './transport.js'

function safeService(ctx, name) {
  try {
    return ctx?.get?.(name)
  } catch {
    return undefined
  }
}

export async function resolveCredential(ctx, ref) {
  if (!ref) return { value: undefined, source: 'none', configured: true }
  const credentials = safeService(ctx, 'credentials')
  if (credentials?.resolve) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit && typeof hit.value === 'string' && hit.value.length > 0) {
        return { value: hit.value, source: hit.source ?? 'store', configured: true }
      }
    } catch {
      /* fall through to the environment */
    }
  }
  const value = process.env[ref]
  if (typeof value === 'string' && value.length > 0) {
    return { value, source: 'env', configured: true }
  }
  return { value: undefined, source: 'missing', configured: false }
}

export async function credentialStatus(ctx, provider) {
  const ref = provider.apiKeyEnv
  if (!ref) return { configured: true, source: 'none', ref: '', writable: false }
  const credentials = safeService(ctx, 'credentials')
  if (credentials?.describe) {
    try {
      const described = await credentials.describe(ref)
      if (described?.configured) {
        return {
          configured: true,
          source: described.source ?? 'store',
          ref,
          writable: described.writable !== false,
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (process.env[ref]) return { configured: true, source: 'env', ref, writable: true }
  return { configured: false, source: 'missing', ref, writable: false }
}

function providerError(code, message, provider) {
  return new DecideError(code, message, { provider: provider?.id, dialect: provider?.dialect })
}

async function selectProvider(state, ctx, requested) {
  if (requested) {
    const provider = getProvider(state, requested)
    if (!provider) {
      const available = listProviders(state).map(item => item.id).join(', ')
      throw providerError('PROVIDER_NOT_FOUND', `unknown provider "${requested}"; available: ${available}`)
    }
    if (provider.problem) {
      throw providerError('PROVIDER_INVALID', `provider "${requested}" is misconfigured: ${provider.problem}`, provider)
    }
    if (!provider.enabled) {
      throw providerError('PROVIDER_DISABLED', `provider "${requested}" is disabled`, provider)
    }
    const status = await credentialStatus(ctx, provider)
    if (!status.configured) {
      throw providerError(
        'MISSING_CREDENTIAL',
        `provider "${requested}" has no key: set ${provider.apiKeyEnv} in Settings → Decisions or export it`,
        provider,
      )
    }
    return { provider, key: (await resolveCredential(ctx, provider.apiKeyEnv)).value, status }
  }

  const candidates = listProviders(state).filter(provider => provider.enabled && !provider.problem)
  if (state.defaultProvider) {
    const chosen = candidates.find(provider => provider.id === state.defaultProvider)
    if (!chosen) {
      throw providerError('PROVIDER_DISABLED', `default provider "${state.defaultProvider}" is not enabled`, undefined)
    }
    const status = await credentialStatus(ctx, chosen)
    if (!status.configured) {
      throw providerError(
        'MISSING_CREDENTIAL',
        `default provider "${chosen.id}" has no key: set ${chosen.apiKeyEnv} in Settings → Decisions or export it`,
        chosen,
      )
    }
    return { provider: chosen, key: (await resolveCredential(ctx, chosen.apiKeyEnv)).value, status }
  }

  for (const candidate of candidates) {
    const status = await credentialStatus(ctx, candidate)
    if (!status.configured) continue
    return { provider: candidate, key: (await resolveCredential(ctx, candidate.apiKeyEnv)).value, status }
  }

  if (candidates.length > 0) {
    const first = candidates[0]
    throw providerError(
      'MISSING_CREDENTIAL',
      `no provider has a key: set ${first.apiKeyEnv} in Settings → Decisions, or configure another provider`,
      first,
    )
  }
  throw providerError('NO_PROVIDER', 'no decision provider is enabled; enable one in Settings → Decisions')
}

function auditRecord(state, provider, tool, request, result, startedAt, outcome, error) {
  const record = {
    ts: new Date(startedAt).toISOString(),
    provider: provider?.id,
    dialect: provider?.dialect,
    tool,
    model: result?.model ?? provider?.model,
    stateHash: state.audit.storeState === 'none' ? undefined : hashState(request.state),
    stateChars: request.state.length,
    questionCount: request.questions.length,
    latencyMs: result?.latencyMs,
    outcome,
  }
  if (state.audit.storeState === 'full') record.state = request.state
  if (result?.answers) {
    record.answers = result.answers.map(answer => ({
      name: answer.name,
      type: answer.type,
      choice: answer.choice,
      score: answer.score,
      probability: answer.probability,
      confidence: answer.confidence,
      uncertain: answer.uncertain,
      refused: answer.refused,
    }))
  }
  if (result?.usage) record.usage = result.usage
  if (result?.estimatedCost) record.cost = result.estimatedCost
  if (error) {
    record.errorCode = error.code
    record.errorMessage = String(error.message).slice(0, 300)
    record.traceId = error.traceId
  }
  return record
}

export function createRuntime(options = {}) {
  const now = options.now ?? Date.now
  const transport = options.transport ?? createTransport({ fetchImpl: options.fetchImpl, now })
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  let cacheState
  let cache

  function getCache(state) {
    const signature = `${state.cache.enabled}:${state.cache.ttlMs}:${state.cache.maxEntries}`
    if (!cache || cacheState !== signature) {
      cacheState = signature
      cache = createCache({ ttlMs: state.cache.ttlMs, maxEntries: state.cache.maxEntries, now })
    }
    return cache
  }

  async function executeDecision(state, ctx, input) {
    const startedAt = now()
    const request = {
      state: input.state,
      questions: input.questions,
    }
    const toolName = typeof input.tool === 'string' && input.tool ? input.tool : 'decide'
    const includeProbabilities = input.includeProbabilities === true
    let selected
    try {
      selected = await selectProvider(state, ctx, input.provider)
      const canonical = validateRequest(state, selected.provider, request)
      request.state = canonical.state
      request.questions = canonical.questions

      const adapter = adapterFor(selected.provider.dialect)
      const wire = buildRequest(selected.provider, request, selected.key)
      const bytes = Buffer.byteLength(JSON.stringify(wire.body))
      const maxBody = Number(selected.provider.limits.maxBodyBytes ?? 4 * 1024 * 1024)
      if (bytes > maxBody) {
        throw new DecideError(
          'LIMIT',
          `request body is ${bytes} bytes; ${selected.provider.displayName} accepts ${maxBody}`,
          { provider: selected.provider.id, dialect: selected.provider.dialect },
        )
      }

      const store = getCache(state)
      const key = cacheKey(selected.provider, request, includeProbabilities)
      const hit = store.get(key)
      if (hit) {
        const thresholds = providerThresholds(state, selected.provider.id)
        const answers = finalizeAnswers(hit.answers, thresholds)
        const usage = normalizeUsage(hit.usage)
        const cost = estimateCost(usage, selected.provider.price)
        const result = {
          provider: selected.provider.id,
          providerLabel: selected.provider.displayName,
          dialect: selected.provider.dialect,
          model: hit.model ?? selected.provider.model,
          answers,
          ...(usage ? { usage } : {}),
          ...(cost ? { estimatedCost: cost } : {}),
          latencyMs: Math.max(0, now() - startedAt),
          uncertainCount: answers.filter(answer => answer.uncertain).length,
          cached: true,
        }
        await appendRecord(
          state,
          auditRecord(state, selected.provider, toolName, request, {
            model: result.model,
            answers: result.answers,
            latencyMs: result.latencyMs,
          }, startedAt, 'cache'),
        ).catch(() => {})
        return result
      }

      const json = await transport({
        url: wire.url,
        headers: wire.headers,
        body: wire.body,
        provider: selected.provider,
        adapter,
        signal: input.signal,
        timeoutMs: Number(selected.provider.timeoutMs ?? state.timeoutMs),
        maxRetries: Number(selected.provider.maxRetries ?? state.maxRetries),
      })
      const parsed = parseResponse(selected.provider, request, json, { includeProbabilities })
      const thresholds = providerThresholds(state, selected.provider.id)
      const answers = finalizeAnswers(parsed.answers, thresholds)
      const usage = normalizeUsage(parsed.usage)
      const cost = estimateCost(usage, selected.provider.price)
      const result = {
        provider: selected.provider.id,
        providerLabel: selected.provider.displayName,
        dialect: selected.provider.dialect,
        model: parsed.model ?? selected.provider.model,
        answers,
        ...(usage ? { usage } : {}),
        ...(cost ? { estimatedCost: cost } : {}),
        latencyMs: Math.max(0, now() - startedAt),
        uncertainCount: answers.filter(answer => answer.uncertain).length,
        cached: false,
      }
      store.set(key, { model: result.model, answers: parsed.answers, usage: parsed.usage })
      await appendRecord(state, auditRecord(state, selected.provider, toolName, request, result, startedAt, 'ok')).catch(() => {})
      return result
    } catch (caught) {
      const error = asDecideError(caught, selected?.provider)
      if (selected) {
        await appendRecord(
          state,
          auditRecord(state, selected.provider, toolName, request, undefined, startedAt, 'error', error),
        ).catch(() => {})
      }
      throw error
    }
  }

  async function executeGate(state, ctx, input) {
    const startedAt = now()
    const question = {
      name: 'verdict',
      type: 'yesno',
      instructions: input.question
        ?? 'Is this action likely to irreversibly delete, overwrite, or expose the user\'s real data?',
    }
    if (input.criteria) question.criteria = input.criteria
    const request = { state: input.action, questions: [question] }
    const selected = await selectProvider(state, ctx, input.provider || state.guard.provider || undefined)
    try {
      const canonical = validateRequest(state, selected.provider, request)
      request.state = canonical.state
      request.questions = canonical.questions
      const adapter = adapterFor(selected.provider.dialect)
      const wire = buildRequest(selected.provider, request, selected.key)
      const json = await transport({
        url: wire.url,
        headers: wire.headers,
        body: wire.body,
        provider: selected.provider,
        adapter,
        signal: input.signal,
        timeoutMs: Number(selected.provider.timeoutMs ?? state.timeoutMs),
        maxRetries: Number(selected.provider.maxRetries ?? state.maxRetries),
      })
      const parsed = parseResponse(selected.provider, request, json, { includeProbabilities: false })
      const probability = Number(parsed.answers?.[0]?.probability)
      if (!Number.isFinite(probability)) {
        throw new DecideError('RESPONSE', 'decision model returned no probability', {
          provider: selected.provider.id,
          dialect: selected.provider.dialect,
        })
      }
      const low = Number(input.low ?? state.guard.low)
      const high = Number(input.high ?? state.guard.high)
      const verdict = probability < low ? 'allow' : probability >= high ? 'deny' : 'review'
      const usage = normalizeUsage(parsed.usage)
      const cost = estimateCost(usage, selected.provider.price)
      const result = {
        verdict,
        probability,
        provider: selected.provider.id,
        providerLabel: selected.provider.displayName,
        dialect: selected.provider.dialect,
        model: parsed.model ?? selected.provider.model,
        ...(usage ? { usage } : {}),
        ...(cost ? { estimatedCost: cost } : {}),
        latencyMs: Math.max(0, now() - startedAt),
        uncertain: verdict === 'review',
      }
      await appendRecord(state, auditRecord(state, selected.provider, 'gate', request, {
        ...result,
        answers: [{ name: 'verdict', type: 'yesno', probability, uncertain: result.uncertain }],
      }, startedAt, 'ok')).catch(() => {})
      return result
    } catch (caught) {
      const error = asDecideError(caught, selected.provider)
      await appendRecord(state, auditRecord(state, selected.provider, 'gate', request, undefined, startedAt, 'error', error)).catch(() => {})
      throw error
    }
  }

  async function listModels(state, ctx, providerId) {
    const selected = await selectProvider(state, ctx, providerId)
    const request = modelsRequest(selected.provider, selected.key)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(state.timeoutMs, 15000))
    try {
      const response = await fetchImpl(request.url, { headers: request.headers, signal: controller.signal })
      const text = await response.text()
      let json
      try {
        json = text ? JSON.parse(text) : undefined
      } catch {
        json = undefined
      }
      if (!response.ok) {
        throw adapterFor(selected.provider.dialect).parseError(selected.provider, response.status, json, text)
      }
      if (!json) throw new DecideError('RESPONSE', 'model list is not JSON', { provider: selected.provider.id })
      return {
        provider: selected.provider.id,
        models: parseModels(selected.provider, json),
        fetchedAt: new Date(now()).toISOString(),
      }
    } catch (caught) {
      throw asDecideError(caught, selected.provider)
    } finally {
      clearTimeout(timer)
    }
  }

  async function testProvider(state, ctx, providerId) {
    const startedAt = now()
    try {
      const result = await executeDecision(state, ctx, {
        provider: providerId,
        state: 'This is a connectivity test for the decision model.',
        questions: [
          {
            name: 'ok',
            type: 'yesno',
            instructions: 'Is this text a connectivity test?',
          },
        ],
      })
      return { ok: true, result }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error.code ?? 'UNEXPECTED',
          message: error.message ?? String(error),
          status: error.status,
          traceId: error.traceId,
          provider: error.provider,
        },
        latencyMs: Math.max(0, now() - startedAt),
      }
    }
  }

  return {
    executeDecision,
    executeGate,
    listModels,
    testProvider,
    credentialStatus,
    resolveCredential,
    selectProvider,
    stats: state => computeStats(state, now()),
  }
}
