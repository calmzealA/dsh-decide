/**
 * dsh-decide — host half.
 *
 * Registers the `decide` and `decide_gate` tools, the Settings → Decisions
 * page API, and (optionally) a pre-execute guard. Providers share one canonical
 * request/answer model; the dialect adapters own the wire differences.
 */

import { normalizeState, readSettings } from './lib/config.js'
import { registerGuard } from './lib/guard.js'
import {
  buildJudgeRequest,
  buildRerankQuestions,
  rankRerank,
  renderJudge,
  renderRerank,
  summarizeJudge,
} from './lib/insights.js'
import { renderDecision, renderGate } from './lib/normalize.js'
import { createRoutes } from './lib/routes.js'
import { createRuntime } from './lib/runtime.js'
import { registerTriage } from './lib/triage.js'

export const inject = ['tools']

const PROBABILITY_LIST = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      probability: { type: 'number' },
    },
    required: ['label', 'probability'],
    additionalProperties: false,
  },
}

const DECIDE_PARAMETERS = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      description:
        'The text to judge. Serialize JSON to a string first. Keep it small; the provider token limit applies.',
    },
    questions: {
      type: 'array',
      description:
        'One to eight named questions. choice needs choices; score needs 2-10 levels; yesno may add criteria.',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Result key. Letters, digits, underscore; must start with a letter or underscore.',
          },
          type: {
            type: 'string',
            enum: ['yesno', 'choice', 'score', 'box'],
          },
          instructions: {
            type: 'string',
            description: 'What to decide. Short and specific is better.',
          },
          choices: {
            type: 'array',
            description: 'For choice: the options.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
          levels: {
            type: 'array',
            description: 'For score: ordered levels, lowest first.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
          criteria: {
            type: 'object',
            description: 'For yesno: what counts as true or false.',
            properties: {
              true: { type: 'string' },
              false: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        required: ['name', 'type'],
        additionalProperties: false,
      },
    },
    provider: {
      type: 'string',
      description: 'Optional provider id. Omit to use the configured default provider.',
    },
    includeProbabilities: {
      type: 'boolean',
      description: 'Include the full probability distribution for choice and score answers.',
    },
  },
  required: ['state', 'questions'],
  additionalProperties: false,
}

const DECIDE_OUTPUT = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    providerLabel: { type: 'string' },
    dialect: { type: 'string' },
    model: { type: 'string' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          choice: { type: 'string' },
          score: { type: 'number' },
          probability: { type: 'number' },
          confidence: { type: 'number' },
          levels: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false } },
          probabilities: PROBABILITY_LIST,
          refused: { type: 'boolean' },
          reason: { type: 'string' },
          uncertain: { type: 'boolean' },
        },
        required: ['name', 'type', 'uncertain'],
        additionalProperties: false,
      },
    },
    usage: {
      type: 'object',
      properties: {
        inputTokens: { type: 'number' },
        outputTokens: { type: 'number' },
        totalTokens: { type: 'number' },
      },
      additionalProperties: false,
    },
    estimatedCost: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
      },
      required: ['amount', 'currency'],
      additionalProperties: false,
    },
    latencyMs: { type: 'number' },
    uncertainCount: { type: 'number' },
    cached: { type: 'boolean' },
  },
  required: ['provider', 'providerLabel', 'dialect', 'model', 'answers', 'latencyMs', 'uncertainCount', 'cached'],
  additionalProperties: false,
}

const GATE_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description: 'The planned action, command, or change to judge. Do not include secrets.',
    },
    question: {
      type: 'string',
      description: 'Optional yes/no question; default asks whether the action could irreversibly damage data.',
    },
    provider: {
      type: 'string',
      description: 'Optional provider id; defaults to the guard provider or the default provider.',
    },
    low: { type: 'number', description: 'Below this probability the verdict is allow.' },
    high: { type: 'number', description: 'At or above this probability the verdict is deny.' },
  },
  required: ['action'],
  additionalProperties: false,
}

const GATE_OUTPUT = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    probability: { type: 'number' },
    provider: { type: 'string' },
    providerLabel: { type: 'string' },
    dialect: { type: 'string' },
    model: { type: 'string' },
    usage: {
      type: 'object',
      properties: {
        inputTokens: { type: 'number' },
        outputTokens: { type: 'number' },
        totalTokens: { type: 'number' },
      },
      additionalProperties: false,
    },
    estimatedCost: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
      },
      required: ['amount', 'currency'],
      additionalProperties: false,
    },
    latencyMs: { type: 'number' },
    uncertain: { type: 'boolean' },
  },
  required: ['verdict', 'probability', 'provider', 'providerLabel', 'dialect', 'model', 'latencyMs', 'uncertain'],
  additionalProperties: false,
}

const RERANK_PARAMETERS = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The search query or question the passages should answer.' },
    documents: {
      type: 'array',
      description: 'Candidate passages; at most maxQuestions (default 8). Long text is clipped.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['text'],
        additionalProperties: false,
      },
    },
    provider: { type: 'string', description: 'Optional provider id.' },
  },
  required: ['query', 'documents'],
  additionalProperties: false,
}

