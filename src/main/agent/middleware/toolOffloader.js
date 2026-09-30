/**
 * ToolOffloader - 工具输出重载外置中间件 (Deep Agents 范式升级版)
 * 职责：
 * 1. 放宽常规阈值 (8 条 / 2000 字符)，让 90% 的普通回忆查询单轮 Inline 直接交付给 Agent
 * 2. 真正超长面临溢出风险时，将全量结果存入本地会话缓存 (Offload Cache)
 * 3. 骨架卡片优先透出 Highlighting Snippet (高亮命中上下文)，打破信息不对称
 * 4. 配合 get_record_detail 工具支持按需点选深入阅读
 */

export class ToolOffloader {
  /**
   * @param {Object} [options]
   * @param {number} [options.thresholdCount=8] - 记录条数外置阈值
   * @param {number} [options.thresholdChars=2000] - 文本字符外置阈值
   */
  constructor({ thresholdCount = 15, thresholdChars = 5000 } = {}) {
    this.thresholdCount = thresholdCount
    this.thresholdChars = thresholdChars
    this.cache = new Map() // cacheId -> fullPayload
    this.recordsById = new Map() // recordId -> record
  }

  /**
   * 处理工具执行结果
   * @param {string} toolName - 工具名称
   * @param {*} rawResult - 原始工具返回值
   * @returns {{ offloaded: boolean, content: *, cacheId?: string }}
   */
  process(toolName, rawResult) {
    if (!rawResult) {
      return { offloaded: false, content: rawResult }
    }

    // 提取可能存在的记录数组
    let records = null
    if (Array.isArray(rawResult)) {
      records = rawResult
    } else if (rawResult && typeof rawResult === 'object') {
      if (Array.isArray(rawResult.records)) {
        records = rawResult.records
      } else if (Array.isArray(rawResult.data)) {
        records = rawResult.data
      } else if (rawResult.data && Array.isArray(rawResult.data.records)) {
        records = rawResult.data.records
      }
    }

    // 场景 A: 结构化记录数组超出阈值
    if (records && records.length > this.thresholdCount) {
      const cacheId = `cache_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`
      this.cache.set(cacheId, records)

      // 按 ID 建立索引
      for (const rec of records) {
        if (rec && (rec.id || rec._id || rec._meta_id)) {
          const idKey = String(rec.id || rec._id || rec._meta_id)
          this.recordsById.set(idKey, rec)
        }
      }

      const totalCount = records.length
      const topSamples = records.slice(0, 5)

      // 提取起止时间
      const dates = records.map(r => r.date || r.time || r.createdAt || '').filter(Boolean).sort()
      const timeSpan = dates.length > 0 ? `${dates[0]} 至 ${dates[dates.length - 1]}` : '多时间段'

      const sampleLines = topSamples.map((r, idx) => {
        const id = r.id || r._id || r._meta_id || `idx_${idx + 1}`
        const date = r.date || r.time || '未知日期'
        const project = r.project || r.shanggexiangmu || '常规'
        const mood = r.mood || (r._ai_meta?.mood_tags?.[0]) || '未记录'

        // 优先使用检索系统返回的关键词高亮片段
        let snippet = r.matchedSnippet || ''
        if (!snippet) {
          const text = r.content || r.raw || r.summary || (r._ai_meta?.summary) || r.ganshou || ''
          snippet = String(text).replace(/\s+/g, ' ').slice(0, 100)
        }
        return `  ${idx + 1}. [${date}] [项目:${project}] [情绪:${mood}] 关键摘录:"${snippet}..." (ID: ${id})`
      }).join('\n')

      const compactSummary = `
[工具执行结果 - 数据已智能外置与切片]:
- 工具名称: ${toolName}
- 检索命中总数: 共检索到 ${totalCount} 条记录 (时间跨度: ${timeSpan})
- 核心样本预览 (Top ${topSamples.length}):
${sampleLines}
- 状态: 其余 ${totalCount - topSamples.length} 条已安全外置暂存 (CacheRef: ${cacheId})
【指引】：
1. 若以上样本及关键摘录已足以回答用户问题，请直接生成综合回答，避免逐条调用 get_record_detail；
2. 仅当用户明确询问某条记录的完整长文时，才按需调用 get_record_detail({ id: "<记录ID>" })。
`.trim()

      return {
        offloaded: true,
        content: compactSummary,
        cacheId,
        rawCount: totalCount
      }
    }

    // 场景 B: 纯文本输出过长
    const str = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
    if (str.length > this.thresholdChars) {
      const cacheId = `cache_str_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`
      this.cache.set(cacheId, rawResult)

      const head = str.slice(0, 300)
      const tail = str.slice(-200)
      const compactStr = `
[工具执行结果 - 超长文本输出已外置暂存]:
- 工具名称: ${toolName}
- 字符总长度: ${str.length} 字符
- 前景预览:
${head}
... [中间内容已截断，缓存指针: ${cacheId}] ...
${tail}
`.trim()

      return {
        offloaded: true,
        content: compactStr,
        cacheId
      }
    }

    return { offloaded: false, content: rawResult }
  }

  /**
   * 获取某篇外置日记的详情
   */
  getRecordDetail(id) {
    if (!id) return null
    return this.recordsById.get(String(id)) || null
  }
}

// 默认单例
export const globalToolOffloader = new ToolOffloader()
