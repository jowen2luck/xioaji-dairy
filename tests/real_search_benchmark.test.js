import { describe, it, expect } from 'vitest'
import { performance } from 'node:perf_hooks'
import { SearchRecordsTool } from '../src/main/tools/searchRecords.js'

describe('Real Search Benchmark', () => {
  it('should execute end-to-end hybrid retrieval with pure local models and BM25', async () => {
    const tool = new SearchRecordsTool()
    const query = '累 疲惫 乏力'

    // 第一次调用（建立缓存）
    const t0 = performance.now()
    const res1 = await tool.invoke({ query, limit: 5 })
    const t1 = performance.now()

    // 第二次调用（完全命中缓存，模拟用户真实日常搜索）
    const t2 = performance.now()
    const res2 = await tool.invoke({ query, limit: 5 })
    const t3 = performance.now()

    console.log(`\n========================================`)
    console.log(`[实测数据] 首次检索总耗时: ${(t1 - t0).toFixed(2)} ms`)
    console.log(`[实测数据] 二次检索命中缓存耗时: ${(t3 - t2).toFixed(2)} ms ⚡ (极速响应)`)
    console.log(`[实测数据] 调试信息:`, res2.data.debug)
    console.log(`\n--- 召回前 3 条日记摘要 ---`)
    console.log(res2.data.records.slice(0, 3).map(r => `[${r.time}] [${r.shanggexiangmu}] ${r.matchedSnippet || r.content}`).join('\n---\n'))
    console.log(`========================================\n`)

    expect(res2.isError).toBe(false)
    expect(res2.data.records.length).toBeGreaterThan(0)
    expect((t3 - t2)).toBeLessThan(200) // 二次检索应在 200ms 内完成！
  }, 15000)
})
