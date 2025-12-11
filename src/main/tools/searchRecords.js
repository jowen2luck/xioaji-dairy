/**
 * 搜索记录工具 (多粒度切片增强版)
 * 核心升级：
 * - 宏观切片：summary + mood + items + people + topics + location
 * - 微观切片：滑窗算法（窗口150字，重叠50字）
 * - Max-Sim检索：单文档多向量表示，取最高相似度
 * - 文件缓存：持久化向量数据库，避免重复计算
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData } from '../data/index.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import dayjs from '../../utils/date.js'

// ==================== 配置与缓存路径 ====================

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CACHE_FILE_PATH = path.join(__dirname, '..', '.cache', 'vector_db_incremental.json')

const CHUNKING_CONFIG = {
  microWindowSize: 150,  // 微观切片窗口大小（字符）
  microOverlap: 50,      // 微观切片重叠大小（字符）
  minChunkLength: 30,    // 最小切片长度（过短的不处理）
}

// ==================== 向量化和检索模块 ====================

let vectorDB = []  // 扁平化切片数组
let embeddingModel = null

async function loadEmbeddingModel() {
  if (embeddingModel) return embeddingModel

  try {
    const { pipeline } = await import('@xenova/transformers')
    try {
      embeddingModel = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
      console.log('[SearchRecordsTool] Embedding model loaded: multilingual MiniLM-L12-v2')
    } catch (e) {
      embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
      console.log('[SearchRecordsTool] Fallback embedding model loaded: all-MiniLM-L6-v2')
    }
    return embeddingModel
  } catch (error) {
    console.error('[SearchRecordsTool] Failed to load embedding model:', error)
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
  if (vecA.length !== vecB.length) return 0

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
 * 构建宏观切片（Macro Chunk）
 * 融合 AI 元数据的高层语义：summary, mood, items, people, topics, location
 */
function buildMacroChunk(item) {
  const aiMeta = item._ai_meta
  if (!aiMeta) return null

  const parts = []

  // 摘要（核心）
  if (aiMeta.summary) parts.push(aiMeta.summary)

  // 情绪标签
  if (Array.isArray(aiMeta.mood_tags) && aiMeta.mood_tags.length > 0) {
    parts.push('情绪：' + aiMeta.mood_tags.join('、'))
  }

  // 实体（物品、书名、食物等）
  if (Array.isArray(aiMeta.items) && aiMeta.items.length > 0) {
    parts.push('相关：' + aiMeta.items.join('、'))
  }

  // 涉及人物
  if (Array.isArray(aiMeta.people_involved) && aiMeta.people_involved.length > 0) {
    parts.push('人物：' + aiMeta.people_involved.join('、'))
  }

  // 主题/关键词
  if (Array.isArray(aiMeta.topics) && aiMeta.topics.length > 0) {
    parts.push('主题：' + aiMeta.topics.join('、'))
  } else if (Array.isArray(aiMeta.keywords) && aiMeta.keywords.length > 0) {
    parts.push('关键词：' + aiMeta.keywords.join('、'))
  }

  // 地点/场景
  if (aiMeta.location) {
    parts.push('地点：' + aiMeta.location)
  } else if (aiMeta.scene) {
    parts.push('场景：' + aiMeta.scene)
  }

  return parts.length > 0 ? parts.join('；') : null
}

/**
 * 构建微观切片（Micro Chunks）
 * 使用滑窗算法切分正文，捕捉局部细节
 */
function buildMicroChunks(item) {
  const baseText = item._meta_plain_text || 
    [item.ganshou || '', item.shanggexiangmu || '', item.chixushijian || '']
      .filter(Boolean)
      .join(' ')

  if (!baseText || baseText.length < CHUNKING_CONFIG.minChunkLength) {
    return []
  }

  const chunks = []
  const windowSize = CHUNKING_CONFIG.microWindowSize
  const step = windowSize - CHUNKING_CONFIG.microOverlap

  for (let i = 0; i < baseText.length; i += step) {
    const chunk = baseText.substring(i, i + windowSize)
    if (chunk.length >= CHUNKING_CONFIG.minChunkLength) {
      chunks.push(chunk)
    }
  }

  return chunks
}

/**
 * 为单条记录生成所有切片（宏观 + 微观）
 */
