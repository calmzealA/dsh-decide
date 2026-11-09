/**
 * Canonical question validation and answer post-processing.
 *
 * Adapters translate between the canonical request/answer model and each
 * provider dialect. This module owns everything dialect-independent: limits,
 * thresholds, uncertainty, cost, and the text the model reads.
 */

import { DecideError } from './errors.js'

export const QUESTION_TYPES = ['yesno', 'choice', 'score', 'box']
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

function invalid(message, provider) {
  return new DecideError('INVALID_REQUEST', message, {
    provider: provider?.id,
    dialect: provider?.dialect,
  })
}

function limitError(message, provider) {
  return new DecideError('LIMIT', message, {
    provider: provider?.id,
    dialect: provider?.dialect,
  })
}

function normalizeLabel(value, where) {
  if (typeof value === 'string' && value.trim()) return { label: value.trim() }
  if (value && typeof value === 'object') {
    if (typeof value.label !== 'string' || !value.label.trim()) {
      throw new DecideError('INVALID_REQUEST', `${where}: label is required`)
    }
    const out = { label: value.label.trim() }
    if (typeof value.description === 'string' && value.description.trim()) {
      out.description = value.description.trim()
    }
    return out
  }
  throw new DecideError('INVALID_REQUEST', `${where}: expected a label or {label, description}`)
}

/** Validate one tool question and convert it into the canonical shape. */
export function normalizeQuestion(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DecideError('INVALID_REQUEST', `questions[${index}] must be an object`)
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!NAME_PATTERN.test(name)) {
    throw new DecideError(
      'INVALID_REQUEST',
      `questions[${index}].name must match ${NAME_PATTERN.source}`,
    )
  }
  const type = raw.type
  if (!QUESTION_TYPES.includes(type)) {
    throw new DecideError(
      'INVALID_REQUEST',
      `questions[${index}].type must be one of ${QUESTION_TYPES.join(', ')}`,
    )
  }
  const instructions = typeof raw.instructions === 'string' ? raw.instructions : undefined
  const question = { name, type, ...(instructions ? { instructions } : {}) }

  if (type === 'choice') {
    if (!Array.isArray(raw.choices) || raw.choices.length === 0) {
      throw new DecideError('INVALID_REQUEST', `questions[${index}].choices is required for choice`)
    }
    if (raw.levels !== undefined || raw.criteria !== undefined) {
      throw new DecideError('INVALID_REQUEST', `questions[${index}] must not mix choices with levels/criteria`)
    }
    const choices = raw.choices.map((item, position) => normalizeLabel(item, `questions[${index}].choices[${position}]`))
    const seen = new Set()
    for (const choice of choices) {
      if (seen.has(choice.label)) {
        throw new DecideError('INVALID_REQUEST', `questions[${index}].choices has duplicate label "${choice.label}"`)
      }
      seen.add(choice.label)
    }
    question.choices = choices
    return question
  }

  if (type === 'score') {
    if (!Array.isArray(raw.levels) || raw.levels.length === 0) {
      throw new DecideError('INVALID_REQUEST', `questions[${index}].levels is required for score`)
    }
    if (raw.choices !== undefined || raw.criteria !== undefined) {
      throw new DecideError('INVALID_REQUEST', `questions[${index}] must not mix levels with choices/criteria`)
    }
    question.levels = raw.levels.map((item, position) => normalizeLabel(item, `questions[${index}].levels[${position}]`))
    return question
  }

  if (type === 'yesno') {
    if (raw.choices !== undefined || raw.levels !== undefined) {
      throw new DecideError('INVALID_REQUEST', `questions[${index}] yesno takes criteria, not choices/levels`)
    }
    if (raw.criteria !== undefined) {
      if (!raw.criteria || typeof raw.criteria !== 'object' || Array.isArray(raw.criteria)) {
        throw new DecideError('INVALID_REQUEST', `questions[${index}].criteria must be an object`)
      }
      const criteria = {}
      for (const key of ['true', 'false']) {
        if (raw.criteria[key] === undefined) continue
        if (typeof raw.criteria[key] !== 'string') {
          throw new DecideError('INVALID_REQUEST', `questions[${index}].criteria.${key} must be a string`)
        }
        criteria[key] = raw.criteria[key]
      }
      for (const key of Object.keys(raw.criteria)) {
        if (key !== 'true' && key !== 'false') {
          throw new DecideError('INVALID_REQUEST', `questions[${index}].criteria has unknown key "${key}"`)
        }
      }
      if (Object.keys(criteria).length) question.criteria = criteria
    }
    return question
  }

  // box
  if (raw.choices !== undefined || raw.levels !== undefined || raw.criteria !== undefined) {
    throw new DecideError('INVALID_REQUEST', `questions[${index}] box takes no choices/levels/criteria`)
  }
  question.type = 'box'
  return question
}

