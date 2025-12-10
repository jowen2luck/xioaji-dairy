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

// ==================== 配置与缓存路径 ====================

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CACHE_FILE_PATH = path.join(__dirname, '..', '.cache', 'vector_db_cache.json')

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
 * 计算数据指纹（用于缓存失效检测）
 */
function computeDataFingerprint(data) {
  const summary = {
    count: data.length,
    lastModified: Math.max(...data.map(item => {
      const time = item.time || item._meta_updated || ''
      return new Date(time).getTime() || 0
    }))
  }
  return crypto.createHash('md5').update(JSON.stringify(summary)).digest('hex')
}

/**
 * 加载向量数据库缓存
 */
function loadVectorCache() {
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) {
      console.log('[VectorDB] Cache file not found, will build new database')
      return null
    }

    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8'))
    console.log(`[VectorDB] Cache loaded: ${cacheData.chunks?.length || 0} chunks, fingerprint: ${cacheData.fingerprint}`)
    return cacheData
  } catch (error) {
    console.error('[VectorDB] Failed to load cache:', error.message)
    return null
  }
}

/**
 * 保存向量数据库缓存
 */
function saveVectorCache(chunks, fingerprint) {
  try {
    const cacheDir = path.dirname(CACHE_FILE_PATH)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }

    const cacheData = {
      fingerprint,
      timestamp: new Date().toISOString(),
      chunkCount: chunks.length,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        parentId: chunk.parentId,
        text: chunk.text,
        type: chunk.type,
        vector: chunk.vector
      }))
    }

    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2), 'utf-8')
    console.log(`[VectorDB] Cache saved: ${chunks.length} chunks written to ${CACHE_FILE_PATH}`)
  } catch (error) {
    console.error('[VectorDB] Failed to save cache:', error.message)
  }
}

/**
 * 构建向量数据库（扁平化切片结构）
 */
async function buildVectorDatabase(data, forceRebuild = false) {
  const fingerprint = computeDataFingerprint(data)

  // 尝试加载缓存
  if (!forceRebuild) {
    const cache = loadVectorCache()
    if (cache && cache.fingerprint === fingerprint) {
      console.log('[VectorDB] Using cached vectors (fingerprint matched)')
      vectorDB = cache.chunks.map(chunk => ({
        ...chunk,
        original: data.find(item => {
          const id = item._meta_id || item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`
          return id === chunk.parentId
        })
      }))
      return
    }
  }

  // 构建新的向量数据库
  console.log('[VectorDB] Building new vector database with multi-granularity chunking...')
  vectorDB = []
  let macroCount = 0
  let microCount = 0

  for (const item of data) {
    const chunks = generateChunksForRecord(item)
    
    for (const chunk of chunks) {
      const vector = await embedText(chunk.text)
      vectorDB.push({
        ...chunk,
        vector
      })

      if (chunk.type === 'macro') macroCount++
      else if (chunk.type === 'micro') microCount++
    }
  }

  console.log(`[VectorDB] Built ${vectorDB.length} chunks (${macroCount} macro + ${microCount} micro) from ${data.length} records`)
  
  // 保存缓存
  saveVectorCache(vectorDB, fingerprint)
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
  await buildVectorDatabase(data, true)
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
    await buildVectorDatabase(data)
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
    this.description = `语义内容检索工具（多粒度切片 + Max-Sim 检索）:

核心能力：
- 宏观理解：通过摘要、情绪、主题、人物、地点等元数据把握整体语义
- 微观捕捉：通过滑窗切片算法精准匹配文本细节片段
- Max-Sim检索：每条记录取最匹配切片得分，增强长文本中短句的匹配能力
- 智能缓存：向量数据持久化，避免重复计算提升性能

适用场景：
- 情感搜索："心情不好"、"压力大"、"开心的事"
- 细节回忆："那杯难喝的咖啡"、"和某某吃饭聊天"
- 主题发现："关于工作的记录"、"运动健身相关"
- 人物搜索："和朋友出去玩"、"同事讨论"
- 地点场景："在健身房"、"咖啡厅"

技术特性：
- 宏观切片：融合 summary, mood_tags, items, people_involved, topics, location
- 微观切片：滑窗大小150字符，重叠50字符
- 向量缓存：自动检测数据变化，智能更新缓存

注意：
- 如需精确条件查询（日期/项目），请使用 query_records 工具
- 如需统计分析，请使用 sql_analysis 工具`
    
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '语义搜索关键词（例如："压力大"、"开心的事"、"项目进展慢"）',
        },
        conditions: {
          type: 'object',
          description: '可选的后置过滤条件。支持时间范围和情绪过滤。高级用法：在模糊回忆场景下，可先调用 calendar_resolver 获取日期范围，然后传入此参数',
          properties: {
            dateRange: {
              type: 'object',
              description: '日期范围后置过滤（可选）。用于在语义搜索结果中进一步按时间过滤',
              properties: {
                start: { type: 'string', description: '开始日期 YYYY-MM-DD' },
                end: { type: 'string', description: '结束日期 YYYY-MM-DD' }
              }
            },
            emotionFocus: {
              type: 'string',
              description: '情绪倾向过滤，可选值: worst（偏向负面情绪）',
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
          // 日期范围过滤
          if (effectiveCond.dateRange) {
            if (item.time) {
              const itemDate = new Date(item.time)
              if (effectiveCond.dateRange.start) {
                if (itemDate < new Date(effectiveCond.dateRange.start)) return false
              }
              if (effectiveCond.dateRange.end) {
                const endDate = new Date(effectiveCond.dateRange.end)
                endDate.setHours(23, 59, 59, 999)
                if (itemDate > endDate) return false
              }
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
