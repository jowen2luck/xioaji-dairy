/**
 * Tool 基类
 * 遵循 LangChain 1.0 Tool 规范
 */

export class Tool {
  constructor() {
    this.name = ''
    this.description = ''
    this.schema = {}
  }

  /**
   * 工具调用接口
   * @param {Object} input - 输入参数
   * @returns {Promise<ToolResult>} - 执行结果
   */
  async invoke(input) {
    throw new Error('invoke() method must be implemented by subclass')
  }

  /**
   * 验证输入参数
   * @param {Object} input - 输入参数
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validateInput(input) {
    return { valid: true, errors: [] }
  }

  /**
   * 获取工具元数据
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema
    }
  }
}

/**
 * Tool 执行结果包装类
 */
export class ToolResult {
  constructor(toolName, data, isError = false) {
    this.toolName = toolName
    this.data = data
    this.isError = isError
    this.timestamp = new Date().toISOString()
  }

  toJSON() {
    return {
      toolName: this.toolName,
      data: this.data,
      isError: this.isError,
      timestamp: this.timestamp
    }
  }
}

/**
 * 格式化记录为 LLM 友好的文本格式
 * 去除 JSON 噪点，仅保留核心语义
 */
export function formatRecordForLLM(item) {
  const parts = []
  
  // 核心字段
  if (item.time) parts.push(`时间：${item.time}`)
  if (item.shanggexiangmu) parts.push(`项目：${item.shanggexiangmu}`)
  if (item.chixushijian) parts.push(`时长：${item.chixushijian}`)
  
  // 内容/摘要
  if (item._ai_meta && item._ai_meta.summary) {
    parts.push(`摘要：${item._ai_meta.summary}`)
  }
  
  // 原始内容 (如果没有摘要，或者作为补充)
  // 如果有摘要，原始内容可以略去，或者截断
  if (!item._ai_meta?.summary && item.ganshou) {
    parts.push(`内容：${item.ganshou}`)
  } else if (item.ganshou && item.ganshou.length < 50) {
     // 短内容即使有摘要也可以保留
     parts.push(`原句：${item.ganshou}`)
  }

  // AI 元数据
  if (item._ai_meta) {
    if (Array.isArray(item._ai_meta.mood_tags) && item._ai_meta.mood_tags.length > 0) {
      parts.push(`情绪：${item._ai_meta.mood_tags.join('、')}`)
    }
    if (Array.isArray(item._ai_meta.people_involved) && item._ai_meta.people_involved.length > 0) {
      parts.push(`人物：${item._ai_meta.people_involved.join('、')}`)
    }
    if (item._ai_meta.location) {
      parts.push(`地点：${item._ai_meta.location}`)
    } else if (item._ai_meta.scene) {
      parts.push(`场景：${item._ai_meta.scene}`)
    }
    if (item._ai_meta.energy_level) {
      parts.push(`能量：${item._ai_meta.energy_level}`)
    }
  }

  return parts.join('\n')
}

/**
 * 净化记录对象，保留UI和LLM需要的核心字段，移除大字段（向量、原始元数据等）
 * @param {Object} item 原始记录
 * @returns {Object} 净化后的记录
 */
export function sanitizeRecordForUI(item) {
  const { 
    // 保留核心字段
    id, time, content, ganshou, shanggexiangmu, chixushijian, tags,
    // 保留 AI 分析摘要（如果需要展示情绪等）
    _ai_meta,
    // 移除 vector, embedding, _meta_plain_text 等大字段
    ...rest 
  } = item

  // 进一步清洗 _ai_meta，只保留 summary 和 mood_tags
  let cleanAiMeta = undefined
  if (_ai_meta) {
    cleanAiMeta = {
      summary: _ai_meta.summary,
      mood_tags: _ai_meta.mood_tags
    }
  }

  return {
    id,
    time,
    content: content || ganshou, // 兼容旧数据
    ganshou,
    shanggexiangmu,
    chixushijian,
    tags,
    _ai_meta: cleanAiMeta
  }
}
