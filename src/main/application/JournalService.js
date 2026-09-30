/**
 * @file JournalService.js
 * @description Application Service coordinating Journal CRUD and revision invalidation hooks.
 */

export default class JournalService {
  /**
   * @param {Object} options
   * @param {import('../infrastructure/persistence/JsonJournalRepository')} options.repository
   * @param {Function} [options.onInvalidate] - Callback when records are updated/invalidated
   */
  constructor({ repository, onInvalidate }) {
    this.repository = repository
    this.onInvalidate = onInvalidate || (() => {})
  }

  async getRecord(id) {
    return await this.repository.get(id)
  }

  async listRecords(scope = {}) {
    return await this.repository.list(scope)
  }

  async importOrUpsertRecords(records) {
    const result = await this.repository.upsert(records)
    const affectedIds = records.map(r => String(r.id))
    this.onInvalidate(affectedIds)
    return result
  }

  async updateRecord(id, patch) {
    const updated = await this.repository.update(id, patch)
    this.onInvalidate([String(id)])
    return updated
  }

  async getRevision(id) {
    return await this.repository.getRevision(id)
  }
}
