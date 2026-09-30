import { describe, it, expect } from 'vitest'
import { ContextCompactor } from '../src/main/agent/middleware/contextCompactor.js'

describe('ContextCompactor', () => {
  const compactor = new ContextCompactor({ windowSize: 4 })

  it('should keep messages untouched if under windowSize', () => {
    const messages = [
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '第二问' },
      { role: 'assistant', content: '第二答' }
    ]

    const result = compactor.compact(messages)
    expect(result.summary).toBeNull()
    expect(result.compactedMessages.length).toBe(4)
    expect(result.compactedMessages[0].content).toBe('第一问')
    expect(result.compactedMessages[3].content).toBe('第二答')
  })

  it('should roll older messages into context summary when exceeding windowSize', () => {
    const messages = [
      { role: 'user', content: '聊了聊论文初稿的实验' },
      { role: 'assistant', content: '建议把对比实验补充在第三章' },
      { role: 'user', content: '刚才说的第三章还有什么注意点？' },
      { role: 'assistant', content: '注意图表清晰度与引用标准' },
      { role: 'user', content: '展开讲讲第二点引用标准' },
      { role: 'assistant', content: '格式应统一为APA第7版' },
      { role: 'user', content: '那明天怎么安排合适？' }
    ]

    const result = compactor.compact(messages)
    // Should preserve the last 4 messages intact
    expect(result.compactedMessages.length).toBe(4)
    expect(result.compactedMessages[result.compactedMessages.length - 1].content).toBe('那明天怎么安排合适？')
    expect(result.compactedMessages[result.compactedMessages.length - 2].content).toBe('格式应统一为APA第7版')

    // Older turns should be summarized into a context rollup
    expect(result.summary).toBeDefined()
    expect(result.summary).toContain('前情提要')
  })

  it('should format messages into model payload with system prompt and core memory', () => {
    const messages = [
      { role: 'user', content: '今天想梳理一下' }
    ]
    const systemPrompt = '你是一个温暖的陪伴者。'
    const coreMemoryPrompt = '<core_memory>用户喜欢跑步</core_memory>'

    const payload = compactor.buildModelMessages({
      systemPrompt,
      coreMemoryPrompt,
      messages,
      currentUserQuery: '今天想梳理一下'
    })

    expect(payload[0].role).toBe('system')
    expect(payload[0].content).toContain(systemPrompt)
    expect(payload[0].content).toContain('用户喜欢跑步')
    expect(payload[payload.length - 1].content).toBe('今天想梳理一下')
  })
})
