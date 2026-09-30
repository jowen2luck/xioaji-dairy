/**
 * @file bm25.js
 * @description 轻量原生中文 Okapi BM25 倒排索引与检索器
 * 特性：
 * - 使用 Node.js 16+ 原生 Intl.Segmenter 进行中文分词，零外部依赖
 * - 标准 Okapi BM25 算法 (k1 = 1.5, b = 0.75)
 * - 针对日记生活化语言过滤无意义标点和停用助词
 * - 支持关键词命中上下文片段提取 (Highlighting Snippet)
 */

export class BM25Index {
  /**
   * @param {Object} options
   * @param {number} [options.k1=1.5] - 词频饱和度参数
   * @param {number} [options.b=0.75] - 文档长度归一化参数
   */
  constructor({ k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1
    this.b = b
    this.segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })

    // 常用中文标点与虚词过滤
    this.stopWords = new Set([
      '的', '了', '和', '是', '就', '都', '而', '及', '与', '着',
      '或', '一个', '没有', '我们', '你们', '他们', '这个', '那个',
      '在', '对', '从', '由', '向', '到', '把', '给', '被', '让',
      '，', '。', '！', '？', '；', '：', '“', '”', '‘', '’', '、',
      '（', '）', '【', '】', '《', '》', '…', '—', ',', '.', '!', '?', ';', ':'
    ])

    this.docs = new Map() // docId -> { id, text, rawDoc, length }
    this.invertedIndex = new Map() // term -> Map<docId, termFrequency>
    this.docCount = 0
    this.totalLength = 0
    this.avgDocLength = 0
  }

  /**
   * 中文分词与清洗
   * @param {string} text
   * @returns {string[]}
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return []
    const clean = text.toLowerCase().trim()
    const segments = this.segmenter.segment(clean)
    const tokens = []

    for (const seg of segments) {
      const w = seg.segment.trim()
      if (w.length > 0 && !this.stopWords.has(w) && !/^\s+$/.test(w)) {
        tokens.push(w)
      }
    }
    return tokens
  }

  /**
   * 添加单篇文档到索引
   * @param {string|number} docId
   * @param {string} text
   * @param {Object} [rawDoc]
   */
  addDocument(docId, text, rawDoc = null) {
    const id = String(docId)
    const tokens = this.tokenize(text)
    const docLength = tokens.length

    // 如果已存在则先扣减
    if (this.docs.has(id)) {
      this.removeDocument(id)
    }

    const tfMap = new Map()
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1)
    }

    for (const [term, freq] of tfMap.entries()) {
      let posting = this.invertedIndex.get(term)
      if (!posting) {
        posting = new Map()
        this.invertedIndex.set(term, posting)
      }
      posting.set(id, freq)
    }

    this.docs.set(id, {
      id,
      text,
      rawDoc,
      length: docLength
    })

    this.docCount++
    this.totalLength += docLength
    this.avgDocLength = this.docCount > 0 ? this.totalLength / this.docCount : 0
  }

  /**
   * 移除单篇文档
   * @param {string|number} docId
   */
  removeDocument(docId) {
    const id = String(docId)
    const existing = this.docs.get(id)
    if (!existing) return

    for (const [, posting] of this.invertedIndex.entries()) {
      posting.delete(id)
    }

    this.docs.delete(id)
    this.docCount--
    this.totalLength -= existing.length
    this.avgDocLength = this.docCount > 0 ? this.totalLength / this.docCount : 0
  }

  /**
   * 清空索引
   */
  clear() {
    this.docs.clear()
    this.invertedIndex.clear()
    this.docCount = 0
    this.totalLength = 0
    this.avgDocLength = 0
  }

  /**
   * 计算词语的 IDF (Okapi BM25 变体，平滑避免负值)
   * @param {string} term
   * @returns {number}
   */
  idf(term) {
    const posting = this.invertedIndex.get(term)
    const n = posting ? posting.size : 0
    // log(1 + (N - n + 0.5) / (n + 0.5))
    return Math.log(1 + (this.docCount - n + 0.5) / (n + 0.5))
  }

  /**
   * 执行 BM25 搜索
   * @param {string} query
   * @param {Object} [options]
   * @param {number} [options.topK=50]
   * @param {Function} [options.filter] - 可选的文档过滤器 (rawDoc) => boolean
   * @returns {Array<{ id: string, score: number, rawDoc: Object, snippet: string }>}
   */
  search(query, { topK = 50, filter = null } = {}) {
    if (!query || this.docCount === 0) return []

    const queryTokens = this.tokenize(query)
    if (queryTokens.length === 0) return []

    const scores = new Map() // docId -> score

    for (const term of queryTokens) {
      const posting = this.invertedIndex.get(term)
      if (!posting) continue

      const termIdf = this.idf(term)

      for (const [docId, tf] of posting.entries()) {
        const doc = this.docs.get(docId)
        if (!doc) continue

        // 预过滤
        if (filter && typeof filter === 'function' && !filter(doc.rawDoc)) {
          continue
        }

        // BM25 TF 归一化公式
        const numerator = tf * (this.k1 + 1)
        const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.length / (this.avgDocLength || 1)))
        const termScore = termIdf * (numerator / denominator)

        scores.set(docId, (scores.get(docId) || 0) + termScore)
      }
    }

    // 排序并截断
    const ranked = Array.from(scores.entries())
      .map(([docId, score]) => {
        const doc = this.docs.get(docId)
        const snippet = this.extractSnippet(doc?.text || '', queryTokens)
        return {
          id: docId,
          score,
          rawDoc: doc?.rawDoc || null,
          text: doc?.text || '',
          snippet
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return ranked
  }

  /**
   * 提取最匹配关键词的高亮上下文片段 (Highlighting Snippet)
   * 寻找包含最多命中词的窗口，截取前后 80~120 字符
   * @param {string} text - 原始内容
   * @param {string[]|string} queryTokens - 查询词元
   * @param {number} [maxLen=100] - 片段最大长度
   * @returns {string}
   */
  extractSnippet(text, queryTokens, maxLen = 100) {
    if (!text || typeof text !== 'string') return ''
    const tokens = Array.isArray(queryTokens) ? queryTokens : this.tokenize(queryTokens)
    if (tokens.length === 0) {
      return text.slice(0, maxLen) + (text.length > maxLen ? '...' : '')
    }

    // 寻找第一个命中词的位置
    let firstIndex = -1
    let matchedToken = ''

    for (const tok of tokens) {
      const idx = text.indexOf(tok)
      if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
        firstIndex = idx
        matchedToken = tok
      }
    }

    if (firstIndex === -1) {
      return text.slice(0, maxLen) + (text.length > maxLen ? '...' : '')
    }

    // 以第一个命中词为中心前后截取
    const half = Math.floor(maxLen / 2)
    let start = Math.max(0, firstIndex - half)
    let end = Math.min(text.length, start + maxLen)

    if (end - start < maxLen) {
      start = Math.max(0, end - maxLen)
    }

    let snippet = text.substring(start, end).replace(/\s+/g, ' ').trim()
    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'

    return snippet
  }
}