function generateChunksForRecord(item) {
  const parentId = item._meta_id || item._id || 
    `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`
  
  const chunks = []

  // 1. 宏观切片（1个）
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

  // 2. 微观切片（多个）
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

/**
 * 计算单条记录的内容指纹 (Hash)
 * 仅包含会影响向量生成的字段
 */
function computeItemHash(item) {
  const content = JSON.stringify({
    id: item._meta_id || item.time,
    text: item._meta_plain_text,
    ai: item._ai_meta,
    summary: item.ganshou + item.shanggexiangmu
  })
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * 核心：增量构建向量库
 * 避免全量重建，仅处理变更数据
 */
async function syncVectorDatabase(currentData) {
  // 1. 加载旧缓存
  let cacheStore = {}
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      cacheStore = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8'))
    }
  } catch (e) {
    console.warn('[VectorDB] Cache corrupted, starting fresh.')
  }

  const newCacheStore = {} // 构建新的缓存对象（未出现在 currentData 的旧 key 会自动被丢弃，实现删除逻辑）
  let reuseCount = 0
  let newCount = 0
  
  // 2. 扁平化的运行时向量列表 (用于搜索)
  const runtimeVectorDB = []

  console.log(`[VectorDB] Syncing ${currentData.length} records...`)

  for (const item of currentData) {
    // 确保有唯一ID (fallback: time + title)
    const itemId = item._meta_id || `${item.time}_${item.shanggexiangmu}`
    const currentHash = computeItemHash(item)
    
    // Check Cache
    if (cacheStore[itemId] && cacheStore[itemId].hash === currentHash) {
      // A. 命中缓存：直接复用
      newCacheStore[itemId] = cacheStore[itemId]
      
      // 恢复 chunk 里的 original 引用 (因为 JSON 不存对象引用)
      cacheStore[itemId].chunks.forEach(chunk => {
        chunk.original = item // 重新挂载内存对象
        runtimeVectorDB.push(chunk)
      })
      reuseCount++
    } else {
      // B. 未命中/已修改：重新生成
      const chunks = generateChunksForRecord(item)
      
      // 并行计算向量
      for (const chunk of chunks) {
        chunk.vector = await embedText(chunk.text)
        runtimeVectorDB.push(chunk)
      }

      // 存入新缓存结构 (不存 original 对象，减小体积)
      newCacheStore[itemId] = {
        hash: currentHash,
        chunks: chunks.map(c => ({ ...c, original: undefined })) 
      }
      newCount++
    }
  }

  // 3. 持久化新缓存
  try {
    const dir = path.dirname(CACHE_FILE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(newCacheStore), 'utf-8')
    console.log(`[VectorDB] Sync complete. Reused: ${reuseCount}, New/Updated: ${newCount}. Cache saved.`)
  } catch (e) {
    console.error('[VectorDB] Failed to save cache:', e)
  }

  return runtimeVectorDB
}

/**
 * 清空向量数据库缓存(用于数据更新后重建)
 */
export function clearVectorCache() {
  vectorDB = []
  
  // 删除缓存文件
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      fs.unlinkSync(CACHE_FILE_PATH)
      console.log('[VectorDB] Cache file deleted')
    }
  } catch (error) {
    console.error('[VectorDB] Failed to delete cache file:', error.message)
  }
  
  console.log('[VectorDB] Vector cache cleared, will rebuild on next search')
}

/**
 * 强制重建向量数据库
 */
export async function rebuildVectorDatabase() {
  console.log('[VectorDB] Force rebuilding vector database...')
  const data = await loadAndEnrichData()
  vectorDB = await syncVectorDatabase(data)
  return { success: true, chunkCount: vectorDB.length }
}

/**
 * Max-Sim 向量搜索（多粒度切片聚合）
 * 逻辑：
 * 1. 计算 Query 与所有切片的相似度
 * 2. 按 parentId 聚合，每个记录只保留最高分切片
 * 3. 返回 Top-K 记录
 */
async function vectorSearch(query, topK = 5, withScores = false) {
  if (vectorDB.length === 0) {
    const data = await loadAndEnrichData()
    vectorDB = await syncVectorDatabase(data)
  }

  const queryEmbedding = await embedText(query)
  
  // 步骤1：计算所有切片的相似度
  const chunkScores = vectorDB.map(chunk => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.vector)
  }))

  // 步骤2：Max-Sim 聚合（按 parentId 取最高分）
  const recordMaxScores = new Map()
  for (const { chunk, similarity } of chunkScores) {
    const existing = recordMaxScores.get(chunk.parentId)
    if (!existing || similarity > existing.similarity) {
      recordMaxScores.set(chunk.parentId, {
        parentId: chunk.parentId,
        similarity,
        bestChunk: chunk,
        original: chunk.original
      })
    }
  }

  // 步骤3：排序并返回 Top-K
  const sortedRecords = Array.from(recordMaxScores.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  console.log(`[VectorSearch] Max-Sim: scanned ${vectorDB.length} chunks -> aggregated to ${recordMaxScores.size} records -> top ${topK}`)
  if (sortedRecords.length > 0) {
    console.log(`[VectorSearch] Top result: score=${sortedRecords[0].similarity.toFixed(4)}, chunkType=${sortedRecords[0].bestChunk.type}`)
  }

  if (withScores) return sortedRecords
  return sortedRecords.map(r => r.original)
}

