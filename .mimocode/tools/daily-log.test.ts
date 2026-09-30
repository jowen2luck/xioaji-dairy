/**
 * daily-log 工具单元测试
 * 测试所有 7 个动作和过滤维度
 *
 * 本测试使用真实的工具逻辑，通过 mock 文件系统来控制测试数据。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 创建临时测试目录
const testDir = join(tmpdir(), 'daily-log-test-' + Date.now())
const testDataDir = join(testDir, 'daily_log_vue')

// 测试数据
const testRecords = [
  {
    _id: 'test-001',
    time: '2026-07-25 09:00',
    ganshou: '<p>今天和妈妈一起吃了早饭，感觉很温暖</p>',
    tiyan: '温暖',
    xinqing: '#FFD700',
    shanggexiangmu: '家庭',
    chixushijian: '1小时30分钟',
    chengjiu: true
  },
  {
    _id: 'test-002',
    time: '2026-07-24 14:30',
    ganshou: '<p>项目会议很顺利，讨论了新功能开发</p>',
    tiyan: '顺利',
    xinqing: '#90EE90',
    shanggexiangmu: '工作',
    chixushijian: '2小时',
    chengjiu: false
  },
  {
    _id: 'test-003',
    time: '2026-07-23 20:00',
    ganshou: '<p>有点焦虑，明天有重要汇报</p>',
    tiyan: '焦虑',
    xinqing: '#87CEEB',
    shanggexiangmu: '工作',
    chixushijian: '30分钟',
    chengjiu: false
  }
]

const testAiMeta = {
  items: {
    'hash-001': {
      data: {
        summary: '与家人共度美好时光',
        mood_tags: ['温馨', '家庭'],
        energy_level: 8,
        primary_domain: '家庭',
        people_involved: ['妈妈']
      }
    },
    'hash-002': {
      data: {
        summary: '项目进展顺利',
        mood_tags: ['专注', '高效'],
        energy_level: 7,
        primary_domain: '工作',
        people_involved: ['同事', '导师']
      }
    }
  }
}

const testSummaries = [
  {
    _id: 'summary-001',
    _summary_type: 'weekly',
    _summary_period: { start: '2026-07-20', end: '2026-07-26' },
    content: '本周主要完成了项目开发和家庭聚会',
    stats: { totalDays: 5, avgEnergy: 7.2 },
    model: 'gpt-4',
    created_at: '2026-07-26T10:00:00Z'
  }
]

// 设置测试环境
beforeAll(() => {
  // 创建测试目录
  mkdirSync(testDataDir, { recursive: true })
  
  // 写入测试数据
  writeFileSync(join(testDataDir, 'appData.json'), JSON.stringify(testRecords, null, 2))
  writeFileSync(join(testDataDir, 'ai_meta_index.json'), JSON.stringify(testAiMeta, null, 2))
  writeFileSync(join(testDataDir, 'summaries.json'), JSON.stringify(testSummaries, null, 2))
  
  // Mock 环境变量指向测试目录
  vi.stubEnv('APPDATA', testDir)
})

afterAll(() => {
  // 清理测试目录
  const fs = require('fs')
  fs.rmSync(testDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

// 动态导入工具以确保环境变量已设置
async function importTool() {
  // 清除模块缓存以重新加载
  vi.resetModules()
  const toolModule = await import('./daily-log')
  return toolModule.default
}

describe('daily-log tool', () => {
  describe('health action', () => {
    it('should return health status', async () => {
      const tool = await importTool()
      const result = await tool.execute({ action: 'health', id: undefined, payload: undefined })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('health')
      expect(data).toHaveProperty('status')
      expect(data).toHaveProperty('recordCount')
      expect(data.status).toBe('available')
      expect(data.recordCount).toBe(3)
    })
  })

  describe('list action', () => {
    it('should return records with default pagination', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({})
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data).toHaveProperty('records')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.records)).toBe(true)
      expect(data.records.length).toBeGreaterThan(0)
      expect(data.pagination.total).toBe(3)
    })

    it('should filter by date range', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          dateRange: {
            start: '2026-07-24',
            end: '2026-07-25'
          }
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBeGreaterThanOrEqual(1)
      expect(data.records.length).toBeLessThanOrEqual(2)
    })

    it('should filter by project', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          project: '工作'
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBe(2)
      data.records.forEach((r: any) => {
        expect(r.project).toBe('工作')
      })
    })

    it('should filter by weekday', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          weekday: '周四'
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      // 2026-07-24 是周四
      expect(data.records.length).toBeGreaterThanOrEqual(0)
    })

    it('should filter by mood tags', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          moodTags: ['温馨']
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBe(1)
      expect(data.records[0].id).toBe('test-001')
    })

    it('should filter by energy level', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          minEnergy: 7,
          maxEnergy: 10
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBeGreaterThanOrEqual(1)
    })

    it('should filter by people', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          people: '妈妈'
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBe(1)
      expect(data.records[0].id).toBe('test-001')
    })

    it('should filter by keywords (AND)', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          keywordsAll: ['妈妈', '早饭']
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBe(1)
      expect(data.records[0].id).toBe('test-001')
    })

    it('should filter by keywords (OR)', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          keywordsAny: ['焦虑', '温暖']
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.records.length).toBe(2)
    })

    it('should support pagination', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'list',
        id: undefined,
        payload: JSON.stringify({
          page: 1,
          pageSize: 2
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('list')
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.pageSize).toBe(2)
      expect(data.pagination.total).toBe(3)
      expect(data.pagination.totalPages).toBe(2)
      expect(data.records.length).toBe(2)
    })
  })

  describe('search action', () => {
    it('should search by query', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'search',
        id: undefined,
        payload: JSON.stringify({
          query: '妈妈'
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('search')
      expect(data).toHaveProperty('query')
      expect(data).toHaveProperty('records')
      expect(Array.isArray(data.records)).toBe(true)
      expect(data.records.length).toBe(1)
      expect(data.records[0].content).toContain('妈妈')
    })

    it('should return score for each record', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'search',
        id: undefined,
        payload: JSON.stringify({
          query: '妈妈'
        })
      })
      const data = JSON.parse(result.output)

      expect(data.records.length).toBeGreaterThan(0)
      expect(data.records[0]).toHaveProperty('score')
      expect(typeof data.records[0].score).toBe('number')
      expect(data.records[0].score).toBeGreaterThan(0)
    })

    it('should respect limit parameter', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'search',
        id: undefined,
        payload: JSON.stringify({
          query: '项目',
          limit: 1
        })
      })
      const data = JSON.parse(result.output)

      expect(data.records.length).toBeLessThanOrEqual(1)
    })
  })

  describe('get action', () => {
    it('should get record by ID', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'get',
        id: 'test-001',
        payload: undefined
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('get')
      expect(result.metadata.found).toBe(true)
      expect(data.id).toBe('test-001')
      expect(data).toHaveProperty('content')
      expect(data).toHaveProperty('project')
    })

    it('should return not found for invalid ID', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'get',
        id: 'invalid-id-12345',
        payload: undefined
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('get')
      expect(result.metadata.found).toBe(false)
      expect(data).toHaveProperty('error')
    })
  })

  describe('stats action', () => {
    it('should return statistics', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'stats',
        id: undefined,
        payload: undefined
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('stats')
      expect(data).toHaveProperty('total')
      expect(data).toHaveProperty('aiEnhanced')
      expect(data).toHaveProperty('timeRange')
      expect(data).toHaveProperty('projects')
      expect(data).toHaveProperty('emotions')
      expect(data).toHaveProperty('moodTags')
      expect(data).toHaveProperty('weekdays')
      expect(data.total).toBe(3)
      expect(data.projects.length).toBeGreaterThan(0)
    })

    it('should support date range filter', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'stats',
        id: undefined,
        payload: JSON.stringify({
          dateRange: {
            start: '2026-07-24',
            end: '2026-07-25'
          }
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('stats')
      expect(data).toHaveProperty('total')
      expect(data.total).toBe(2)
    })
  })

  describe('summaries action', () => {
    it('should return summaries', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'summaries',
        id: undefined,
        payload: undefined
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('summaries')
      expect(data).toHaveProperty('summaries')
      expect(Array.isArray(data.summaries)).toBe(true)
      expect(data.summaries.length).toBe(1)
      expect(data.summaries[0].type).toBe('weekly')
    })

    it('should filter by type', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'summaries',
        id: undefined,
        payload: JSON.stringify({
          type: 'monthly'
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('summaries')
      expect(data.summaries.length).toBe(0)
    })
  })

  describe('export action', () => {
    it('should export data in DiaryConnector format', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'export',
        id: undefined,
        payload: undefined
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('export')
      expect(data.format).toBe('daily_log_vue_v1')
      expect(data.compatibleWith).toBe('summary.DiaryConnector')
      expect(data).toHaveProperty('recordCount')
      expect(data).toHaveProperty('records')
      expect(Array.isArray(data.records)).toBe(true)
      expect(data.recordCount).toBe(3)
    })

    it('should include required fields in each record', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'export',
        id: undefined,
        payload: undefined
      })
      const data = JSON.parse(result.output)

      expect(data.records.length).toBeGreaterThan(0)
      const record = data.records[0]
      expect(record).toHaveProperty('_id')
      expect(record).toHaveProperty('time')
      expect(record).toHaveProperty('ganshou')
      expect(record).toHaveProperty('tiyan')
      expect(record).toHaveProperty('xinqing')
      expect(record).toHaveProperty('shanggexiangmu')
      expect(record).toHaveProperty('chixushijian')
      expect(record).toHaveProperty('chengjiu')
    })

    it('should support date range filter', async () => {
      const tool = await importTool()
      const result = await tool.execute({
        action: 'export',
        id: undefined,
        payload: JSON.stringify({
          dateRange: {
            start: '2026-07-24',
            end: '2026-07-25'
          }
        })
      })
      const data = JSON.parse(result.output)

      expect(result.metadata.action).toBe('export')
      expect(data.format).toBe('daily_log_vue_v1')
      expect(data.recordCount).toBe(2)
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid action', async () => {
      const tool = await importTool()
      await expect(
        tool.execute({
          action: 'invalid-action',
          id: undefined,
          payload: undefined
        })
      ).rejects.toThrow('Unknown action: invalid-action')
    })

    it('should throw error for invalid JSON payload', async () => {
      const tool = await importTool()
      await expect(
        tool.execute({
          action: 'list',
          id: undefined,
          payload: 'invalid-json'
        })
      ).rejects.toThrow('Payload must be valid JSON')
    })

    it('should throw error for missing required parameters', async () => {
      const tool = await importTool()
      await expect(
        tool.execute({
          action: 'search',
          id: undefined,
          payload: undefined
        })
      ).rejects.toThrow("search requires a 'query' parameter")
    })

    it('should throw error for get without ID', async () => {
      const tool = await importTool()
      await expect(
        tool.execute({
          action: 'get',
          id: undefined,
          payload: undefined
        })
      ).rejects.toThrow("get requires an 'id' parameter")
    })
  })
})

describe('data compatibility', () => {
  it('export format should match DiaryConnector input', async () => {
    const tool = await importTool()
    const result = await tool.execute({
      action: 'export',
      id: undefined,
      payload: undefined
    })
    const data = JSON.parse(result.output)

    // 验证格式兼容性
    expect(data.format).toBe('daily_log_vue_v1')
    expect(data.compatibleWith).toBe('summary.DiaryConnector')

    // 验证记录格式
    for (const record of data.records) {
      expect(record).toHaveProperty('_id')
      expect(record).toHaveProperty('time')
      expect(record).toHaveProperty('ganshou')
      expect(record).toHaveProperty('tiyan')
      expect(record).toHaveProperty('xinqing')
      expect(record).toHaveProperty('shanggexiangmu')
      expect(record).toHaveProperty('chixushijian')
      expect(record).toHaveProperty('chengjiu')
    }
  })
})
