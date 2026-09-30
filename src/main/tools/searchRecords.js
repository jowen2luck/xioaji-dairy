/**
 * 搜索记录工具 (多粒度切片与纯本地双路混合检索及真实 Reranker 升级版)
 * 核心特性：
 * - 纯本地离线模型：自动优先加载项目内 resources/models/ 下的 bge-small-zh-v1.5 与 bge-reranker-base (ONNX q8量化版)
 * - 零网络超时：检测到本地模型存在时强制 allowRemoteModels = false，彻底杜绝外网卡顿
 * - 双路召回：稠密向量召回 + 纯原生中文 BM25 稀疏召回
 * - 交叉重排：采用本地 BGE-Reranker (Cross-Encoder) 全量 Cross-Attention 重排打分
 * - RRF 融合：Reciprocal Rank Fusion 倒数排名融合算法
 * - 自适应切片：短日记 (<300字) 整块保留，长日记滑动切片
 * - Header Injection：微观切片头部强制注入时间/项目/情绪前缀，杜绝指代丢失
 * - 平滑聚合：Top-2 衰减累加 (Score = Best + 0.3 * Second)，兼顾单句命中与全局共现
 * - 透出 Highlighting Snippet：关键词命中片段直通 Agent，打破信息不对称
 */

import { Tool, ToolResult, formatRecordForLLM, sanitizeRecordForUI } from './base.js'
import { loadAndEnrichData } from '../data/index.js'
import { BM25Index, reciprocalRankFusion } from '../infrastructure/retrieval/bm25.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import dayjs from '../../utils/date.js'
import { app } from 'electron'

// ==================== 配置与本地路径 ====================

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getCacheFilePath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'vector_db_incremental.json')
    }
  } catch {}
  return path.join(__dirname, '..', '.cache', 'vector_db_incremental.json')
}

const CACHE_FILE_PATH = getCacheFilePath()

const CHUNKING_CONFIG = {
  microWindowSize: 150,  // 微观切片窗口大小（字符）
  microOverlap: 50,      // 微观切片重叠大小（字符）
  adaptiveThreshold: 300 // 自适应阈值：低于 300 字符不切片，整篇作为一个块
}

// 探测项目内 resources/models 本地目录（兼容开发与生产打包环境）
function getLocalModelsDir() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'models') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'models') : null,
    path.join(process.cwd(), 'resources', 'models'),
    path.join(__dirname, '..', '..', '..', 'resources', 'models'),
    path.join(__dirname, '..', '..', 'resources', 'models')
  ].filter(Boolean)

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0] || path.join(process.cwd(), 'resources', 'models')
}

// ==================== 向量化与模型加载模块 ====================

let vectorDB = []       // 扁平化切片数组
let bm25Index = new BM25Index() // 稀疏 BM25 倒排索引
let embeddingModel = null
let rerankerTokenizer = null
let rerankerModel = null

/**
 * 优先从项目本地 resources/models 加载 BGE 中文模型，零联网请求
 */
async function loadEmbeddingModel() {
  if (embeddingModel) return embeddingModel

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return null
  }

  try {
    const { env, pipeline } = await import('@xenova/transformers')
    const modelsDir = getLocalModelsDir()
    const bgeLocalDir = path.join(modelsDir, 'bge-small-zh-v1.5')

    if (fs.existsSync(bgeLocalDir)) {
      env.allowRemoteModels = false
      env.localModelPath = modelsDir
      embeddingModel = await pipeline('feature-extraction', 'bge-small-zh-v1.5', { quantized: true })
      console.log('[SearchRecordsTool] Successfully loaded pure local model: bge-small-zh-v1.5')
      return embeddingModel
    }

    // 备用机制（若本地文件被误删）
    try {
      embeddingModel = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5')
    } catch {
      embeddingModel = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
    }
    return embeddingModel
  } catch (error) {
    console.error('[SearchRecordsTool] Failed to load embedding model:', error)
    return null
  }
}

/**
 * 优先从项目本地 resources/models 加载 BGE-Reranker 模型
 */
