# 未完成工作代码骨架

> 本文档提供 TOP 5 架构缺口的具体实现骨架，可直接作为开发参考。

---

## Gap 1: QueryPlanner（核心缺口）

**文件**: `src/main/domain/inquiry/QueryPlanner.js`

```javascript
/**
 * QueryPlanner — 生成并验证 InquiryPlan
 * 支持 LLM 辅助生成 + allow-list 校验
 */

const ALLOWED_OPERATIONS = [
  'exact_query', 'semantic_search', 'aggregate', 'compare', 'timeline'
]

const ALLOWED_SCOPE_FIELDS = [
  'dateRange', 'projects', 'people', 'weekdays', 'recordIds', 'includeInferredMetadata'
]

export default class QueryPlanner {
  constructor({ llmClient }) {
    this.llm = llmClient
  }

  /**
   * 根据用户问题 + session state 生成 InquiryPlan
   */
  async generatePlan(question, sessionState = {}) {
    // 1. 尝试 LLM 生成
    if (this.llm) {
      try {
        const raw = await this._llmGenerate(question, sessionState)
        const validated = this.validate(raw)
        if (validated) return validated
      } catch (e) {
        console.warn('[QueryPlanner] LLM plan generation failed, falling back:', e.message)
      }
    }

    // 2. Fallback: 规则式 plan
    return this._ruleBasedPlan(question, sessionState)
  }

  /**
   * 校验 plan 结构合法性 + allow-list 过滤
   */
  validate(plan) {
    if (!plan || !Array.isArray(plan.operations)) return null

    const ops = plan.operations.filter(op => ALLOWED_OPERATIONS.includes(op.type))
    if (ops.length === 0) return null

    // scope 字段白名单
    const scope = this._sanitizeScope(plan.scope || {})

    return {
      normalizedQuestion: plan.normalizedQuestion || '',
      operations: ops.map((op, i) => ({
        id: op.id || `op_${i}`,
        type: op.type,
        input: op.input || {},
        dependsOn: Array.isArray(op.dependsOn) ? op.dependsOn : []
      })),
      scope,
      expectedOutput: plan.expectedOutput || 'mixed'
    }
  }

  /**
   * Follow-up scope 演化策略: reuse / narrow / extend / replace
   */
  evolveScope(previousScope, strategy, patch) {
    switch (strategy) {
      case 'narrow':    // 缩窄范围
        return { ...previousScope, ...patch }
      case 'extend':    // 扩展范围
        return { ...previousScope, ...patch }
      case 'replace':   // 完全替换
        return { ...patch }
      case 'reuse':     // 复用前一个
      default:
        return { ...previousScope }
    }
  }

  // ===================== 私有方法 =====================

  async _llmGenerate(question, sessionState) {
    const prompt = this._buildPlannerPrompt(question, sessionState)
    const response = await this.llm.invoke([
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ])
    return this._parseJSON(response)
  }

  _ruleBasedPlan(question, sessionState) {
    const q = question.toLowerCase()
    const ops = [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }]

    // 如果含比较意图 → 添加 compare
    if (q.includes('比较') || q.includes('对比') || q.includes('compared') || q.includes('vs')) {
      ops.push({ id: 'op_2', type: 'compare', input: {}, dependsOn: ['op_1'] })
    }
    // 如果含趋势/时间 → 添加 timeline
    else if (q.includes('趋势') || q.includes('变化') || q.includes('trend')) {
      ops.push({ id: 'op_2', type: 'timeline', input: {}, dependsOn: ['op_1'] })
    }
    // 默认 aggregate
    else {
      ops.push({ id: 'op_2', type: 'aggregate', input: {}, dependsOn: ['op_1'] })
    }

    // 如果含模糊概念 → 添加 semantic_search
    if (q.includes('心情') || q.includes('感觉') || q.includes('回忆') || q.includes('想起')) {
      ops.unshift({ id: 'op_0', type: 'semantic_search', input: { query: question }, dependsOn: [] })
    }

    return {
      normalizedQuestion: question,
      operations: ops,
      scope: sessionState?.scope || {},
      expectedOutput: 'mixed'
    }
  }

  _sanitizeScope(scope) {
    const clean = {}
    for (const key of ALLOWED_SCOPE_FIELDS) {
      if (scope[key] !== undefined) clean[key] = scope[key]
    }
    return clean
  }
}

const PLANNER_SYSTEM_PROMPT = `You are a query planner for a personal journal exploration system.
Output ONLY valid JSON in this exact format:
{
  "normalizedQuestion": "the rewritten question",
  "operations": [
    { "id": "op_1", "type": "exact_query", "input": {}, "dependsOn": [] },
    { "id": "op_2", "type": "aggregate", "input": {}, "dependsOn": ["op_1"] }
  ],
  "scope": {},
  "expectedOutput": "mixed"
}
Allowed operation types: exact_query, semantic_search, aggregate, compare, timeline.
Do NOT include any text outside the JSON.`
```

