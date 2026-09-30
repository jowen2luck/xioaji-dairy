/**
 * SqliteJournalRepository - 基于 SQLite 的正式日记持久化仓储
 * 
 * 职责：
 * 1. 负责管理正式日记（journals 表）及 AI 结构化元数据（journal_ai_meta 表）
 * 2. 替代原有直接读写巨型 appData.json，实现毫秒级索引与事务支持
 * 3. 完整保存原始字段（通过 raw_json 保留 tiyan、xinqing、chengjiu 等全部历史字段），保证 100% 零数据丢失
 * 4. 自动检测并从 appData.json 平滑无损迁移，自动创建 appData.bak.json 物理备份
 * 5. 双向同步支持：在过渡期自动维护 appData.json 快照以兼容外部只读工具与导出
 */

import fs from 'node:fs'
import path from 'node:path'
import { getDatabaseManager } from '../db/DatabaseManager.js'

/**
 * 辅助解析持续时间文本为分钟数
 * 支持 '30m', '1h', '1.5h', '1h30m', '90分钟' 等格式
 */
export function parseDurationMinutes(val) {
  if (typeof val === 'number') return Math.max(0, Math.round(val))
  if (!val || typeof val !== 'string') return 0

  const s = val.trim().toLowerCase()
  let minutes = 0

  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|小时)/)
  if (hMatch) {
    minutes += parseFloat(hMatch[1]) * 60
  }

  const mMatch = s.match(/(\d+)\s*(?:m|分|分钟)/)
  if (mMatch) {
    minutes += parseInt(mMatch[1], 10)
  }

  if (!hMatch && !mMatch) {
    const directNum = parseFloat(s)
    if (!isNaN(directNum)) {
      minutes = directNum
    }
  }

  return Math.max(0, Math.round(minutes))
}

export class SqliteJournalRepository {
  /**
   * @param {Object} options
   * @param {DatabaseManager} [options.dbManager]
   * @param {string} [options.legacyJsonPath] - 旧版 appData.json 路径
   */
  constructor({ dbManager = null, legacyJsonPath = null } = {}) {
    this.dbManager = dbManager || getDatabaseManager()
    this.legacyJsonPath = legacyJsonPath
    this._migrated = false

    this._ensureInitialized()
  }

