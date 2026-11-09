/**
 * Beta helpers that turn decision questions into higher-level workflows:
 * RAG reranking and output judging. They are pure request builders plus
 * result shapers; the actual provider call goes through the runtime.
 */

const LEVELS = [
  { label: 'irrelevant' },
  { label: 'slightly relevant' },
  { label: 'relevant' },
  { label: 'highly relevant' },
]

const MAX_PASSAGE_CHARS = 4000

export function clip(text, limit = MAX_PASSAGE_CHARS) {
  const value = String(text ?? '')
  return value.length > limit ? value.slice(0, limit) + '…' : value
}

export function buildRerankQuestions(documents) {
  return documents.map((document, index) => ({
    name: `doc_${index}`,
    type: 'score',
    instructions: `How relevant is this passage to the search query?\n\nPassage:\n${clip(document.text)}`,
    levels: LEVELS,
  }))
}

export function rankRerank(documents, result) {
  const byName = new Map((result.answers ?? []).map(answer => [answer.name, answer]))
  const rows = documents.map((document, index) => {
    const answer = byName.get(`doc_${index}`)
    const score = Number(answer?.score)
    const max = LEVELS.length - 1
    const normalized = Number.isFinite(score) ? Math.max(0, Math.min(1, score / max)) : 0
    return {
      id: document.id ?? String(index),
      score: Number.isFinite(score) ? score : 0,
      relevance: normalized,
      uncertain: answer?.uncertain === true,
    }
  })
  return rows
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .map(({ index, ...row }) => row)
}

export function buildJudgeRequest(task, output, checks) {
  return {
    state: `Task:\n${clip(task, 12000)}\n\nCandidate output:\n${clip(output, 12000)}`,
    questions: checks.map((check, index) => ({
      name: `check_${index}`,
      type: 'yesno',
      instructions: `Does the candidate output satisfy this requirement?\n\nRequirement: ${check}`,
    })),
  }
}

export function summarizeJudge(checks, result, threshold = 0.5) {
  const byName = new Map((result.answers ?? []).map(answer => [answer.name, answer]))
  const rows = checks.map((check, index) => {
    const answer = byName.get(`check_${index}`)
    const probability = Number(answer?.probability)
    const passed = Number.isFinite(probability) ? probability >= threshold : false
    return {
      name: `check_${index}`,
      question: check,
      probability: Number.isFinite(probability) ? probability : 0,
      passed,
      uncertain: answer?.uncertain === true,
    }
  })
  return { passed: rows.every(row => row.passed), checks: rows }
}

export function renderRerank(value) {
  const lines = [`Rerank via ${value.providerLabel ?? value.provider} (${value.model})`]
  value.results.forEach((row, index) => {
    lines.push(
      `${index + 1}. [${row.id}] relevance ${row.relevance.toFixed(3)} (score ${row.score.toFixed(2)})${row.uncertain ? ' ⚠ uncertain' : ''}`,
    )
  })
  return lines.join('\n')
}

export function renderJudge(value) {
  const lines = [
    `${value.passed ? 'PASS' : 'FAIL'} via ${value.providerLabel ?? value.provider} (${value.model})`,
    ...value.checks.map(
      check => `- ${check.passed ? '✓' : '✗'} ${check.question} (p=${check.probability.toFixed(3)})${check.uncertain ? ' ⚠ uncertain' : ''}`,
    ),
  ]
  return lines.join('\n')
}
