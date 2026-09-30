/**
 * @file InquirySessionStore.js
 * @description In-memory store for continuous inquiry sessions with structured scopes.
 */

export default class InquirySessionStore {
  constructor() {
    this.sessions = new Map() // sessionId -> InquirySession
  }

  /**
   * Create a new inquiry session
   * @param {string} initialQuestion 
   * @param {import('../contracts').InquiryScope} [initialScope] 
   * @returns {import('../contracts').InquirySession}
   */
  createSession(initialQuestion, initialScope = {}) {
    const id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const session = {
      id,
      goal: initialQuestion,
      currentQuestion: initialQuestion,
      scope: { ...initialScope },
      entities: {},
      evidencePackIds: [],
      acceptedConclusions: [],
      unresolvedQuestions: [],
      updatedAt: new Date().toISOString()
    }
    this.sessions.set(id, session)
    return session
  }

  /**
   * Get session by ID
   * @param {string} id 
   */
  getSession(id) {
    return this.sessions.get(String(id)) || null
  }

  /**
   * Update session scope and question on follow-up
   * @param {string} id 
   * @param {string} nextQuestion 
   * @param {Partial<import('../contracts').InquiryScope>} scopePatch 
   */
  updateSession(id, nextQuestion, scopePatch = {}) {
    const session = this.getSession(id)
    if (!session) throw new Error(`[InquirySessionStore] Session ${id} not found`)

    session.currentQuestion = nextQuestion
    session.scope = {
      ...session.scope,
      ...scopePatch
    }
    session.updatedAt = new Date().toISOString()
    return session
  }

  /**
   * Add evidence pack link to session
   * @param {string} sessionId 
   * @param {string} packId 
   */
  addEvidencePack(sessionId, packId) {
    const session = this.getSession(sessionId)
    if (session && !session.evidencePackIds.includes(packId)) {
      session.evidencePackIds.push(packId)
    }
  }
}
