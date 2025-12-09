/**
 * 搜索记录工具 (增强版)
 * 新增功能：融合 AI 元数据增强语义检索能力
 * 
 * 增强策略：
 * - 向量构建时融合 _ai_meta.summary、mood_tags、items
 * - 权重设计：原文 50% + 摘要 30% + 情绪 10% + 实体 10%
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData } from '../data/index.js'

// ==================== 向量化和检索模块 ====================

let vectorDB = []
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
 * 构建增强文本（融合 AI 元数据）
 * 权重通过文本重复实现：
 * - 原文 1 次 (50% 基准)
 * - 摘要 3 次 (30% 权重)
 * - 情绪标签 1 次 (10% 权重)
 * - 实体 1 次 (10% 权重)
 */
function buildEnhancedText(item) {
  let baseText = item._meta_plain_text || 
                 [item.ganshou || '', item.shanggexiangmu || '', item.chixushijian || '', item.time || '']
                   .filter(Boolean)
                   .join(' ')

  // 如果有 AI 元数据，进行融合增强
  if (item._ai_meta) {
    const aiMeta = item._ai_meta
    const enhancementParts = []

    // 摘要重复 3 次（30% 权重）
    if (aiMeta.summary) {
      enhancementParts.push(aiMeta.summary, aiMeta.summary, aiMeta.summary)
    }

    // 情绪标签（10% 权重）
    if (Array.isArray(aiMeta.mood_tags) && aiMeta.mood_tags.length > 0) {
      enhancementParts.push(aiMeta.mood_tags.join(' '))
    }

    // 实体（10% 权重）
    if (Array.isArray(aiMeta.items) && aiMeta.items.length > 0) {
      enhancementParts.push(aiMeta.items.join(' '))
    }

    // 人物（额外增强）
    if (Array.isArray(aiMeta.people_involved) && aiMeta.people_involved.length > 0) {
      enhancementParts.push(aiMeta.people_involved.join(' '))
    }

    // 合并增强文本
    if (enhancementParts.length > 0) {
      baseText = `${baseText} ${enhancementParts.join(' ')}`
      console.log('[SearchRecordsTool] Enhanced text with AI metadata:', baseText.substring(0, 100) + '...')
    }
  }

  return baseText
}

async function buildVectorDatabase(data) {
  vectorDB = []

  for (const item of data) {
    // 使用增强文本构建向量
    const text = buildEnhancedText(item)

    if (text.trim()) {
      const embedding = await embedText(text)
      vectorDB.push({
        id: item._meta_id || item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`,
        embedding,
        original: item, // 保留完整的增强数据(包含 _meta_ 和 _ai_meta 字段)
      })
    }
  }

  console.log(`[SearchRecordsTool] Vector database built with ${vectorDB.length} entries (AI-enhanced)`)
}

/**
 * 清空向量数据库缓存(用于数据更新后重建)
 */
export function clearVectorCache() {
  vectorDB = []
  console.log('[SearchRecordsTool] Vector cache cleared, will rebuild on next search')
}

async function vectorSearch(query, topK = 5, withScores = false) {
  if (vectorDB.length === 0) {
    const data = await loadAndEnrichData()
    await buildVectorDatabase(data)
  }

  const queryEmbedding = await embedText(query)
  const similarities = vectorDB.map(item => ({
    item,
    similarity: cosineSimilarity(queryEmbedding, item.embedding),
  }))

  similarities.sort((a, b) => b.similarity - a.similarity)
  const top = similarities.slice(0, topK)

  if (withScores) return top
  return top.map(s => s.item.original)
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
    this.description = `语义内容检索工具（右脑 - 模糊搜索）【已增强 AI 元数据融合】:
使用场景：
- 情感/主题搜索："心情不好的记录"、"压力大的时候"、"开心的事情"
- 相似内容发现："和XX项目类似的内容"、"关于学习的记录"
- 关键词语义扩展："焦虑"（会匹配"紧张"、"压力大"等相似表达）
- 模糊回忆："好像是做某个功能的时候..."（不记得确切项目名）

AI 增强能力：
- 自动匹配 AI 提取的情绪标签（mood_tags）
- 精确查找实体（items）如书名、食物、地点
- 利用 AI 摘要提升语义理解准确度

注意：
- 本工具使用向量语义搜索，擅长理解内容含义而非精确匹配
- 如需精确条件查询（日期/项目/时长），请使用 query_records 工具
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

      const TOPK = 200
      const SIM_THRESHOLD = 0.25
      console.log('[SearchRecordsTool] Performing AI-enhanced vector semantic search for:', query)
      try {
        const sims = await vectorSearch(query, TOPK, true)
        console.log(`[SearchRecordsTool] Vector search returned ${sims.length} semantic matches (TOPK=${TOPK})`)
        let passed = 0
        for (const s of sims) {
          if (s.similarity < SIM_THRESHOLD) continue
          const it = s.item.original
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
        candidateCount: candidates.length,
        resultCountAfterRerank: results.length,
        maxResults: SEARCH_CONFIG.maxResults,
        vectorSearchCount: TOPK,
        similarityThreshold: SIM_THRESHOLD,
        lexicalTokenCount: tokens.length,
        searchType: 'ai_enhanced_semantic_vector_hybrid'
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