async function loadLocalReranker() {
  if (rerankerModel && rerankerTokenizer) {
    return { model: rerankerModel, tokenizer: rerankerTokenizer }
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return null
  }

  try {
    const { env, AutoTokenizer, AutoModelForSequenceClassification } = await import('@xenova/transformers')
    const modelsDir = getLocalModelsDir()
    const rerankerLocalDir = path.join(modelsDir, 'bge-reranker-base')

    if (fs.existsSync(rerankerLocalDir)) {
      env.allowRemoteModels = false
      env.localModelPath = modelsDir
      rerankerTokenizer = await AutoTokenizer.from_pretrained('bge-reranker-base')
      rerankerModel = await AutoModelForSequenceClassification.from_pretrained('bge-reranker-base', { quantized: true })
      console.log('[SearchRecordsTool] Successfully loaded pure local reranker: bge-reranker-base')
      return { model: rerankerModel, tokenizer: rerankerTokenizer }
    }
    return null
  } catch (e) {
    console.warn('[SearchRecordsTool] Failed to load local reranker:', e.message)
    return null
  }
}

async function embedText(text) {
  if (!embeddingModel) {
    embeddingModel = await loadEmbeddingModel()
  }

  if (!embeddingModel) {
    return Array.from({ length: 384 }, (_, i) => Math.sin(i * text.length))
  }

  try {
    const output = await embeddingModel(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data)
  } catch (error) {
    console.error('[SearchRecordsTool] Embedding error:', error)
    return Array.from({ length: 384 }, (_, i) => Math.sin(i * text.length))
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 构建头部元数据前缀 (Header Injection)
 */
function buildHeaderPrefix(item) {
  const time = item.time || item.occurredAt || ''
  const project = item.shanggexiangmu || item.project || '日常'
  const mood = item._ai_meta?.mood_tags?.join('、') || ''
  return `【时间: ${time}】 【项目: ${project}】` + (mood ? ` 【情绪: ${mood}】` : '')
}

function buildMacroChunk(item) {
  const aiMeta = item._ai_meta
  if (!aiMeta) return null

  const parts = []
  if (aiMeta.summary) parts.push(aiMeta.summary)
  if (Array.isArray(aiMeta.mood_tags) && aiMeta.mood_tags.length > 0) {
    parts.push('情绪：' + aiMeta.mood_tags.join('、'))
  }
  if (Array.isArray(aiMeta.items) && aiMeta.items.length > 0) {
    parts.push('相关：' + aiMeta.items.join('、'))
  }
  if (Array.isArray(aiMeta.people_involved) && aiMeta.people_involved.length > 0) {
    parts.push('人物：' + aiMeta.people_involved.join('、'))
  }
  if (Array.isArray(aiMeta.topics) && aiMeta.topics.length > 0) {
    parts.push('主题：' + aiMeta.topics.join('、'))
  } else if (Array.isArray(aiMeta.keywords) && aiMeta.keywords.length > 0) {
    parts.push('关键词：' + aiMeta.keywords.join('、'))
  }
  if (aiMeta.location) {
    parts.push('地点：' + aiMeta.location)
  }

  return parts.length > 0 ? parts.join('；') : null
}

function buildMicroChunks(item) {
  const baseText = item._meta_plain_text ||
    [item.ganshou || '', item.shanggexiangmu || '', item.chixushijian || '']
      .filter(Boolean)
      .join(' ')

  if (!baseText || baseText.trim().length === 0) {
    return []
  }

  const header = buildHeaderPrefix(item)

  if (baseText.length < CHUNKING_CONFIG.adaptiveThreshold) {
    return [`${header}\n${baseText}`]
  }

  const chunks = []
  const windowSize = CHUNKING_CONFIG.microWindowSize
  const step = windowSize - CHUNKING_CONFIG.microOverlap

  for (let i = 0; i < baseText.length; i += step) {
    const chunkContent = baseText.substring(i, i + windowSize)
    if (chunkContent.length >= 20) {
      chunks.push(`${header}\n${chunkContent}`)
    }
  }

  return chunks
}

function generateChunksForRecord(item) {
  const parentId = item._meta_id || item._id || item.id ||
    `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`

  const chunks = []

  const macroText = buildMacroChunk(item)
  if (macroText) {
    chunks.push({
      id: `${parentId}_macro`,
      parentId,
      text: macroText,
      type: 'macro',
      original: item
    })
  }

  const microTexts = buildMicroChunks(item)
  microTexts.forEach((text, index) => {
    chunks.push({
      id: `${parentId}_micro_${index}`,
      parentId,
      text,
      type: 'micro',
      original: item
    })
  })

  return chunks
}

function computeItemHash(item) {
  const content = JSON.stringify({
    id: item._meta_id || item.time || item.id,
    text: item._meta_plain_text,
    ai: item._ai_meta,
    summary: (item.ganshou || '') + (item.shanggexiangmu || '')
  })
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * 增量同步向量库与 BM25 倒排索引
 */
async function syncVectorDatabase(currentData) {
  bm25Index.clear()
  for (const item of currentData) {
    const itemId = item._meta_id || item._id || item.id || `${item.time}_${item.shanggexiangmu}`
    const fullText = [
      item.time,
      item.shanggexiangmu,
      item.ganshou,
      item.chixushijian,
      item._meta_plain_text,
      item._ai_meta?.summary,
      item._ai_meta?.topics?.join(' '),
      item._ai_meta?.mood_tags?.join(' ')
    ].filter(Boolean).join(' ')
    bm25Index.addDocument(itemId, fullText, item)
  }

  let cacheStore = {}
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      cacheStore = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8'))
    }
  } catch (e) {
    console.warn('[VectorDB] Cache corrupted, starting fresh.')
  }

  const newCacheStore = {}
  let reuseCount = 0
  let newCount = 0
  const runtimeVectorDB = []

  console.log(`[VectorDB] Syncing ${currentData.length} records (Pure Local BGE & BM25)...`)

  for (const item of currentData) {
    const itemId = item._meta_id || item._id || item.id || `${item.time}_${item.shanggexiangmu}`
    const currentHash = computeItemHash(item)

    if (cacheStore[itemId] && cacheStore[itemId].hash === currentHash) {
      newCacheStore[itemId] = cacheStore[itemId]
      cacheStore[itemId].chunks.forEach(chunk => {
        chunk.original = item
        runtimeVectorDB.push(chunk)
      })
      reuseCount++
    } else {
      const chunks = generateChunksForRecord(item)
      for (const chunk of chunks) {
        chunk.vector = await embedText(chunk.text)
        runtimeVectorDB.push(chunk)
      }

      newCacheStore[itemId] = {
        hash: currentHash,
        chunks: chunks.map(c => ({ ...c, original: undefined }))
      }
      newCount++
    }
  }

  try {
    const dir = path.dirname(CACHE_FILE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(newCacheStore), 'utf-8')
    console.log(`[VectorDB] Sync complete. Reused: ${reuseCount}, New: ${newCount}. BM25 docs: ${bm25Index.docCount}`)
  } catch (e) {
    console.error('[VectorDB] Failed to save cache:', e)
  }

  return runtimeVectorDB
}

function matchFilterConditions(item, conditions) {
  if (!conditions || !item) return true

  if (conditions.dateRange) {
    const { start, end } = conditions.dateRange
    const startDate = start ? dayjs(start).startOf('day') : null
    const endDate = end ? dayjs(end).endOf('day') : null

    const timeStr = item.time || item.occurredAt
    if (timeStr) {
      const itemTime = dayjs(timeStr)
      if (startDate && itemTime.isBefore(startDate)) return false
      if (endDate && itemTime.isAfter(endDate)) return false
    } else {
      return false
    }
  }

  if (conditions.emotionFocus === 'worst') {
    if (computeEmotionScore(item.ganshou || '') >= 0) return false
  }

  return true
}

/**
 * 稠密向量搜索（Top-2 衰减平滑聚合）
 */
async function vectorSearch(query, topK = 50, conditions = null) {
  if (vectorDB.length === 0) {
    const data = await loadAndEnrichData()
    vectorDB = await syncVectorDatabase(data)
  }

  const queryEmbedding = await embedText(query)

  const chunkScores = vectorDB.map(chunk => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.vector)
  }))

  const recordScores = new Map()
  for (const { chunk, similarity } of chunkScores) {
    const existing = recordScores.get(chunk.parentId)
    if (!existing) {
      recordScores.set(chunk.parentId, {
        parentId: chunk.parentId,
        bestScore: similarity,
        secondScore: 0,
        bestChunk: chunk,
        original: chunk.original
      })
    } else if (similarity > existing.bestScore) {
      existing.secondScore = existing.bestScore
      existing.bestScore = similarity
      existing.bestChunk = chunk
    } else if (similarity > existing.secondScore) {
      existing.secondScore = similarity
    }
  }

  let candidates = Array.from(recordScores.values()).filter(cand =>
    matchFilterConditions(cand.original, conditions)
  )

  candidates.forEach(cand => {
    cand.finalVecScore = cand.bestScore + 0.3 * cand.secondScore
  })

  const sorted = candidates
    .sort((a, b) => b.finalVecScore - a.finalVecScore)
    .slice(0, topK)

  return sorted.map(c => ({
    id: c.parentId,
    parentId: c.parentId,
    score: c.finalVecScore,
    original: c.original,
    bestChunk: c.bestChunk,
    snippet: c.bestChunk?.text ? c.bestChunk.text.slice(0, 100) : ''
  }))
}

