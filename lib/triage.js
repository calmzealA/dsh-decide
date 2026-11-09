/**
 * Experimental loop triage.
 *
 * On the first step of a turn, ask the decision model what kind of work the
 * user's message needs, then append a short notice to the step. The notice is
 * visible to the model (and in the transcript), so the hint can steer effort
 * without changing the model route. Disabled by default.
 */

import { randomUUID } from 'node:crypto'

const SUMMARY_PREFIX = 'Decision triage:'
const SOURCE_KIND = 'plugin:dsh-decide'

function messageText(message) {
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(part => part && part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

function latestUserText(payload) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    const text = messageText(message)
    if (text) return text
  }
  return ''
}

export function noticeMessage(text, summary) {
  const short = summary.length <= 120 ? summary : summary.slice(0, 119) + '…'
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: SOURCE_KIND,
      form: 'notice',
      summary: short,
    },
  }
}

function modeHint(mode) {
  if (mode === 'quick') {
    return 'Answer directly and keep it short; avoid unnecessary planning or tool calls.'
  }
  if (mode === 'tool') {
    return 'Prefer the smallest set of tool calls, and report the evidence you used.'
  }
  return 'Plan briefly, then verify the result before finishing.'
}

export function registerTriage(ctx, getState, runtime) {
  return ctx.on('agent/pre-step', async (payload, next) => {
    let decision
    try {
      decision = await next()
    } catch (error) {
      throw error
    }
    try {
      const state = await getState()
      if (state.experimental?.triage?.enabled !== true) return decision
      if (decision?.kind !== 'enter' || payload?.signal?.aborted) return decision
      if (payload?.step !== undefined && payload.step !== 1) return decision
      const text = latestUserText(payload)
      if (!text) return decision

      const result = await runtime.executeDecision(state, ctx, {
        provider: state.experimental.triage.provider || undefined,
        state: text.slice(0, 20000),
        questions: [
          {
            name: 'mode',
            type: 'choice',
            instructions: 'What kind of work does this request need?',
            choices: [
              { label: 'quick', description: 'a short answer or a single lookup' },
              { label: 'deep', description: 'multi-step analysis or a careful plan' },
              { label: 'tool', description: 'needs external tools or shell commands' },
            ],
          },
        ],
        tool: 'triage',
        signal: payload.signal,
      })
      const answer = result.answers?.[0]
      const mode = ['quick', 'deep', 'tool'].includes(answer?.choice) ? answer.choice : 'deep'
      const probability = Number(answer?.probability)
      const summary = `${SUMMARY_PREFIX} ${mode}${Number.isFinite(probability) ? ` (p=${probability.toFixed(2)})` : ''}`
      const notice = noticeMessage(`${summary}\n\n${modeHint(mode)}`, summary)
      return { ...decision, messages: [...(decision.messages ?? []), notice] }
    } catch (error) {
      ctx.logger?.warn?.('dsh-decide: triage skipped: %s', error?.message ?? String(error))
      return decision
    }
  })
}
