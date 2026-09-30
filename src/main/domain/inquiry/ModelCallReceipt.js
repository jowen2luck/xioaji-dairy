/**
 * @file ModelCallReceipt.js
 * @description ModelCallReceipt — immutable record of an LLM API call.
 * Used for audit trail, cost tracking, and citation integrity verification.
 */

export default class ModelCallReceipt {
  /**
   * @param {Object} params
   * @param {string} params.provider — e.g. 'openai', 'anthropic', 'ollama'
   * @param {string} params.model — e.g. 'gpt-4', 'claude-3'
   * @param {string} params.purpose — 'planning', 'composition', 'summary'
   * @param {string[]} [params.recordIds] — record IDs involved
   * @param {string} [params.contentScope] — 'metadata', 'excerpt', 'full'
   * @param {boolean} [params.success]
   * @param {string} [params.query] — truncated query text
   */
  constructor({ provider = 'unknown', model = 'unknown', purpose, recordIds = [], contentScope = 'metadata', success = true, query = '' }) {
    this.id = `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    this.provider = provider
    this.model = model
    this.purpose = purpose
    this.recordIds = [...recordIds]
    this.contentScope = contentScope
    this.requestedAt = new Date().toISOString()
    this.success = success
    this.query = query.substring(0, 200)
  }

  /**
   * Convert to plain object for serialization.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      provider: this.provider,
      model: this.model,
      purpose: this.purpose,
      recordIds: this.recordIds,
      contentScope: this.contentScope,
      requestedAt: this.requestedAt,
      success: this.success,
      query: this.query
    }
  }
}
