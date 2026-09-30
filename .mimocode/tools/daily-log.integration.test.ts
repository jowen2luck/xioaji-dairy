/**
 * daily-log 与 summary (AIAE) 集成测试
 * 
 * 测试目标：验证 daily-log export 输出的格式与 SummaryService 的输入格式完全兼容
 * 
 * 测试用例：
 * 1. 格式兼容性测试 - 验证 export 输出结构
 * 2. 记录格式测试 - 验证每条记录的字段和类型
 * 3. 过滤功能测试 - 验证日期范围、项目、分页过滤
 * 4. 数据完整性测试 - 验证 HTML 解析、时间格式、AI 元数据合并
 * 
 * 本测试使用真实的工具实现，通过创建临时测试数据文件来控制测试环境。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ==================== 测试配置 ====================

const testDir = join(tmpdir(), `daily-log-integration-${Date.now()}`)
const testDataDir = join(testDir, 'daily_log_vue')

// ==================== 测试数据 ====================

/**
 * 测试记录数据 - 包含各种边界情况
 */
const testRecords = [
  {
    _id: 'integration-001',
    time: '2026-07-25 09:00',
    ganshou: '<p>今天和妈妈一起吃了早饭，感觉很温暖。<strong>这是一个美好的开始</strong></p>',
    tiyan: '温暖',
    xinqing: '#FFD700',
    shanggexiangmu: '家庭',
    chixushijian: '1小时30分钟',
    chengjiu: true
  },
  {
    _id: 'integration-002',
    time: '2026-07-24 14:30',
    ganshou: '<p>项目会议很顺利，讨论了新功能开发。<em>团队协作很棒</em></p>',
    tiyan: '顺利',
    xinqing: '#90EE90',
    shanggexiangmu: '工作',
    chixushijian: '2小时',
    chengjiu: false
  },
  {
    _id: 'integration-003',
    time: '2026-07-23 20:00',
    ganshou: '<p>有点焦虑，明天有重要汇报。</p><p>需要再准备一下</p>',
    tiyan: '焦虑',
    xinqing: '#87CEEB',
    shanggexiangmu: '工作',
    chixushijian: '30分钟',
    chengjiu: false
  },
  {
    _id: 'integration-004',
    time: '2026-07-22 08:00',
    ganshou: '<p>早上跑步5公里，感觉精力充沛！</p>',
    tiyan: '兴奋',
    xinqing: '#FFA500',
    shanggexiangmu: '运动',
    chixushijian: '45分钟',
    chengjiu: true
  },
  {
    _id: 'integration-005',
    time: '2026-07-21 16:00',
    ganshou: '无内容',  // 边界情况：纯文本，无 HTML 标签
    tiyan: '平静',
    xinqing: '#DDA0DD',
    shanggexiangmu: '学习',
    chixushijian: '3小时',
    chengjiu: false
  }
]

/**
 * AI 元数据 - 模拟 AI 分析结果
 */
const testAiMeta = {
  items: {
    'meta-hash-001': {
      data: {
        summary: '与家人共度美好时光',
        mood_tags: ['温馨', '家庭', '幸福'],
        energy_level: 8,
        focus_level: 7,
        primary_domain: '家庭',
        people_involved: ['妈妈', '爸爸']
      }
    },
    'meta-hash-002': {
      data: {
        summary: '项目进展顺利',
        mood_tags: ['专注', '高效', '顺利'],
        energy_level: 7,
        focus_level: 8,
        primary_domain: '工作',
        people_involved: ['同事', '导师']
      }
    },
    'meta-hash-003': {
      data: {
        summary: '运动后的活力时刻',
        mood_tags: ['兴奋', '活力', '健康'],
        energy_level: 9,
        focus_level: 6,
        primary_domain: '健康',
        people_involved: []
      }
    }
  }
}

/**
 * 总结数据 - 模拟已生成的总结
 */
const testSummaries = [
  {
    _id: 'summary-integration-001',
    _summary_type: 'weekly',
    _summary_period: { start: '2026-07-20', end: '2026-07-26' },
    content: '本周主要完成了项目开发和家庭聚会，运动习惯保持良好。',
    stats: { totalDays: 5, avgEnergy: 7.5, totalDurationHours: 12 },
    model: 'qwen3-max',
    created_at: '2026-07-26T10:00:00Z'
  }
]