const RERANK_OUTPUT = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    providerLabel: { type: 'string' },
    dialect: { type: 'string' },
    model: { type: 'string' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'number' },
          relevance: { type: 'number' },
          uncertain: { type: 'boolean' },
        },
        required: ['id', 'score', 'relevance', 'uncertain'],
        additionalProperties: false,
      },
    },
    usage: {
      type: 'object',
      properties: {
        inputTokens: { type: 'number' },
        outputTokens: { type: 'number' },
        totalTokens: { type: 'number' },
      },
      additionalProperties: false,
    },
    estimatedCost: {
      type: 'object',
      properties: { amount: { type: 'number' }, currency: { type: 'string' } },
      required: ['amount', 'currency'],
      additionalProperties: false,
    },
    latencyMs: { type: 'number' },
  },
  required: ['provider', 'providerLabel', 'dialect', 'model', 'results', 'latencyMs'],
  additionalProperties: false,
}

const JUDGE_PARAMETERS = {
  type: 'object',
  properties: {
    task: { type: 'string', description: 'The task or question the candidate output should satisfy.' },
    output: { type: 'string', description: 'The answer, tool result, or draft to judge.' },
    checks: {
      type: 'array',
      description: 'Independent yes/no requirements; at most maxQuestions.',
      items: { type: 'string' },
    },
    provider: { type: 'string', description: 'Optional provider id.' },
    threshold: { type: 'number', description: 'Probability at or above which a check passes (default 0.5).' },
  },
  required: ['task', 'output', 'checks'],
  additionalProperties: false,
}

const JUDGE_OUTPUT = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    provider: { type: 'string' },
    providerLabel: { type: 'string' },
    dialect: { type: 'string' },
    model: { type: 'string' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          question: { type: 'string' },
          probability: { type: 'number' },
          passed: { type: 'boolean' },
          uncertain: { type: 'boolean' },
        },
        required: ['name', 'question', 'probability', 'passed', 'uncertain'],
        additionalProperties: false,
      },
    },
    usage: {
      type: 'object',
      properties: {
        inputTokens: { type: 'number' },
        outputTokens: { type: 'number' },
        totalTokens: { type: 'number' },
      },
      additionalProperties: false,
    },
    estimatedCost: {
      type: 'object',
      properties: { amount: { type: 'number' }, currency: { type: 'string' } },
      required: ['amount', 'currency'],
      additionalProperties: false,
    },
    latencyMs: { type: 'number' },
  },
  required: ['passed', 'provider', 'providerLabel', 'dialect', 'model', 'checks', 'latencyMs'],
  additionalProperties: false,
}

function asText(value) {
  return [{ type: 'text', text: value }]
}

