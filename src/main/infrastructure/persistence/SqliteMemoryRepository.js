/**
 * SqliteMemoryRepository - 基于 SQLite 与 sqlite-vec 的记忆持久化与检索仓储
 * 
 * 职责：
 * 1. 结构化用户画像 (KV) 维护，完全兼容旧版 CoreMemoryManager 接口
 * 2. 向量情节事实 (Episodic Memory) 的追加式写入、失效标记与时序演进
 * 3. 动态加载与利用 sqlite-vec 进行毫秒级硬件加速向量检索
 * 4. 自动从遗留 core-memory.json 进行零摩擦数据平滑迁移
 */

import fs from 'node:fs'
import path from 'node:path'
import { getDatabaseManager } from '../db/DatabaseManager.js'

export const DEFAULT_PROFILE = {
  user_profile: '性格偏向 INFP，注重反思与自我探索，富有同理心，表达偏真诚温和。',
  key_entities: '重要人际：导师（张教授/张老师）、师兄（李雷）；重要活动与项目：高校科研课题/毕业论文。',
  current_focus: '近期正专注于毕业科研攻坚、论文撰写，关注工作节奏与身心能量平衡。',
  preferences: '偏好结论先行、富有人文温度与模式识别洞察的分析，拒绝空洞说教。',
  user: '性格偏向 INFP，注重反思与自我探索，富有同理心，表达偏真诚温和。',
  agent: '偏好结论先行、富有人文温度与模式识别洞察的分析，拒绝空洞说教。'
}

export const VALID_PROFILE_SECTIONS = [
  'user_profile',
  'key_entities',
  'current_focus',
  'preferences',
  'user',
  'agent'
]

export class SqliteMemoryRepository {
  /**
   * @param {Object} options
   * @param {DatabaseManager} [options.dbManager]
   * @param {string} [options.legacyJsonPath] - 旧版 core-memory.json 路径用于自动数据迁移
   */
  constructor({ dbManager = null, legacyJsonPath = null } = {}) {
    this.dbManager = dbManager || getDatabaseManager()
    this.legacyJsonPath = legacyJsonPath
    this._migrated = false

    this._ensureProfileInitialized()
  }

  // ===================== 1. 结构化画像 KV 管理 =====================

  _ensureProfileInitialized() {
    try {
      const countRes = this.dbManager.prepare('SELECT count(*) as count FROM user_profile').get()
      if (countRes && countRes.count > 0) {
        return
      }

      // 尝试从 legacyJsonPath 迁移旧数据
      if (this.legacyJsonPath && fs.existsSync(this.legacyJsonPath)) {
        try {
          const raw = fs.readFileSync(this.legacyJsonPath, 'utf-8')
          if (raw && raw.trim()) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              this._importProfile(parsed)
              this._migrated = true
              console.log('[SqliteMemoryRepository] Successfully migrated profile from legacy JSON')
              return
            }
          }
        } catch (migErr) {
          console.warn('[SqliteMemoryRepository] Failed to parse legacy core-memory.json:', migErr.message)
        }
      }

