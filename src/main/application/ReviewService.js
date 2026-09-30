/**
 * @file ReviewService.js
 * @description Review Service generating weekly/monthly/yearly evidence-backed review artifacts.
 * Reuses the shared AnalysisService core and EvidencePack pipeline.
 * Persists artifacts via ArtifactRepository for historical review.
 */

import { getAnalysisService } from './index.js'
import AnswerComposer from './AnswerComposer.js'

export default class ReviewService {
  /**
   * @param {Object} options
   * @param {import('./AnalysisService.js')} [options.analysisService]
   * @param {Object} [options.artifactRepository] — ArtifactRepository for persistence
   */
  constructor({ analysisService, artifactRepository } = {}) {
    this.analysisService = analysisService || null
    this.artifactRepository = artifactRepository || null
    this.composer = new AnswerComposer()
  }

  getAnalysisService() {
    if (!this.analysisService) {
      this.analysisService = getAnalysisService()
    }
    return this.analysisService
  }

  /**
   * Generate periodic review artifact and persist it.
   * @param {Object} input
   * @param {'weekly' | 'monthly' | 'yearly' | string} input.recipe
   * @param {import('../domain/contracts.js').InquiryScope} [input.scope]
   * @returns {Promise<{artifactId: string, recipe: string, evidencePack: Object, result: Object}>}
   */
  async generate({ recipe = 'weekly', scope = {} }) {
    const analysisService = this.getAnalysisService()

    // Resolve scope based on recipe if not explicit
    const resolvedScope = { ...scope }
    const now = new Date()

    if (!resolvedScope.dateRange) {
      if (recipe === 'weekly') {
        const start = new Date(now.valueOf() - 7 * 24 * 3600 * 1000).toISOString()
        resolvedScope.dateRange = { start, end: now.toISOString() }
      } else if (recipe === 'monthly') {
        const start = new Date(now.valueOf() - 30 * 24 * 3600 * 1000).toISOString()
        resolvedScope.dateRange = { start, end: now.toISOString() }
      } else if (recipe === 'yearly') {
        const start = new Date(now.valueOf() - 365 * 24 * 3600 * 1000).toISOString()
        resolvedScope.dateRange = { start, end: now.toISOString() }
      }
    }

    const plan = {
      normalizedQuestion: `Generate ${recipe} review summary`,
      operations: [
        { id: 'op_review_1', type: 'exact_query', input: {}, dependsOn: [] },
        { id: 'op_review_2', type: 'aggregate', input: {}, dependsOn: ['op_review_1'] }
      ],
      scope: resolvedScope,
      expectedOutput: 'mixed'
    }

    const evidencePack = await analysisService.execute(plan)
    const mockSession = {
      id: `review_sess_${Date.now()}`,
      currentQuestion: `Review Recipe: ${recipe}`,
      scope: resolvedScope
    }

    const explorationResult = this.composer.compose({
      evidencePack,
      session: mockSession,
      llmSummary: `This ${recipe} review is grounded in ${evidencePack.evidence.length} journal entries between ${resolvedScope.dateRange?.start?.slice(0, 10) || 'earliest'} and ${resolvedScope.dateRange?.end?.slice(0, 10) || 'present'}.`
    })

    const artifact = {
      type: `review/${recipe}`,
      recipe,
      evidencePack,
      result: explorationResult,
      generatedAt: new Date().toISOString(),
    }

    // Persist via repository if available
    if (this.artifactRepository) {
      const saved = this.artifactRepository.save(artifact)
      return {
        artifactId: saved.id,
        recipe,
        evidencePack,
        result: explorationResult,
        savedAt: saved.savedAt,
      }
    }

    // Fallback: return without persistence
    return {
      artifactId: `artifact_review_${recipe}_${Date.now()}`,
      recipe,
      evidencePack,
      result: explorationResult
    }
  }

  /**
   * List saved review artifacts.
   * @param {Object} [options]
   * @param {string} [options.recipe] — filter by recipe type
   * @param {number} [options.limit]
   * @returns {Array<Object>}
   */
  listArtifacts({ recipe, limit } = {}) {
    if (!this.artifactRepository) return []
    return this.artifactRepository.list({
      type: recipe ? `review/${recipe}` : 'review',
      limit
    })
  }

  /**
   * Get a specific artifact by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getArtifact(id) {
    if (!this.artifactRepository) return null
    return this.artifactRepository.getById(id)
  }
}
