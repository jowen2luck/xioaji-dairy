/**
 * SqliteMemoRepository - 基于 SQLite 的便签盒持久化仓储
 * 
 * 职责：
 * 1. 管理自然倾诉阶段产生的待收纳便签 (Memos)
 * 2. 替代原有 memos.json 文件读写，提供结构化查询与状态管理
 * 3. 支持同话题多轮增补追加与去重合并
 * 4. 支持单篇或批量便签状态流转（'active' | 'merged' | 'discarded'）
 * 5. 自动检测并从 memos.json 平滑无损迁移，自动创建 .bak.json 备份
 */

import fs from 'node:fs'
import path from 'node:path'
import dayjs from '../../../utils/date.js'
import { getDatabaseManager } from '../db/DatabaseManager.js'
import { 
  sanitizeMemoContent, 
  computeContentOverlap, 
  isTopicSimilar, 
  mergeMemoContent 
} from '../../memo/memoManager.js'

export class SqliteMemoRepository {
  /**
   * @param {Object} options
   * @param {DatabaseManager} [options.dbManager]
   * @param {string} [options.legacyJsonPath] - 旧版 memos.json 路径
   */
  constructor({ dbManager = null, legacyJsonPath = null } = {}) {
    this.dbManager = dbManager || getDatabaseManager()
    this.legacyJsonPath = legacyJsonPath
    this._migrated = false

    this._ensureInitialized()
  }