      // 导入默认初始画像
      this._importProfile(DEFAULT_PROFILE)
    } catch (e) {
      console.error('[SqliteMemoryRepository] Error ensuring profile initialized:', e)
    }
  }

  _importProfile(data) {
    const now = Date.now()
    const normalized = { ...data }
    if (normalized.user_profile && !normalized.user) normalized.user = normalized.user_profile
    if (normalized.user && !normalized.user_profile) normalized.user_profile = normalized.user
    if (normalized.preferences && !normalized.agent) normalized.agent = normalized.preferences
    if (normalized.agent && !normalized.preferences) normalized.preferences = normalized.agent

    const stmt = this.dbManager.prepare(`
      INSERT OR REPLACE INTO user_profile(key, value, category, updated_at)
      VALUES (?, ?, ?, ?)
    `)

    this.dbManager.transaction(() => {
      for (const [key, val] of Object.entries(normalized)) {
        if (VALID_PROFILE_SECTIONS.includes(key)) {
          stmt.run(key, String(val || ''), 'profile', now)
        }
      }
    })
  }

  getProfile() {
    try {
      const rows = this.dbManager.prepare('SELECT key, value FROM user_profile').all()
      const profile = { ...DEFAULT_PROFILE }

      for (const row of rows) {
        profile[row.key] = row.value
      }

      // 维护双向别名映射
      const hasUserProfile = rows.some(r => r.key === 'user_profile')
      const hasUser = rows.some(r => r.key === 'user')
      if (hasUserProfile && !hasUser) {
        profile.user = profile.user_profile
      } else if (hasUser && !hasUserProfile) {
        profile.user_profile = profile.user
      }

      const hasPreferences = rows.some(r => r.key === 'preferences')
      const hasAgent = rows.some(r => r.key === 'agent')
      if (hasPreferences && !hasAgent) {
        profile.agent = profile.preferences
      } else if (hasAgent && !hasPreferences) {
        profile.preferences = profile.agent
      }

      return {
        ...profile,
        user_profile: profile.user_profile,
        user: profile.user,
        preferences: profile.preferences,
        agent: profile.agent
      }
    } catch (e) {
      console.error('[SqliteMemoryRepository] getProfile error:', e)
      return { ...DEFAULT_PROFILE }
    }
  }

  updateProfile(section, content) {
    if (!VALID_PROFILE_SECTIONS.includes(section)) {
      return false
    }

    const trimmed = String(content || '').trim()
    const now = Date.now()

    const stmt = this.dbManager.prepare(`
      INSERT INTO user_profile(key, value, category, updated_at)
      VALUES(?, ?, 'profile', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)

    this.dbManager.transaction(() => {
      stmt.run(section, trimmed, now)

      // 双向同步别名映射
      if (section === 'user') {
        stmt.run('user_profile', trimmed, now)
      } else if (section === 'user_profile') {
        stmt.run('user', trimmed, now)
      } else if (section === 'agent') {
        stmt.run('preferences', trimmed, now)
      } else if (section === 'preferences') {
        stmt.run('agent', trimmed, now)
      }
    })

    return true
  }

  /**
   * 渲染用于 System Prompt 注入的格式化提示词
   */
  getPromptBlock() {
    const profile = this.getProfile()
    const lines = []
    if (profile.user_profile) lines.push(`- 用户画像 (user_profile)：${profile.user_profile}`)
    if (profile.key_entities) lines.push(`- 人际网络与重点项目 (key_entities)：${profile.key_entities}`)
    if (profile.current_focus) lines.push(`- 当前重心与焦点 (current_focus)：${profile.current_focus}`)
    if (profile.preferences) lines.push(`- 偏好设定与助手准则 (preferences)：${profile.preferences}`)

    return `
<core_memory>
【用户长期记忆与常驻画像 (Core Memory)】
${lines.join('\n')}
(说明：此为用户的长期记忆外挂。若在对话中感知到用户生活、项目或偏好发生新变化，可适时调用 update_core_memory 工具更新此画像)
</core_memory>
`.trim()
  }

  // ===================== 2. 向量情节记忆管理 (Episodic) =====================

  /**
   * 追加写入一条情节事实
   * @param {Object} memory
   * @param {string} memory.content - 事实文本
   * @param {string} [memory.sourceType='chat'] - 'chat' | 'diary' | 'manual'
   * @param {string} [memory.sourceId=null] - 关联的 session_id 或 journal_id
   * @param {string} [memory.category='fact'] - 'fact' | 'habit' | 'preference'
   * @param {number[]|Float32Array} [memory.embedding=null] - 384维向量
   * @param {number} [memory.confidence=1.0] - 置信度
   * @returns {Object} 插入成功的记录
   */
  addMemory({
    content,
    sourceType = 'chat',
    sourceId = null,
    category = 'fact',
    embedding = null,
    confidence = 1.0
  }) {
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error('[SqliteMemoryRepository] Memory content cannot be empty')
    }

    const now = Date.now()
    const id = `mem_${now}_${Math.random().toString(36).slice(2, 7)}`
    const trimmed = content.trim()

    const insertMem = this.dbManager.prepare(`
      INSERT INTO episodic_memories(
        id, content, source_type, source_id, category, confidence, is_valid, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)

    this.dbManager.transaction(() => {
      insertMem.run(id, trimmed, sourceType, sourceId, category, confidence, now, now)

      // 写入向量虚表
      if (embedding && this.dbManager.hasVecExtension) {
        const floatArray = embedding instanceof Float32Array ? embedding : new Float32Array(embedding)
        const insertVec = this.dbManager.prepare(`
          INSERT INTO vec_memories(memory_id, embedding) VALUES(?, ?)
        `)
        insertVec.run(id, floatArray)
      }
    })

    return {
      id,
      content: trimmed,
      sourceType,
      sourceId,
      category,
      confidence,
      isValid: 1,
      createdAt: now
    }
  }

  /**
   * 基于向量相似度进行 Top-K 检索
   * @param {number[]|Float32Array} queryEmbedding
   * @param {Object} [options]
   * @param {number} [options.limit=3]
   * @param {string} [options.sourceType='chat']
   * @param {number} [options.maxDistance=null] - 距离上限过滤
   * @returns {Array<Object>}
   */
  searchSimilarMemories(queryEmbedding, { limit = 3, sourceType = 'chat', maxDistance = null } = {}) {
    if (!queryEmbedding || !this.dbManager.hasVecExtension) {
      return []
    }

    try {
      const floatArray = queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding)
      // vec0 子查询需要 LIMIT 参数以保证 KNN 约束
      const candidateK = Math.max(limit * 3, 10)

      let sql = `
        SELECT 
          m.id, 
          m.content, 
          m.source_type as sourceType, 
          m.source_id as sourceId, 
          m.category, 
          m.confidence, 
          m.created_at as createdAt,
          v.distance
        FROM (
          SELECT memory_id, distance
          FROM vec_memories
          WHERE embedding MATCH ?
          ORDER BY distance ASC
          LIMIT ?
        ) v
        JOIN episodic_memories m ON m.id = v.memory_id
        WHERE m.is_valid = 1
      `
      const params = [floatArray, candidateK]

      if (sourceType) {
        sql += ` AND m.source_type = ?`
        params.push(sourceType)
      }

      sql += ` ORDER BY v.distance ASC LIMIT ?`
      params.push(limit)

      const rows = this.dbManager.prepare(sql).all(...params)

      return rows
        .filter(r => (maxDistance === null || r.distance <= maxDistance))
        .map(r => ({
          ...r,
          similarity: Math.max(0, Math.min(1, 1 / (1 + r.distance)))
        }))
    } catch (e) {
      console.error('[SqliteMemoryRepository] searchSimilarMemories failed:', e)
      return []
    }
  }

  /**
   * 标记记忆失效 (逻辑删除 / 纠偏阻断)
   * @param {string} memoryId
   * @param {string} [reason='user_deleted']
   * @returns {boolean}
   */
  invalidateMemory(memoryId, reason = 'user_deleted') {
    if (!memoryId) return false

    const now = Date.now()
    const updateStmt = this.dbManager.prepare(`
      UPDATE episodic_memories
      SET is_valid = 0, invalidated_reason = ?, updated_at = ?
      WHERE id = ? AND is_valid = 1
    `)

    let changed = 0
    this.dbManager.transaction(() => {
      const info = updateStmt.run(reason, now, memoryId)
      changed = info.changes

      // 同步从向量索引中移除，避免任何无效距离计算
      if (this.dbManager.hasVecExtension) {
        try {
          this.dbManager.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(memoryId)
        } catch {}
      }
    })

    return changed > 0
  }

  /**
   * 获取所有有效记忆列表 (供前端认知画布卡片渲染)
   * @param {Object} [options]
   * @param {number} [options.limit=100]
   * @param {string} [options.sourceType=null]
   * @returns {Array<Object>}
   */
  listValidMemories({ limit = 100, sourceType = null } = {}) {
    try {
      let sql = `
        SELECT 
          id, content, source_type as sourceType, source_id as sourceId, 
          category, confidence, created_at as createdAt, updated_at as updatedAt
        FROM episodic_memories
        WHERE is_valid = 1
      `
      const params = []

      if (sourceType) {
        sql += ` AND source_type = ?`
        params.push(sourceType)
      }

      sql += ` ORDER BY created_at DESC LIMIT ?`
      params.push(limit)

      return this.dbManager.prepare(sql).all(...params)
    } catch (e) {
      console.error('[SqliteMemoryRepository] listValidMemories failed:', e)
      return []
    }
  }

  /**
   * 手动就地更新记忆文本 (支持前端编辑后重新向量化)
   * @param {string} memoryId
   * @param {string} newContent
   * @param {number[]|Float32Array} [newEmbedding=null]
   * @returns {boolean}
   */
  updateMemoryContent(memoryId, newContent, newEmbedding = null) {
    if (!memoryId || !newContent || !newContent.trim()) return false

    const trimmed = newContent.trim()
    const now = Date.now()

    let changed = 0
    this.dbManager.transaction(() => {
      const info = this.dbManager.prepare(`
        UPDATE episodic_memories
        SET content = ?, updated_at = ?
        WHERE id = ? AND is_valid = 1
      `).run(trimmed, now, memoryId)
      changed = info.changes

      if (newEmbedding && this.dbManager.hasVecExtension) {
        const floatArray = newEmbedding instanceof Float32Array ? newEmbedding : new Float32Array(newEmbedding)
        // 虚拟表不支持 ON CONFLICT DO UPDATE，因此先 DELETE 后 INSERT
        this.dbManager.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(memoryId)
        this.dbManager.prepare('INSERT INTO vec_memories(memory_id, embedding) VALUES(?, ?)').run(memoryId, floatArray)
      }
    })

    return changed > 0
  }
}
