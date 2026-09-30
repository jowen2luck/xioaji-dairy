/**
 * @file AnswerComposer.js
 * @description AnswerComposer enforces epistemic separation into:
 * - facts (source evidence citations)
 * - computations (deterministic metrics)
 * - hypotheses (model-generated hypotheses)
 * - suggestions (reflective suggestions)
 *
 * Supports optional LLM-backed hypothesis generation with citation integrity validation.
 */

export default class AnswerComposer {
  /**
   * @param {Object} options
   * @param {Object} [options.llmClient] — optional LLM client with invoke() method
   */
  constructor({ llmClient } = {}) {
    this.llm = llmClient || null
  }

  /**
   * Compose ExplorationResult from EvidencePack and session context.
   * @param {Object} options
   * @param {import('../domain/contracts').EvidencePack} options.evidencePack
   * @param {import('../domain/contracts').InquirySession} options.session
   * @param {string} [options.llmSummary] - Optional LLM-generated narrative summary
   * @returns {import('../domain/contracts').ExplorationResult}
   */
  compose({ evidencePack, session, llmSummary }) {
    const facts = evidencePack.evidence.map(ev => ({
      text: `Direct Entry Excerpt (${ev.occurredAt}): "${ev.excerpt}"`,
      evidenceRefs: [ev.id]
    }))

    const computations = evidencePack.metrics.map(m => ({
      text: `${m.label}: ${m.value !== null ? m.value : 'N/A'} ${m.unit || ''} (Sample Size: ${m.sampleSize})`,
      metricRefs: [m.id]
    }))

    const hypotheses = llmSummary ? [
      {
        text: llmSummary,
        evidenceRefs: evidencePack.evidence.map(e => e.id),
        confidence: 'medium',
        model: 'AnalysisCore-Composer-v1'
      }
    ] : [
      {
        text: `Based on ${evidencePack.evidence.length} retrieved entries, records reflect activity in target scope.`,
        evidenceRefs: evidencePack.evidence.map(e => e.id),
        confidence: 'high',
        model: 'Rule-Based-Inference-v1'
      }
    ]

    // Validate citation integrity: every referenced evidence ID must exist in the pack
    const validIds = new Set(evidencePack.evidence.map(e => e.id))
    for (const h of hypotheses) {
      h.evidenceRefs = h.evidenceRefs.filter(ref => validIds.has(ref))
    }

    const suggestions = [
      {
        text: 'Compare these records with non-matching dates or different project filters for deeper contrast.',
        basisRefs: evidencePack.evidence.map(e => e.id)
      }
    ]

    const answerLines = [
      `### Evidence Summary`,
      `Found **${evidencePack.evidence.length}** matching journal entries.`,
      `### Key Computations`,
      ...computations.map(c => `- ${c.text}`),
      `### Analysis & Hypothesis`,
      ...hypotheses.map(h => `- ${h.text}`)
    ]

    return {
      sessionId: session.id,
      evidencePackId: evidencePack.id,
      answer: answerLines.join('\n\n'),
      facts,
      computations,
      hypotheses,
      suggestions,
      followUps: this._generateFollowUps(session, evidencePack)
    }
  }

  /**
   * Generate contextual follow-up suggestions.
   * @param {Object} session
   * @param {Object} evidencePack
   * @returns {string[]}
   */
  _generateFollowUps(session, evidencePack) {
    const suggestions = []
    if (evidencePack.metrics.length > 0) {
      suggestions.push('How does this compare with last period?')
    }
    if (evidencePack.evidence.length > 5) {
      suggestions.push('Only show entries with high mood ratings.')
    }
    suggestions.push('Show exact entries for this period.')
    return suggestions
  }
}
