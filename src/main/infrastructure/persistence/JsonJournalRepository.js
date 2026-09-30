/**
 * @file JsonJournalRepository.js
 * @description Infrastructure adapter for local JSON file persistence of Journal Records.
 * Encapsulates raw appData.json access, maintains revisions, and provides clean JournalRecord interfaces.
 */

import fs from 'node:fs'
import path from 'node:path'
import { normalizeJournalRecord } from '../../domain/contracts.js'

export default class JsonJournalRepository {
  /**
   * @param {Object} options
   * @param {string} options.filePath - Path to appData.json
   * @param {Function} [options.getAppDataPath] - Optional provider function for appData path
   */
  constructor(options = {}) {
    this.filePath = options.filePath || null
    this.getAppDataPath = options.getAppDataPath || null
    this._cache = new Map() // id -> JournalRecord
    this._revisions = new Map() // id -> revision number
    this.isLoaded = false
  }

  getResolvedPath() {
    if (this.filePath) return this.filePath
    if (this.getAppDataPath) return this.getAppDataPath()
    throw new Error('[JsonJournalRepository] No file path provided')
  }

  /**
   * Ensure repository cache is initialized from disk
   */
  async load() {
    const p = this.getResolvedPath()
    this._cache.clear()
    this._revisions.clear()

    if (!fs.existsSync(p)) {
      this.isLoaded = true
      return []
    }

    try {
      const rawText = fs.readFileSync(p, 'utf-8')
      if (!rawText.trim()) {
        this.isLoaded = true
        return []
      }

      const rawList = JSON.parse(rawText)
      if (Array.isArray(rawList)) {
        for (const item of rawList) {
          const record = normalizeJournalRecord(item)
          if (record && record.id) {
            this._cache.set(record.id, record)
            this._revisions.set(record.id, record.revision)
          }
        }
      }
      this.isLoaded = true
      return Array.from(this._cache.values())
    } catch (err) {
      console.error('[JsonJournalRepository] Load failed:', err)
      this.isLoaded = true
      return []
    }
  }

  /**
   * Persist in-memory cache back to disk safely
   */
  async flush() {
    const p = this.getResolvedPath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const exportArray = Array.from(this._cache.values()).map(rec => rec.raw || {
      _id: rec.id,
      time: rec.occurredAt,
      ganshou: rec.contentHtml,
      tiyan: rec.experience,
      xinqing: rec.moodColor,
      shanggexiangmu: rec.project,
      chixushijian: rec.durationMinutes,
      chengjiu: rec.achievement,
      revision: rec.revision
    })

    const tmpPath = `${p}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(exportArray, null, 2), 'utf-8')
    fs.renameSync(tmpPath, p)
  }

  /**
   * Get single record by ID
   * @param {string} id 
   * @returns {Promise<import('../../domain/contracts').JournalRecord | null>}
   */
  async get(id) {
    if (!this.isLoaded) await this.load()
    return this._cache.get(String(id)) || null
  }

  /**
   * List records based on scope filters
   * @param {import('../../domain/contracts').InquiryScope} [scope] 
   * @returns {Promise<import('../../domain/contracts').JournalRecord[]>}
   */
  async list(scope = {}) {
    if (!this.isLoaded) await this.load()
    let records = Array.from(this._cache.values())

    if (scope.dateRange) {
      const { start, end } = scope.dateRange
      if (start) records = records.filter(r => new Date(r.occurredAt) >= new Date(start))
      if (end) records = records.filter(r => new Date(r.occurredAt) <= new Date(end))
    }

    if (scope.projects && scope.projects.length > 0) {
      const set = new Set(scope.projects.map(p => p.toLowerCase()))
      records = records.filter(r => r.project && set.has(r.project.toLowerCase()))
    }

    if (scope.recordIds && scope.recordIds.length > 0) {
      const set = new Set(scope.recordIds.map(String))
      records = records.filter(r => set.has(r.id))
    }

    return records
  }

  /**
   * Upsert list of journal records with revision incrementing
   * @param {import('../../domain/contracts').JournalRecord[]} records 
   */
  async upsert(records) {
    if (!this.isLoaded) await this.load()
    let added = 0
    let updated = 0

    for (const rec of records) {
      const id = String(rec.id)
      const existing = this._cache.get(id)
      if (existing) {
        const nextRev = (existing.revision || 1) + 1
        const updatedRec = { ...rec, id, revision: nextRev }
        this._cache.set(id, updatedRec)
        this._revisions.set(id, nextRev)
        updated++
      } else {
        const newRev = rec.revision || 1
        const newRec = { ...rec, id, revision: newRev }
        this._cache.set(id, newRec)
        this._revisions.set(id, newRev)
        added++
      }
    }

    await this.flush()
    return { added, updated }
  }

  /**
   * Update a record partial patch
   * @param {string} id 
   * @param {Partial<import('../../domain/contracts').JournalRecord>} patch 
   */
  async update(id, patch) {
    if (!this.isLoaded) await this.load()
    const existing = this._cache.get(String(id))
    if (!existing) throw new Error(`[JsonJournalRepository] Record ${id} not found`)

    const nextRev = (existing.revision || 1) + 1
    const updated = {
      ...existing,
      ...patch,
      id: String(id),
      revision: nextRev
    }

    // Synchronize underlying raw object
    if (updated.raw) {
      if (patch.contentHtml !== undefined) updated.raw.ganshou = patch.contentHtml
      if (patch.project !== undefined) updated.raw.shanggexiangmu = patch.project
      if (patch.durationMinutes !== undefined) updated.raw.chixushijian = patch.durationMinutes
      if (patch.moodColor !== undefined) updated.raw.xinqing = patch.moodColor
      updated.raw.revision = nextRev
    }

    this._cache.set(String(id), updated)
    this._revisions.set(String(id), nextRev)

    await this.flush()
    return updated
  }

  /**
   * Get current revision for record
   * @param {string} id 
   */
  async getRevision(id) {
    if (!this.isLoaded) await this.load()
    return this._revisions.get(String(id)) || null
  }
}