---

## Gap 2: LocalVectorSearchAdapter

**文件**: `src/main/infrastructure/retrieval/LocalVectorSearchAdapter.js`

```javascript
/**
 * LocalVectorSearchAdapter — 将现有 searchRecords.js 的 Max-Sim 多粒度切片
 * 向量搜索能力封装为 AnalysisService 的可插拔适配器
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default class LocalVectorSearchAdapter {
  constructor({ cacheDir } = {}) {
    this.cacheDir = cacheDir || path.join(__dirname, '..', '..', '.cache')
    this.cacheFile = path.join(this.cacheDir, 'vector_db_incremental.json')
    this.vectorDB = []
    this.embeddingModel = null
    this.CHUNKING_CONFIG = {
      microWindowSize: 150,
      microOverlap: 50,
      minChunkLength: 30,
    }
  }

  /**
   * 初始化 / 增量同步向量库
   */
  async sync(currentData) {
    let cacheStore = {}
    try {
      if (fs.existsSync(this.cacheFile)) {
        cacheStore = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'))
      }
    } catch { /* corrupted → fresh start */ }

    const newCacheStore = {}
    const runtimeVectorDB = []

    for (const item of currentData) {
      const itemId = item.id || item._id || `${item.occurredAt}_${item.project}`
      const currentHash = this._computeHash(item)

      if (cacheStore[itemId]?.hash === currentHash) {
        // 命中缓存
        cacheStore[itemId].chunks.forEach(chunk => {
          chunk.original = item
          runtimeVectorDB.push(chunk)
        })
        newCacheStore[itemId] = cacheStore[itemId]
      } else {
        // 重新生成
        const chunks = this._generateChunks(item, itemId)
        for (const chunk of chunks) {
          chunk.vector = await this._embed(chunk.text)
          runtimeVectorDB.push(chunk)
        }
        newCacheStore[itemId] = { hash: currentHash, chunks: chunks.map(c => ({ ...c, original: undefined })) }
      }
    }

    // 持久化
    this._persist(newCacheStore)
    this.vectorDB = runtimeVectorDB
    return runtimeVectorDB.length
  }

  /**
   * Max-Sim 语义搜索
   * 返回 EvidenceRef[]
   */
  async search(query, scope = {}, limit = 10) {
    if (this.vectorDB.length === 0) return []

    const queryVec = await this._embed(query)
    const similarities = this.vectorDB.map(chunk => ({
      chunk,
      similarity: this._cosineSimilarity(queryVec, chunk.vector)
    }))

    // Max-Sim 聚合（按 parentId）
    const recordScores = new Map()
    for (const { chunk, similarity } of similarities) {
      const existing = recordScores.get(chunk.parentId)
      if (!existing || similarity > existing.similarity) {
        recordScores.set(chunk.parentId, { parentId: chunk.parentId, similarity, original: chunk.original })
      }
    }

    // 排序 + Top-K
    return Array.from(recordScores.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .filter(r => r.similarity > 0.2)
      .map((r, idx) => ({
        id: `ev_sem_${r.parentId}_${idx}`,
        recordId: r.parentId,
        occurredAt: r.original?.occurredAt || r.original?.time,
        field: 'contentText',
        excerpt: this._makeExcerpt(r.original),
        relevance: r.similarity
      }))
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.vectorDB = []
    try { if (fs.existsSync(this.cacheFile)) fs.unlinkSync(this.cacheFile) } catch {}
  }

  // ===================== 私有方法 =====================

  async _embed(text) {
    if (!this.embeddingModel) await this._loadModel()
    if (!this.embeddingModel) return this._fallbackVector(text)
    try {
      const output = await this.embeddingModel(text, { pooling: 'mean', normalize: true })
      return Array.from(output.data)
    } catch { return this._fallbackVector(text) }
  }

  async _loadModel() {
    try {
      const { pipeline } = await import('@xenova/transformers')
      this.embeddingModel = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
    } catch { /* fallback available */ }
  }

  _fallbackVector(text) {
    return Array.from({ length: 384 }, (_, i) => Math.sin(i * text.length))
  }

  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i] }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
  }

  _generateChunks(item, parentId) {
    const chunks = []
    // Macro chunk (融合了 _ai_meta 字段)
    const macro = this._buildMacroText(item)
    if (macro) chunks.push({ id: `${parentId}_macro`, parentId, text: macro, type: 'macro', original: item })
    // Micro chunks (滑窗)
    const text = item.contentText || item._meta_plain_text || (item.ganshou || '').replace(/<[^>]+>/g, '')
    if (text && text.length >= this.CHUNKING_CONFIG.minChunkLength) {
      const step = this.CHUNKING_CONFIG.microWindowSize - this.CHUNKING_CONFIG.microOverlap
      for (let i = 0; i < text.length; i += step) {
        const c = text.substring(i, i + this.CHUNKING_CONFIG.microWindowSize)
        if (c.length >= this.CHUNKING_CONFIG.minChunkLength) {
          chunks.push({ id: `${parentId}_micro_${chunks.length}`, parentId, text: c, type: 'micro', original: item })
        }
      }
    }
    return chunks
  }

  _buildMacroText(item) {
    const ai = item._ai_meta || item.ai_meta
    if (!ai) return null
    const parts = []
    if (ai.summary) parts.push(ai.summary)
    if (Array.isArray(ai.mood_tags)) parts.push('情绪：' + ai.mood_tags.join('、'))
    if (Array.isArray(ai.topics)) parts.push('主题：' + ai.topics.join('、'))
    return parts.length > 0 ? parts.join('；') : null
  }

  _makeExcerpt(item) {
    const text = item?.contentText || item?._meta_plain_text || item?.ganshou || ''
    return text.length > 200 ? text.slice(0, 200) + '...' : text
  }

  _computeHash(item) {
    const content = JSON.stringify({ id: item.id || item._id, text: item.contentText || item.ganshou, ai: item._ai_meta })
    return crypto.createHash('md5').update(content).digest('hex')
  }

  _persist(store) {
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true })
    fs.writeFileSync(this.cacheFile, JSON.stringify(store), 'utf-8')
  }
}
```

