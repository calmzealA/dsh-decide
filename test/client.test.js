import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
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

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props, children }
    },
    useState(initial) {
      return [initial, () => {}]
    },
    useEffect() {},
    useMemo(fn) {
      return fn()
    },
  }
}

test('client bundle registers the package id and a settings section', () => {
  assert.ok(captured, 'window.__ModuleLoader__.load was not called')
  assert.equal(captured.id, pkg.name)
  const exports = captured.factory(name => {
    if (name === 'react') return fakeReact()
    throw new Error('unexpected require: ' + name)
  })
  assert.deepEqual(exports.inject, ['slots', 'locale'])

  const sections = []
  const locales = []
  const ctx = {
    effect(fn) {
      return fn()
    },
    locale: {
      bind: () => key => key,
      register: (namespace, language) => {
        locales.push([namespace, language])
      },
    },
    slots: {
      inject: (_name, callback) => callback(),
      register: (definition, component) => {
        sections.push({ definition, component })
      },
    },
  }
  exports.apply(ctx)
  assert.equal(locales.length, 9)
  assert.deepEqual(locales.map(item => item[0]), Array(9).fill('dsh-decide'))
  for (const language of ['en', 'zh', 'zh-CN', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
    assert.ok(locales.some(item => item[1] === language), `missing locale ${language}`)
  }
  assert.equal(sections.length, 1)
  assert.equal(sections[0].definition.name, 'settings.section')
  assert.equal(sections[0].definition.id, 'dsh-decide')
  assert.equal(typeof sections[0].component, 'function')
})
