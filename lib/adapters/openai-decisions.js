/**
 * OpenAI Decisions dialect: `POST /v1/decisions` with `input` and an array of
 * named questions (`predicate` / `choice` / `score`). Answers come back as an
 * array; a question may be answered with `type: "refusal"`.
 */

import { DecideError, errorFromResponse } from '../errors.js'
import { joinURL, modelsURL } from '../providers.js'
import { normalizeUsage } from '../normalize.js'

export const dialect = 'openai-decisions'

function wireQuestion(question) {
  const out = { name: question.name }
  if (question.instructions) out.instructions = question.instructions
  if (question.type === 'yesno') {
    out.type = 'predicate'
    return out
  }
  if (question.type === 'choice') {
    out.type = 'choice'
    const choices = {}
    for (const choice of question.choices) {
      choices[choice.label] = choice.description ?? choice.label
    }
    out.choices = choices
    return out
  }
  if (question.type === 'score') {
    out.type = 'score'
    out.levels = question.levels.map(level =>
      level.description
        ? { label: level.label, description: level.description }
        : level.label,
    )
    return out
  }
  throw new DecideError('UNSUPPORTED', 'OpenAI Decisions does not support box questions', {
    dialect,
  })
}

export function buildRequest(provider, request, key) {
  const headers = { 'content-type': 'application/json' }
  if (key) headers.authorization = `Bearer ${key}`
  return {
    url: joinURL(provider.baseURL, provider.path),
    headers,
    body: {
      model: provider.model,
      input: request.state,
      questions: request.questions.map(wireQuestion),
    },
  }
}

function probabilityList(map, order) {
  const labels = Array.isArray(order) && order.length ? order : Object.keys(map ?? {})
  return labels
    .filter(label => map && Number.isFinite(Number(map[label])))
    .map(label => ({ label, probability: Number(map[label]) }))
}

function answerFor(provider, question, answer, includeProbabilities) {
  if (!answer || typeof answer !== 'object') {
    throw new DecideError(
      'RESPONSE',
      `${provider.displayName} returned no answer for "${question.name}"`,
      { provider: provider.id, dialect },
    )
  }
  const base = { name: question.name }
  if (answer.type === 'refusal') {
    return {
      ...base,
      type: 'refusal',
      refused: true,
      reason: typeof answer.reason === 'string' ? answer.reason : 'the model declined to answer',
    }
  }
  if (answer.type === 'predicate' || answer.probability !== undefined) {
    return { ...base, type: 'yesno', probability: Number(answer.probability) }
  }
  if (answer.type === 'choice' || answer.choice !== undefined) {
    const out = { ...base, type: 'choice', choice: String(answer.choice ?? '') }
    if (Number.isFinite(Number(answer.confidence))) out.confidence = Number(answer.confidence)
    if (includeProbabilities) {
      out.probabilities = probabilityList(
        answer.probabilities ?? {},
        question.choices?.map(choice => choice.label),
      )
    }
    return out
  }
  if (answer.type === 'score' || answer.score !== undefined) {
    const out = {
      ...base,
      type: 'score',
      score: Number(answer.score),
      levels: question.levels?.map(level => ({ label: level.label })) ?? [],
    }
    if (Number.isFinite(Number(answer.confidence))) out.confidence = Number(answer.confidence)
    if (includeProbabilities) {
      const list = Array.isArray(answer.probabilities) ? answer.probabilities : []
      out.probabilities = list
        .map(item => ({
          label: String(item?.label ?? item?.value ?? ''),
          probability: Number(item?.probability),
        }))
        .filter(item => item.label && Number.isFinite(item.probability))
    }
    return out
  }
  throw new DecideError(
    'RESPONSE',
    `${provider.displayName} returned an unknown answer type for "${question.name}"`,
    { provider: provider.id, dialect },
  )
}

export function parseResponse(provider, request, json, options = {}) {
  if (!json || typeof json !== 'object') {
    throw new DecideError('RESPONSE', `${provider.displayName} returned an empty response`, {
      provider: provider.id,
      dialect,
    })
  }
  const list = Array.isArray(json.answers)
    ? json.answers
    : json.answers && typeof json.answers === 'object'
      ? Object.entries(json.answers).map(([name, value]) => ({ name, ...value }))
      : undefined
  if (!list) {
    throw new DecideError('RESPONSE', `${provider.displayName} response has no answers`, {
      provider: provider.id,
      dialect,
    })
  }
  const byName = new Map()
  for (const answer of list) {
    if (answer && typeof answer.name === 'string') byName.set(answer.name, answer)
  }
  const answers = request.questions.map(question =>
    answerFor(provider, question, byName.get(question.name), options.includeProbabilities === true),
  )
  return {
    model: typeof json.model === 'string' ? json.model : provider.model,
    answers,
    usage: normalizeUsage(json.usage),
  }
}

export function parseError(provider, status, json, text) {
  const error = errorFromResponse(provider, status, json, text)
  if (error.status === 403) {
    error.message += ' (the key may not have access to the Decisions API)'
  }
  return error
}

export function modelsRequest(provider, key) {
  const headers = { accept: 'application/json' }
  if (key) headers.authorization = `Bearer ${key}`
  return { url: modelsURL(provider), headers }
}

export function parseModels(json) {
  const list = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
        ? json.models
        : []
  return list
    .map(item => {
      if (typeof item === 'string') return { id: item }
      if (!item || typeof item !== 'object') return undefined
      const id = item.id ?? item.name ?? item.model
      if (typeof id !== 'string' || !id) return undefined
      return typeof item.name === 'string' && item.name
        ? { id, name: item.name }
        : { id }
    })
    .filter(Boolean)
}
