/**
 * BackgroundMemoryReflector - 闲时自进化增量提炼器
 * 
 * 职责：
 * 1. 监听用户与智能体的对话流，通过防抖计时器 (Debounce Timer) 捕获闲时缝隙
 * 2. 达到闲置阈值（默认 3 分钟）或累积 6 轮对话时自动触发提炼流水线
 * 3. 驱动大语言模型按照严格 JSON Schema 格式萃取新事实 (ADD) 或纠偏失效冲突 (UPDATE_CONFLICT)
 * 4. 自动调用本地 BGE 向量生成模块写入 SqliteMemoryRepository
 * 5. 通过事件总线向 Electron 渲染进程广播状态，并支持 before-quit 优雅安全落盘
 */

import { SqliteMemoryRepository } from '../../infrastructure/persistence/SqliteMemoryRepository.js'

let reflectorInstance = null

export class BackgroundMemoryReflector {
  /**
   * @param {Object} options
   * @param {SqliteMemoryRepository} [options.memoryRepo]
   * @param {Function} [options.llmCaller] - 自定义 LLM 调用器 (供测试或指定模型)
   * @param {Function} [options.embedder] - 向量生成器 (text => Float32Array)
   * @param {number} [options.idleTimeoutMs=180000] - 闲时超时时间（默认 3 分钟）
   * @param {number} [options.maxTurns=6] - 累积触发轮次上限
   */
  constructor({
    memoryRepo = null,
    llmCaller = null,
    embedder = null,
    idleTimeoutMs = 180000,
    maxTurns = 6
  } = {}) {
    this.memoryRepo = memoryRepo || new SqliteMemoryRepository()
    this.llmCaller = llmCaller
    this.embedder = embedder
    this.idleTimeoutMs = idleTimeoutMs
    this.maxTurns = maxTurns

    // 会话临时暂存缓冲区: sessionId -> Array<{ userQuery, assistantResponse, timestamp }>
    this.turnBuffers = new Map()
    // 防抖计时器: sessionId -> Timeout
    this.timers = new Map()
    // 事件监听器列表
    this.listeners = new Set()

    this._embeddingPipeline = null
  }

  /**
   * 注册一轮新对话对并重置闲时计时器
   * @param {string} sessionId
   * @param {string} userQuery
   * @param {string} assistantResponse
   */
  recordTurn(sessionId, userQuery, assistantResponse) {
    if (!sessionId || !userQuery) return

    if (!this.turnBuffers.has(sessionId)) {
      this.turnBuffers.set(sessionId, [])
    }
    const buffer = this.turnBuffers.get(sessionId)
    buffer.push({
      userQuery: String(userQuery).trim(),
      assistantResponse: String(assistantResponse || '').trim(),
      timestamp: Date.now()
    })

    // 清除既有防抖计时器
    if (this.timers.has(sessionId)) {
      clearTimeout(this.timers.get(sessionId))
    }

    // 检查是否达到轮次硬上限
    if (buffer.length >= this.maxTurns) {
      console.log(`[MemoryReflector] Buffer reached ${buffer.length} turns, triggering immediate reflection for session:`, sessionId)
      this.reflectSession(sessionId)
      return
    }

    // 设置闲时防抖触发
    const timer = setTimeout(() => {
      console.log(`[MemoryReflector] Idle threshold reached (${this.idleTimeoutMs}ms), reflecting session:`, sessionId)
      this.reflectSession(sessionId)
    }, this.idleTimeoutMs)

    this.timers.set(sessionId, timer)
  }

  /**
   * 执行指定会话的记忆提炼
   * @param {string} sessionId
   * @returns {Promise<Array<Object>>} 生成并入库的有效事实条目
   */
  async reflectSession(sessionId) {
    if (this.timers.has(sessionId)) {
      clearTimeout(this.timers.get(sessionId))
      this.timers.delete(sessionId)
    }

    const buffer = this.turnBuffers.get(sessionId) || []
    if (buffer.length === 0) return []

    // 取出并清空当前缓冲区
    const turnsToProcess = [...buffer]
    this.turnBuffers.set(sessionId, [])

    try {
      const dialogueText = turnsToProcess.map((t, idx) => 
        `[轮次 ${idx + 1}]\n用户：${t.userQuery}\n小鸡助手：${t.assistantResponse}`
      ).join('\n\n')

      const profile = this.memoryRepo.getProfile()
      const existingMemories = this.memoryRepo.listValidMemories({ limit: 10 })

      const prompt = this._buildReflectionPrompt(dialogueText, profile, existingMemories)
      const rawDecisions = await this._callLLM(prompt)

      const appliedMemories = []
      for (const item of rawDecisions) {
        if (!item || !item.action || item.action === 'NOOP') continue

        const fact = String(item.fact || item.content || '').trim()
        if (!fact) continue

        const embedding = await this._computeEmbedding(fact)

        if (item.action === 'UPDATE_CONFLICT') {
          // 冲突消解：查找高相似旧记忆并置为失效
          const conflictKeyword = item.conflict_with || fact
          const conflictVec = await this._computeEmbedding(conflictKeyword)
          const similar = this.memoryRepo.searchSimilarMemories(conflictVec, { limit: 2 })
          if (similar && similar.length > 0) {
            for (const oldMem of similar) {
              this.memoryRepo.invalidateMemory(oldMem.id, `conflict_updated: ${fact}`)
              console.log(`[MemoryReflector] Invalidated conflicting memory ${oldMem.id}: "${oldMem.content}"`)
            }
          }
        }

        // 追加式写入新事实
        const added = this.memoryRepo.addMemory({
          content: fact,
          sourceType: 'chat',
          sourceId: sessionId,
          category: item.category || 'fact',
          embedding,
          confidence: item.confidence || 0.95
        })

        appliedMemories.push(added)
        this._notifyEvolved({ action: item.action, memory: added })
      }

      console.log(`[MemoryReflector] Reflection finished for ${sessionId}, stored ${appliedMemories.length} facts.`)
      return appliedMemories
    } catch (err) {
      console.error(`[MemoryReflector] Reflection failed for session ${sessionId}:`, err)
      // 若出错，将未完成轮次放回暂存
      const current = this.turnBuffers.get(sessionId) || []
      this.turnBuffers.set(sessionId, [...turnsToProcess, ...current])
      return []
    }
  }

