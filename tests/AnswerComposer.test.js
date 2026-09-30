/**
 * AnswerComposer Tests
 */

import { describe, it, expect } from 'vitest'
import AnswerComposer from '../src/main/application/AnswerComposer.js'

describe('AnswerComposer', () => {
  let composer

  beforeEach(() => {
    composer = new AnswerComposer()
  })

  const makeEvidencePack = () => ({
    id: 'pack-test',
    schemaVersion: '1.0.0',
    question: 'test question',
    scope: {},
    evidence: [
      { id: 'ev-001', recordId: 'rec-001', occurredAt: '2026-07-25', field: 'contentText', excerpt: 'excerpt 1', relevance: 0.9 },
      { id: 'ev-002', recordId: 'rec-002', occurredAt: '2026-07-24', field: 'contentText', excerpt: 'excerpt 2', relevance: 0.8 },
    ],
    metrics: [
      { id: 'm-001', label: 'Total Entries', value: 10, unit: 'entries', operation: 'COUNT', sampleSize: 10 },
    ],
    comparisons: [],
    limitations: [],
    generatedAt: '2026-07-26T10:00:00Z',
  })

  const makeSession = () => ({
    id: 'sess-test',
    currentQuestion: 'test',
    scope: {},
  })

  it('should compose result with required fields', () => {
    const result = composer.compose({ evidencePack: makeEvidencePack(), session: makeSession() })
    expect(result.sessionId).toBe('sess-test')
    expect(result.evidencePackId).toBe('pack-test')
    expect(result.facts.length).toBe(2)
    expect(result.computations.length).toBe(1)
    expect(result.hypotheses.length).toBe(1)
    expect(result.suggestions.length).toBe(1)
    expect(result.followUps.length).toBeGreaterThan(0)
  })

  it('should include answer text', () => {
    const result = composer.compose({ evidencePack: makeEvidencePack(), session: makeSession() })
    expect(result.answer).toContain('Evidence Summary')
    expect(result.answer).toContain('2')  // evidence count
  })

  it('should use llmSummary when provided', () => {
    const result = composer.compose({
      evidencePack: makeEvidencePack(),
      session: makeSession(),
      llmSummary: 'Custom LLM generated summary'
    })
    expect(result.hypotheses[0].text).toBe('Custom LLM generated summary')
    expect(result.hypotheses[0].confidence).toBe('medium')
  })

  it('should generate rule-based hypothesis without llmSummary', () => {
    const result = composer.compose({ evidencePack: makeEvidencePack(), session: makeSession() })
    expect(result.hypotheses[0].text).toContain('2 retrieved entries')
    expect(result.hypotheses[0].model).toBe('Rule-Based-Inference-v1')
    expect(result.hypotheses[0].confidence).toBe('high')
  })

  it('should validate citation integrity — remove dangling refs', () => {
    const result = composer.compose({
      evidencePack: makeEvidencePack(),
      session: makeSession(),
      llmSummary: 'Test'
    })
    const validIds = new Set(['ev-001', 'ev-002'])
    for (const h of result.hypotheses) {
      for (const ref of h.evidenceRefs) {
        expect(validIds.has(ref)).toBe(true)
      }
    }
  })

  it('should default to reuse when no signals detected', () => {
    const result = composer.compose({
      evidencePack: { ...makeEvidencePack(), evidence: [], metrics: [] },
      session: makeSession(),
    })
    expect(result.followUps).toContain('Show exact entries for this period.')
  })
})
