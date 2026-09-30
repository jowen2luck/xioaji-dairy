/**
 * @file AnalysisService.js
 * @description Analysis Application Service providing exact, semantic, aggregate, and comparison core operations.
 * Produces structured EvidencePack and ComputedMetrics according to target architecture contracts.
 */

export default class AnalysisService {
  /**
   * @param {Object} options
   * @param {import('./JournalService')} options.journalService
   * @param {Object} [options.vectorSearchAdapter]
   */
  constructor({ journalService, vectorSearchAdapter }) {
    this.journalService = journalService
    this.vectorSearchAdapter = vectorSearchAdapter || null
  }

  /**
   * Perform exact scope query and extract matching EvidenceRefs
   * @param {import('../domain/contracts').InquiryScope} scope 
   * @returns {Promise<import('../domain/contracts').EvidenceRef[]>}
   */
  async exactQuery(scope = {}) {
    const records = await this.journalService.listRecords(scope)
    return records.map((rec, idx) => ({
      id: `ev_exact_${rec.id}_${idx}`,
      recordId: rec.id,
      occurredAt: rec.occurredAt,
      field: 'contentText',
      excerpt: rec.contentText.length > 200 ? rec.contentText.slice(0, 200) + '...' : rec.contentText,
      relevance: 1.0
    }))
  }

  /**
   * Perform semantic search over records.
   * Uses vector search adapter if available, falls back to keyword matching.
   * @param {string} query 
   * @param {import('../domain/contracts').InquiryScope} scope 
   * @param {number} [limit=10]
   * @returns {Promise<import('../domain/contracts').EvidenceRef[]>}
   */
  async semanticSearch(query, scope = {}, limit = 10) {
    const records = await this.journalService.listRecords(scope)
    if (!query) return this.exactQuery(scope)

    // Try vector search adapter first
    if (this.vectorSearchAdapter) {
      try {
        await this.vectorSearchAdapter.sync(records)
        const results = await this.vectorSearchAdapter.search(query, scope, limit)
        return results.map((r, idx) => ({
          id: `ev_sem_${r.parentId}_${idx}`,
          recordId: r.parentId,
          occurredAt: r.original?.occurredAt || r.original?.time || '',
          field: 'contentText',
          excerpt: this._makeExcerpt(r.original),
          relevance: r.similarity
        }))
      } catch (e) {
        console.warn('[AnalysisService] Vector search failed, falling back to keyword:', e.message)
      }
    }

    // Fallback: keyword matching
    const qLower = query.toLowerCase()
    const scored = records.map(rec => {
      let score = 0
      if (rec.contentText.toLowerCase().includes(qLower)) score += 0.8
      if (rec.project && rec.project.toLowerCase().includes(qLower)) score += 0.5
      return { rec, score }
    }).filter(item => item.score > 0)

    scored.sort((a, b) => b.score - a.score)
    const selected = scored.slice(0, limit)

    return selected.map((item, idx) => ({
      id: `ev_sem_${item.rec.id}_${idx}`,
      recordId: item.rec.id,
      occurredAt: item.rec.occurredAt,
      field: 'contentText',
      excerpt: item.rec.contentText.length > 200 ? item.rec.contentText.slice(0, 200) + '...' : item.rec.contentText,
      relevance: item.score
    }))
  }

  /**
   * Create excerpt from a record object.
   * @param {Object} item 
   * @returns {string}
   */
  _makeExcerpt(item) {
    if (!item) return ''
    const text = item.contentText || item._meta_plain_text || (item.ganshou || '').replace(/<[^>]+>/g, '').trim() || ''
    return text.length > 200 ? text.slice(0, 200) + '...' : text
  }

  /**
   * Aggregate computations over current scope using SqlService
   * @param {Record<string, any>} spec 
   * @param {import('../domain/contracts').InquiryScope} scope 
   * @returns {Promise<import('../domain/contracts').ComputedMetric[]>}
   */
  async aggregate(spec = {}, scope = {}) {
    const records = await this.journalService.listRecords(scope)
    const count = records.length
    
    let totalDuration = 0
    let validDurations = 0
    records.forEach(r => {
      if (typeof r.durationMinutes === 'number' && !isNaN(r.durationMinutes)) {
        totalDuration += r.durationMinutes
        validDurations++
      }
    })

    const avgDuration = validDurations > 0 ? (totalDuration / validDurations).toFixed(1) : null

    return [
      {
        id: `metric_count_${Date.now()}`,
        label: 'Total Entries',
        value: count,
        unit: 'entries',
        operation: 'COUNT',
        sampleSize: count,
        recordIds: records.map(r => r.id)
      },
      {
        id: `metric_avg_duration_${Date.now()}`,
        label: 'Average Duration',
        value: avgDuration ? Number(avgDuration) : null,
        unit: 'minutes',
        operation: 'AVG(durationMinutes)',
        sampleSize: validDurations,
        recordIds: records.filter(r => r.durationMinutes !== undefined).map(r => r.id)
      }
    ]
  }

  /**
   * Execute an InquiryPlan and compile an EvidencePack
   * @param {import('../domain/contracts').InquiryPlan} plan 
   * @returns {Promise<import('../domain/contracts').EvidencePack>}
   */
  async execute(plan) {
    const scope = plan.scope || {}
    const exactEv = await this.exactQuery(scope)
    const semEv = plan.normalizedQuestion ? await this.semanticSearch(plan.normalizedQuestion, scope, 5) : []

    // Deduplicate evidence references by ID
    const evMap = new Map()
    for (const ev of [...exactEv, ...semEv]) {
      if (!evMap.has(ev.recordId)) {
        evMap.set(ev.recordId, ev)
      }
    }

    const metrics = await this.aggregate({}, scope)

    return {
      id: `pack_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      schemaVersion: '1.0.0',
      question: plan.normalizedQuestion || '',
      scope,
      evidence: Array.from(evMap.values()),
      metrics,
      comparisons: [],
      limitations: evMap.size === 0 ? [{
        code: 'NO_RECORDS_FOUND',
        message: 'No journal entries matched the target query scope.',
        severity: 'info'
      }] : [],
      generatedAt: new Date().toISOString()
    }
  }
}
