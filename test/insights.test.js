import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildJudgeRequest,
  buildRerankQuestions,
  rankRerank,
  summarizeJudge,
} from '../lib/insights.js'

test('rerank questions are one score question per document', () => {
  const questions = buildRerankQuestions([
    { id: 'a', text: 'first passage' },
    { id: 'b', text: 'second passage' },
  ])
  assert.equal(questions.length, 2)
  assert.equal(questions[0].name, 'doc_0')
  assert.equal(questions[0].type, 'score')
  assert.match(questions[0].instructions, /first passage/)
  assert.equal(questions[0].levels.length, 4)
})

test('rankRerank sorts by relevance and keeps ids', () => {
  const documents = [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }]
  const result = {
    answers: [
      { name: 'doc_0', type: 'score', score: 1, uncertain: false },
      { name: 'doc_1', type: 'score', score: 3, uncertain: true },
    ],
  }
  const ranked = rankRerank(documents, result)
  assert.deepEqual(ranked.map(row => row.id), ['b', 'a'])
  assert.equal(ranked[0].relevance, 1)
  assert.equal(ranked[0].uncertain, true)
})

test('judge builds one yes/no question per check and aggregates', () => {
  const request = buildJudgeRequest('task', 'output', ['has sources', 'no invented facts'])
  assert.equal(request.questions.length, 2)
  assert.equal(request.questions[0].type, 'yesno')
  assert.match(request.state, /Candidate output:\noutput/)

  const summary = summarizeJudge(['has sources', 'no invented facts'], {
    answers: [
      { name: 'check_0', type: 'yesno', probability: 0.9, uncertain: false },
      { name: 'check_1', type: 'yesno', probability: 0.4, uncertain: true },
    ],
  }, 0.5)
  assert.equal(summary.passed, false)
  assert.equal(summary.checks[0].passed, true)
  assert.equal(summary.checks[1].passed, false)
  assert.equal(summary.checks[1].uncertain, true)
})