/** Validate a whole tool request against the provider's declared limits. */
export function validateRequest(state, provider, request) {
  if (!request || typeof request !== 'object') {
    throw invalid('request must be an object', provider)
  }
  if (typeof request.state !== 'string' || !request.state.trim()) {
    throw invalid('state must be a non-empty string (serialize JSON before sending it)', provider)
  }
  const maxChars = Number(provider.limits?.maxStateChars ?? 120000)
  if (request.state.length > maxChars) {
    throw limitError(
      `state is ${request.state.length} characters; ${provider.displayName} accepts about ${maxChars}. Shorten it or switch provider.`,
      provider,
    )
  }
  if (!Array.isArray(request.questions) || request.questions.length === 0) {
    throw invalid('questions must be a non-empty array', provider)
  }
  const limit = Math.min(Number(state?.maxQuestions ?? 8), Number(provider.limits?.maxQuestions ?? 8))
  if (request.questions.length > limit) {
    throw limitError(
      `${provider.displayName} accepts at most ${limit} questions per request (got ${request.questions.length})`,
      provider,
    )
  }
  const questions = request.questions.map((item, index) => normalizeQuestion(item, index))
  const seen = new Set()
  for (const question of questions) {
    if (seen.has(question.name)) {
      throw invalid(`duplicate question name "${question.name}"`, provider)
    }
    seen.add(question.name)
  }
  for (const [index, question] of questions.entries()) {
    if (question.type === 'choice') {
      const max = Number(provider.limits?.maxChoice ?? 255)
      if (question.choices.length > max) {
        throw limitError(`questions[${index}].choices has ${question.choices.length} options; max ${max}`, provider)
      }
    }
    if (question.type === 'score') {
      const min = Number(provider.limits?.minScore ?? 2)
      const max = Number(provider.limits?.maxScore ?? 10)
      if (question.levels.length < min || question.levels.length > max) {
        throw limitError(
          `questions[${index}].levels has ${question.levels.length} levels; ${provider.displayName} accepts ${min}-${max}`,
          provider,
        )
      }
    }
    if (question.type === 'box') {
      throw new DecideError(
        'UNSUPPORTED',
        'box questions require image input, which this version does not send yet; use yesno/choice/score',
        { provider: provider.id, dialect: provider.dialect },
      )
    }
  }
  return { state: request.state, questions }
}

/** Normalise the token counts each dialect reports. */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  const input = Number(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens)
  const output = Number(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens)
  const total = Number(usage.total_tokens ?? usage.totalTokens)
  const out = {}
  if (Number.isFinite(input)) out.inputTokens = input
  if (Number.isFinite(output)) out.outputTokens = output
  if (Number.isFinite(total)) out.totalTokens = total
  else if (out.inputTokens !== undefined || out.outputTokens !== undefined) {
    out.totalTokens = (out.inputTokens ?? 0) + (out.outputTokens ?? 0)
  }
  return Object.keys(out).length ? out : undefined
}