---

## Gap 3: Zod Runtime Schemas

**文件**: `src/main/domain/contracts.js`（追加到现有文件末尾）

```javascript
/**
 * Zod Runtime Validators — 为所有 normative contracts 提供运行时校验
 */

let zod = null
try { zod = (await import('zod')).z } catch {
  console.warn('[Contracts] zod not installed, runtime validation disabled')
}

export const JournalRecordSchema = zod?.object({
  id: zod.string(),
  occurredAt: zod.string(),
  contentHtml: zod.string(),
  contentText: zod.string(),
  project: zod.string().optional(),
  durationMinutes: zod.number().optional(),
  experience: zod.string().optional(),
  moodColor: zod.string().optional(),
  achievement: zod.boolean().optional(),
  source: zod.enum(['local', 'import']).optional(),
  revision: zod.number().optional(),
})

export const EvidenceRefSchema = zod?.object({
  id: zod.string(),
  recordId: zod.string(),
  occurredAt: zod.string(),
  field: zod.string(),
  excerpt: zod.string(),
  relevance: zod.number().optional(),
})

export const ComputedMetricSchema = zod?.object({
  id: zod.string(),
  label: zod.string(),
  value: zod.union([zod.number(), zod.string(), zod.null()]),
  unit: zod.string().optional(),
  operation: zod.string(),
  sampleSize: zod.number(),
  recordIds: zod.array(zod.string()).optional(),
  cohortFingerprint: zod.string().optional(),
})

export const EvidencePackSchema = zod?.object({
  id: zod.string(),
  schemaVersion: zod.string(),
  question: zod.string(),
  scope: zod.record(zod.unknown()),
  evidence: zod.array(EvidenceRefSchema),
  metrics: zod.array(ComputedMetricSchema),
  comparisons: zod.array(zod.record(zod.unknown())),
  limitations: zod.array(zod.object({
    code: zod.string(),
    message: zod.string(),
    severity: zod.enum(['info', 'warning'])
  })),
  generatedAt: zod.string(),
})

/**
 * 运行时校验辅助函数
 */
export function safeParseEvidencePack(data) {
  if (!zod || !EvidencePackSchema) return { success: true, data, skipped: true }
  const result = EvidencePackSchema.safeParse(data)
  if (!result.success) {
    console.error('[Contracts] EvidencePack validation failed:', result.error.message)
    return { success: false, errors: result.error.issues }
  }
  return { success: true, data: result.data }
}

export function safeParseJournalRecord(data) {
  if (!zod || !JournalRecordSchema) return { success: true, data, skipped: true }
  const result = JournalRecordSchema.safeParse(data)
  if (!result.success) {
    console.error('[Contracts] JournalRecord validation failed:', result.error.message)
    return { success: false, errors: result.error.issues }
  }
  return { success: true, data: result.data }
}
```