/**
 * RRF (Reciprocal Rank Fusion) 倒数排名融合算法
 * @param {Array<Array<{ id: string, [key: string]: any }>>} rankedLists - 多路排序结果
 * @param {number} [k=60] - 平滑常数
 * @returns {Array<{ id: string, rrfScore: number, item: Object, snippet: string }>}
 */
export function reciprocalRankFusion(rankedLists, k = 60) {
  const scoreMap = new Map() // id -> { rrfScore, item, snippet }

  for (const list of rankedLists) {
    if (!Array.isArray(list)) continue

    list.forEach((entry, rankIndex) => {
      const id = String(entry.id || entry.parentId || entry.recordId)
      if (!id) return

      const rank = rankIndex + 1
      const score = 1 / (k + rank)

      const existing = scoreMap.get(id)
      if (existing) {
        existing.rrfScore += score
        if (entry.rawDoc || entry.original) {
          existing.item = entry.rawDoc || entry.original
        }
        if (entry.snippet && !existing.snippet) {
          existing.snippet = entry.snippet
        }
      } else {
        scoreMap.set(id, {
          id,
          rrfScore: score,
          item: entry.rawDoc || entry.original || entry,
          snippet: entry.snippet || ''
        })
      }
    })
  }

  return Array.from(scoreMap.values()).sort((a, b) => b.rrfScore - a.rrfScore)
}
