import * as systemone from './systemone.js'
import * as openaiDecisions from './openai-decisions.js'
import { DecideError } from '../errors.js'

const ADAPTERS = {
  systemone,
  'openai-decisions': openaiDecisions,
}

export function adapterFor(dialect) {
  const adapter = ADAPTERS[dialect]
  if (!adapter) {
    throw new DecideError('UNSUPPORTED', `unsupported decision dialect "${dialect}"`)
  }
  return adapter
}

export function buildRequest(provider, request, key) {
  return adapterFor(provider.dialect).buildRequest(provider, request, key)
}

export function parseResponse(provider, request, json, options) {
  return adapterFor(provider.dialect).parseResponse(provider, request, json, options)
}

export function parseError(provider, status, json, text) {
  return adapterFor(provider.dialect).parseError(provider, status, json, text)
}

export function modelsRequest(provider, key) {
  return adapterFor(provider.dialect).modelsRequest(provider, key)
}

export function parseModels(provider, json) {
  return adapterFor(provider.dialect).parseModels(json)
}
