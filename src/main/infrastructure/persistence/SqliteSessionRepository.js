/**
 * SqliteSessionRepository - 基于 SQLite 的对话会话与历史消息持久化仓储
 * 
 * 职责：
 * 1. 维护多会话生命周期与消息流（chat_sessions 与 chat_messages）
 * 2. 支持单条消息高效追加（O(1) 插入，替代旧版整个 JSON 的频繁重写）
 * 3. 自动检测并从 agent-sessions.json 平滑无损迁移，自动创建 .bak.json 备份
 * 4. 保证在会话清空时自动保底创建默认新会话
 */

import fs from 'node:fs'
import path from 'node:path'
import { getDatabaseManager } from '../db/DatabaseManager.js'

export class SqliteSessionRepository {
  /**
   * @param {Object} options
   * @param {DatabaseManager} [options.dbManager]
   * @param {string} [options.legacyJsonPath] - 旧版 agent-sessions.json 路径
   */
  constructor({ dbManager = null, legacyJsonPath = null } = {}) {
    this.dbManager = dbManager || getDatabaseManager()
    this.legacyJsonPath = legacyJsonPath
    this._migrated = false

    this._ensureInitialized()
  }

  _ensureInitialized() {
    try {
      const countRes = this.dbManager.prepare('SELECT count(*) as count FROM chat_sessions').get()
      if (countRes && countRes.count > 0) {
        return
      }

      // 尝试从 legacyJsonPath 迁移旧数据
      if (this.legacyJsonPath && fs.existsSync(this.legacyJsonPath)) {
        try {
          const raw = fs.readFileSync(this.legacyJsonPath, 'utf-8')
          if (raw && raw.trim()) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed) && parsed.length > 0) {
              this._backupLegacyFile()
              this._importLegacySessions(parsed)
              this._migrated = true
              console.log(`[SqliteSessionRepository] Successfully migrated ${parsed.length} sessions from legacy JSON`)
              return
            }
          }
        } catch (migErr) {
          console.warn('[SqliteSessionRepository] Failed to parse legacy agent-sessions.json:', migErr.message)
        }
      }

      // 默认若为空，初始化一个空白默认会话
      this._createDefaultSessionRow()
    } catch (e) {
      console.error('[SqliteSessionRepository] Error initializing sessions:', e)
    }
  }

  _backupLegacyFile() {
    try {
      if (!this.legacyJsonPath || !fs.existsSync(this.legacyJsonPath)) return
      const bakPath = path.join(path.dirname(this.legacyJsonPath), 'agent-sessions.bak.json')
      fs.copyFileSync(this.legacyJsonPath, bakPath)
    } catch (e) {
      console.warn('[SqliteSessionRepository] Failed to create legacy backup:', e.message)
    }
  }

  _importLegacySessions(sessions) {
    const insertSession = this.dbManager.prepare(`
      INSERT OR REPLACE INTO chat_sessions(
        id, title, pinned, context_summary, reacts_json, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMessage = this.dbManager.prepare(`
      INSERT OR REPLACE INTO chat_messages(
        id, session_id, role, content, react_steps, created_at
      ) VALUES(?, ?, ?, ?, ?, ?)
    `)

    this.dbManager.transaction(() => {
      for (const s of sessions) {
        if (!s || !s.id) continue
        const now = Date.now()
        const createdAt = s.createdAt ? new Date(s.createdAt).getTime() : now
        const updatedAt = s.updatedAt ? new Date(s.updatedAt).getTime() : now
        const reactsJson = s.reacts ? JSON.stringify(s.reacts) : '{}'

        insertSession.run(
          s.id,
          s.title || '新对话',
          s.pinned ? 1 : 0,
          s.contextSummary || '',
          reactsJson,
          createdAt,
          updatedAt
        )

        if (Array.isArray(s.messages)) {
          for (let i = 0; i < s.messages.length; i++) {
            const m = s.messages[i]
            if (!m) continue
            const msgId = m.id || `msg_${s.id}_${i}_${Math.random().toString(36).slice(2, 6)}`
            const role = m.role || (m.sender === 'user' ? 'user' : 'assistant')
            const content = m.content || ''
            const msgCreatedAt = m.time ? new Date(m.time).getTime() : (createdAt + i * 1000)
            const reactSteps = m.reactSteps ? JSON.stringify(m.reactSteps) : null

            insertMessage.run(msgId, s.id, role, content, reactSteps, msgCreatedAt)
          }
        }
      }
    })
  }

  _createDefaultSessionRow() {
    const now = Date.now()
    const id = `sess_${now}_${Math.random().toString(16).slice(2, 8)}`
    this.dbManager.prepare(`
      INSERT INTO chat_sessions(id, title, pinned, context_summary, reacts_json, created_at, updated_at)
      VALUES(?, '新对话', 0, '', '{}', ?, ?)
    `).run(id, now, now)

    return id
  }

  /**
   * 获取所有会话概览列表（按置顶与更新时间排序）
   */
  listSessions() {
    try {
      const sql = `
        SELECT 
          s.id,
          s.title,
          s.pinned,
          s.created_at as createdAt,
          s.updated_at as updatedAt,
          (SELECT count(*) FROM chat_messages m WHERE m.session_id = s.id) as messageCount,
          (
            SELECT m.content 
            FROM chat_messages m 
            WHERE m.session_id = s.id 
            ORDER BY m.created_at DESC, m.rowid DESC 
            LIMIT 1
          ) as lastMessagePreview
        FROM chat_sessions s
        ORDER BY s.pinned DESC, s.updated_at DESC
      `
      const rows = this.dbManager.prepare(sql).all()

      return rows.map(r => ({
        id: r.id,
        title: r.title || '新对话',
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
        messageCount: r.messageCount || 0,
        lastMessagePreview: r.lastMessagePreview ? String(r.lastMessagePreview).slice(0, 60) : '',
        pinned: !!r.pinned
      }))
    } catch (e) {
      console.error('[SqliteSessionRepository] listSessions error:', e)
      return []
    }
  }

  /**
   * 获取指定会话完整数据（包含全部有序消息与思维步骤）
   * @param {string} id
   */
  getSession(id) {
    try {
      let sessRow = null
      if (id) {
        sessRow = this.dbManager.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id)
      }
      if (!sessRow) {
        sessRow = this.dbManager.prepare('SELECT * FROM chat_sessions ORDER BY pinned DESC, updated_at DESC LIMIT 1').get()
      }
      if (!sessRow) {
        const defaultId = this._createDefaultSessionRow()
        sessRow = this.dbManager.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(defaultId)
      }

      const messageRows = this.dbManager.prepare(`
        SELECT id, role, content, react_steps, created_at 
        FROM chat_messages 
        WHERE session_id = ? 
        ORDER BY created_at ASC, rowid ASC
      `).all(sessRow.id)

      let reacts = {}
      if (sessRow.reacts_json) {
        try {
          reacts = JSON.parse(sessRow.reacts_json)
        } catch {}
      }

      return {
        id: sessRow.id,
        title: sessRow.title || '新对话',
        createdAt: new Date(sessRow.created_at).toISOString(),
        updatedAt: new Date(sessRow.updated_at).toISOString(),
        messages: messageRows.map(m => {
          let parsedSteps = undefined
          if (m.react_steps) {
            try {
              parsedSteps = JSON.parse(m.react_steps)
            } catch {}
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            time: new Date(m.created_at).toISOString(),
            conversationId: m.id,
            reactSteps: parsedSteps
          }
        }),
        reacts,
        contextSummary: sessRow.context_summary || '',
        pinned: !!sessRow.pinned
      }
    } catch (e) {
      console.error('[SqliteSessionRepository] getSession error:', e)
      return null
    }
  }

  /**
   * 创建新会话
   */
  createSession({ id = null, title = '新对话' } = {}) {
    const now = Date.now()
    const sessionId = id || `sess_${now}_${Math.random().toString(16).slice(2, 8)}`
    const cleanTitle = (title && title.trim()) || '新对话'

    this.dbManager.prepare(`
      INSERT INTO chat_sessions(id, title, pinned, context_summary, reacts_json, created_at, updated_at)
      VALUES(?, ?, 0, '', '{}', ?, ?)
    `).run(sessionId, cleanTitle, now, now)

    return {
      id: sessionId,
      title: cleanTitle,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      messages: [],
      reacts: {},
      contextSummary: '',
      pinned: false
    }
  }

  /**
   * 追加单条消息与可选思维步骤
   */
  appendMessage(sessionId, message, stepReacts = null) {
    if (!sessionId || !message) return null

    let session = this.getSession(sessionId)
    if (!session || session.id !== sessionId) {
      session = this.createSession({ id: sessionId })
    }

    const now = Date.now()
    const msgId = message.id || `msg_${now}_${Math.random().toString(36).slice(2, 7)}`
    const role = message.role || (message.sender === 'user' ? 'user' : 'assistant')
    const content = message.content || ''
    const msgTime = message.time ? new Date(message.time).getTime() : now
    const reactStepsStr = stepReacts 
      ? JSON.stringify(stepReacts) 
      : (message.reactSteps ? JSON.stringify(message.reactSteps) : null)

    const insertMsg = this.dbManager.prepare(`
      INSERT INTO chat_messages(id, session_id, role, content, react_steps, created_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `)

    this.dbManager.transaction(() => {
      insertMsg.run(msgId, sessionId, role, content, reactStepsStr, msgTime)

      // 更新 reacts_json
      let reacts = session.reacts || {}
      if (stepReacts && Array.isArray(stepReacts) && stepReacts.length > 0) {
        const convKey = message.conversationId || `req_${now}`
        reacts[convKey] = stepReacts
      }

      let updatedTitle = session.title
      // 检查标题自适应：若为默认标题且已产生两轮及以上对白
      const countRes = this.dbManager.prepare('SELECT count(*) as count FROM chat_messages WHERE session_id = ?').get(sessionId)
      if (session.title === '新对话' && countRes && countRes.count >= 2) {
        const firstTwo = this.dbManager.prepare(`
          SELECT content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 2
        `).all(sessionId)
        updatedTitle = this.generateSessionTitle(firstTwo[0]?.content || '', firstTwo[1]?.content || '')
      }

      this.dbManager.prepare(`
        UPDATE chat_sessions 
        SET title = ?, reacts_json = ?, updated_at = ?
        WHERE id = ?
      `).run(updatedTitle, JSON.stringify(reacts), now, sessionId)
    })

    return this.getSession(sessionId)
  }

  /**
   * 保存更新完整会话快照
   */
  saveSession(sessionData) {
    if (!sessionData || !sessionData.id) return false
    const now = Date.now()
    const sessionId = sessionData.id

    const exists = this.dbManager.prepare('SELECT id, title FROM chat_sessions WHERE id = ?').get(sessionId)

    this.dbManager.transaction(() => {
      let finalTitle = sessionData.title || (exists ? exists.title : '新对话')

      if (finalTitle === '新对话' && Array.isArray(sessionData.messages) && sessionData.messages.length >= 2) {
        finalTitle = this.generateSessionTitle(
          sessionData.messages[0]?.content || '',
          sessionData.messages[1]?.content || ''
        )
      }

      const reactsJson = sessionData.reacts ? JSON.stringify(sessionData.reacts) : '{}'
      const pinnedVal = sessionData.pinned ? 1 : 0
      const contextSummary = sessionData.contextSummary || ''

      if (exists) {
        this.dbManager.prepare(`
          UPDATE chat_sessions 
          SET title = ?, pinned = ?, context_summary = ?, reacts_json = ?, updated_at = ?
          WHERE id = ?
        `).run(finalTitle, pinnedVal, contextSummary, reactsJson, now, sessionId)
      } else {
        const createdAt = sessionData.createdAt ? new Date(sessionData.createdAt).getTime() : now
        this.dbManager.prepare(`
          INSERT INTO chat_sessions(id, title, pinned, context_summary, reacts_json, created_at, updated_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
        `).run(sessionId, finalTitle, pinnedVal, contextSummary, reactsJson, createdAt, now)
      }

      // 同步消息列表（若提供了 messages 数组）
      if (Array.isArray(sessionData.messages)) {
        this.dbManager.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
        const insertMsg = this.dbManager.prepare(`
          INSERT INTO chat_messages(id, session_id, role, content, react_steps, created_at)
          VALUES(?, ?, ?, ?, ?, ?)
        `)
        for (let i = 0; i < sessionData.messages.length; i++) {
          const m = sessionData.messages[i]
          if (!m) continue
          const msgId = m.id || `msg_${sessionId}_${i}_${Math.random().toString(36).slice(2, 6)}`
          const role = m.role || (m.sender === 'user' ? 'user' : 'assistant')
          const content = m.content || ''
          const msgTime = m.time ? new Date(m.time).getTime() : (now + i * 100)
          const reactSteps = m.reactSteps ? JSON.stringify(m.reactSteps) : null
          insertMsg.run(msgId, sessionId, role, content, reactSteps, msgTime)
        }
      }
    })

    return true
  }

  /**
   * 重命名会话
   */
  renameSession(id, title) {
    if (!id) return false
    const cleanTitle = (title && title.trim()) || '未命名会话'
    const now = Date.now()
    const info = this.dbManager.prepare(`
      UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?
    `).run(cleanTitle, now, id)
    return info.changes > 0
  }

  /**
   * 删除会话
   */
  deleteSession(id) {
    if (!id) return false

    let deleted = false
    this.dbManager.transaction(() => {
      // 开启外键联动级联删除消息
      this.dbManager.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id)
      const info = this.dbManager.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
      deleted = info.changes > 0

      // 若所有会话已被清空，自动补充一个默认会话
      const count = this.dbManager.prepare('SELECT count(*) as count FROM chat_sessions').get()?.count || 0
      if (count === 0) {
        this._createDefaultSessionRow()
      }
    })

    return deleted
  }

  /**
   * 提炼标题简要
   */
  generateSessionTitle(firstUserMsg, firstAssistantMsg = '') {
    const clean = String(firstUserMsg || '').replace(/[#*`\n]/g, ' ').trim()
    if (!clean) return '随记交流'
    if (clean.length <= 15) return clean
    return clean.slice(0, 14) + '...'
  }

  /**
   * 迁移旧版单会话数据
   */
  migrateLegacyData(legacyMessages, legacyReacts = {}) {
    if (!Array.isArray(legacyMessages) || legacyMessages.length === 0) {
      return false
    }

    const now = Date.now()
    const legacySessionId = `sess_legacy_${now}`
    const firstMsgTime = legacyMessages[0]?.time ? new Date(legacyMessages[0].time).getTime() : now
    const lastMsgTime = legacyMessages[legacyMessages.length - 1]?.time ? new Date(legacyMessages[legacyMessages.length - 1].time).getTime() : now

    this.dbManager.transaction(() => {
      // 如果当前只有 1 个会话，且没有任何消息、标题为“新对话”，则直接清除该空白会话
      const list = this.listSessions()
      if (list.length === 1 && list[0].messageCount === 0 && list[0].title === '新对话') {
        this.dbManager.prepare('DELETE FROM chat_sessions WHERE id = ?').run(list[0].id)
      }

      this.dbManager.prepare(`
        INSERT INTO chat_sessions(id, title, pinned, context_summary, reacts_json, created_at, updated_at)
        VALUES(?, '历史迁移对话', 0, '', ?, ?, ?)
      `).run(legacySessionId, JSON.stringify(legacyReacts || {}), firstMsgTime, lastMsgTime)

      const insertMsg = this.dbManager.prepare(`
        INSERT INTO chat_messages(id, session_id, role, content, react_steps, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
      `)

      for (let i = 0; i < legacyMessages.length; i++) {
        const m = legacyMessages[i]
        const role = m.sender === 'user' ? 'user' : 'assistant'
        const content = m.content || ''
        const mTime = m.time ? new Date(m.time).getTime() : (firstMsgTime + i * 1000)
        const msgId = m.conversationId || `msg_${legacySessionId}_${i}`
        insertMsg.run(msgId, legacySessionId, role, content, null, mTime)
      }
    })

    return true
  }

  migrateLegacy(legacyMessages, legacyReacts = {}) {
    return this.migrateLegacyData(legacyMessages, legacyReacts)
  }
}