---

## Gap 4: 新 IPC Handler（按 use case 拆分）

**文件**: `src/main/adapters/ipc/inquiryHandler.js`

```javascript
/**
 * inquiryHandler.js — 将 InquiryService IPC 从旧 agent 路径切换到新架构
 */

import { ipcMain } from 'electron'
import { getInquiryService } from '../../application/index.js'

/**
 * 注册 Inquiry 相关 IPC handlers
 */
export function registerInquiryHandlers() {
  const service = getInquiryService()

  // 新版 inquiry:start
  ipcMain.handle('inquiry:start', async (event, { question, scope }) => {
    try {
      return await service.start({ question, scope })
    } catch (error) {
      return { error: error.message }
    }
  })

  // 版 inquiry:followUp
  ipcMain.handle('inquiry:followUp', async (event, { sessionId, question, scopePatch }) => {
    try {
      return await service.followUp({ sessionId, question, scopePatch })
    } catch (error) {
      return { error: error.message }
    }
  })

  // inquiry:getSession
  ipcMain.handle('inquiry:getSession', async (event, sessionId) => {
    return await service.getSession(sessionId)
  })

  // inquiry:getEvidencePack
  ipcMain.handle('inquiry:getEvidencePack', async (event, packId) => {
    return await service.getEvidencePack(packId)
  })
}
```

**文件**: `src/main/adapters/ipc/journalHandler.js`

```javascript
/**
 * journalHandler.js — Journal CRUD IPC
 */

import { ipcMain } from 'electron'
import { getJournalService } from '../../application/index.js'

export function registerJournalHandlers() {
  const service = getJournalService()

  ipcMain.handle('journal:list', async (event, scope) => {
    return await service.listRecords(scope)
  })

  ipcMain.handle('journal:get', async (event, id) => {
    return await service.getRecord(id)
  })

  ipcMain.handle('journal:update', async (event, { id, patch }) => {
    return await service.updateRecord(id, patch)
  })

  ipcMain.handle('journal:upsert', async (event, records) => {
    return await service.importOrUpsertRecords(records)
  })
}
```

---

## Gap 5: 测试基础设施

**文件**: `vitest.config.js`

```javascript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.{js,ts}',
      '.mimocode/tools/**/*.test.{js,ts}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@domain': path.resolve(__dirname, 'src/main/domain'),
      '@application': path.resolve(__dirname, 'src/main/application'),
      '@infrastructure': path.resolve(__dirname, 'src/main/infrastructure'),
    },
  },
})
```

**package.json 追加 scripts**:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**测试 fixtures 文件**: `tests/fixtures/journal-records.js`

```javascript
/**
 * Sanitized fixtures for contract and analysis tests
 */

export const fixtureRecords = [
  {
    id: 'fixture-001',
    occurredAt: '2026-07-25T09:00:00',
    contentHtml: '<p>今天和妈妈一起吃了早饭，感觉很温暖。</p>',
    contentText: '今天和妈妈一起吃了早饭，感觉很温暖。',
    project: '家庭',
    durationMinutes: 90,
    experience: '温暖',
    moodColor: '#FFD700',
    achievement: true,
    source: 'local',
    revision: 1,
  },
  {
    id: 'fixture-002',
    occurredAt: '2026-07-24T14:30:00',
    contentHtml: '<p>项目会议很顺利，讨论了新功能开发。</p>',
    contentText: '项目会议很顺利，讨论了新功能开发。',
    project: '工作',
    durationMinutes: 120,
    experience: '顺利',
    moodColor: '#90EE90',
    achievement: false,
    source: 'local',
    revision: 1,
  },
  {
    id: 'fixture-003',
    occurredAt: '2026-07-23T20:00:00',
    contentHtml: '<p>有点焦虑，明天有重要汇报。</p>',
    contentText: '有点焦虑，明天有重要汇报。',
    project: '工作',
    durationMinutes: 30,
    experience: '焦虑',
    moodColor: '#87CEEB',
    achievement: false,
    source: 'local',
    revision: 1,
  },
]

export const fixtureScope = {
  dateRange: { start: '2026-07-20T00:00:00', end: '2026-07-26T23:59:59' },
}

export const fixtureEmptyScope = {}

export function makeOverlappingRecords(count = 50) {
  // 用于测试大量记录下的分页和搜索性能
  return Array.from({ length: count }, (_, i) => ({
    id: `bulk-${String(i).padStart(3, '0')}`,
    occurredAt: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00`,
    contentHtml: `<p>Bulk record ${i} content with some repetitive text for search testing.</p>`,
    contentText: `Bulk record ${i} content with some repetitive text for search testing.`,
    project: i % 2 === 0 ? '工作' : '生活',
    durationMinutes: 30 + (i % 120),
    experience: '常规',
    moodColor: '#FFFFFF',
    achievement: i % 3 === 0,
    source: 'local',
    revision: 1,
  }))
}
```

---

## 关键集成点：将 LocalVectorSearchAdapter 接入 AnalysisService

**修改文件**: `src/main/application/AnalysisService.js`

```javascript
// 在构造函数中添加 vectorSearchAdapter 的对接
constructor({ journalService, vectorSearchAdapter, alSqlAdapter }) {
  this.journalService = journalService
  this.vectorSearchAdapter = vectorSearchAdapter || null
  this.alSqlAdapter = alSqlAdapter || null
}

