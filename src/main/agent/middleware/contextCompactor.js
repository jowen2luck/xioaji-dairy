/**
 * ContextCompactor - 滑动窗口与滚动压缩中间件 (Harness 范式)
 * 职责：
 * 1. 彻底代替硬切历史的“吸星大法”，原样保留最近 N 轮完整对白，保护多轮追问语境
 * 2. 超过窗口阈值的更早对白滚动提取为精炼的前情提要 (Context Rollup)
 * 3. 融合 Core Memory、动态时间锚点与系统人设，组装最终 Model Messages
 */

export class ContextCompactor {
  constructor({ windowSize = 6 } = {}) {
    // 默认保留最近 6 条消息（约 3 轮用户-助手往返）
    this.windowSize = windowSize
  }

  /**
   * 执行滑动窗口剪枝与滚动摘要提取
   * @param {Array} messages - 历史消息数组 [{ role, content }]
   * @param {string} [existingSummary] - 之前已有滚动摘要
   * @returns {{ compactedMessages: Array, summary: string|null }}
   */
  compact(messages = [], existingSummary = '') {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { compactedMessages: [], summary: existingSummary || null }
    }

    // 过滤掉已有的系统提示词，并严格清洗错误残留、<pre> 堆栈与空消息
    const chatMessages = messages.filter(m => {
      if (m.role !== 'user' && m.role !== 'assistant') return false
      const c = String(m.content || '').trim()
      if (!c) return false
      if (c.startsWith('<pre>') || c.startsWith('LLM 调用失败') || c.includes('"success": false')) {
        return false
      }
      return true
    })

    if (chatMessages.length <= this.windowSize) {
      return {
        compactedMessages: chatMessages,
        summary: existingSummary || null
      }
    }

    const cutPoint = chatMessages.length - this.windowSize
    const olderMessages = chatMessages.slice(0, cutPoint)
    const recentMessages = chatMessages.slice(cutPoint)

    // 提取旧消息脉络摘要
    const summaries = []
    if (existingSummary && existingSummary.trim()) {
      summaries.push(existingSummary.trim())
    }

    const olderPoints = []
    for (let i = 0; i < olderMessages.length; i += 2) {
      const u = olderMessages[i]
      const a = olderMessages[i + 1]
      const uSnippet = u ? String(u.content).replace(/\n/g, ' ').slice(0, 40) : ''
      const aSnippet = a ? String(a.content).replace(/\n/g, ' ').slice(0, 40) : ''
      if (uSnippet) {
        olderPoints.push(`- 探讨 "${uSnippet}" -> 归纳: "${aSnippet}"`)
      }
    }

    const newRollup = `【前情提要 / 历史讨论摘要】:\n${olderPoints.join('\n')}`
    summaries.push(newRollup)

    const finalSummary = summaries.join('\n\n')

    return {
      compactedMessages: recentMessages,
      summary: finalSummary
    }
  }

  /**
   * 组装直接提供给大模型的完整结构化 Messages
   */
  buildModelMessages({
    systemPrompt = '',
    coreMemoryPrompt = '',
    messages = [],
    currentUserQuery = '',
    existingSummary = ''
  } = {}) {
    const { compactedMessages, summary } = this.compact(messages, existingSummary)

    // 1. 组装 System Prompt (基础提示词 + Core Memory)
    let fullSystemContent = systemPrompt
    if (coreMemoryPrompt) {
      fullSystemContent += `\n\n${coreMemoryPrompt}`
    }

    const modelPayload = [
      { role: 'system', content: fullSystemContent }
    ]

    // 2. 插入滚动摘要（若有）
    if (summary) {
      modelPayload.push({
        role: 'system',
        content: summary
      })
    }

    // 3. 插入最近几轮原汁原味对白
    for (const msg of compactedMessages) {
      // 避免重复追加最后一条用户提问
      modelPayload.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })
    }

    // 4. 确保当前最新提问处于队尾
    const lastMsg = modelPayload[modelPayload.length - 1]
    if (currentUserQuery && (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== currentUserQuery)) {
      modelPayload.push({
        role: 'user',
        content: currentUserQuery
      })
    }

    return modelPayload
  }
}

export const globalContextCompactor = new ContextCompactor()
