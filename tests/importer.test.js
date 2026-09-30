/**
 * Tests for diary importer & validator
 * Validates Chinese headers, aliases, date parsing, and Excel import compatibility.
 */

import { describe, it, expect } from 'vitest'
import {
  validateRecord,
  validateBatch,
  normalizeRawRecord,
  parseDateValue,
  importFromJson,
} from '../src/utils/diary-plugin/index.js'

describe('parseDateValue', () => {
  it('should parse standard ISO strings', () => {
    const d = parseDateValue('2026-07-31T16:12:00.000Z')
    expect(d).toBeInstanceOf(Date)
    expect(isNaN(d.getTime())).toBe(false)
  })

  it('should parse YYYY-MM-DD HH:mm format', () => {
    const d = parseDateValue('2026-07-31 16:12')
    expect(d).toBeInstanceOf(Date)
    expect(isNaN(d.getTime())).toBe(false)
  })

  it('should parse Chinese formatted date string', () => {
    const d = parseDateValue('2026年07月31日 16时12分')
    expect(d).toBeInstanceOf(Date)
    expect(isNaN(d.getTime())).toBe(false)
  })

  it('should return null for invalid date', () => {
    expect(parseDateValue('invalid-date')).toBeNull()
    expect(parseDateValue('')).toBeNull()
    expect(parseDateValue(null)).toBeNull()
  })
})

describe('normalizeRawRecord', () => {
  it('should normalize Chinese headers to standard fields', () => {
    const raw = {
      '时间': '2026-07-31 16:12',
      '感受': '今天工作顺利',
      '项目': '工作',
      '持续时间': '6时31分',
      '心情': '普通',
      '特殊记忆': '否',
      '隐私': '是'
    }
    const normalized = normalizeRawRecord(raw)
    expect(normalized.time).toBe('2026-07-31 16:12')
    expect(normalized.ganshou).toBe('今天工作顺利')
    expect(normalized.shanggexiangmu).toBe('工作')
    expect(normalized.chixushijian).toBe('6时31分')
    expect(normalized.xinqing).toBe('#FFFFFF')
    expect(normalized.tiyan).toBe('常规')
    expect(normalized.chengjiu).toBe(false)
    expect(normalized.yinsi).toBe(true)
  })

  it('should preserve existing standard fields', () => {
    const raw = {
      time: '2026-07-31T08:00:00.000Z',
      ganshou: '测试',
      shanggexiangmu: '学习',
      xinqing: '#90EE90',
      tiyan: '超赞',
      chengjiu: true,
      yinsi: false,
    }
    const normalized = normalizeRawRecord(raw)
    expect(normalized.time).toBe('2026-07-31T08:00:00.000Z')
    expect(normalized.ganshou).toBe('测试')
    expect(normalized.shanggexiangmu).toBe('学习')
    expect(normalized.xinqing).toBe('#90EE90')
    expect(normalized.tiyan).toBe('超赞')
    expect(normalized.chengjiu).toBe(true)
    expect(normalized.yinsi).toBe(false)
  })
})

describe('validateRecord & validateBatch', () => {
  it('should successfully validate record with Chinese headers', () => {
    const raw = {
      '时间': '2026-07-31 16:12',
      '感受': '今天把系统集成好了',
      '项目': '工作',
      '持续时间': '1时30分',
      '心情': '开心',
      '特殊记忆': '是',
      '隐私': '否'
    }
    const result = validateRecord(raw, 0)
    expect(result.valid).toBe(true)
    expect(result.record).toBeDefined()
    expect(result.record.ganshou).toBe('今天把系统集成好了')
    expect(result.record.shanggexiangmu).toBe('工作')
    expect(result.record.xinqing).toBe('#90EE90')
    expect(result.record.tiyan).toBe('超赞')
    expect(result.record.chengjiu).toBe(true)
    expect(result.record.yinsi).toBe(false)
    expect(result.record._id).toBeDefined()
  })

  it('should batch validate mixed records and return valid records', () => {
    const list = [
      { '时间': '2026-07-31 16:12', '感受': '日记1', '项目': '工作' },
      { '时间': '2026-08-01 10:00', '感受': '日记2', '项目': '休息' },
      { '时间': '', '感受': '无效日记' } // missing time
    ]
    const batchResult = validateBatch(list)
    expect(batchResult.stats.total).toBe(3)
    expect(batchResult.stats.valid).toBe(2)
    expect(batchResult.stats.invalid).toBe(1)
    expect(batchResult.validRecords.length).toBe(2)
  })

  it('should work with importFromJson pipeline', () => {
    const list = [
      { '时间': '2026-07-31 16:12', '感受': '日记内容', '项目': '工作', '持续时间': '30分钟' }
    ]
    const res = importFromJson(list, { autoEnrich: true })
    expect(res.records.length).toBe(1)
    expect(res.enrichedRecords.length).toBe(1)
    expect(res.enrichedRecords[0]._meta_duration_min).toBe(30)
    expect(res.enrichedRecords[0]._meta_project).toBe('工作')
  })
})
