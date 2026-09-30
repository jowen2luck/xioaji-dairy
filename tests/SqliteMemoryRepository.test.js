import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteMemoryRepository } from '../src/main/infrastructure/persistence/SqliteMemoryRepository.js'

describe('SqliteMemoryRepository', () => {
  let tempDir
  let dbManager
  let repo

  // 构造模拟 384 维向量的辅助函数
  const makeVector = (val) => {
    const arr = new Float32Array(384)
    arr.fill(val)
    return arr
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-repo-test-'))
    const dbPath = path.join(tempDir, 'test_memory.db')
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

  describe('1. 结构化画像 (KV Profile)', () => {
    it('should initialize with default profile structure', () => {
      const profile = repo.getProfile()
      expect(profile.user_profile).toBeDefined()
      expect(profile.key_entities).toBeDefined()
      expect(profile.current_focus).toBeDefined()
      expect(profile.preferences).toBeDefined()
    })

    it('should update profile and keep user/agent aliases synchronized', () => {
      repo.updateProfile('user', '专注研发的架构师')
      const profile1 = repo.getProfile()
      expect(profile1.user).toBe('专注研发的架构师')
      expect(profile1.user_profile).toBe('专注研发的架构师')

      repo.updateProfile('agent', '回答务求精炼，直接输出代码')
      const profile2 = repo.getProfile()
      expect(profile2.agent).toBe('回答务求精炼，直接输出代码')
      expect(profile2.preferences).toBe('回答务求精炼，直接输出代码')
    })

    it('should render a clean prompt block matching core memory format', () => {
      const prompt = repo.getPromptBlock()
      expect(prompt).toContain('<core_memory>')
      expect(prompt).toContain('【用户长期记忆与常驻画像 (Core Memory)】')
      expect(prompt).toContain('</core_memory>')
    })

    it('should automatically migrate legacy core-memory.json if present', () => {
      const legacyPath = path.join(tempDir, 'legacy-core-memory.json')
      fs.writeFileSync(legacyPath, JSON.stringify({
        user_profile: '从旧版本迁移而来的用户画像',
        preferences: '旧版助手偏好设定'
      }))

      // 新建一个全新数据库与仓储，并传入 legacyJsonPath
      const freshDbPath = path.join(tempDir, 'fresh_migrated.db')
      const freshDb = new DatabaseManager({ dbPath: freshDbPath })
      const migratedRepo = new SqliteMemoryRepository({ dbManager: freshDb, legacyJsonPath: legacyPath })

      const profile = migratedRepo.getProfile()
      expect(profile.user_profile).toBe('从旧版本迁移而来的用户画像')
      expect(profile.preferences).toBe('旧版助手偏好设定')
      expect(migratedRepo._migrated).toBe(true)

      freshDb.close()
    })
  })

  describe('2. 情节记忆与向量检索 (Episodic Memories)', () => {
    it('should add memory with vector embedding and list it', () => {
      const vec = makeVector(0.1)
      const mem = repo.addMemory({
        content: '用户养了一只英短蓝猫叫老王',
        sourceType: 'chat',
        category: 'fact',
        embedding: vec
      })

      expect(mem.id).toMatch(/^mem_\d+/)
      expect(mem.content).toBe('用户养了一只英短蓝猫叫老王')

      const list = repo.listValidMemories()
      expect(list.length).toBe(1)
      expect(list[0].content).toBe('用户养了一只英短蓝猫叫老王')
      expect(list[0].sourceType).toBe('chat')
    })

    it('should perform vector similarity search and return closest match', () => {
      const vecTarget = makeVector(0.1)
      const vecFar = makeVector(0.9)

      repo.addMemory({
        content: '目标记忆：喜欢喝冷萃咖啡',
        embedding: vecTarget
      })
      repo.addMemory({
        content: '干扰记忆：明天下午三点开会',
        embedding: vecFar
      })

      // 检索与 vecTarget 一致的向量
      const results = repo.searchSimilarMemories(vecTarget, { limit: 2 })
      expect(results.length).toBe(2)
      expect(results[0].content).toBe('目标记忆：喜欢喝冷萃咖啡')
      expect(results[0].distance).toBeLessThan(results[1].distance)
    })

    it('should invalidate memory and exclude it from both search and list', () => {
      const vec = makeVector(0.5)
      const mem = repo.addMemory({
        content: '老王是大学同学',
        embedding: vec
      })

      // 初始能够搜索到
      const beforeResults = repo.searchSimilarMemories(vec, { limit: 1 })
      expect(beforeResults.length).toBe(1)

      // 纠偏失效
      const ok = repo.invalidateMemory(mem.id, 'conflict_detected')
      expect(ok).toBe(true)

      // 失效后列表不返回
      const listAfter = repo.listValidMemories()
      expect(listAfter.length).toBe(0)

      // 向量搜索不返回
      const searchAfter = repo.searchSimilarMemories(vec, { limit: 1 })
      expect(searchAfter.length).toBe(0)
    })

    it('should update memory content and update embedding', () => {
      const vec1 = makeVector(0.2)
      const mem = repo.addMemory({
        content: '打算去北京旅游',
        embedding: vec1
      })

      const vec2 = makeVector(0.8)
      const updated = repo.updateMemoryContent(mem.id, '改成去杭州旅游', vec2)
      expect(updated).toBe(true)

      const list = repo.listValidMemories()
      expect(list[0].content).toBe('改成去杭州旅游')

      // 使用新向量搜索能第一匹配
      const searchRes = repo.searchSimilarMemories(vec2, { limit: 1 })
      expect(searchRes[0].content).toBe('改成去杭州旅游')
    })
  })
})