// ==================== 辅助函数 ====================

function computeEmotionScore(text) {
  if (!text || typeof text !== 'string') return 0
  const t = text.toLowerCase()
  const pos = ['开心', '高兴', '愉快', '满意', '顺利', '成功']
  const neg = ['难过', '沮丧', '糟糕', '生气', '焦虑', '失败', '孤独', '寂寞', '孤单', '无助']
  let score = 0
  for (const w of pos) if (t.includes(w)) score += 1
  for (const w of neg) if (t.includes(w)) score -= 1
  return score
}

function expandQuerySynonyms(query) {
  const q = (query || '').trim()
  const set = new Set()
  q.split(/\s+/).filter(Boolean).forEach(t => set.add(t))
  const synonyms = ['孤独', '寂寞', '孤单', '一个人', '无人', '无助', '没人理解', '被忽视', '被冷落', '孤立', '空虚']
  if (synonyms.some(s => q.includes(s))) {
    synonyms.forEach(s => set.add(s))
  }
  return Array.from(set)
}

function getPlainText(item) {
  const t = item._meta_plain_text || [item.ganshou, item.shanggexiangmu, item.chixushijian].filter(Boolean).join(' ')
  return (t || '').toLowerCase()
}

function lexicalScoreForItem(item, tokens) {
  if (!tokens || tokens.length === 0) return 0
  const text = getPlainText(item)
  let hits = 0
  for (const tok of tokens) {
    if (!tok) continue
    if (text.includes(tok.toLowerCase())) hits += 1
  }
  return hits / Math.max(tokens.length, 1)
}

const SEARCH_CONFIG = {
  maxResults: 10
}

function rerankResults(query, items, conditions, vecScoreMap, queryTokens = []) {
  const q = (query || '').toLowerCase()
  const hasTokens = Array.isArray(queryTokens) && queryTokens.length > 0

  const scored = items
    .map(it => {
      const key = it._id || `${it.time || ''}_${it.shanggexiangmu || ''}_${it.ganshou || ''}`
      const vec = vecScoreMap.get(key) || 0
      const lex = hasTokens ? lexicalScoreForItem(it, queryTokens) : 0
      let emoBonus = 0
      if (conditions?.emotionFocus === 'worst') {
        emoBonus = computeEmotionScore(it.ganshou || '') < 0 ? 0.1 : 0
      }
      const total = 0.6 * vec + 0.3 * lex + emoBonus
      return { item: it, score: total, vec, lex }
    })
    .sort((a, b) => b.score - a.score)

  console.log(`[rerankResults] Ranked ${scored.length} items; top3 details:`,
    scored.slice(0, 3).map(s => ({ score: s.score.toFixed(3), vec: s.vec.toFixed(3), lex: s.lex.toFixed(3) })))

  const ranked = scored.map(x => x.item)
  const limited = ranked.slice(0, SEARCH_CONFIG.maxResults)

  console.log(`[rerankResults] Limited results to ${limited.length} from ${ranked.length}`)

  return limited
}

// ==================== SearchRecordsTool 实现 ====================

