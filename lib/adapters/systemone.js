/**
 * System One dialect: TypeSafe Jev, TokenRhythm's compatible endpoint, and
 * local servers such as Unsloth that expose `POST /v1/systemone`.
 */

import { DecideError, errorFromResponse } from '../errors.js'
import { joinURL, modelsURL } from '../providers.js'
import { normalizeUsage } from '../normalize.js'

export const dialect = 'systemone'

function criteriaFor(question) {
  if (question.type === 'choice') {
    const criteria = {}
    for (const choice of question.choices) {
      criteria[choice.label] = choice.description ?? choice.label
    }
    return criteria
  }
  if (question.type === 'score') {
    return question.levels.map(level =>
      level.description ? `${level.label}: ${level.description}` : level.label,
    )
  }
  if (question.type === 'yesno' && question.criteria) {
    return { ...question.criteria }
  }
  return undefined
}

function wireQuestion(question) {
  const out = { type: question.type === 'yesno' ? 'noul' : question.type }
  if (question.instructions) out.instructions = question.instructions
  const criteria = criteriaFor(question)
  if (criteria !== undefined) out.criteria = criteria
  return out
}

export function buildRequest(provider, request, key) {
  const questions = {}
  for (const question of request.questions) {
    questions[question.name] = wireQuestion(question)
  }
  const headers = { 'content-type': 'application/json' }
  if (key) headers.authorization = `Bearer ${key}`
  return {
    url: joinURL(provider.baseURL, provider.path),
    headers,
    body: {
      model: provider.model,
      state: request.state,
      questions,
    },
  }
}

function probabilityList(map, order) {
  const labels = Array.isArray(order) && order.length
    ? order
    : Object.keys(map ?? {})
  return labels
    .filter(label => map && Number.isFinite(Number(map[label])))
    .map(label => ({ label, probability: Number(map[label]) }))
}

function parseAnswer(provider, question, answer, includeProbabilities) {
  if (!answer || typeof answer !== 'object') {
    throw new DecideError(
      'RESPONSE',
      `${provider.displayName} returned no answer for "${question.name}"`,
      { provider: provider.id, dialect },
    )
  }
  const base = { name: question.name }
  if (answer.type === 'noul' || answer.noul !== undefined) {
    return { ...base, type: 'yesno', probability: Number(answer.noul) }
  }
  if (answer.type === 'box' || answer.box !== undefined) {
    const confidence = answer.confidence
    return {
      ...base,
      type: 'box',
      box: answer.box ?? null,
      confidence: confidence === null || confidence === undefined || !Number.isFinite(Number(confidence))
        ? null
        : Number(confidence),
    }
  }
  if (answer.type === 'score' || answer.score !== undefined) {
    const legend = answer.legend && typeof answer.legend === 'object' ? answer.legend : {}
    const keys = Object.keys(legend).sort((a, b) => Number(a) - Number(b))
    const out = { ...base, type: 'score', score: Number(answer.score) }
    if (Number.isFinite(Number(answer.confidence))) out.confidence = Number(answer.confidence)
    if (keys.length) out.levels = keys.map(key => ({ label: String(legend[key] ?? key) }))
    if (includeProbabilities) {
      const map = answer.probabilities ?? {}
      out.probabilities = keys.map(key => ({
        label: String(legend[key] ?? key),
        probability: Number(map[key] ?? 0),
      }))
    }
    return out
  }
  if (answer.type === 'choice' || answer.choice !== undefined) {
    const out = { ...base, type: 'choice', choice: String(answer.choice ?? '') }
    if (Number.isFinite(Number(answer.confidence))) out.confidence = Number(answer.confidence)
    if (includeProbabilities) {
      const order = question.choices?.map(choice => choice.label)
      out.probabilities = probabilityList(answer.probabilities ?? {}, order)
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
  if (!json.answers || typeof json.answers !== 'object') {
    throw new DecideError('RESPONSE', `${provider.displayName} response has no answers object`, {
      provider: provider.id,
      dialect,
    })
  }
  const answers = request.questions.map(question =>
    parseAnswer(provider, question, json.answers[question.name], options.includeProbabilities === true),
  )
  return {
    model: typeof json.model === 'string' ? json.model : provider.model,
    answers,
    usage: normalizeUsage(json.usage),
    extensions: json.extensions,
  }
}

export function parseError(provider, status, json, text) {
  const error = errorFromResponse(provider, status, json, text)
  if (error.status === 403 && provider.id === 'tokenrhythm') {
    error.message += ' (decision-model access is gated by an account allow-list)'
  }
  if (error.status === 451) {
    error.message += ' (the service is not available from this egress; check proxy/region)'
  }
  if (error.status === 413) {
    error.message += ' (request body is too large for this provider)'
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
