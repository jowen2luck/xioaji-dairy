import { describe, it, expect, beforeEach } from 'vitest'
import { ToolOffloader } from '../src/main/agent/middleware/toolOffloader.js'

describe('ToolOffloader', () => {
  let offloader

  beforeEach(() => {
    offloader = new ToolOffloader({ thresholdCount: 3, thresholdChars: 500 })
  })

  it('should not offload small tool results', () => {
    const smallResult = {
      records: [
        { id: '1', date: '2026-09-01', content: '今天天气不错', project: '生活' }
      ]
    }
    const processed = offloader.process('query_records', smallResult)
    expect(processed.offloaded).toBe(false)
    expect(processed.content).toBe(smallResult)
  })

  it('should support default relaxed threshold (8 records, 2000 chars)', () => {
    const defaultOffloader = new ToolOffloader()
    const fiveRecords = Array.from({ length: 5 }, (_, i) => ({
      id: `rec_${i + 1}`,
      date: `2026-09-0${i + 1}`,
      content: `短日记 ${i + 1}`,
      project: '生活'
    }))

    // 5 条记录应直接放行，不触发 offload
    const processed = defaultOffloader.process('search_records', { records: fiveRecords })
    expect(processed.offloaded).toBe(false)
  })

  it('should offload large record sets and prioritize matchedSnippet in preview', () => {
    const largeRecords = Array.from({ length: 15 }, (_, i) => ({
      id: `rec_${i + 1}`,
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      content: `这是第 ${i + 1} 条长日记内容，描述了详细的工作实验过程。`,
      project: i % 2 === 0 ? '科研' : '运动',
      mood: i % 2 === 0 ? '专注' : '兴奋',
      matchedSnippet: `高亮测试关键词命中片段 ${i + 1}`
    }))

    const processed = offloader.process('query_records', { records: largeRecords })
    expect(processed.offloaded).toBe(true)
    expect(typeof processed.content).toBe('string')
    expect(processed.content).toContain('共检索到 15 条记录')
    expect(processed.content).toContain('rec_1')
    expect(processed.content).toContain('关键摘录:"高亮测试关键词命中片段 1')
    expect(processed.content).toContain('get_record_detail')
    expect(processed.cacheId).toBeDefined()

    // Can retrieve detail from offloader
    const detail = offloader.getRecordDetail('rec_1')
    expect(detail).toBeDefined()
    expect(detail.id).toBe('rec_1')
    expect(detail.content).toContain('第 1 条长日记')
  })

  it('should offload very long text output', () => {
    const longString = 'A'.repeat(1200)
    const processed = offloader.process('sql_analysis', longString)
    expect(processed.offloaded).toBe(true)
    expect(processed.content).toContain('超长文本输出已外置暂存')
  })
})