// 升级 semanticSearch 方法 - 优先使用向量适配器
async semanticSearch(query, scope = {}, limit = 10) {
  // 1. 尝试向量搜索
  if (this.vectorSearchAdapter) {
    try {
      const records = await this.journalService.listRecords(scope)
      await this.vectorSearchAdapter.sync(records)
      return await this.vectorSearchAdapter.search(query, scope, limit)
    } catch (e) {
      console.warn('[AnalysisService] Vector search failed, falling back:', e.message)
    }
  }

  // 2. Fallback: 关键词匹配 (保留现有逻辑)
  return this._keywordFallback(query, scope, limit)
}
```

---

## 关键集成点：QueryPlanner 接入 InquiryService

**修改文件**: `src/main/application/InquiryService.js`

```javascript
importQueryPlanner from '../domain/inquiry/QueryPlanner.js'

// 在构造函数中
constructor({ journalService, analysisService, llmClient }) {
  this.journalService = journalService
  this.analysisService = analysisService
  this.sessionStore = new InquirySessionStore()
  this.composer = new AnswerComposer()
  this.queryPlanner = new QueryPlanner({ llmClient })  // ← 新增
  this.evidencePacks = new Map()
  this.modelCallReceipts = []  // ← 新增
}

// 升级 start 方法
async start({ question, scope = {} }) {
  const session = this.sessionStore.createSession(question, scope)

  // 使用 QueryPlanner 生成 plan
  const plan = await this.queryPlanner.generatePlan(question, session)
  this._recordModelCall('planning', question)

  const evidencePack = await this.analysisService.execute(plan)
  this.evidencePacks.set(evidencePack.id, evidencePack)
  this.sessionStore.addEvidencePack(session.id, evidencePack.id)

  const result = this.composer.compose({ evidencePack, session })
  return result
}

// 升级 followUp 方法 - 智能 scope 演化
async followUp({ sessionId, question, scopePatch = {} }) {
  const session = this.sessionStore.getSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  // 确定 scope 演化策略
  const strategy = this._detectScopeStrategy(question, scopePatch)
  const evolvedScope = this.queryPlanner.evolveScope(session.scope, strategy, scopePatch)
  this.sessionStore.updateSession(sessionId, question, evolvedScope)

  const plan = await this.queryPlanner.generatePlan(question, { ...session, scope: evolvedScope })
  this._recordModelCall('planning', question)

  const evidencePack = await this.analysisService.execute(plan)
  this.evidencePacks.set(evidencePack.id, evidencePack)
  this.sessionStore.addEvidencePack(session.id, evidencePack.id)

  const result = this.composer.compose({ evidencePack, session: { ...session, scope: evolvedScope } })
  return result
}

_detectScopeStrategy(question, patch) {
  const q = question.toLowerCase()
  if (q.includes('只') || q.includes('仅') || q.includes('only')) return 'narrow'
  if (q.includes('换成') || q.includes('改') || q.includes('instead')) return 'replace'
  if (q.includes('扩大') || q.includes('更多') || q.includes('expand')) return 'extend'
  if (Object.keys(patch).length > 0) return 'narrow'
  return 'reuse'
}

_recordModelCall(purpose, question) {
  this.modelCallReceipts.push({
    id: `receipt_${Date.now()}_${this.modelCallReceipts.length}`,
    provider: 'unknown',
    model: 'unknown',
    purpose,
    recordIds: [],
    contentScope: 'metadata',
    requestedAt: new Date().toISOString(),
    success: true,
    query: question.substring(0, 100)
  })
}
```

---

> 文档版本：v1.0  
> 最后更新：2026-08-17
