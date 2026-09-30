/**
 * ContextCompactor - 滑动窗口与滚动压缩中间件 (Harness 范式 + 隐性动态记忆激活)
 * 职责：
 * 1. 彻底代替硬切历史的“吸星大法”，原样保留最近 N 轮完整对白，保护多轮追问语境
 * 2. 超过窗口阈值的更早对白滚动提取为精炼的前情提要 (Context Rollup)
 * 3. 融合 Core Memory、动态检索的情节暗知识 (Contextual Memories)、时间锚点与系统人设，组装最终 Model Messages
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

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

    // 过滤掉已有的系统提示词，严格清洗错误残留、<pre> 堆栈与空消息，并防御相邻重复用户提问
    const chatMessages = []
    for (const m of messages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue
      const c = String(m.content || '').trim()
      if (!c) continue
      if (c.startsWith('<pre>') || c.startsWith('LLM 调用失败') || c.includes('"success": false')) {
        continue
      }
      const prev = chatMessages[chatMessages.length - 1]
      if (prev && prev.role === 'user' && m.role === 'user' && String(prev.content || '').trim() === c) {
        continue
      }
      chatMessages.push(m)
    }

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
   * @param {Object} options
   * @param {string} [options.systemPrompt='']
   * @param {string} [options.coreMemoryPrompt='']
   * @param {Array<Object|string>} [options.relevantMemories=[]] - 动态召回的 Top-K 情节记忆
   * @param {Array} [options.messages=[]]
   * @param {string} [options.currentUserQuery='']
   * @param {string} [options.existingSummary='']
   */
  buildModelMessages({
    systemPrompt = '',
    coreMemoryPrompt = '',
    relevantMemories = [],
    messages = [],
    currentUserQuery = '',
    existingSummary = ''
  } = {}) {
    const { compactedMessages, summary } = this.compact(messages, existingSummary)

    // 1. 组装 System Prompt (基础提示词 + Core Memory + Contextual Memories)
    let fullSystemContent = systemPrompt
    if (coreMemoryPrompt) {
      fullSystemContent += `\n\n${coreMemoryPrompt}`
    }

    // 隐性动态暗知识注入（双层提示词隔离，杜绝机械背诵）
    if (Array.isArray(relevantMemories) && relevantMemories.length > 0) {
      const factLines = relevantMemories
        .map(m => `- ${typeof m === 'string' ? m : m.content}`)
        .filter(Boolean)

      if (factLines.length > 0) {
        fullSystemContent += `\n\n<contextual_memories>
【后台背景暗知识 (Contextual Memories)】
${factLines.join('\n')}
(重要准则：以上信息仅作为你深度理解用户当前语境与隐含情绪的后台背景知识。除非用户明确在提问中要求你回忆某事，否则你绝对不要在回复中主动生硬引用这些事实，严禁使用“我记得你...”、“根据记录...”等机械句式。你的共情与懂你，必须隐晦地体现在回复的语气和对问题的理解深度中，而不是通过陈述历史来证明你的记忆力。)
</contextual_memories>`
      }
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

    // 3. 插入最近几轮原汁原味对白（附带真实时间感知前缀）
    for (const msg of compactedMessages) {
      let content = String(msg.content || '').trim()
      let timePrefix = msg.timePrefix || ''

      if (!timePrefix && msg.time) {
        try {
          const t = dayjs(msg.time).tz('Asia/Shanghai')
          if (t.isValid()) {
            const h = t.hour()
            const p = h >= 5 && h < 9 ? '早晨' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜'
            timePrefix = `[${t.format('HH:mm')} ${p}] `
          }
        } catch {}
      }

      if (timePrefix && !content.startsWith('[')) {
        content = `${timePrefix}${content}`
      }

      modelPayload.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content
      })
    }

    // 4. 确保当前最新提问处于队尾
    const lastMsg = modelPayload[modelPayload.length - 1]
    if (currentUserQuery && (!lastMsg || lastMsg.role !== 'user' || !lastMsg.content.includes(currentUserQuery))) {
      modelPayload.push({
        role: 'user',
        content: currentUserQuery
      })
    }

    return modelPayload
  }
}

export const globalContextCompactor = new ContextCompactor()