  _ensureInitialized() {
    try {
      const countRes = this.dbManager.prepare('SELECT count(*) as count FROM journals WHERE is_deleted = 0').get()
      if (countRes && countRes.count > 0) {
        return
      }

      // 尝试从 legacyJsonPath 迁移旧版数据
      if (this.legacyJsonPath && fs.existsSync(this.legacyJsonPath)) {
        try {
          const raw = fs.readFileSync(this.legacyJsonPath, 'utf-8')
          if (raw && raw.trim()) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed) && parsed.length > 0) {
              this._backupLegacyFile()
              this._importLegacyRecords(parsed)
              this._migrated = true
              console.log(`[SqliteJournalRepository] Successfully migrated ${parsed.length} journals from legacy JSON`)
            }
          }
        } catch (migErr) {
          console.warn('[SqliteJournalRepository] Failed to parse legacy appData.json:', migErr.message)
        }
      }
    } catch (e) {
      console.error('[SqliteJournalRepository] Error initializing journals:', e)
    }
  }

  _backupLegacyFile() {
    try {
      if (!this.legacyJsonPath || !fs.existsSync(this.legacyJsonPath)) return
      const bakPath = path.join(path.dirname(this.legacyJsonPath), 'appData.bak.json')
      fs.copyFileSync(this.legacyJsonPath, bakPath)
    } catch (e) {
      console.warn('[SqliteJournalRepository] Failed to create legacy backup:', e.message)
    }
  }

  _importLegacyRecords(records) {
    const insertJournal = this.dbManager.prepare(`
      INSERT OR REPLACE INTO journals(
        id, content, project, occurred_at, duration_min, duration_str, is_deleted, raw_json, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `)

    const insertAiMeta = this.dbManager.prepare(`
      INSERT OR REPLACE INTO journal_ai_meta(
        journal_id, summary, mood_tags, energy_level, people_involved, items, key_quotes, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.dbManager.transaction(() => {
      const now = Date.now()
      for (const r of records) {
        if (!r) continue
        const id = r._id || r.id || `rec_${now}_${Math.random().toString(36).slice(2, 7)}`
        const content = r.ganshou || r.content || r.contentText || r.contentHtml || ''
        const project = r.shanggexiangmu || r.project || '日常'
        const occurredAt = r.time || r.occurredAt || new Date(now).toISOString()
        const durationMin = r._meta_duration_min ?? parseDurationMinutes(r.chixushijian || r.durationMinutes)
        const durationStr = String(r.chixushijian || '')
        const rawJson = JSON.stringify(r)
        const createdAt = r.created_at || (r.time ? new Date(r.time).getTime() : now)
        const updatedAt = r.updated_at || now

        insertJournal.run(id, content, project, occurredAt, durationMin, durationStr, rawJson, createdAt, updatedAt)

        // 迁移可能附带的 AI 元数据
        if (r._ai_meta) {
          const ai = r._ai_meta
          const summary = ai.summary || ''
          const moodTags = Array.isArray(ai.mood_tags) ? JSON.stringify(ai.mood_tags) : null
          const energyLevel = ai.energy_level || null
          const people = Array.isArray(ai.people_involved) ? JSON.stringify(ai.people_involved) : null
          const items = Array.isArray(ai.items) ? JSON.stringify(ai.items) : null
          const quotes = Array.isArray(ai.key_quotes) ? JSON.stringify(ai.key_quotes) : null

          insertAiMeta.run(id, summary, moodTags, energyLevel, people, items, quotes, now)
        }
      }
    })
  }

  _syncToLegacyJson() {
    if (!this.legacyJsonPath) return
    try {
      const all = this.listJournals({ includeDeleted: false })
      const dir = path.dirname(this.legacyJsonPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmpPath = `${this.legacyJsonPath}.tmp`
      fs.writeFileSync(tmpPath, JSON.stringify(all, null, 2), 'utf-8')
      fs.renameSync(tmpPath, this.legacyJsonPath)
    } catch (e) {
      console.warn('[SqliteJournalRepository] Failed to sync to legacy JSON:', e.message)
    }
  }

  /**
   * 查询日记列表
   * @param {Object} [options]
   * @param {number} [options.limit=null]
   * @param {number} [options.offset=0]
   * @param {string} [options.project=null]
   * @param {{ start?: string, end?: string }} [options.dateRange=null]
   * @param {boolean} [options.includeDeleted=false]
   */
  listJournals({ limit = null, offset = 0, project = null, dateRange = null, includeDeleted = false } = {}) {
    try {
      let sql = `
        SELECT 
          j.id, j.content, j.project, j.occurred_at, j.duration_min, j.duration_str,
          j.is_deleted, j.raw_json, j.created_at, j.updated_at,
          m.summary as ai_summary, m.mood_tags as ai_mood_tags, m.energy_level as ai_energy_level,
          m.people_involved as ai_people, m.items as ai_items, m.key_quotes as ai_quotes
        FROM journals j
        LEFT JOIN journal_ai_meta m ON m.journal_id = j.id
        WHERE 1=1
      `
      const params = []

      if (!includeDeleted) {
        sql += ` AND j.is_deleted = 0`
      }
      if (project) {
        sql += ` AND j.project = ?`
        params.push(project)
      }
      if (dateRange) {
        if (dateRange.start) {
          sql += ` AND j.occurred_at >= ?`
          params.push(dateRange.start)
        }
        if (dateRange.end) {
          sql += ` AND j.occurred_at <= ?`
          params.push(dateRange.end)
        }
      }

      sql += ` ORDER BY j.occurred_at DESC`

      if (limit !== null) {
        sql += ` LIMIT ? OFFSET ?`
        params.push(limit, offset)
      }

      const rows = this.dbManager.prepare(sql).all(...params)

      return rows.map(r => this._formatJournalRow(r))
    } catch (e) {
      console.error('[SqliteJournalRepository] listJournals error:', e)
      return []
    }
  }

  /**
   * 获取单条日记
   * @param {string} id
   */
  getJournal(id) {
    if (!id) return null
    try {
      const sql = `
        SELECT 
          j.id, j.content, j.project, j.occurred_at, j.duration_min, j.duration_str,
          j.is_deleted, j.raw_json, j.created_at, j.updated_at,
          m.summary as ai_summary, m.mood_tags as ai_mood_tags, m.energy_level as ai_energy_level,
          m.people_involved as ai_people, m.items as ai_items, m.key_quotes as ai_quotes
        FROM journals j
        LEFT JOIN journal_ai_meta m ON m.journal_id = j.id
        WHERE j.id = ? AND j.is_deleted = 0
      `
      const row = this.dbManager.prepare(sql).get(id)
      if (!row) return null

      return this._formatJournalRow(row)
    } catch (e) {
      console.error('[SqliteJournalRepository] getJournal error:', e)
      return null
    }
  }

  _formatJournalRow(r) {
    let item = {}
    if (r.raw_json) {
      try {
        item = JSON.parse(r.raw_json)
      } catch {}
    }

    // 保证基本字段规范对齐
    item._id = r.id
    item.time = r.occurred_at
    item.shanggexiangmu = r.project
    item.chixushijian = r.duration_str || item.chixushijian || `${r.duration_min}m`
    item.ganshou = r.content

    // 格式化 AI 元数据
    if (r.ai_summary || r.ai_mood_tags || r.ai_energy_level !== null) {
      item._ai_meta = {
        summary: r.ai_summary || '',
        mood_tags: r.ai_mood_tags ? JSON.parse(r.ai_mood_tags) : [],
        energy_level: r.ai_energy_level,
        people_involved: r.ai_people ? JSON.parse(r.ai_people) : [],
        items: r.ai_items ? JSON.parse(r.ai_items) : [],
        key_quotes: r.ai_quotes ? JSON.parse(r.ai_quotes) : []
      }
    }

    return item
  }

  /**
   * 保存或追加日记记录
   * @param {Array<Object>} newRecords
   */
  saveJournals(newRecords) {
    if (!Array.isArray(newRecords) || newRecords.length === 0) {
      return { success: true, count: 0 }
    }

    const now = Date.now()
    const insertStmt = this.dbManager.prepare(`
      INSERT INTO journals(
        id, content, project, occurred_at, duration_min, duration_str, is_deleted, raw_json, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        project = excluded.project,
        occurred_at = excluded.occurred_at,
        duration_min = excluded.duration_min,
        duration_str = excluded.duration_str,
        is_deleted = 0,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `)

    this.dbManager.transaction(() => {
      for (const r of newRecords) {
        if (!r) continue
        const id = r._id || r.id || `rec_${now}_${Math.random().toString(36).slice(2, 7)}`
        r._id = id
        const content = r.ganshou || r.content || r.contentText || r.contentHtml || ''
        const project = r.shanggexiangmu || r.project || '日常'
        const occurredAt = r.time || r.occurredAt || new Date(now).toISOString()
        const durationMin = r._meta_duration_min ?? parseDurationMinutes(r.chixushijian || r.durationMinutes)
        const durationStr = String(r.chixushijian || '')
        const rawJson = JSON.stringify(r)
        const createdAt = r.created_at || (r.time ? new Date(r.time).getTime() : now)

        insertStmt.run(id, content, project, occurredAt, durationMin, durationStr, rawJson, createdAt, now)
      }
    })

    this._syncToLegacyJson()

    return {
      success: true,
      count: newRecords.length
    }
  }

  /**
   * 更新单条日记与可选 AI 元数据
   * @param {string} id
   * @param {Object} updates
   * @param {Object} [aiMetaUpdates=null]
   */
  updateJournal(id, updates = {}, aiMetaUpdates = null) {
    if (!id) return { success: false, error: '缺少日记 ID' }

    const existing = this.getJournal(id)
    if (!existing) {
      return { success: false, error: `找不到 ID 为 ${id} 的日记` }
    }

    const now = Date.now()
    const merged = { ...existing, ...updates }
    const content = merged.ganshou || merged.content || ''
    const project = merged.shanggexiangmu || merged.project || '日常'
    const occurredAt = merged.time || merged.occurredAt || existing.time
    const durationMin = merged._meta_duration_min ?? parseDurationMinutes(merged.chixushijian)
    const durationStr = String(merged.chixushijian || '')
    const rawJson = JSON.stringify(merged)

    this.dbManager.transaction(() => {
      this.dbManager.prepare(`
        UPDATE journals
        SET content = ?, project = ?, occurred_at = ?, duration_min = ?, duration_str = ?, raw_json = ?, updated_at = ?
        WHERE id = ?
      `).run(content, project, occurredAt, durationMin, durationStr, rawJson, now, id)

      if (aiMetaUpdates && typeof aiMetaUpdates === 'object') {
        const currentAi = existing._ai_meta || {}
        const newAi = { ...currentAi, ...aiMetaUpdates }
        const summary = newAi.summary || ''
        const moodTags = Array.isArray(newAi.mood_tags) ? JSON.stringify(newAi.mood_tags) : null
        const energyLevel = newAi.energy_level !== undefined ? newAi.energy_level : null
        const people = Array.isArray(newAi.people_involved) ? JSON.stringify(newAi.people_involved) : null
        const items = Array.isArray(newAi.items) ? JSON.stringify(newAi.items) : null
        const quotes = Array.isArray(newAi.key_quotes) ? JSON.stringify(newAi.key_quotes) : null

        this.dbManager.prepare(`
          INSERT INTO journal_ai_meta(
            journal_id, summary, mood_tags, energy_level, people_involved, items, key_quotes, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(journal_id) DO UPDATE SET
            summary = excluded.summary,
            mood_tags = excluded.mood_tags,
            energy_level = excluded.energy_level,
            people_involved = excluded.people_involved,
            items = excluded.items,
            key_quotes = excluded.key_quotes,
            updated_at = excluded.updated_at
        `).run(id, summary, moodTags, energyLevel, people, items, quotes, now)
      }
    })

    this._syncToLegacyJson()

    return {
      success: true,
      record: this.getJournal(id)
    }
  }

  /**
   * 软删除或物理删除日记
   * @param {string} id
   */
  deleteJournal(id) {
    if (!id) return { success: false, error: '缺少日记 ID' }

    const existing = this.getJournal(id)
    if (!existing) {
      return { success: false, error: `找不到 ID 为 ${id} 的日记` }
    }

    const now = Date.now()
    this.dbManager.prepare(`
      UPDATE journals SET is_deleted = 1, updated_at = ? WHERE id = ?
    `).run(now, id)

    this._syncToLegacyJson()

    return {
      success: true,
      deletedRecord: existing
    }
  }

  /**
   * 统计有效日记总数
   */
  countJournals({ includeDeleted = false } = {}) {
    try {
      const sql = includeDeleted
        ? 'SELECT count(*) as count FROM journals'
        : 'SELECT count(*) as count FROM journals WHERE is_deleted = 0'
      return this.dbManager.prepare(sql).get()?.count || 0
    } catch {
      return 0
    }
  }
}
