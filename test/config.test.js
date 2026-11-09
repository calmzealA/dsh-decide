import test from 'node:test'
import assert from 'node:assert/strict'
import { deepMerge, normalizeState, listProviders, providerThresholds, getProvider } from '../lib/config.js'
import { taggedHomepage } from '../lib/providers.js'

test('provider homepages carry the referral tag', () => {
  assert.equal(taggedHomepage('https://typesafe.ai/'), 'https://typesafe.ai/?aichen')
  assert.equal(taggedHomepage('https://example.com/path?x=1'), 'https://example.com/path?x=1&aichen')
  assert.equal(taggedHomepage('not a url'), '')
})

test('defaults include the four presets', () => {
  const state = normalizeState({}, {})
  const providers = listProviders(state)
  assert.deepEqual(providers.map(provider => provider.id), ['typesafe', 'tokenrhythm', 'openai', 'local'])
  assert.equal(providers.find(provider => provider.id === 'tokenrhythm').enabled, true)
  assert.equal(providers.find(provider => provider.id === 'openai').enabled, false)
  assert.equal(state.maxQuestions, 8)
  assert.equal(state.audit.storeState, 'hash')
})

test('profile config outranks the settings file', () => {
  const state = normalizeState(
    { maxQuestions: 5, providers: { tokenrhythm: { model: 'from-profile' } } },
    { maxQuestions: 9, providers: { tokenrhythm: { enabled: false } } },
  )
  assert.equal(state.maxQuestions, 5)
  const provider = getProvider(state, 'tokenrhythm')
  assert.equal(provider.model, 'from-profile')
  assert.equal(provider.enabled, false)
})

test('arrays replace instead of merging', () => {
  assert.deepEqual(deepMerge({ list: [1, 2] }, { list: [3] }), { list: [3] })
})

test('an invalid provider is reported, not thrown', () => {
  const state = normalizeState({}, { providers: { custom: { dialect: 'systemone', baseURL: 'not-a-url', path: '/x', model: 'm', enabled: true } } })
  assert.match(state.providerProblems.custom, /not a valid URL/)
})

test('provider thresholds merge over the global values', () => {
  const state = normalizeState({ thresholds: { choice: 0.6 } }, { providers: { tokenrhythm: { thresholds: { choice: 0.9 } } } })
  assert.equal(providerThresholds(state, 'typesafe').choice, 0.6)
  assert.equal(providerThresholds(state, 'tokenrhythm').choice, 0.9)
  assert.equal(providerThresholds(state, 'tokenrhythm').yesnoLow, state.thresholds.yesnoLow)
})

test('yesno thresholds are ordered', () => {
  const state = normalizeState({ thresholds: { yesnoLow: 0.8, yesnoHigh: 0.2 } }, {})
  assert.equal(state.thresholds.yesnoLow, 0.2)
  assert.equal(state.thresholds.yesnoHigh, 0.8)
})