export function apply(ctx, config = {}) {
  const tools = ctx.get('tools')
  if (!tools) throw new Error('dsh-decide requires the tools service')
  const runtime = createRuntime()

  async function getState() {
    const file = await readSettings()
    const state = normalizeState(config, file)
    state.pluginConfig = config
    return state
  }

  ctx.effect(() => tools.register({
    name: 'decide',
    description:
      'Ask a decision model for typed answers about a piece of text. Supports classification (choice), yes/no probability (yesno), and ordered scoring (score). Providers may be TypeSafe Jev, TokenRhythm NeoHorse-Jev, OpenAI Decisions, or a local System One endpoint; the user configures which. Results are calibrated probabilities, not explanations — branch on them with a threshold and escalate when `uncertain` is true. The state text is sent to the selected provider, so do not include secrets.',
    parameters: DECIDE_PARAMETERS,
    output: {
      schema: DECIDE_OUTPUT,
      render: (_args, value) => asText(renderDecision(value)),
    },
    async execute(args, exec) {
      const state = await getState()
      return await runtime.executeDecision(state, ctx, {
        state: args.state,
        questions: args.questions,
        provider: args.provider,
        includeProbabilities: args.includeProbabilities === true,
        signal: exec?.signal,
      })
    },
  }))

  ctx.effect(() => tools.register({
    name: 'decide_gate',
    description:
      'Ask a yes/no decision model whether a planned action is risky, and get allow / review / deny. Use it before destructive or irreversible actions (shell commands, file deletions, force pushes, publishing). The action text is sent to the selected provider; do not include secrets. A failure to reach the provider is reported as an error, not as approval.',
    parameters: GATE_PARAMETERS,
    output: {
      schema: GATE_OUTPUT,
      render: (_args, value) => asText(renderGate(value)),
    },
    async execute(args, exec) {
      const state = await getState()
      if (typeof args.action !== 'string' || !args.action.trim()) {
        throw new Error('action must be a non-empty string')
      }
      const low = args.low === undefined ? undefined : Number(args.low)
      const high = args.high === undefined ? undefined : Number(args.high)
      if (low !== undefined && (!Number.isFinite(low) || low < 0 || low > 1)) {
        throw new Error('low must be between 0 and 1')
      }
      if (high !== undefined && (!Number.isFinite(high) || high < 0 || high > 1)) {
        throw new Error('high must be between 0 and 1')
      }
      return await runtime.executeGate(state, ctx, {
        action: args.action,
        question: args.question,
        provider: args.provider,
        low,
        high,
        signal: exec?.signal,
      })
    },
  }))

  ctx.effect(() => tools.register({
    name: 'decide_rerank',
    description:
      'Beta: rerank candidate passages for RAG with a decision model. Give a query and up to maxQuestions passages; each passage is scored for relevance and the list is returned sorted. Useful before stuffing context, when keyword search returned too much. The query and passages are sent to the selected provider.',
    parameters: RERANK_PARAMETERS,
    output: {
      schema: RERANK_OUTPUT,
      render: (_args, value) => asText(renderRerank(value)),
    },
    async execute(args, exec) {
      const state = await getState()
      if (typeof args.query !== 'string' || !args.query.trim()) {
        throw new Error('query must be a non-empty string')
      }
      if (!Array.isArray(args.documents) || args.documents.length === 0) {
        throw new Error('documents must be a non-empty array')
      }
      const documents = args.documents.map((document, index) => ({
        id: typeof document?.id === 'string' && document.id ? document.id : String(index),
        text: typeof document?.text === 'string' ? document.text : '',
      }))
      const max = Math.min(Number(state.maxQuestions) || 8, 64)
      if (documents.length > max) {
        throw new Error(`at most ${max} documents per request; raise maxQuestions in Settings → Decisions or send fewer`)
      }
      const result = await runtime.executeDecision(state, ctx, {
        provider: args.provider,
        state: args.query,
        questions: buildRerankQuestions(documents),
        tool: 'rerank',
        signal: exec?.signal,
      })
      return {
        provider: result.provider,
        providerLabel: result.providerLabel,
        dialect: result.dialect,
        model: result.model,
        results: rankRerank(documents, result),
        ...(result.usage ? { usage: result.usage } : {}),
        ...(result.estimatedCost ? { estimatedCost: result.estimatedCost } : {}),
        latencyMs: result.latencyMs,
      }
    },
  }))

  ctx.effect(() => tools.register({
    name: 'decide_judge',
    description:
      'Beta: judge an answer, draft, or tool result against explicit yes/no checks with a decision model. Returns PASS/FAIL and one probability per check. Use it for review gates, LLM-as-a-judge, or checking that a tool result actually satisfies the request. The task, output, and checks are sent to the selected provider.',
    parameters: JUDGE_PARAMETERS,
    output: {
      schema: JUDGE_OUTPUT,
      render: (_args, value) => asText(renderJudge(value)),
    },
    async execute(args, exec) {
      const state = await getState()
      if (typeof args.task !== 'string' || !args.task.trim()) {
        throw new Error('task must be a non-empty string')
      }
      if (typeof args.output !== 'string' || !args.output.trim()) {
        throw new Error('output must be a non-empty string')
      }
      if (!Array.isArray(args.checks)) throw new Error('checks must be an array of strings')
      const checks = args.checks.map(check => String(check ?? '').trim()).filter(Boolean)
      if (checks.length === 0) throw new Error('checks must contain at least one requirement')
      const max = Math.min(Number(state.maxQuestions) || 8, 64)
      if (checks.length > max) {
        throw new Error(`at most ${max} checks per request; raise maxQuestions in Settings → Decisions or send fewer`)
      }
      const rawThreshold = Number(args.threshold)
      const threshold = Number.isFinite(rawThreshold) ? Math.min(1, Math.max(0, rawThreshold)) : 0.5
      const request = buildJudgeRequest(args.task, args.output, checks)
      const result = await runtime.executeDecision(state, ctx, {
        provider: args.provider,
        state: request.state,
        questions: request.questions,
        tool: 'judge',
        signal: exec?.signal,
      })
      const summary = summarizeJudge(checks, result, threshold)
      return {
        passed: summary.passed,
        provider: result.provider,
        providerLabel: result.providerLabel,
        dialect: result.dialect,
        model: result.model,
        checks: summary.checks,
        ...(result.usage ? { usage: result.usage } : {}),
        ...(result.estimatedCost ? { estimatedCost: result.estimatedCost } : {}),
        latencyMs: result.latencyMs,
      }
    },
  }))

  ctx.effect(() => registerGuard(ctx, getState, runtime))
  ctx.effect(() => registerTriage(ctx, getState, runtime))

  ctx.inject(['webServer'], scoped => {
    const webServer = scoped.get('webServer') ?? scoped.webServer
    if (!webServer?.register) return
    const routes = createRoutes({ ctx: scoped, getState, runtime })
    scoped.effect(() => webServer.register({
      kind: 'prefix',
      path: routes.path,
      handler: routes.handle,
    }))
  })
}
