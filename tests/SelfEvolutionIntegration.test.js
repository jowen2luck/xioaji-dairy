import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteMemoryRepository } from '../src/main/infrastructure/persistence/SqliteMemoryRepository.js'
import { BackgroundMemoryReflector } from '../src/main/agent/memory/BackgroundMemoryReflector.js'
import { ContextCompactor } from '../src/main/agent/middleware/contextCompactor.js'

describe('SelfEvolutionIntegration - 阶段一记忆自进化全链路端到端闭环', () => {
  let tempDir
  let dbPath
  let dbManager
  let repo
  let compactor

  // 构造确定性正交向量，便于测试精准检索
  const makeVector = (seed) => {
    const arr = new Float32Array(384)
    for (let i = 0; i < 384; i++) {
      arr[i] = Math.sin(seed * (i + 1))
    }
    return arr
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-evolution-e2e-'))
    dbPath = path.join(tempDir, 'evolution_e2e.db')
    dbManager = new DatabaseManager({ dbPath })
    repo = new SqliteMemoryRepository({ dbManager })
    compactor = new ContextCompactor({ windowSize: 6 })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('完整自进化闭环：会话记录 -> 闲时增量提炼 -> 动态记忆召回 -> 上下文隐性注入 -> 纠偏自动失效 -> 认知画布手工维护', async () => {
    const apolloVector = makeVector(1.0)
    const nebulaVector = makeVector(2.0)

    // 向量计算模拟器：包含特定关键词则输出对应向量
    const mockEmbedder = vi.fn().mockImplementation(async (text) => {
      if (text.includes('Nebula') || text.includes('前端渲染器')) {
        return nebulaVector
      }
      return apolloVector
    })

    // 模拟 LLM 决策响应
    let nextLlmResponse = null
    const mockLlm = vi.fn().mockImplementation(async () => {
      return nextLlmResponse
    })

    const reflector = new BackgroundMemoryReflector({
      memoryRepo: repo,
      llmCaller: mockLlm,
      embedder: mockEmbedder,
      idleTimeoutMs: 100000 // 长超时，通过手动或事件驱动
    })

    const broadcastEvents = []
    reflector.onMemoryEvolved((evt) => {
      broadcastEvents.push(evt)
    })

    // ----------------------------------------------------
    // 步骤 1：记录第 1~2 轮对话，触发闲时自进化提炼 (ADD)
    // ----------------------------------------------------
    reflector.recordTurn(
      'sess_e2e_101',
      '我最近在负责一个叫 Apollo 的低代码平台架构迁移工作，我主要负责后端编译器部分。',
      '听起来非常有挑战性！编译器迁移需要格外注意 AST 节点的边界解析与向后兼容。'
    )

    nextLlmResponse = JSON.stringify([
      {
        action: 'ADD',
        fact: '用户负责 Apollo 低代码平台的后端编译器架构迁移',
        category: 'project',
        confidence: 0.96
      }
    ])

    // 模拟闲时到来或 before-quit 触发提炼
    await reflector.flushPending()

    // 验证：
    // 1. 产生了一次记忆演进事件广播
    expect(broadcastEvents.length).toBe(1)
    expect(broadcastEvents[0].action).toBe('ADD')
    expect(broadcastEvents[0].memory.content).toBe('用户负责 Apollo 低代码平台的后端编译器架构迁移')

    // 2. 底层 SQLite 真实落盘且处于有效状态
    const activeMemories = repo.listValidMemories()
    expect(activeMemories.length).toBe(1)
    expect(activeMemories[0].content).toBe('用户负责 Apollo 低代码平台的后端编译器架构迁移')
    expect(activeMemories[0].sourceType).toBe('chat')

    // ----------------------------------------------------
    // 步骤 2：后续对话动态检索该记忆并隐性注入上下文
    // ----------------------------------------------------
    const userQueryVector = apolloVector // 模拟语义相近的提问向量
    const recalledMemories = repo.searchSimilarMemories(userQueryVector, {
      limit: 3,
      sourceType: 'chat'
    })
    expect(recalledMemories.length).toBe(1)
    expect(recalledMemories[0].content).toContain('Apollo')
    expect(recalledMemories[0].distance).toBeLessThan(0.001)

    // 构建进入 LLM 的上下文 Payload
    const modelPayload = compactor.buildModelMessages({
      systemPrompt: '你是一个充满理解力与同理心的小鸡日记伴侣。',
      coreMemoryPrompt: repo.getPromptBlock(),
      relevantMemories: recalledMemories,
      messages: [
        { role: 'user', content: '我之前跟你说过我在做什么项目来着？' }
      ],
      currentUserQuery: '我之前跟你说过我在做什么项目来着？'
    })

    const systemMessage = modelPayload.find(m => m.role === 'system')
    expect(systemMessage).toBeDefined()
    expect(systemMessage.content).toContain('<contextual_memories>')
    expect(systemMessage.content).toContain('Apollo 低代码平台的后端编译器架构迁移')
    expect(systemMessage.content).toContain('严禁使用“我记得你...”')

    // ----------------------------------------------------
    // 步骤 3：用户发生认知反驳与更迭，触发 UPDATE_CONFLICT 纠偏
    // ----------------------------------------------------
    reflector.recordTurn(
      'sess_e2e_101',
      '对了，Apollo 项目后来改名叫 Nebula 了，并且我转去做前端渲染器了。',
      '收到！已经为你更新了这个变化，从 Apollo 改为 Nebula，并且主攻前端渲染器。'
    )

    nextLlmResponse = JSON.stringify([
      {
        action: 'UPDATE_CONFLICT',
        fact: '用户的项目从 Apollo 更名为 Nebula，职责转为主攻前端渲染器',
        conflict_with: '用户负责 Apollo 低代码平台的后端编译器架构迁移',
        category: 'project',
        confidence: 0.98
      }
    ])

    await reflector.flushPending()

    // 验证：
    // 1. 捕获到 UPDATE_CONFLICT 演进广播
    expect(broadcastEvents.length).toBe(2)
    expect(broadcastEvents[1].action).toBe('UPDATE_CONFLICT')

    // 2. 原旧记忆被标记失效 (is_valid = 0)，有效列表中仅剩 Nebula
    const updatedActiveMemories = repo.listValidMemories()
    expect(updatedActiveMemories.length).toBe(1)
    expect(updatedActiveMemories[0].content).toBe('用户的项目从 Apollo 更名为 Nebula，职责转为主攻前端渲染器')

    // 3. 再次进行 Apollo 检索，确保旧记忆已被淘汰，结果中绝不再包含任何 Apollo 事实
    const oldQueryHits = repo.searchSimilarMemories(apolloVector, {
      limit: 3,
      sourceType: 'chat'
    })
    expect(oldQueryHits.some(h => h.content.includes('后端编译器架构迁移'))).toBe(false)
    expect(oldQueryHits[0].content).toContain('Nebula')

    // 4. 若设置相似距离阈值 (如 maxDistance: 0.1)，不相关的 Apollo 向量不会命中任何记录
    const strictOldHits = repo.searchSimilarMemories(apolloVector, {
      limit: 3,
      sourceType: 'chat',
      maxDistance: 0.1
    })
    expect(strictOldHits.length).toBe(0)

    // 5. 检索 Nebula 向量则可以精确匹配召回
    const newQueryHits = repo.searchSimilarMemories(nebulaVector, {
      limit: 3,
      sourceType: 'chat',
      maxDistance: 0.1
    })
    expect(newQueryHits.length).toBe(1)
    expect(newQueryHits[0].content).toContain('Nebula')

    // ----------------------------------------------------
    // 步骤 4：前端“认知画布”交互（修改与遗忘）
    // ----------------------------------------------------
    const targetMemId = updatedActiveMemories[0].id

    // 用户在画布上编辑内容
    const editedContent = '用户的项目从 Apollo 更名为 Nebula，主要负责渲染器性能优化与 WASM 模块'
    const editSuccess = repo.updateMemoryContent(targetMemId, editedContent, nebulaVector)
    expect(editSuccess).toBe(true)

    const afterEditList = repo.listValidMemories()
    expect(afterEditList[0].content).toBe(editedContent)

    // 用户在画布上点击“遗忘”
    const invalidateSuccess = repo.invalidateMemory(targetMemId, '用户手动从认知画布删除')
    expect(invalidateSuccess).toBe(true)

    // 验证当前有效记忆已清空
    expect(repo.listValidMemories().length).toBe(0)

    // ----------------------------------------------------
    // 步骤 5：持久化一致性验证 (WAL Checkpoint & 重启校验)
    // ----------------------------------------------------
    dbManager.close()

    // 重新连接数据库
    const reloadedDbManager = new DatabaseManager({ dbPath })
    const reloadedRepo = new SqliteMemoryRepository({ dbManager: reloadedDbManager })

    // 验证有效记忆仍为 0
    expect(reloadedRepo.listValidMemories().length).toBe(0)

    // 验证底层数据库保留了失效记录溯源日志
    const allRecords = reloadedDbManager.prepare('SELECT id, is_valid, invalidated_reason FROM episodic_memories').all()
    expect(allRecords.length).toBe(2)
    const invalidatedByConflict = allRecords.find(r => r.invalidated_reason?.includes('conflict_updated'))
    const invalidatedByUser = allRecords.find(r => r.invalidated_reason === '用户手动从认知画布删除')
    expect(invalidatedByConflict).toBeDefined()
    expect(invalidatedByUser).toBeDefined()

    reloadedDbManager.close()
  })
})
