/**
 * Append-only decision audit (JSONL) and usage aggregates.
 *
 * The state is never written in clear text unless `audit.storeState` is
 * explicitly `full`; the default stores a short hash and the character count.
 */

import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

export function hashState(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

function dayKey(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function ensureDir(file) {
  await fs.mkdir(path.dirname(file), { recursive: true })
}

export async function appendRecord(state, record) {
  if (!state.audit?.enabled) return
  const file = state.audit.path
  await ensureDir(file)
  const line = JSON.stringify(record) + '\n'
  const bytes = Buffer.byteLength(line)
  try {
    const stat = await fs.stat(file)
    if (stat.size + bytes > state.audit.maxBytes) {
      try {
        await fs.rm(file + '.1', { force: true })
      } catch {
        /* ignore */
      }
      await fs.rename(file, file + '.1')
    }
  } catch {
    /* no file yet */
  }
  await fs.appendFile(file, line, 'utf8')
}

async function readLines(file) {
  try {
    const text = await fs.readFile(file, 'utf8')
    const lines = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        lines.push(JSON.parse(line))
      } catch {
        /* skip a torn line */
      }
    }
    return lines
  } catch {
    return []
  }
}

export async function readDecisions(state, options = {}) {
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 50))
  const records = await readLines(state.audit.path)
  const filtered = options.provider
    ? records.filter(record => record.provider === options.provider)
    : records
  return filtered.slice(-limit).reverse()
}

function emptyBucket() {
  return { requests: 0, inputTokens: 0, outputTokens: 0, errors: 0, cost: null }
}

function addCost(bucket, cost) {
  if (!cost || !Number.isFinite(cost.amount)) return
  if (!bucket.cost) bucket.cost = { amount: 0, currency: cost.currency ?? 'USD' }
  bucket.cost.amount += cost.amount
}

function aggregate(records) {
  const providers = {}
  const total = emptyBucket()
  for (const record of records) {
    const id = record.provider ?? 'unknown'
    const bucket = providers[id] ?? (providers[id] = emptyBucket())
    for (const target of [bucket, total]) {
      target.requests += 1
      target.inputTokens += Number(record.usage?.inputTokens) || 0
      target.outputTokens += Number(record.usage?.outputTokens) || 0
      if (record.outcome === 'error') target.errors += 1
      addCost(target, record.cost)
    }
  }
  for (const bucket of [...Object.values(providers), total]) {
    if (bucket.cost) bucket.cost.amount = Number(bucket.cost.amount.toFixed(6))
  }
  return { providers, total }
}

export async function computeStats(state, now = Date.now()) {
  const records = await readLines(state.audit.path)
  const today = dayKey(now)
  const recent = records.filter(record => {
    const time = Date.parse(record.ts)
    return Number.isFinite(time) && now - time <= 7 * 24 * 3600 * 1000
  })
  const todayRecords = recent.filter(record => dayKey(Date.parse(record.ts)) === today)
  return {
    generatedAt: new Date(now).toISOString(),
    today: { date: today, ...aggregate(todayRecords) },
    last7: aggregate(recent),
    cache: state.cache?.enabled === true,
  }
}