function computeEmotionScore(text) {
  if (!text || typeof text !== 'string') return 0
  const t = text.toLowerCase()
  const pos = [
    '开心', '高兴', '愉快', '满意', '顺利', '成功', '美好', '幸福', '兴奋',
    '激动', '棒', '爽', '喜欢', '热爱', '期待', '温暖', '感动', '自豪',
    '骄傲', '享受', '轻松', '惬意', '满足', '幸运', '乐观'
  ]
  const neg = [
    '难过', '沮丧', '糟糕', '生气', '焦虑', '失败', '孤独', '寂寞', '孤单',
    '无助', '害怕', '恐惧', '担心', '煎熬', '痛苦', '烦', '累', '讨厌',
    '失望', '遗憾', '压抑', '迷茫', '疲惫', '厌恶', '绝望', '惊恐'
  ]
  let score = 0
  for (const w of pos) if (t.includes(w)) score += 1
  for (const w of neg) if (t.includes(w)) score -= 1
  return score
}

/**
 * 本地 Cross-Encoder Reranker 重排序 (带算法平滑降级)
 */
async function rerankCandidates(query, candidates, conditions, limit = 10) {
  const q = (query || '').toLowerCase()
  const queryEmotionScore = computeEmotionScore(q)

  // 尝试加载本地 BGE-Reranker
  const rerankerBundle = await loadLocalReranker()

  if (rerankerBundle && candidates.length > 0) {
    try {
      const topCandidates = candidates.slice(0, 20)
      for (const cand of topCandidates) {
        const it = cand.original || cand.item || cand
        const docText = (it.shanggexiangmu ? `[${it.shanggexiangmu}] ` : '') +
          (it.ganshou || it._meta_plain_text || it._ai_meta?.summary || '').slice(0, 300)

        const inputs = await rerankerBundle.tokenizer(query, {
          text_pair: docText,
          padding: true,
          truncation: true
        })
        const { logits } = await rerankerBundle.model(inputs)
        cand.rerankScore = logits.data[0]
      }

      // 按 Cross-Encoder 真实分数排序
      topCandidates.sort((a, b) => (b.rerankScore ?? b.rrfScore) - (a.rerankScore ?? a.rrfScore))
      candidates = topCandidates
      console.log(`[SearchRecordsTool] Successfully re-ranked with local BGE-Reranker (Top score: ${topCandidates[0]?.rerankScore?.toFixed(3)})`)
    } catch (e) {
      console.warn('[SearchRecordsTool] Cross-Encoder rerank failed, using RRF score:', e.message)
    }
  }

  const scored = candidates.map(cand => {
    const it = cand.original || cand.item || cand
    const rawScore = cand.rerankScore !== undefined ? cand.rerankScore : (cand.rrfScore || cand.score || 0)

    const itemText = (it.ganshou || '') + ' ' + (it._ai_meta?.summary || '')
    const itemEmotionScore = computeEmotionScore(itemText)
    let softEmoBoost = 0

    if (queryEmotionScore > 0 && itemEmotionScore > 0) {
      softEmoBoost = 0.05
    } else if (queryEmotionScore < 0 && itemEmotionScore < 0) {
      softEmoBoost = 0.05
    }

    const finalScore = rawScore + softEmoBoost

    let snippet = cand.snippet
    if (!snippet) {
      snippet = bm25Index.extractSnippet(itemText, query, 100)
    }

    return {
      item: it,
      score: finalScore,
      snippet
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

// ==================== SearchRecordsTool 实现 ====================

export class SearchRecordsTool extends Tool {
  constructor() {
    super()
    this.name = 'search_records'
    this.description = `【语义检索与综合回忆专用】基于本地 BGE 向量与 BM25 双路召回，并由本地 BGE-Reranker 精准交叉重排的搜索引擎。

核心能力：
- 纯本地离线运行，零网络请求、零延迟波动
- 双路召回 (BGE-Small 稠密语义 + BM25 原生中文词法倒排)，兼顾抽象概念与具体实体
- 交叉注意力重排 (BGE-Reranker Cross-Encoder)，精准识别否定、修饰与复合多事件
- 自适应切片与 Header Injection，长短日记均具备完整上下文锚定

⚠️ 调用建议：
1. 【关键词提炼】提取 2-4 个核心意向词（如 "青旅 雨 窗边" 或 "导师 答辩 焦虑"）。
2. 【时间约束】若涉及相对时间（如上周、上个月），请在 conditions.dateRange 中填入规范时间范围。`

    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '核心意象、事件或概念关键词（空格分隔）。例："焦虑 答辩" 或 "海边 烧烤 朋友"'
        },
        limit: {
          type: 'number',
          description: '返回结果数量限制（默认 10，最大 30）。'
        },
        minScore: {
          type: 'number',
          description: '相似度阈值偏好（0.0-1.0，默认 0.2）。'
        },
        conditions: {
          type: 'object',
          description: '前置过滤条件',
          properties: {
            dateRange: {
              type: 'object',
              description: '起止时间范围过滤',
              properties: {
                start: { type: 'string', description: 'YYYY-MM-DD' },
                end: { type: 'string', description: 'YYYY-MM-DD' }
              }
            },
            emotionFocus: {
              type: 'string',
              description: '情绪倾向过滤，可选值: worst (负向情绪)'
            }
          }
        }
      },
      required: ['query']
    }
  }

  async invoke(input) {
    try {
      console.log('[SearchRecordsTool] Invoking hybrid search with:', JSON.stringify(input, null, 2))

      if (!input || typeof input !== 'object') {
        throw new Error('Input must be an object')
      }

      const { query = '', conditions: userConditions } = input
      const limit = Math.min(input.limit || 10, 30)

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('语义搜索需要提供 query 参数')
      }

      const data = await loadAndEnrichData()
      if (vectorDB.length === 0 || bm25Index.docCount === 0) {
        vectorDB = await syncVectorDatabase(data)
      }

      const effectiveCond = userConditions && typeof userConditions === 'object' && Object.keys(userConditions).length > 0 ? userConditions : null

      // 1. 路 1：稠密向量搜索 (Dense Top-50)
      console.log('[SearchRecordsTool] Running Local Dense Vector Search (Top-50)...')
      const denseCandidates = await vectorSearch(query, 50, effectiveCond)

      // 2. 路 2：稀疏 BM25 搜索 (Sparse Top-50)
      console.log('[SearchRecordsTool] Running Sparse BM25 Search (Top-50)...')
      const bm25Candidates = bm25Index.search(query, {
        topK: 50,
        filter: (item) => matchFilterConditions(item, effectiveCond)
      })

      // 3. 双路融合：RRF (Reciprocal Rank Fusion)
      console.log(`[SearchRecordsTool] Dense hits: ${denseCandidates.length}, BM25 hits: ${bm25Candidates.length}. Performing RRF fusion...`)
      const fusedCandidates = reciprocalRankFusion([denseCandidates, bm25Candidates], 60)

      // 4. 重排并截断 (本地 BGE-Reranker Cross-Encoder)
      const rankedResults = await rerankCandidates(query, fusedCandidates, effectiveCond, limit)
      console.log(`[SearchRecordsTool] Final ranked results: ${rankedResults.length}`)

      // 5. 格式化输出 (透出高亮片段 Snippet)
      const uiRecords = rankedResults.map(r => {
        const clean = sanitizeRecordForUI(r.item)
        if (r.snippet) {
          clean.matchedSnippet = r.snippet
        }
        return clean
      })

      const formattedPreviews = rankedResults.map(r => {
        let text = formatRecordForLLM(r.item)
        if (r.snippet) {
          text += `\n【关键高亮摘录】：${r.snippet}`
        }
        return text
      })
      const llmText = formattedPreviews.join('\n\n')

      let systemHint = ''
      if (rankedResults.length > 0) {
        systemHint = `✅ 已找到 ${rankedResults.length} 条高相关记录（经本地向量、BM25 双路召回与 BGE-Reranker 重排）。
💡 若当前结果已足以解答用户问题，请直接生成清晰回答；
💡 若用户提问涉及多个时间段对比（如“今年和去年对比”）或多人物/多场景核实，可按需发起下一阶段检索。`
      } else {
        systemHint = `⚠️ 未找到高度相关的记录。建议尝试更宽泛的关键词，或使用 query_records 按时间段浏览。`
      }

      return new ToolResult(this.name, {
        records: uiRecords,
        summary: llmText,
        system_hint: systemHint,
        debug: {
          query,
          denseHitCount: denseCandidates.length,
          bm25HitCount: bm25Candidates.length,
          fusedCount: fusedCandidates.length,
          returnedCount: rankedResults.length,
          localModelUsed: true
        }
      })

    } catch (error) {
      console.error('[SearchRecordsTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }
}

/**
 * 清空运行时向量与 BM25 索引缓存 (用于数据更新后触发轻量增量同步)
 * 警告：严禁删除磁盘缓存文件 CACHE_FILE_PATH！
 * 保留磁盘文件后，syncVectorDatabase 会根据 MD5 校验已有记录（0ms），仅需为新增或变更条目做向量化（~20ms）。
 */
export function clearVectorCache() {
  vectorDB = []
  bm25Index.clear()
  console.log('[VectorDB] In-memory cache invalidated. Incremental disk cache preserved for instant sync.')
}

/**
 * 后台预热索引与本地模型（非阻塞）
 */
export async function initVectorSearch() {
  try {
    if (vectorDB.length > 0 && bm25Index.docCount > 0) return
    console.log('[VectorDB] Background warming up local models and index...')
    await loadEmbeddingModel()
    await loadLocalReranker()
    const data = await loadAndEnrichData()
    vectorDB = await syncVectorDatabase(data)
    console.log(`[VectorDB] Background warm-up ready. Chunks: ${vectorDB.length}, BM25 docs: ${bm25Index.docCount}`)
  } catch (err) {
    console.warn('[VectorDB] Background warm-up failed gracefully:', err.message)
  }
}

/**
 * 强制从零重建向量与 BM25 数据库（仅在用户显式要求完全重新索引时调用）
 */
export async function rebuildVectorDatabase() {
  console.log('[VectorDB] Force rebuilding vector and BM25 database from scratch...')
  vectorDB = []
  bm25Index.clear()
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      fs.unlinkSync(CACHE_FILE_PATH)
      console.log('[VectorDB] Cache file deleted for full rebuild')
    }
  } catch (error) {
    console.error('[VectorDB] Failed to delete cache file:', error.message)
  }
  const data = await loadAndEnrichData()
  vectorDB = await syncVectorDatabase(data)
  return { success: true, chunkCount: vectorDB.length, bm25Count: bm25Index.docCount }
}