  _ensureInitialized() {
    try {
      const countRes = this.dbManager.prepare('SELECT count(*) as count FROM memos').get()
      if (countRes && countRes.count > 0) {
        return
      }

      // 尝试从 legacyJsonPath 迁移旧便签数据
      if (this.legacyJsonPath && fs.existsSync(this.legacyJsonPath)) {
        try {
          const raw = fs.readFileSync(this.legacyJsonPath, 'utf-8')
          if (raw && raw.trim()) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed) && parsed.length > 0) {
              this._backupLegacyFile()
              this._importLegacyMemos(parsed)
              this._migrated = true
              console.log(`[SqliteMemoRepository] Successfully migrated ${parsed.length} memos from legacy JSON`)
            }
          }
        } catch (migErr) {
          console.warn('[SqliteMemoRepository] Failed to parse legacy memos.json:', migErr.message)
        }
      }
    } catch (e) {
      console.error('[SqliteMemoRepository] Error initializing memos:', e)
    }
  }

  _backupLegacyFile() {
    try {
      if (!this.legacyJsonPath || !fs.existsSync(this.legacyJsonPath)) return
      const bakPath = path.join(path.dirname(this.legacyJsonPath), 'memos.bak.json')
      fs.copyFileSync(this.legacyJsonPath, bakPath)
    } catch (e) {
      console.warn('[SqliteMemoRepository] Failed to create legacy backup:', e.message)
    }
  }

  _importLegacyMemos(memos) {
    const insertStmt = this.dbManager.prepare(`
      INSERT OR REPLACE INTO memos(
        id, content, topic, project, date, quotes, status, target_record_id, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.dbManager.transaction(() => {
      for (const m of memos) {
        if (!m || !m.id) continue
        const now = Date.now()
        const createdAt = m.createdAt ? new Date(m.createdAt).getTime() : now
        const updatedAt = m.updatedAt ? new Date(m.updatedAt).getTime() : now
        const quotesJson = Array.isArray(m.quotes) ? JSON.stringify(m.quotes) : '[]'

        insertStmt.run(
          m.id,
          m.content || '',
          m.topic || '生活随想',
          m.project || '生活',
          m.date || dayjs(createdAt).format('YYYY-MM-DD'),
          quotesJson,
          m.status || 'active',
          m.targetRecordId || null,
          createdAt,
          updatedAt
        )
      }
    })
  }

  /**
   * 查询便签列表
   * @param {Object} [options]
   * @param {'all'|'active'|'merged'|'discarded'} [options.status='all']
   * @param {string} [options.date=null]
   */
  listMemos({ status = 'all', date = null } = {}) {
    try {
      let sql = `
        SELECT 
          id, content, topic, project, date, quotes, status,
          target_record_id as targetRecordId,
          created_at as createdAt,
          updated_at as updatedAt
        FROM memos
        WHERE 1=1
      `
      const params = []

      if (status && status !== 'all') {
        sql += ` AND status = ?`
        params.push(status)
      }
      if (date) {
        sql += ` AND date = ?`
        params.push(date)
      }

      sql += ` ORDER BY updated_at DESC, created_at DESC`

      const rows = this.dbManager.prepare(sql).all(...params)

      return rows.map(r => {
        let quotes = []
        if (r.quotes) {
          try { quotes = JSON.parse(r.quotes) } catch {}
        }
        return {
          id: r.id,
          date: r.date,
          topic: r.topic,
          project: r.project,
          content: r.content,
          quotes,
          status: r.status,
          targetRecordId: r.targetRecordId || null,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString()
        }
      })
    } catch (e) {
      console.error('[SqliteMemoRepository] listMemos error:', e)
      return []
    }
  }

  /**
   * 获取单条便签
   * @param {string} id
   */
  getMemo(id) {
    if (!id) return null
    try {
      const row = this.dbManager.prepare(`
        SELECT 
          id, content, topic, project, date, quotes, status,
          target_record_id as targetRecordId,
          created_at as createdAt,
          updated_at as updatedAt
        FROM memos
        WHERE id = ?
      `).get(id)

      if (!row) return null

      let quotes = []
      if (row.quotes) {
        try { quotes = JSON.parse(row.quotes) } catch {}
      }

      return {
        id: row.id,
        date: row.date,
        topic: row.topic,
        project: row.project,
        content: row.content,
        quotes,
        status: row.status,
        targetRecordId: row.targetRecordId || null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString()
      }
    } catch (e) {
      console.error('[SqliteMemoRepository] getMemo error:', e)
      return null
    }
  }

  /**
   * 创建或增补便签
   */
  upsertMemo({ id = null, topic, project, content, quotes = [], date = null } = {}) {
    if (!content || !content.trim()) {
      throw new Error('便签正文不能为空')
    }

    const now = Date.now()
    const targetDate = date || dayjs().format('YYYY-MM-DD')
    const cleanContent = sanitizeMemoContent(content)
    const cleanTopic = (topic && topic.trim()) || '生活随想'
    const cleanProject = (project && project.trim()) || '生活'
    const cleanQuotes = Array.isArray(quotes) ? quotes.map(q => sanitizeMemoContent(q)).filter(Boolean) : []

    let result = null

    this.dbManager.transaction(() => {
      // 1. 如果指定了具体 ID 且存在，直接更新
      if (id) {
        const existing = this.getMemo(id)
        if (existing) {
          const finalTopic = cleanTopic || existing.topic
          const finalProject = cleanProject || existing.project
          const finalContent = mergeMemoContent(existing.content, cleanContent)
          const finalQuotes = Array.from(new Set([...(existing.quotes || []), ...cleanQuotes]))

          this.dbManager.prepare(`
            UPDATE memos 
            SET topic = ?, project = ?, content = ?, quotes = ?, updated_at = ?
            WHERE id = ?
          `).run(finalTopic, finalProject, finalContent, JSON.stringify(finalQuotes), now, id)

          result = { memo: this.getMemo(id), isNew: false }
          return
        }
      }

      // 2. 未指定 ID 或指定 ID 不存在时，在当天活跃便签中匹配同主题、相似主题或高重合正文
      const candidates = this.dbManager.prepare(`
        SELECT id, content, quotes, topic, project 
        FROM memos 
        WHERE status = 'active' AND date = ?
      `).all(targetDate)

      // 匹配优先级：
      // (a) 相同 topic
      // (b) 子串包含或相似主题 (如 "中秋节的无力感与逻辑闭环" vs "逻辑闭环与中秋节的无力感")
      // (c) 正文内容高度重合 (overlap >= 0.65，避免同轮或同日创建双胞胎便签)
      let activeSameTopic = candidates.find(m => m.topic === cleanTopic)
      if (!activeSameTopic) {
        activeSameTopic = candidates.find(m => 
          (m.project === cleanProject && (m.topic.includes(cleanTopic) || cleanTopic.includes(m.topic))) ||
          isTopicSimilar(m.topic, cleanTopic)
        )
      }
      if (!activeSameTopic) {
        activeSameTopic = candidates.find(m => computeContentOverlap(m.content, cleanContent) >= 0.65)
      }

      if (activeSameTopic) {
        let existingQuotes = []
        if (activeSameTopic.quotes) {
          try { existingQuotes = JSON.parse(activeSameTopic.quotes) } catch {}
        }
        const finalContent = mergeMemoContent(activeSameTopic.content, cleanContent)
        const finalQuotes = Array.from(new Set([...existingQuotes, ...cleanQuotes]))
        const finalTopic = (activeSameTopic.topic && activeSameTopic.topic !== '生活随想') ? activeSameTopic.topic : cleanTopic
        const finalProject = cleanProject || activeSameTopic.project

        this.dbManager.prepare(`
          UPDATE memos 
          SET topic = ?, project = ?, content = ?, quotes = ?, updated_at = ?
          WHERE id = ?
        `).run(finalTopic, finalProject, finalContent, JSON.stringify(finalQuotes), now, activeSameTopic.id)

        result = { memo: this.getMemo(activeSameTopic.id), isNew: false }
        return
      }

      // 3. 否则创建新便签
      const newId = `memo_${now}_${Math.random().toString(36).slice(2, 7)}`
      this.dbManager.prepare(`
        INSERT INTO memos(
          id, content, topic, project, date, quotes, status, target_record_id, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)
      `).run(newId, cleanContent, cleanTopic, cleanProject, targetDate, JSON.stringify(cleanQuotes), now, now)

      result = { memo: this.getMemo(newId), isNew: true }
    })

    return result
  }

  /**
   * 删除便签
   */
  deleteMemo(id) {
    if (!id) return false
    try {
      const info = this.dbManager.prepare('DELETE FROM memos WHERE id = ?').run(id)
      return info.changes > 0
    } catch (e) {
      console.error('[SqliteMemoRepository] deleteMemo error:', e)
      return false
    }
  }

  /**
   * 更新便签状态与关联日记 ID
   */
  updateMemoStatus(id, status, targetRecordId = null) {
    if (!id) return false
    const now = Date.now()
    try {
      const info = this.dbManager.prepare(`
        UPDATE memos SET status = ?, target_record_id = ?, updated_at = ? WHERE id = ?
      `).run(status, targetRecordId, now, id)
      return info.changes > 0
    } catch (e) {
      console.error('[SqliteMemoRepository] updateMemoStatus error:', e)
      return false
    }
  }

  /**
   * 批量更新便签状态
   */
  batchUpdateMemosStatus(ids, status, targetRecordId = null) {
    if (!Array.isArray(ids) || ids.length === 0) return 0
    const now = Date.now()
    let count = 0
    this.dbManager.transaction(() => {
      const stmt = this.dbManager.prepare(`
        UPDATE memos SET status = ?, target_record_id = ?, updated_at = ? WHERE id = ?
      `)
      for (const id of ids) {
        const info = stmt.run(status, targetRecordId, now, id)
        count += info.changes
      }
    })
    return count
  }
}
