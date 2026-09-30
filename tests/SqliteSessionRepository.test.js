import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteSessionRepository } from '../src/main/infrastructure/persistence/SqliteSessionRepository.js'

describe('SqliteSessionRepository', () => {
  let tempDir
  let dbManager
  let repo

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-session-repo-test-'))
    const dbPath = path.join(tempDir, 'sessions.db')
    dbManager = new DatabaseManager({ dbPath })
    repo = new SqliteSessionRepository({ dbManager })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should initialize and create a default session when none exists', () => {
    const list = repo.listSessions()
    expect(list.length).toBe(1)
    expect(list[0].title).toBe('新对话')
    expect(list[0].messageCount).toBe(0)
  })

  it('should create new sessions and query detail', () => {
    const session = repo.createSession({ title: '技术调研会话' })
    expect(session.id).toBeDefined()
    expect(session.title).toBe('技术调研会话')
    expect(session.messages).toEqual([])

    const retrieved = repo.getSession(session.id)
    expect(retrieved.id).toBe(session.id)
    expect(retrieved.title).toBe('技术调研会话')
    expect(retrieved.messages.length).toBe(0)
  })

  it('should append messages, record reactSteps and auto-generate title', () => {
    const session = repo.createSession({ title: '新对话' })

    repo.appendMessage(session.id, {
      role: 'user',
      content: '今天想梳理一下关于自进化记忆的落地路线'
    })

    const afterOne = repo.getSession(session.id)
    expect(afterOne.messages.length).toBe(1)
    expect(afterOne.title).toBe('新对话')

    repo.appendMessage(session.id, {
      role: 'assistant',
      content: '我们可以分成底座搭建、记忆闭环和事务合并三个步骤来做。'
    }, [{ action: 'thinking', detail: '拆解为三个步骤' }])

    const afterTwo = repo.getSession(session.id)
    expect(afterTwo.messages.length).toBe(2)
    // 标题自适应生成
    expect(afterTwo.title).toContain('今天想梳理一下关于自进化')
    expect(afterTwo.messages[1].reactSteps).toBeDefined()
    expect(afterTwo.messages[1].reactSteps[0].action).toBe('thinking')

    const list = repo.listSessions()
    const found = list.find(s => s.id === session.id)
    expect(found.messageCount).toBe(2)
    expect(found.lastMessagePreview).toContain('我们可以分成底座搭建')
  })

  it('should rename a session', () => {
    const session = repo.createSession({ title: '待改名' })
    const success = repo.renameSession(session.id, '已改名会话')
    expect(success).toBe(true)

    const updated = repo.getSession(session.id)
    expect(updated.title).toBe('已改名会话')
  })

  it('should delete a session and cascade delete messages, creating default if empty', () => {
    const s1 = repo.createSession({ title: '临时会话' })
    repo.appendMessage(s1.id, { role: 'user', content: '测试消息' })

    const delRes = repo.deleteSession(s1.id)
    expect(delRes).toBe(true)

    // 检查消息级联删除
    const msgCount = dbManager.prepare('SELECT count(*) as count FROM chat_messages WHERE session_id = ?').get(s1.id).count
    expect(msgCount).toBe(0)

    // 保持至少一个会话保底
    const list = repo.listSessions()
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  it('should auto-migrate legacy agent-sessions.json and create backup', () => {
    const legacyJsonPath = path.join(tempDir, 'legacy-sessions.json')
    const legacyData = [
      {
        id: 'sess_legacy_01',
        title: '老版会话数据',
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: '2026-09-01T08:05:00.000Z',
        pinned: true,
        contextSummary: '老前情提要',
        messages: [
          { role: 'user', content: '老问题1', time: '2026-09-01T08:00:00.000Z' },
          { role: 'assistant', content: '老回答1', time: '2026-09-01T08:01:00.000Z' }
        ],
        reacts: {
          conv_old: [{ action: 'tool', name: 'search' }]
        }
      }
    ]
    fs.writeFileSync(legacyJsonPath, JSON.stringify(legacyData), 'utf-8')

    // 新建独立数据库测试迁移
    const migDbPath = path.join(tempDir, 'migrated.db')
    const migDbManager = new DatabaseManager({ dbPath: migDbPath })
    const migRepo = new SqliteSessionRepository({
      dbManager: migDbManager,
      legacyJsonPath
    })

    // 验证备份文件已创建
    const bakFile = path.join(tempDir, 'agent-sessions.bak.json')
    expect(fs.existsSync(bakFile)).toBe(true)

    // 验证会话与消息已成功迁入 SQLite
    const sessions = migRepo.listSessions()
    expect(sessions.length).toBe(1)
    expect(sessions[0].id).toBe('sess_legacy_01')
    expect(sessions[0].title).toBe('老版会话数据')
    expect(sessions[0].pinned).toBe(true)
    expect(sessions[0].messageCount).toBe(2)

    const detail = migRepo.getSession('sess_legacy_01')
    expect(detail.messages.length).toBe(2)
    expect(detail.messages[0].content).toBe('老问题1')
    expect(detail.reacts.conv_old).toBeDefined()

    migDbManager.close()
  })
})