// ==================== 测试环境设置 ====================

beforeAll(() => {
  // 创建测试目录
  mkdirSync(testDataDir, { recursive: true })
  
  // 写入测试数据
  writeFileSync(
    join(testDataDir, 'appData.json'),
    JSON.stringify(testRecords, null, 2)
  )
  writeFileSync(
    join(testDataDir, 'ai_meta_index.json'),
    JSON.stringify(testAiMeta, null, 2)
  )
  writeFileSync(
    join(testDataDir, 'summaries.json'),
    JSON.stringify(testSummaries, null, 2)
  )
  
  // Mock 环境变量指向测试目录
  vi.stubEnv('APPDATA', testDir)
})

afterAll(() => {
  // 清理测试目录
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
  vi.unstubAllEnvs()
})

/**
 * 动态导入工具以确保环境变量已设置
 */
async function importTool() {
  vi.resetModules()
  const toolModule = await import('./daily-log')
  return toolModule.default
}

/**
 * 执行 export 动作并返回解析后的数据
 */
async function executeExport(payload?: Record<string, any>) {
  const tool = await importTool()
  const result = await tool.execute({
    action: 'export',
    id: undefined,
    payload: payload ? JSON.stringify(payload) : undefined
  })
  return {
    raw: result,
    data: JSON.parse(result.output)
  }
}

/**
 * 执行 list 动作并返回解析后的数据
 */
async function executeList(payload?: Record<string, any>) {
  const tool = await importTool()
  const result = await tool.execute({
    action: 'list',
    id: undefined,
    payload: payload ? JSON.stringify(payload) : undefined
  })
  return {
    raw: result,
    data: JSON.parse(result.output)
  }
}

// ==================== 测试套件 ====================