export class SearchRecordsTool extends Tool {
  constructor() {
    super()
    this.name = 'search_records'
    this.description = `【语义检索/模糊回忆专用】基于向量的语义搜索引擎。

核心能力：
- 能够理解\"心情不好\"、\"压力大\"等抽象概念，也能检索\"青旅\"、\"咖啡\"等具体意象
- 采用 Max-Sim 多粒度切片算法，对长文本中的碎片记忆检索效果极佳

⚠️ 调用前必读：
1. 【关键词提取】禁止将\"帮我找一下...\"等整句作为 query。请先提取 2-3 个核心意象词（如\"青旅 窗边 雨\"）。
2. 【时间约束】如果用户提到\"上周\"、\"最近\"等时间，必须先调用 calendar_resolver 获取 ISO 时间，并填入 conditions.dateRange。不要忽略时间条件！
3. 【排他性】如果用户明确要找\"项目A\"或\"包含'代码'二字\"的记录，请改用 query_records。

技术细节（仅供参考）：
- 宏观切片：融合 summary, mood_tags, items, people_involved, topics, location
- 微观切片：滑窗大小150字符，重叠50字符
- Max-Sim 聚合：每条记录取最匹配切片得分，增强长文本中短句的匹配能力`
    
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '核心意象/概念关键词（空格分隔）。例：\"焦虑 答辩\" 或 \"海边 烧烤\"。请去除无意义的虚词。'
        },
        conditions: {
          type: 'object',
          description: '后置过滤条件（用于缩小语义搜索的范围）',
          properties: {
            dateRange: {
              type: 'object',
              description: '【强制】若用户指定时间，必须填此项。格式需由 calendar_resolver 生成。',
              properties: {
                start: { type: 'string', description: 'YYYY-MM-DD HH:mm:ss' },
                end: { type: 'string', description: 'YYYY-MM-DD HH:mm:ss' }
              }
            },
            emotionFocus: {
              type: 'string',
              description: '情绪倾向过滤（可选），可选值: worst（偏向负面情绪）',
            },
          },
        },
      },
      required: ['query'],
    }
  }

  async invoke(input) {
    try {
      console.log('[SearchRecordsTool] Invoking semantic search with:', JSON.stringify(input, null, 2))

      if (!input || typeof input !== 'object') {
        throw new Error('Input must be an object')
      }

      const { query = '', conditions: userConditions } = input

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('语义搜索需要提供 query 参数，如需条件查询请使用 query_records 工具')
      }

      const data = await loadAndEnrichData()
      
      const effectiveCond = userConditions && typeof userConditions === 'object' && Object.keys(userConditions).length > 0 ? userConditions : null

      const vecScores = new Map()
      const candidatesMap = new Map()
      const keyOf = item => item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`

      const TOPK = 100  // Max-Sim 聚合后返回的记录数（不是切片数）
      const SIM_THRESHOLD = 0.2  // 降低阈值，因为 Max-Sim 已经是最优匹配
      console.log('[SearchRecordsTool] Performing Max-Sim multi-granularity vector search for:', query)
      try {
        const sims = await vectorSearch(query, TOPK, true)  // 返回的是记录级别的 Max-Sim 结果
        console.log(`[SearchRecordsTool] Max-Sim search returned ${sims.length} records (aggregated from chunks)`)
        let passed = 0
        for (const s of sims) {
          if (s.similarity < SIM_THRESHOLD) continue
          const it = s.original
          const k = keyOf(it)
          candidatesMap.set(k, it)
          vecScores.set(k, s.similarity)
          passed++
        }
        console.log(`[SearchRecordsTool] Similarity threshold=${SIM_THRESHOLD}, passed=${passed}, filtered=${sims.length - passed}`)
      } catch (error) {
        console.error('[SearchRecordsTool] Vector search error:', error)
        throw new Error('向量搜索失败: ' + error.message)
      }

      if (effectiveCond) {
        console.log('[SearchRecordsTool] Applying post-filter conditions:', effectiveCond)
        const candidates = Array.from(candidatesMap.values())
        const filtered = candidates.filter(item => {
          // 日期范围过滤 (Day.js 改造)
          if (effectiveCond.dateRange) {
            const { start, end } = effectiveCond.dateRange
            // 使用 dayjs 进行严谨比较
            const startDate = start ? dayjs(start).startOf('day') : null
            const endDate = end ? dayjs(end).endOf('day') : null
            
            if (item.time) {
              const itemTime = dayjs(item.time)
              if (startDate && itemTime.isBefore(startDate)) return false
              if (endDate && itemTime.isAfter(endDate)) return false
            } else {
              return false
            }
          }
          
          // 情绪倾向过滤
          if (effectiveCond.emotionFocus === 'worst') {
            return computeEmotionScore(item.ganshou || '') < 0
          }
          return true
        })
        candidatesMap.clear()
        for (const it of filtered) candidatesMap.set(keyOf(it), it)
      }

      const candidates = Array.from(candidatesMap.values())
      console.log(`[SearchRecordsTool] Total candidates before reranking: ${candidates.length}`)

      const tokens = expandQuerySynonyms(query)
      const results = rerankResults(query || '', candidates, effectiveCond || {}, vecScores, tokens)
      console.log(`[SearchRecordsTool] After reranking: ${results.length} results from ${candidates.length} candidates`)

      if (results.length > 0) {
        console.log(`[SearchRecordsTool] First 3 results:`, JSON.stringify(results.slice(0, 3), null, 2))
      }

      const dataCount = data.length
      const aiEnhancedCount = data.filter(item => item._ai_meta).length
      const debug = {
        query: query || null,
        conditions: effectiveCond || null,
        dataCount,
        aiEnhancedCount,
        chunkCount: vectorDB.length,
        macroChunks: vectorDB.filter(c => c.type === 'macro').length,
        microChunks: vectorDB.filter(c => c.type === 'micro').length,
        candidateCount: candidates.length,
        resultCountAfterRerank: results.length,
        maxResults: SEARCH_CONFIG.maxResults,
        vectorSearchCount: TOPK,
        similarityThreshold: SIM_THRESHOLD,
        lexicalTokenCount: tokens.length,
        searchType: 'max_sim_multi_granularity_chunking',
        chunkingConfig: CHUNKING_CONFIG
      }

      console.log(`[SearchRecordsTool] Final debug info:`, debug)

      return new ToolResult(this.name, {
        records: results,
        debug,
      })
    } catch (error) {
      console.error('[SearchRecordsTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }
}
