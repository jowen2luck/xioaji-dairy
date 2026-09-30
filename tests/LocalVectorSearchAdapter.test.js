/**
 * LocalVectorSearchAdapter Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import LocalVectorSearchAdapter from '../src/main/infrastructure/retrieval/LocalVectorSearchAdapter.js'

const testCacheDir = path.join(tmpdir(), 'vector-adapter-test-' + Date.now())

describe('LocalVectorSearchAdapter', () => {
  let adapter

  beforeEach(() => {
    adapter = new LocalVectorSearchAdapter({ cacheDir: testCacheDir })
  })

  afterEach(() => {
    adapter.clearCache()
    try { fs.rmSync(testCacheDir, { recursive: true, force: true }) } catch {}
  })

  it('should initialize with empty vector DB', () => {
    expect(adapter.vectorDB).toEqual([])
  })

  it('should sync records and produce chunks (with AI metadata for macro)', async () => {
    const records = [
      { id: 'r1', occurredAt: '2026-07-25', contentText: '今天和妈妈一起吃了早饭，感觉很温暖。', _ai_meta: { summary: '与家人共度时光', mood_tags: ['温馨'] } },
      { id: 'r2', occurredAt: '2026-07-24', contentText: '项目会议很顺利，讨论了新功能开发。' },
    ]
    const count = await adapter.sync(records)
    expect(count).toBeGreaterThan(0)
    expect(adapter.vectorDB.length).toBeGreaterThan(0)
  })

  it('should reuse cached vectors on second sync', async () => {
    const records = [
      { id: 'r1', occurredAt: '2026-07-25', contentText: '今天和妈妈一起吃了早饭，感觉很温暖。', _ai_meta: { summary: '与家人共度时光' } },
    ]
    const count1 = await adapter.sync(records)
    const count2 = await adapter.sync(records)
    expect(count1).toBe(count2)
  })

  it('should return empty results when vector DB is empty', async () => {
    const results = await adapter.search('test', {}, 10)
    expect(results).toEqual([])
  })

  it('should clear cache', async () => {
    const records = [
      { id: 'r1', occurredAt: '2026-07-25', contentText: '今天和妈妈一起吃了早饭，感觉很温暖。', _ai_meta: { summary: '与家人共度时光' } },
    ]
    await adapter.sync(records)
    expect(adapter.vectorDB.length).toBeGreaterThan(0)
    adapter.clearCache()
    expect(adapter.vectorDB).toEqual([])
  })

  it('should generate macro chunks for records with AI metadata', () => {
    const item = {
      id: 'r1',
      _ai_meta: {
        summary: '与家人共度时光',
        mood_tags: ['温馨', '幸福'],
        people_involved: ['妈妈']
      }
    }
    const chunks = adapter._generateChunks(item, 'r1')
    const macro = chunks.find(c => c.type === 'macro')
    expect(macro).toBeDefined()
    expect(macro.text).toContain('与家人共度时光')
    expect(macro.text).toContain('温馨')
  })

  it('should inject header into micro chunks and support adaptive chunking', () => {
    // 场景 1: 短日记整篇作为单个 chunk 并注入 Header
    const shortItem = {
      id: 'r1',
      time: '2026-07-25',
      project: '家庭生活',
      contentText: '今天和妈妈一起吃了早饭，感觉很温暖。'
    }
    const shortChunks = adapter._generateChunks(shortItem, 'r1')
    const shortMicros = shortChunks.filter(c => c.type === 'micro')
    expect(shortMicros.length).toBe(1)
    expect(shortMicros[0].text).toContain('【时间: 2026-07-25】')
    expect(shortMicros[0].text).toContain('【项目: 家庭生活】')

    // 场景 2: 超长日记滑动切片并每块注入 Header
    const longItem = {
      id: 'r2',
      time: '2026-07-26',
      project: '深度科研',
      contentText: '这是一个很长的工作总结。'.repeat(30)
    }
    const longChunks = adapter._generateChunks(longItem, 'r2')
    const longMicros = longChunks.filter(c => c.type === 'micro')
    expect(longMicros.length).toBeGreaterThan(1)
    expect(longMicros[0].text).toContain('【项目: 深度科研】')
    expect(longMicros[1].text).toContain('【项目: 深度科研】')
  })

  it('should compute consistent hash for same content', () => {
    const item = { id: 'r1', contentText: 'hello world' }
    const hash1 = adapter._computeHash(item)
    const hash2 = adapter._computeHash(item)
    expect(hash1).toBe(hash2)
  })

  it('should compute different hash for different content', () => {
    const item1 = { id: 'r1', contentText: 'hello' }
    const item2 = { id: 'r2', contentText: 'world' }
    expect(adapter._computeHash(item1)).not.toBe(adapter._computeHash(item2))
  })

  it('should calculate cosine similarity correctly', () => {
    const a = [1, 0, 0]
    const b = [1, 0, 0]
    const c = [0, 1, 0]
    expect(adapter._cosineSimilarity(a, b)).toBeCloseTo(1.0, 5)
    expect(adapter._cosineSimilarity(a, c)).toBeCloseTo(0.0, 5)
  })

  it('should handle zero vectors in cosine similarity', () => {
    const a = [0, 0, 0]
    const b = [1, 2, 3]
    expect(adapter._cosineSimilarity(a, b)).toBe(0)
  })

  it('should filter by date range', () => {
    const candidates = [
      { parentId: 'r1', original: { time: '2026-07-25T09:00:00' }, similarity: 0.9 },
      { parentId: 'r2', original: { time: '2026-07-20T09:00:00' }, similarity: 0.8 },
    ]
    const filtered = adapter._filterByDateRange(candidates, { start: '2026-07-24', end: '2026-07-26' })
    expect(filtered.length).toBe(1)
    expect(filtered[0].parentId).toBe('r1')
  })
})