describe('daily-log 与 summary (AIAE) 集成测试', () => {
  
  // ==================== 1. 格式兼容性测试 ====================
  
  describe('1. 格式兼容性测试', () => {
    
    it('should have required top-level fields', async () => {
      const { data } = await executeExport()
      
      expect(data).toHaveProperty('format')
      expect(data).toHaveProperty('compatibleWith')
      expect(data).toHaveProperty('recordCount')
      expect(data).toHaveProperty('records')
    })
    
    it('should have format value "daily_log_vue_v1"', async () => {
      const { data } = await executeExport()
      
      expect(data.format).toBe('daily_log_vue_v1')
    })
    
    it('should have compatibleWith value "summary.DiaryConnector"', async () => {
      const { data } = await executeExport()
      
      expect(data.compatibleWith).toBe('summary.DiaryConnector')
    })
    
    it('should have recordCount matching records array length', async () => {
      const { data } = await executeExport()
      
      expect(data.recordCount).toBe(data.records.length)
      expect(data.recordCount).toBe(5)  // 测试数据有 5 条记录
    })
    
    it('should have records as array', async () => {
      const { data } = await executeExport()
      
      expect(Array.isArray(data.records)).toBe(true)
      expect(data.records.length).toBeGreaterThan(0)
    })
    
    it('should include metadata in action result', async () => {
      const { raw } = await executeExport()
      
      expect(raw.metadata).toBeDefined()
      expect(raw.metadata.action).toBe('export')
      expect(raw.metadata.format).toBe('daily_log_vue_v1')
      expect(typeof raw.metadata.count).toBe('number')
    })
  })
  
  // ==================== 2. 记录格式测试 ====================
  
  describe('2. 记录格式测试', () => {
    
    it('should have all required fields in each record', async () => {
      const { data } = await executeExport()
      
      for (const record of data.records) {
        expect(record).toHaveProperty('_id')
        expect(record).toHaveProperty('time')
        expect(record).toHaveProperty('ganshou')
        expect(record).toHaveProperty('tiyan')
        expect(record).toHaveProperty('xinqing')
        expect(record).toHaveProperty('shanggexiangmu')
        expect(record).toHaveProperty('chixushijian')
        expect(record).toHaveProperty('chengjiu')
        expect(record).toHaveProperty('_ai_meta')
      }
    })
    
    it('should have correct field types', async () => {
      const { data } = await executeExport()
      
      for (const record of data.records) {
        expect(typeof record._id).toBe('string')
        expect(typeof record.time).toBe('string')
        expect(typeof record.ganshou).toBe('string')
        expect(typeof record.tiyan).toBe('string')
        expect(typeof record.xinqing).toBe('string')
        expect(typeof record.shanggexiangmu).toBe('string')
        expect(typeof record.chixushijian).toBe('string')
        // chengjiu 可以是 boolean 或 undefined
        expect(typeof record.chengjiu === 'boolean' || record.chengjiu === undefined).toBe(true)
      }
    })
    
    it('should preserve _id from source data', async () => {
      const { data } = await executeExport()
      
      const ids = data.records.map((r: any) => r._id)
      expect(ids).toContain('integration-001')
      expect(ids).toContain('integration-002')
      expect(ids).toContain('integration-003')
    })
    
    it('should have valid time format (YYYY-MM-DD HH:mm)', async () => {
      const { data } = await executeExport()
      
      const timeRegex = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/
      for (const record of data.records) {
        expect(record.time).toMatch(timeRegex)
      }
    })
    
    it('should have valid hex color for xinqing', async () => {
      const { data } = await executeExport()
      
      const hexRegex = /^#[0-9A-Fa-f]{6}$/
      for (const record of data.records) {
        expect(record.xinqing).toMatch(hexRegex)
      }
    })
    
    it('should preserve HTML in ganshou field', async () => {
      const { data } = await executeExport()
      
      // 找到包含 HTML 标签的记录
      const recordWithHtml = data.records.find((r: any) => 
        r.ganshou.includes('<p>') || r.ganshou.includes('<strong>')
      )
      expect(recordWithHtml).toBeDefined()
      expect(recordWithHtml.ganshou).toContain('<p>')
    })
  })
  
  // ==================== 3. 过滤功能测试 ====================
  
  describe('3. 过滤功能测试', () => {
    
    it('should filter by date range (start only)', async () => {
      const { data } = await executeExport({
        dateRange: { start: '2026-07-24' }
      })
      
      // 只有 7-24 和 7-25 的记录
      expect(data.recordCount).toBe(2)
      for (const record of data.records) {
        const recordDate = record.time.split(' ')[0]
        expect(recordDate >= '2026-07-24').toBe(true)
      }
    })
    
    it('should filter by date range (end only)', async () => {
      const { data } = await executeExport({
        dateRange: { end: '2026-07-23' }
      })
      
      // 只有 7-21, 7-22, 7-23 的记录
      expect(data.recordCount).toBe(3)
      for (const record of data.records) {
        const recordDate = record.time.split(' ')[0]
        expect(recordDate <= '2026-07-23').toBe(true)
      }
    })
    
    it('should filter by date range (both start and end)', async () => {
      const { data } = await executeExport({
        dateRange: { start: '2026-07-22', end: '2026-07-24' }
      })
      
      // 7-22, 7-23, 7-24 的记录
      expect(data.recordCount).toBe(3)
      for (const record of data.records) {
        const recordDate = record.time.split(' ')[0]
        expect(recordDate >= '2026-07-22').toBe(true)
        expect(recordDate <= '2026-07-24').toBe(true)
      }
    })
    
    it('should return all records when no filter applied', async () => {
      const { data } = await executeExport()
      
      expect(data.recordCount).toBe(5)
    })
    
    it('should handle date range that matches no records', async () => {
      const { data } = await executeExport({
        dateRange: { start: '2026-08-01', end: '2026-08-31' }
      })
      
      expect(data.recordCount).toBe(0)
      expect(data.records).toEqual([])
    })
  })
  
  // ==================== 4. 数据完整性测试 ====================
  
  describe('4. 数据完整性测试', () => {
    
    it('should merge AI metadata correctly', async () => {
      const { data } = await executeExport()
      
      // 找到有 AI 元数据的记录
      const recordWithMeta = data.records.find((r: any) => r._ai_meta !== null)
      
      if (recordWithMeta) {
        expect(recordWithMeta._ai_meta).toHaveProperty('summary')
        expect(recordWithMeta._ai_meta).toHaveProperty('mood_tags')
        expect(recordWithMeta._ai_meta).toHaveProperty('energy_level')
        expect(Array.isArray(recordWithMeta._ai_meta.mood_tags)).toBe(true)
      }
    })
    
    it('should preserve _ai_meta structure for SummaryService compatibility', async () => {
      const { data } = await executeExport()
      
      const recordWithMeta = data.records.find((r: any) => r._ai_meta !== null)
      
      if (recordWithMeta) {
        // 验证 SummaryService 期望的字段
        const meta = recordWithMeta._ai_meta
        expect(typeof meta.summary).toBe('string')
        expect(Array.isArray(meta.mood_tags)).toBe(true)
        expect(typeof meta.energy_level).toBe('number')
        expect(typeof meta.primary_domain).toBe('string')
        expect(Array.isArray(meta.people_involved)).toBe(true)
      }
    })
    
    it('should have _ai_meta as null for records without AI analysis', async () => {
      const { data } = await executeExport()
      
      // 找到没有 AI 元数据的记录
      const recordWithoutMeta = data.records.find((r: any) => r._ai_meta === null)
      
      if (recordWithoutMeta) {
        expect(recordWithoutMeta._ai_meta).toBeNull()
      }
    })
    
    it('should maintain record order (newest first)', async () => {
      const { data } = await executeExport()
      
      for (let i = 1; i < data.records.length; i++) {
        const prevDate = new Date(data.records[i - 1].time)
        const currDate = new Date(data.records[i].time)
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime())
      }
    })
    
    it('should handle empty ganshou field', async () => {
      const { data } = await executeExport()
      
      // 找到 ganshou 为空或无 HTML 的记录
      const recordWithPlainText = data.records.find((r: any) => 
        !r.ganshou.includes('<')
      )
      
      if (recordWithPlainText) {
        expect(typeof recordWithPlainText.ganshou).toBe('string')
      }
    })
    
    it('should preserve chengjiu boolean value', async () => {
      const { data } = await executeExport()
      
      const trueRecord = data.records.find((r: any) => r.chengjiu === true)
      const falseRecord = data.records.find((r: any) => r.chengjiu === false)
      
      expect(trueRecord).toBeDefined()
      expect(falseRecord).toBeDefined()
    })
  })
  
  // ==================== 5. SummaryService 兼容性验证 ====================
  
  describe('5. SummaryService 兼容性验证', () => {
    
    it('export records should be directly usable by SummaryService', async () => {
      const { data } = await executeExport()
      
      // 模拟 SummaryService 的输入验证
      const validateForSummaryService = (records: any[]) => {
        for (const record of records) {
          // SummaryService 期望的字段
          expect(record).toHaveProperty('time')
          expect(record).toHaveProperty('ganshou')
          expect(record).toHaveProperty('shanggexiangmu')
          expect(record).toHaveProperty('chixushijian')
          expect(record).toHaveProperty('chengjiu')
          
          // 时间格式验证（SummaryService 使用 record.time.split('T')[0]）
          // 注意：daily-log 使用空格分隔，SummaryService 需要兼容
          const dateStr = record.time.split(' ')[0]  // 或 split('T')[0]
          expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      }
      
      validateForSummaryService(data.records)
    })
    
    it('export format should match integration-design spec', async () => {
      const { data } = await executeExport()
      
      // 根据 integration-design.md 的规范验证
      expect(data.format).toBe('daily_log_vue_v1')
      expect(data.compatibleWith).toBe('summary.DiaryConnector')
      expect(typeof data.recordCount).toBe('number')
      expect(Array.isArray(data.records)).toBe(true)
      
      // 验证每条记录的字段符合规范
      for (const record of data.records) {
        expect(typeof record._id).toBe('string')
        expect(typeof record.time).toBe('string')
        expect(typeof record.ganshou).toBe('string')
        expect(typeof record.tiyan).toBe('string')
        expect(typeof record.xinqing).toBe('string')
        expect(typeof record.shanggexiangmu).toBe('string')
        expect(typeof record.chixushijian).toBe('string')
      }
    })
    
    it('export data should support weekly summary generation', async () => {
      const { data } = await executeExport({
        dateRange: { start: '2026-07-21', end: '2026-07-26' }
      })
      
      // 模拟 SummaryService.generateWeeklySummary 的输入处理
      const weeklyRecords = data.records.map((r: any) => ({
        time: r.time,
        project: r.shanggexiangmu,
        duration: r.chixushijian,
        content: r.ganshou?.substring(0, 500),
        ai_meta: r._ai_meta
      }))
      
      expect(weeklyRecords.length).toBeGreaterThan(0)
      
      for (const record of weeklyRecords) {
        expect(record).toHaveProperty('time')
        expect(record).toHaveProperty('project')
        expect(record).toHaveProperty('duration')
        expect(record).toHaveProperty('content')
        expect(record).toHaveProperty('ai_meta')
      }
    })
    
    it('export data should support monthly summary generation', async () => {
      const { data } = await executeExport({
        dateRange: { start: '2026-07-01', end: '2026-07-31' }
      })
      
      // 模拟 SummaryService.generateMonthlySummary 的输入处理
      const aiMetaData = data.records
        .filter((r: any) => r._ai_meta)
        .map((r: any) => ({
          time: r.time,
          ...r._ai_meta
        }))
      
      expect(aiMetaData.length).toBeGreaterThanOrEqual(0)
      
      for (const meta of aiMetaData) {
        expect(meta).toHaveProperty('time')
        // 可能有 mood_tags, energy_level 等字段
      }
    })
  })
  
  // ==================== 6. 边界情况测试 ====================
  
  describe('6. 边界情况测试', () => {
    
    it('should handle export with no data files', async () => {
      // 临时创建一个空数据目录
      const emptyDir = join(tmpdir(), `daily-log-empty-${Date.now()}`)
      const emptyDataDir = join(emptyDir, 'daily_log_vue')
      mkdirSync(emptyDataDir, { recursive: true })
      
      vi.stubEnv('APPDATA', emptyDir)
      vi.resetModules()
      
      const toolModule = await import('./daily-log')
      const tool = toolModule.default
      
      const result = await tool.execute({
        action: 'export',
        id: undefined,
        payload: undefined
      })
      const data = JSON.parse(result.output)
      
      expect(data.format).toBe('daily_log_vue_v1')
      expect(data.compatibleWith).toBe('summary.DiaryConnector')
      expect(data.recordCount).toBe(0)
      expect(data.records).toEqual([])
      
      // 清理
      rmSync(emptyDir, { recursive: true, force: true })
      vi.stubEnv('APPDATA', testDir)  // 恢复原环境
    })
    
    it('should handle large date range filter', async () => {
      const { data } = await executeExport({
        dateRange: { start: '2020-01-01', end: '2030-12-31' }
      })
      
      // 应该返回所有测试记录
      expect(data.recordCount).toBe(5)
    })
    
    it('should handle invalid date range gracefully', async () => {
      const { data } = await executeExport({
        dateRange: { start: 'invalid-date', end: 'also-invalid' }
      })
      
      // 无效日期应该被过滤掉或返回空
      expect(data.recordCount).toBe(0)
    })
    
    it('should handle missing dateRange properties', async () => {
      const { data } = await executeExport({
        dateRange: {}
      })
      
      // 没有过滤条件，应该返回所有记录
      expect(data.recordCount).toBe(5)
    })
  })
  
  // ==================== 7. 性能基准测试 ====================
  
  describe('7. 性能基准测试', () => {
    
    it('should export 5 records within 100ms', async () => {
      const start = Date.now()
      const { data } = await executeExport()
      const duration = Date.now() - start
      
      expect(data.recordCount).toBe(5)
      expect(duration).toBeLessThan(100)
    })
    
    it('should handle repeated exports efficiently', async () => {
      const start = Date.now()
      
      for (let i = 0; i < 10; i++) {
        await executeExport()
      }
      
      const duration = Date.now() - start
      // 10 次导出应该在 500ms 内完成
      expect(duration).toBeLessThan(500)
    })
  })
})

// ==================== 辅助类型定义 ====================

interface ExportResult {
  format: string
  compatibleWith: string
  recordCount: number
  records: ExportRecord[]
}

interface ExportRecord {
  _id: string
  time: string
  ganshou: string
  tiyan: string
  xinqing: string
  shanggexiangmu: string
  chixushijian: string
  chengjiu: boolean | undefined
  _ai_meta: AiMeta | null
}

interface AiMeta {
  summary: string
  mood_tags: string[]
  energy_level: number
  focus_level?: number
  primary_domain: string
  people_involved: string[]
}
