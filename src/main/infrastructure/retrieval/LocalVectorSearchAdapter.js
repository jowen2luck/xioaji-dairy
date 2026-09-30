/**
 * @file LocalVectorSearchAdapter.js
 * @description Local vector search adapter with adaptive chunking, Header Injection,
 * and Top-2 decay aggregation. Pluggable infrastructure adapter for AnalysisService.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CHUNKING_CONFIG = {
  microWindowSize: 150,
  microOverlap: 50,
  minChunkLength: 30,
  adaptiveThreshold: 300 // < 300 chars treated as a single whole chunk
}

export default class LocalVectorSearchAdapter {
  /**
   * @param {Object} options
   * @param {string} [options.cacheDir] — directory for vector cache file
   */
  constructor({ cacheDir } = {}) {
    this.cacheDir = cacheDir || path.join(process.cwd(), 'src', 'main', '.cache')
    this.cacheFile = path.join(this.cacheDir, 'vector_db_incremental.json')
    this.vectorDB = []
    this.embeddingModel = null
    this.chunkingConfig = { ...CHUNKING_CONFIG }
  }

  // ===================== Public API =====================

  /**
   * Incrementally sync vector database with current records.
   * @param {Array} currentData — normalized journal records
   * @returns {Promise<number>} total chunk count
   */
  async sync(currentData) {
    let cacheStore = {}
    try {
      if (fs.existsSync(this.cacheFile)) {
        cacheStore = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'))
      }
    } catch {
      console.warn('[LocalVectorSearchAdapter] Cache corrupted, starting fresh.')
    }

    const newCacheStore = {}
    const runtimeVectorDB = []
    let reuseCount = 0
    let newCount = 0

    for (const item of currentData) {
      const itemId = this._getItemId(item)
      const currentHash = this._computeHash(item)

      if (cacheStore[itemId]?.hash === currentHash) {
        cacheStore[itemId].chunks.forEach(chunk => {
          chunk.original = item
          runtimeVectorDB.push(chunk)
        })
        newCacheStore[itemId] = cacheStore[itemId]
        reuseCount++
      } else {
        const chunks = this._generateChunks(item, itemId)
        for (const chunk of chunks) {
          chunk.vector = await this._embed(chunk.text)
          runtimeVectorDB.push(chunk)
        }
        newCacheStore[itemId] = {
          hash: currentHash,
          chunks: chunks.map(c => ({ ...c, original: undefined }))
        }
        newCount++
      }
    }

    this._persist(newCacheStore)
    this.vectorDB = runtimeVectorDB
    console.log(`[LocalVectorSearchAdapter] Sync complete. Reused: ${reuseCount}, New: ${newCount}, Total chunks: ${runtimeVectorDB.length}`)
    return runtimeVectorDB.length
  }

  /**
   * Semantic search with Top-2 decay aggregation.
   * @param {string} query
   * @param {Object} [scope={}] — optional dateRange filter
   * @param {number} [limit=10]
   * @returns {Promise<Array<{parentId: string, similarity: number, original: Object}>>}
   */
  async search(query, scope = {}, limit = 10) {
    if (this.vectorDB.length === 0) {
      console.warn('[LocalVectorSearchAdapter] Vector DB empty, returning empty results')
      return []
    }

    const queryVec = await this._embed(query)
    const similarities = this.vectorDB.map(chunk => ({
      chunk,
      similarity: this._cosineSimilarity(queryVec, chunk.vector)
    }))

    // Top-2 decay aggregation by parentId (Score = Best + 0.3 * Second)
    const recordScores = new Map()
    for (const { chunk, similarity } of similarities) {
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

    let candidates = Array.from(recordScores.values()).map(r => ({
      parentId: r.parentId,
      similarity: r.bestScore + 0.3 * r.secondScore,
      bestChunk: r.bestChunk,
      original: r.original
    }))

    // Apply scope filters
    if (scope.dateRange) {
      candidates = this._filterByDateRange(candidates, scope.dateRange)
    }

    return candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .filter(r => r.similarity > 0.15)
  }

  /**
   * Clear all cached vectors.
   */
  clearCache() {
    this.vectorDB = []
    try {
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile)
      }
    } catch {
      // ignore
    }
  }

  // ===================== Private: Embedding =====================

  async _embed(text) {
    if (!this.embeddingModel) await this._loadModel()
    if (!this.embeddingModel) return this._fallbackVector(text)
    try {
      const output = await this.embeddingModel(text, { pooling: 'mean', normalize: true })
      return Array.from(output.data)
    } catch {
      return this._fallbackVector(text)
    }
  }

  async _loadModel() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return
    }
    try {
      const { env, pipeline } = await import('@xenova/transformers')
      const modelsDir = path.join(process.cwd(), 'resources', 'models')
      const bgeDir = path.join(modelsDir, 'bge-small-zh-v1.5')

      if (fs.existsSync(bgeDir)) {
        env.allowRemoteModels = false
        env.localModelPath = modelsDir
        this.embeddingModel = await pipeline('feature-extraction', 'bge-small-zh-v1.5', { quantized: true })
        return
      }

      try {
        this.embeddingModel = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5')
      } catch {
        this.embeddingModel = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2')
      }
    } catch {
      // fallback available
    }
  }

  _fallbackVector(text) {
    return Array.from({ length: 384 }, (_, i) => Math.sin(i * text.length))
  }

  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
  }

  // ===================== Private: Chunking =====================

  _buildHeaderPrefix(item) {
    const time = item.time || item.occurredAt || ''
    const project = item.project || item.shanggexiangmu || '日常'
    const mood = item._ai_meta?.mood_tags?.join('、') || ''
    return `【时间: ${time}】 【项目: ${project}】` + (mood ? ` 【情绪: ${mood}】` : '')
  }

  _generateChunks(item, parentId) {
    const chunks = []

    // 1. Macro chunk (fuses AI metadata)
    const macro = this._buildMacroText(item)
    if (macro) {
      chunks.push({ id: `${parentId}_macro`, parentId, text: macro, type: 'macro', original: item })
    }

    // 2. Micro / Full chunk (Adaptive + Header Injection)
    const text = this._getPlainText(item)
    if (text && text.trim().length > 0) {
      const header = this._buildHeaderPrefix(item)

      if (text.length < this.chunkingConfig.adaptiveThreshold) {
        // 短日记：整块保留
        chunks.push({
          id: `${parentId}_micro_0`,
          parentId,
          text: `${header}\n${text}`,
          type: 'micro',
          original: item
        })
      } else {
        // 长日记：滑动窗口切分
        const step = this.chunkingConfig.microWindowSize - this.chunkingConfig.microOverlap
        for (let i = 0; i < text.length; i += step) {
          const c = text.substring(i, i + this.chunkingConfig.microWindowSize)
          if (c.length >= 20) {
            chunks.push({
              id: `${parentId}_micro_${chunks.length}`,
              parentId,
              text: `${header}\n${c}`,
              type: 'micro',
              original: item
            })
          }
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
    if (Array.isArray(ai.items)) parts.push('相关：' + ai.items.join('、'))
    if (Array.isArray(ai.people_involved)) parts.push('人物：' + ai.people_involved.join('、'))
    if (Array.isArray(ai.topics)) parts.push('主题：' + ai.topics.join('、'))
    if (ai.location) parts.push('地点：' + ai.location)
    return parts.length > 0 ? parts.join('；') : null
  }

  _getPlainText(item) {
    return item._meta_plain_text ||
      item.contentText ||
      (item.ganshou || '').replace(/<[^>]+>/g, '').trim() ||
      ''
  }

  // ===================== Private: Utilities =====================

  _getItemId(item) {
    return item.id || item._id || item._meta_id || `${item.time || item.occurredAt}_${item.project || item.shanggexiangmu}`
  }

  _computeHash(item) {
    const content = JSON.stringify({
      id: this._getItemId(item),
      text: this._getPlainText(item),
      ai: item._ai_meta || item.ai_meta
    })
    return crypto.createHash('md5').update(content).digest('hex')
  }

  _filterByDateRange(candidates, dateRange) {
    const { start, end } = dateRange
    return candidates.filter(c => {
      const item = c.original
      if (!item) return false
      const itemTime = item.time || item.occurredAt
      if (!itemTime) return false
      const t = new Date(itemTime).getTime()
      if (isNaN(t)) return false
      if (start && t < new Date(start).getTime()) return false
      if (end && t > new Date(end).getTime()) return false
      return true
    })
  }

  _persist(store) {
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true })
    fs.writeFileSync(this.cacheFile, JSON.stringify(store), 'utf-8')
  }
}