export function estimateCost(usage, price) {
  const raw = price?.perMTokInput
  if (raw === null || raw === undefined) return undefined
  const perMillion = Number(raw)
  if (!Number.isFinite(perMillion) || perMillion < 0) return undefined
  if (!usage || !Number.isFinite(usage.inputTokens)) return undefined
  return {
    amount: (usage.inputTokens / 1000000) * perMillion,
    currency: price?.currency ?? 'USD',
  }
}

function topProbability(answer) {
  if (!Array.isArray(answer.probabilities) || answer.probabilities.length === 0) return undefined
  let best
  for (const item of answer.probabilities) {
    if (!Number.isFinite(item.probability)) continue
    if (best === undefined || item.probability > best.probability) best = item
  }
  return best?.probability
}

function isUncertain(answer, thresholds) {
  if (answer.refused) return true
  if (answer.type === 'yesno') {
    const p = Number(answer.probability)
    return Number.isFinite(p) && p > thresholds.yesnoLow && p < thresholds.yesnoHigh
  }
  if (answer.type === 'choice') {
    const p = Number(answer.probability ?? topProbability(answer))
    return Number.isFinite(p) ? p < thresholds.choice : true
  }
  if (answer.type === 'score') {
    const confidence = Number(answer.confidence)
    return Number.isFinite(confidence) ? confidence < thresholds.score : true
  }
  if (answer.type === 'box') {
    const confidence = Number(answer.confidence)
    return !Number.isFinite(confidence) || confidence < thresholds.score
  }
  return true
}

/** Add choice probability and the uncertainty flag, then drop unused payload. */
export function finalizeAnswers(answers, thresholds) {
  return answers.map(answer => {
    const out = { ...answer }
    if (out.type === 'choice' && out.probability === undefined) {
      out.probability = topProbability(out) ?? out.confidence
    }
    out.uncertain = isUncertain(out, thresholds)
    return out
  })
}

function formatProbability(value) {
  return Number.isFinite(value) ? value.toFixed(3) : '?'
}

function answerLine(answer) {
  const mark = answer.uncertain ? ' ⚠ uncertain' : ''
  if (answer.type === 'yesno') {
    return `- ${answer.name}: probability ${formatProbability(answer.probability)}${mark}`
  }
  if (answer.type === 'choice') {
    return `- ${answer.name}: ${answer.choice} (p=${formatProbability(answer.probability)})${mark}`
  }
  if (answer.type === 'score') {
    const levels = Array.isArray(answer.levels) ? answer.levels.map(item => item.label).join(' | ') : ''
    return `- ${answer.name}: ${answer.score}${levels ? ` [${levels}]` : ''}${mark}`
  }
  if (answer.type === 'box') {
    const box = answer.box
    const coords = box
      ? `top=${box.top} bottom=${box.bottom} left=${box.left} right=${box.right}`
      : 'no box'
    return `- ${answer.name}: ${coords}${mark}`
  }
  return `- ${answer.name}: declined to answer${mark}`
}

export function renderDecision(value) {
  const lines = [
    `Decision via ${value.providerLabel ?? value.provider} (${value.dialect})`,
    `model: ${value.model}`,
    ...value.answers.map(answerLine),
  ]
  const usage = value.usage
  if (usage) {
    const cost = value.estimatedCost
      ? ` · est. ${value.estimatedCost.amount.toFixed(6)} ${value.estimatedCost.currency}`
      : ''
    lines.push(
      `usage: input ${usage.inputTokens ?? '?'} · output ${usage.outputTokens ?? '?'}${cost} · ${value.latencyMs} ms`,
    )
  } else {
    lines.push(`latency: ${value.latencyMs} ms`)
  }
  if (value.uncertainCount > 0) {
    lines.push(`${value.uncertainCount} answer(s) are uncertain; consider escalating or adding context.`)
  }
  return lines.join('\n')
}

export function renderGate(value) {
  const verdict = String(value.verdict ?? '').toUpperCase()
  return `${verdict} (p=${formatProbability(value.probability)}) via ${value.providerLabel ?? value.provider}`
}
