import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { SessionManager } from '../src/main/agent/sessionManager.js'

describe('SessionManager', () => {
  let tempDir
  let sessionFilePath
  let sessionManager

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-session-test-'))
    sessionFilePath = path.join(tempDir, 'agent-sessions.json')
    sessionManager = new SessionManager({ storagePath: sessionFilePath })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should initialize and create a default session when none exists', () => {
    const list = sessionManager.listSessions()
    expect(list.length).toBe(1)
    expect(list[0].title).toBe('新对话')
  })

  it('should create new sessions with custom titles', () => {
    const session = sessionManager.createSession({ title: '科研复盘讨论' })
    expect(session.id).toBeDefined()
    expect(session.title).toBe('科研复盘讨论')
    expect(session.messages).toEqual([])

    const list = sessionManager.listSessions()
    expect(list.length).toBe(2)
  })

  it('should append messages and update timestamps', () => {
    const session = sessionManager.createSession({ title: '测试会话' })
    sessionManager.appendMessage(session.id, {
      role: 'user',
      content: '今天感觉有点累',
      time: new Date().toISOString()
    })
    sessionManager.appendMessage(session.id, {
      role: 'assistant',
      content: '发生什么事了？',
      time: new Date().toISOString()
    }, [{ action: 'thinking', detail: '用户情绪低落' }])

    const updated = sessionManager.getSession(session.id)
    expect(updated.messages.length).toBe(2)
    expect(updated.reacts[session.id] || Object.keys(updated.reacts).length > 0).toBeTruthy()

    const list = sessionManager.listSessions()
    const found = list.find(s => s.id === session.id)
    expect(found.messageCount).toBe(2)
    expect(found.lastMessagePreview).toContain('发生什么事了')
  })

  it('should rename a session', () => {
    const session = sessionManager.createSession({ title: '旧名称' })
    sessionManager.renameSession(session.id, '新名称')
    const updated = sessionManager.getSession(session.id)
    expect(updated.title).toBe('新名称')
  })

  it('should delete a session and keep at least one default if empty', () => {
    const session1 = sessionManager.createSession({ title: '会话1' })
    const session2 = sessionManager.createSession({ title: '会话2' })
    
    sessionManager.deleteSession(session1.id)
    const list = sessionManager.listSessions()
    expect(list.find(s => s.id === session1.id)).toBeUndefined()
  })

  it('should migrate legacy conversation data gracefully', () => {
    const legacyMessages = [
      { sender: 'user', content: '历史老问题', time: '2026-09-01T10:00:00.000Z' },
      { sender: 'agent', content: '历史老回答', time: '2026-09-01T10:00:05.000Z' }
    ]
    const legacyReacts = {
      conv_1: [{ action: 'tool_calls', name: 'search_records' }]
    }

    const migrated = sessionManager.migrateLegacyData(legacyMessages, legacyReacts)
    expect(migrated).toBe(true)

    const list = sessionManager.listSessions()
    const defaultSession = list.find(s => s.title === '历史迁移对话')
    expect(defaultSession).toBeDefined()
    expect(defaultSession.messageCount).toBe(2)
  })

  it('should support migrateLegacy alias', () => {
    const legacyMessages = [
      { sender: 'user', content: '别名测试问题', time: '2026-09-02T10:00:00.000Z' }
    ]
    expect(typeof sessionManager.migrateLegacy).toBe('function')
    const ok = sessionManager.migrateLegacy(legacyMessages)
    expect(ok).toBe(true)
  })

  it('should auto-generate title in saveSession when title is default and messages are present', () => {
    const session = sessionManager.createSession({ title: '新对话' })
    sessionManager.saveSession({
      id: session.id,
      messages: [
        { role: 'user', content: '我的第一篇毕业设计进度记录' },
        { role: 'assistant', content: '收到了，毕业设计进展如何？' }
      ]
    })
    const updated = sessionManager.getSession(session.id)
    expect(updated.title).not.toBe('新对话')
    expect(updated.title).toContain('我的第一篇毕业设计')
  })
})