  _buildReflectionPrompt(dialogueText, profile, existingMemories) {
    const memoryLines = existingMemories.map(m => `- [id:${m.id}] ${m.content}`).join('\n') || '(暂无)'

    return `你是一个私人智能体助手的“记忆与认知中枢”。请审视用户与小鸡助手的最新对话，识别是否有值得沉淀的长期个人生活事实、偏好习惯变化，或者用户对旧认知的反驳纠正。

【已知常驻画像】
${profile.user_profile || '无'}
${profile.preferences || '无'}

【已存部分情节事实】
${memoryLines}

【最新对话记录】
${dialogueText}

【提取规则】
1. 绝对不要记录单次即时问候、临时天气查询或无关闲聊琐事。
2. 只记录具有长期价值的事实（例如：家庭成员、宠物、饮食偏好、近期关键目标、重要日程安排）。
3. 如果用户纠正了小鸡以前的错误事实（例如：“老王不是人，是我的猫”），Action 必须为 "UPDATE_CONFLICT"，并在 "conflict_with" 标明被纠正的旧事实。
4. 必须输出严格 JSON 数组格式，禁止输出任何思考过程或 Markdown 代码块：
[
  {
    "action": "ADD" | "UPDATE_CONFLICT" | "NOOP",
    "fact": "精炼陈述的事实句子",
    "category": "fact" | "habit" | "preference" | "relation",
    "conflict_with": "若为纠偏，填写冲突的旧事实或关键词"
  }
]`
  }

  async _callLLM(prompt) {
    if (typeof this.llmCaller === 'function') {
      const res = await this.llmCaller(prompt)
      return this._parseDecisions(res)
    }

    try {
      // 默认尝试导入内部 directOpenAI
      const { callOpenAIAPI } = await import('../../llm/directOpenAI.js')
      const apiRes = await callOpenAIAPI({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
      return this._parseDecisions(apiRes?.content || '')
    } catch (e) {
      console.warn('[MemoryReflector] Default LLM call failed:', e.message)
      return []
    }
  }

  _parseDecisions(rawText) {
    if (!rawText) return []
    try {
      let cleaned = String(rawText).trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      }
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) return parsed
      if (parsed && Array.isArray(parsed.decisions)) return parsed.decisions
      return []
    } catch (e) {
      console.warn('[MemoryReflector] Failed to parse JSON decisions from LLM output:', rawText)
      return []
    }
  }

  async _computeEmbedding(text) {
    if (typeof this.embedder === 'function') {
      return await this.embedder(text)
    }

    // 默认加载本地量化版 BGE 模型
    try {
      if (!this._embeddingPipeline) {
        const { pipeline, env } = await import('@xenova/transformers')
        env.allowRemoteModels = false
        const fs = await import('node:fs')
        const path = await import('node:path')
        const candidates = [
          process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'models') : null,
          process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'models') : null,
          path.join(process.cwd(), 'resources', 'models'),
          path.join(__dirname, '..', '..', '..', '..', 'resources', 'models')
        ].filter(Boolean)
        let modelsDir = path.join(process.cwd(), 'resources', 'models')
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            modelsDir = c
            break
          }
        }
        env.localModelPath = modelsDir
        try {
          this._embeddingPipeline = await pipeline('feature-extraction', 'bge-small-zh-v1.5', { quantized: true })
        } catch {
          this._embeddingPipeline = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5')
        }
      }
      const output = await this._embeddingPipeline(text, { pooling: 'mean', normalize: true })
      return new Float32Array(output.data)
    } catch {
      // 优雅回退：确定性 Hash 向量
      const fallback = new Float32Array(384)
      for (let i = 0; i < 384; i++) {
        fallback[i] = Math.sin((i + 1) * text.length)
      }
      return fallback
    }
  }

  /**
   * 注册记忆演进事件监听器
   */
  onMemoryEvolved(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback)
    }
  }

  _notifyEvolved(payload) {
    for (const cb of this.listeners) {
      try {
        cb(payload)
      } catch {}
    }
  }

  /**
   * 优雅退出：立即持久化所有待处理的会话暂存
   */
  async flushPending() {
    console.log('[MemoryReflector] Flushing all pending reflection buffers...')
    const sessionIds = Array.from(this.turnBuffers.keys())
    for (const sid of sessionIds) {
      if ((this.turnBuffers.get(sid) || []).length > 0) {
        await this.reflectSession(sid)
      }
    }
  }
}

export function getBackgroundMemoryReflector(options = {}) {
  if (!reflectorInstance) {
    reflectorInstance = new BackgroundMemoryReflector(options)
  }
  return reflectorInstance
}
