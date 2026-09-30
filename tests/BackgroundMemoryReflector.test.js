import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteMemoryRepository } from '../src/main/infrastructure/persistence/SqliteMemoryRepository.js'
import { BackgroundMemoryReflector } from '../src/main/agent/memory/BackgroundMemoryReflector.js'

describe('BackgroundMemoryReflector', () => {
  let tempDir
  let dbManager
  let repo
  let reflector

  const mockVector = (val) => {
    const arr = new Float32Array(384)
    arr.fill(val)
    return arr
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-reflector-test-'))
    const dbPath = path.join(tempDir, 'reflector.db')
    dbManager = new DatabaseManager({ dbPath })
    repo = new SqliteMemoryRepository({ dbManager })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should buffer dialogue turns and debounce reflection', async () => {
    let calledWithPrompt = null
    const mockLLM = vi.fn().mockImplementation(async (prompt) => {
      calledWithPrompt = prompt
      return JSON.stringify([
        { action: 'ADD', fact: '用户养了一只英短蓝猫叫老王', category: 'fact' }
      ])
    })

    reflector = new BackgroundMemoryReflector({
      memoryRepo: repo,
      llmCaller: mockLLM,
      embedder: async () => mockVector(0.1),
      idleTimeoutMs: 50 // 50ms 快速超时
    })

    reflector.recordTurn('sess_1', '我家里新养了一只猫叫老王', '太棒啦！猫咪一定很可爱。')

    // 此时尚未触发
    expect(mockLLM).not.toHaveBeenCalled()

    // 等待 80ms 触发闲时
    await new Promise(r => setTimeout(r, 80))

    expect(mockLLM).toHaveBeenCalledTimes(1)
    expect(calledWithPrompt).toContain('我家里新养了一只猫叫老王')

    // 验证事实已成功追加落盘
    const validMemories = repo.listValidMemories()
    expect(validMemories.length).toBe(1)
    expect(validMemories[0].content).toBe('用户养了一只英短蓝猫叫老王')
  })

  it('should trigger immediate reflection when reaching maxTurns threshold', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify([]))

    reflector = new BackgroundMemoryReflector({
      memoryRepo: repo,
      llmCaller: mockLLM,
      embedder: async () => mockVector(0.2),
      idleTimeoutMs: 10000, // 较长超时
      maxTurns: 3           // 3 轮即刻触发
    })

    reflector.recordTurn('sess_2', '问答1', '回答1')
    reflector.recordTurn('sess_2', '问答2', '回答2')
    expect(mockLLM).not.toHaveBeenCalled()

    // 第 3 轮直接触发
    reflector.recordTurn('sess_2', '问答3', '回答3')
    await new Promise(r => setTimeout(r, 10))

    expect(mockLLM).toHaveBeenCalledTimes(1)
  })

  it('should handle UPDATE_CONFLICT and invalidate conflicting memory', async () => {
    // 预先存入旧记忆
    const oldMem = repo.addMemory({
      content: '老王是我的同班同学',
      embedding: mockVector(0.5)
    })
    expect(repo.listValidMemories().length).toBe(1)

    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify([
      {
        action: 'UPDATE_CONFLICT',
        fact: '老王是用户养的猫，不是同学',
        conflict_with: '老王是我的同班同学',
        category: 'fact'
      }
    ]))

    reflector = new BackgroundMemoryReflector({
      memoryRepo: repo,
      llmCaller: mockLLM,
      embedder: async () => mockVector(0.5)
    })

    const evolvedEvents = []
    reflector.onMemoryEvolved((evt) => evolvedEvents.push(evt))

    // 模拟直接执行会话提炼
    reflector.turnBuffers.set('sess_conflict', [
      { userQuery: '你记错了，老王是我养的猫，不是我同学', assistantResponse: '抱歉记错了！', timestamp: Date.now() }
    ])

    const applied = await reflector.reflectSession('sess_conflict')
    expect(applied.length).toBe(1)
    expect(applied[0].content).toBe('老王是用户养的猫，不是同学')

    // 验证旧记忆已置为失效
    const allValid = repo.listValidMemories()
    expect(allValid.length).toBe(1)
    expect(allValid[0].content).toBe('老王是用户养的猫，不是同学')

    // 验证事件广播
    expect(evolvedEvents.length).toBe(1)
    expect(evolvedEvents[0].action).toBe('UPDATE_CONFLICT')
  })

  it('should flush pending buffers on flushPending (before-quit simulation)', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify([
      { action: 'ADD', fact: '用户明天去面试', category: 'fact' }
    ]))

    reflector = new BackgroundMemoryReflector({
      memoryRepo: repo,
      llmCaller: mockLLM,
      embedder: async () => mockVector(0.3),
      idleTimeoutMs: 60000 // 长超时，正常不会立即触发
    })

    reflector.recordTurn('sess_quit', '我明天要去大厂面试', '祝你面试顺利！')
    expect(mockLLM).not.toHaveBeenCalled()

    // 模拟 before-quit 触发 flushPending
    await reflector.flushPending()
    expect(mockLLM).toHaveBeenCalledTimes(1)

    const memories = repo.listValidMemories()
    expect(memories.length).toBe(1)
    expect(memories[0].content).toBe('用户明天去面试')
  })
})
