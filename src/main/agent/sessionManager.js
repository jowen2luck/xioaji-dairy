/**
 * 多会话管理器 (SessionManager)
 * 职责：
 * 1. 管理多话题会话的生命周期（创建、切换、重命名、删除、查询）
 * 2. 独立维护各会话的消息流与 ReAct 思维步骤
 * 3. 兼容与自动迁移旧版本单一会话记录
 */

import fs from 'fs'
import path from 'path'

export class SessionManager {
  constructor({ storagePath } = {}) {
    this.storagePath = storagePath || ''
    this.sessions = []
    this._initialized = false
    if (this.storagePath) {
      this._load()
    }
  }

  _load() {
    try {
      if (this.storagePath && fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8')
        if (raw && raw.trim()) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            this.sessions = parsed
            this._initialized = true
            return
          }
        }
      }
    } catch (e) {
      console.error('[SessionManager] Failed to load sessions from file:', e)
    }

    // 默认若为空，初始化一个空白会话
    if (this.sessions.length === 0) {
      this.sessions = [this._createDefaultSession()]
      this._save()
    }
    this._initialized = true
  }

  _save() {
    if (!this.storagePath) return
    try {
      const dir = path.dirname(this.storagePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.sessions, null, 2), 'utf-8')
    } catch (e) {
      console.error('[SessionManager] Failed to save sessions:', e)
    }
  }

  _createDefaultSession() {
    const now = new Date().toISOString()
    return {
      id: `sess_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      title: '新对话',
      createdAt: now,
      updatedAt: now,
      messages: [],
      reacts: {},
      contextSummary: '',
      pinned: false
    }
  }

  /**
   * 获取所有会话概览列表（按更新时间降序）
   */
  listSessions() {
    return this.sessions
      .map(s => {
        const lastMsg = s.messages && s.messages.length > 0
          ? s.messages[s.messages.length - 1]
          : null
        return {
          id: s.id,
          title: s.title || '新对话',
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
          lastMessagePreview: lastMsg ? (lastMsg.content ? String(lastMsg.content).slice(0, 60) : '') : '',
          pinned: !!s.pinned
        }
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
  }

  /**
   * 获取指定会话完整数据
   */
  getSession(id) {
    let session = this.sessions.find(s => s.id === id)
    if (!session) {
      // 若不存在，默认返回第一个会话
      session = this.sessions[0] || null
    }
    return session
  }

  /**
   * 创建新会话
   */
  createSession({ title, id } = {}) {
    const now = new Date().toISOString()
    const newSession = {
      id: id || `sess_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      title: title || '新对话',
      createdAt: now,
      updatedAt: now,
      messages: [],
      reacts: {},
      contextSummary: '',
      pinned: false
    }
    this.sessions.unshift(newSession)
    this._save()
    return newSession
  }

  /**
   * 保存更新会话
   */
  saveSession(sessionData) {
    if (!sessionData || !sessionData.id) return false
    const index = this.sessions.findIndex(s => s.id === sessionData.id)
    if (index >= 0) {
      this.sessions[index] = {
        ...this.sessions[index],
        ...sessionData,
        updatedAt: new Date().toISOString()
      }
      if (this.sessions[index].title === '新对话' && Array.isArray(this.sessions[index].messages) && this.sessions[index].messages.length >= 2) {
        this.sessions[index].title = this.generateSessionTitle(
          this.sessions[index].messages[0]?.content || '',
          this.sessions[index].messages[1]?.content || ''
        )
      }
    } else {
      const newSess = {
        ...sessionData,
        updatedAt: new Date().toISOString()
      }
      if ((!newSess.title || newSess.title === '新对话') && Array.isArray(newSess.messages) && newSess.messages.length >= 2) {
        newSess.title = this.generateSessionTitle(
          newSess.messages[0]?.content || '',
          newSess.messages[1]?.content || ''
        )
      }
      this.sessions.unshift(newSess)
    }
    this._save()
    return true
  }

  /**
   * 追加消息与对应思维记录
   */
  appendMessage(sessionId, message, stepReacts = null) {
    let session = this.sessions.find(s => s.id === sessionId)
    if (!session) {
      session = this.createSession({ id: sessionId })
    }

    if (!Array.isArray(session.messages)) {
      session.messages = []
    }
    if (!session.reacts || typeof session.reacts !== 'object') {
      session.reacts = {}
    }

    session.messages.push(message)
    if (stepReacts && Array.isArray(stepReacts) && stepReacts.length > 0) {
      const convKey = message.conversationId || `req_${Date.now()}`
      session.reacts[convKey] = stepReacts
    }

    session.updatedAt = new Date().toISOString()

    // 若会话标题仍为默认标题且已产生对话，自动提炼标题
    if (session.title === '新对话' && session.messages.length >= 2) {
      session.title = this.generateSessionTitle(
        session.messages[0]?.content || '',
        session.messages[1]?.content || ''
      )
    }

    this._save()
    return session
  }

  /**
   * 重命名会话
   */
  renameSession(id, title) {
    const session = this.sessions.find(s => s.id === id)
    if (session) {
      session.title = title ? title.trim() : '未命名会话'
      session.updatedAt = new Date().toISOString()
      this._save()
      return true
    }
    return false
  }

  /**
   * 删除会话
   */
  deleteSession(id) {
    const idx = this.sessions.findIndex(s => s.id === id)
    if (idx >= 0) {
      this.sessions.splice(idx, 1)
      // 若清空了，自动补充一个默认会话
      if (this.sessions.length === 0) {
        this.sessions.push(this._createDefaultSession())
      }
      this._save()
      return true
    }
    return false
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

    // 格式化消息
    const formattedMessages = legacyMessages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.content || '',
      time: m.time || new Date().toISOString(),
      conversationId: m.conversationId,
      reactIndex: m.reactIndex
    }))

    const now = new Date().toISOString()
    const legacySession = {
      id: `sess_legacy_${Date.now()}`,
      title: '历史迁移对话',
      createdAt: formattedMessages[0]?.time || now,
      updatedAt: formattedMessages[formattedMessages.length - 1]?.time || now,
      messages: formattedMessages,
      reacts: legacyReacts || {},
      contextSummary: '',
      pinned: false
    }

    // 如果当前只有一个且是空白默认会话，则直接替换
    if (this.sessions.length === 1 && this.sessions[0].messages.length === 0 && this.sessions[0].title === '新对话') {
      this.sessions = [legacySession]
    } else {
      this.sessions.push(legacySession)
    }

    this._save()
    return true
  }

  /**
   * 迁移接口别名，兼容 migrateLegacy 调用
   */
  migrateLegacy(legacyMessages, legacyReacts = {}) {
    return this.migrateLegacyData(legacyMessages, legacyReacts)
  }
}
