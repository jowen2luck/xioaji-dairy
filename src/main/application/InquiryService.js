/**
 * @file InquiryService.js
 * @description Central Application Service coordinating inquiry workflows, continuous session state,
 * EvidencePack generation via AnalysisService, and AnswerComposer rendering.
 * Uses QueryPlanner for dynamic plan generation and intelligent scope evolution.
 */

import InquirySessionStore from '../domain/inquiry/InquirySessionStore.js'
import QueryPlanner from '../domain/inquiry/QueryPlanner.js'
import AnswerComposer from './AnswerComposer.js'

export default class InquiryService {
  /**
   * @param {Object} options
   * @param {import('./JournalService.js')} options.journalService
   * @param {import('./AnalysisService.js')} options.analysisService
   * @param {Object} [options.llmClient] — optional LLM client for QueryPlanner
   */
  constructor({ journalService, analysisService, llmClient } = {}) {
    this.journalService = journalService
    this.analysisService = analysisService
    this.sessionStore = new InquirySessionStore()
    this.composer = new AnswerComposer()
    this.queryPlanner = new QueryPlanner({ llmClient })
    this.evidencePacks = new Map() // packId -> EvidencePack
    this.modelCallReceipts = [] // tracks all LLM calls
  }

  /**
   * Start a new inquiry session
   * @param {Object} input
   * @param {string} input.question
   * @param {import('../domain/contracts.js').InquiryScope} [input.scope]
   * @returns {Promise<import('../domain/contracts.js').ExplorationResult>}
   */
  async start({ question, scope = {} }) {
    const session = this.sessionStore.createSession(question, scope)

    // Use QueryPlanner to generate a dynamic plan
    const plan = await this.queryPlanner.generatePlan(question, session)
    this._recordModelCall('planning', question)

    const evidencePack = await this.analysisService.execute(plan)
    this.evidencePacks.set(evidencePack.id, evidencePack)
    this.sessionStore.addEvidencePack(session.id, evidencePack.id)

    const result = this.composer.compose({ evidencePack, session })
    return result
  }

  /**
   * Follow up in an existing inquiry session with intelligent scope evolution.
   * @param {Object} input
   * @param {string} input.sessionId
   * @param {string} input.question
   * @param {Partial<import('../domain/contracts.js').InquiryScope>} [input.scopePatch]
   * @returns {Promise<import('../domain/contracts.js').ExplorationResult>}
   */
  async followUp({ sessionId, question, scopePatch = {} }) {
    const session = this.sessionStore.getSession(sessionId)
    if (!session) throw new Error(`[InquiryService] Session ${sessionId} not found`)

    // Detect scope evolution strategy from the question
    const strategy = this.queryPlanner.detectScopeStrategy(question, scopePatch)
    const evolvedScope = this.queryPlanner.evolveScope(session.scope, strategy, scopePatch)

    // Update session with evolved scope
    this.sessionStore.updateSession(sessionId, question, evolvedScope)

    // Generate plan based on evolved session
    const updatedSession = this.sessionStore.getSession(sessionId)
    const plan = await this.queryPlanner.generatePlan(question, updatedSession)
    this._recordModelCall('planning', question)

    const evidencePack = await this.analysisService.execute(plan)
    this.evidencePacks.set(evidencePack.id, evidencePack)
    this.sessionStore.addEvidencePack(session.id, evidencePack.id)

    const result = this.composer.compose({ evidencePack, session: updatedSession })
    return result
  }

  /**
   * Get session details
   * @param {string} sessionId
   */
  async getSession(sessionId) {
    return this.sessionStore.getSession(sessionId)
  }

  /**
   * Get evidence pack by ID
   * @param {string} id
   */
  async getEvidencePack(id) {
    return this.evidencePacks.get(String(id)) || null
  }

  /**
   * Get all model call receipts (for auditing)
   * @returns {Array<ModelCallReceipt>}
   */
  getModelCallReceipts() {
    return [...this.modelCallReceipts]
  }

  // ===================== Private Methods =====================

  /**
   * Record a model call receipt for audit trail.
   * @param {string} purpose
   * @param {string} query
   */
  _recordModelCall(purpose, query) {
    this.modelCallReceipts.push({
      id: `receipt_${Date.now()}_${this.modelCallReceipts.length}`,
      provider: 'unknown',
      model: 'unknown',
      purpose,
      recordIds: [],
      contentScope: 'metadata',
      requestedAt: new Date().toISOString(),
      success: true,
      query: query?.substring(0, 100) || ''
    })
  }
}
