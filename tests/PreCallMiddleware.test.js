import { describe, it, expect } from 'vitest'
import { PreCallMiddleware } from '../src/main/agent/middleware/preCallMiddleware.js'

describe('PreCallMiddleware', () => {
  const middleware = new PreCallMiddleware()

  it('should generate accurate temporal anchors', () => {
    const anchors = middleware.getTemporalAnchors()
    expect(anchors).toContain('【当前时间锚点】')
    expect(anchors).toContain('今天:')
    expect(anchors).toContain('本周范围:')
    expect(anchors).toContain('上周范围:')
    expect(anchors).toContain('本月范围:')
  })

  it('should reuse CalendarResolverTool to pre-resolve temporal queries', () => {
    // "上周" should be resolved to a specific ISO date range without LLM
    const resolved = middleware.preResolveTemporal('查一下我上周的日记')
    expect(resolved).toBeDefined()
    expect(resolved.hasTemporal).toBe(true)
    expect(resolved.range.start).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(resolved.range.end).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(resolved.promptHint).toContain('已前置解析时间范围')
  })

  it('should detect casual greetings for fast-path bypass', () => {
    expect(middleware.isCasualGreeting('你好呀')).toBe(true)
    expect(middleware.isCasualGreeting('hi')).toBe(true)
    expect(middleware.isCasualGreeting('在吗')).toBe(true)
    expect(middleware.isCasualGreeting('哈哈哈哈')).toBe(true)
    expect(middleware.isCasualGreeting('帮我查一下上周写了多少行代码')).toBe(false)
  })

  it('should compose augmented system prompt', () => {
    const basePrompt = '你是专业的日记分析师。'
    const augmented = middleware.augmentSystemPrompt(basePrompt, '查一下上周的总结')
    expect(augmented).toContain(basePrompt)
    expect(augmented).toContain('【当前时间锚点】')
    expect(augmented).toContain('已前置解析时间范围')
  })

  it('should support process pipeline call used by ipcHandlers', async () => {
    const casualResult = await middleware.process({ userQuery: '你好' })
    expect(casualResult.isCasual).toBe(true)
    expect(casualResult.timeAnchor).toBeDefined()

    const temporalResult = await middleware.process({ userQuery: '查一下上周记录' })
    expect(temporalResult.isCasual).toBe(false)
    expect(temporalResult.resolvedTime).toBeDefined()
    expect(temporalResult.resolvedTime.start).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('should filter proactive recall based on triggers, distance, and cooldown', async () => {
    // Mock a search tool
    const mockSearchTool = {
      invoke: async ({ query }) => ({
        data: {
          records: [
            {
              time: '2026-09-01 10:00:00', // ~19 days before 2026-09-20
              matchedSnippet: '代码报错了，压力好大，感觉好累',
              ganshou: '非常疲惫'
            }
          ]
        }
      })
    }

    const testMiddleware = new PreCallMiddleware({
      searchTool: mockSearchTool,
      storagePath: null // in-memory
    })

    // 1. Explicit search commands should NOT trigger proactive recall
    const explicitCmd = await testMiddleware.checkProactiveRecall('查一下我之前什么时候累')
    expect(explicitCmd).toBeNull()

    // 2. Normal non-trigger text should NOT trigger
    const normalText = await testMiddleware.checkProactiveRecall('今天天气真好，出去散步了')
    expect(normalText).toBeNull()

    // 3. Trigger pattern with cycle/fatigue words AND >= 14 days old should trigger!
    const triggerText = '今天怎么又感觉压力好大，心慌意乱的'
    const echoResult = await testMiddleware.checkProactiveRecall(triggerText, '2026-09-20T12:00:00')
    expect(echoResult).toBeDefined()
    expect(echoResult).toContain('【小鸡的心头记忆 (偶尔的默契回响)】')
    expect(echoResult).toContain('压力好大')

    // 4. Second call within 3 days should be blocked by the Cooldown lock!
    const cooldownBlocked = await testMiddleware.checkProactiveRecall(triggerText, '2026-09-21T12:00:00')
    expect(cooldownBlocked).toBeNull()

    // 5. After 3 days (e.g. 4 days later), should be allowed again
    const afterCooldown = await testMiddleware.checkProactiveRecall(triggerText, '2026-09-25T12:00:00')
    expect(afterCooldown).toBeDefined()
    expect(afterCooldown).toContain('【小鸡的心头记忆 (偶尔的默契回响)】')
  })
})
