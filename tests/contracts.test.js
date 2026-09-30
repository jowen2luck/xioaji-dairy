/**
 * Contract Tests — validate Zod schemas and normalization logic
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeJournalRecord,
  safeParseJournalRecord,
  safeParseEvidencePack,
  safeParseInquiryPlan,
  JournalRecordSchema,
  EvidencePackSchema,
  InquiryPlanSchema,
} from '../src/main/domain/contracts.js'

describe('JournalRecordSchema', () => {
  it('should validate a correct JournalRecord', () => {
    const record = {
      id: 'rec-001',
      occurredAt: '2026-07-25T09:00:00',
      contentHtml: '<p>Hello</p>',
      contentText: 'Hello',
      project: '工作',
      durationMinutes: 60,
    }
    const result = JournalRecordSchema.safeParse(record)
    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const record = { id: 'rec-001' }
    const result = JournalRecordSchema.safeParse(record)
    expect(result.success).toBe(false)
  })

  it('should reject wrong type for durationMinutes', () => {
    const record = {
      id: 'rec-001',
      occurredAt: '2026-07-25T09:00:00',
      contentHtml: '<p>Hi</p>',
      contentText: 'Hi',
      durationMinutes: 'not-a-number',
    }
    const result = JournalRecordSchema.safeParse(record)
    expect(result.success).toBe(false)
  })
})

describe('normalizeJournalRecord', () => {
  it('should normalize legacy raw record with HTML tags', () => {
    const raw = {
      _id: 'legacy-001',
      time: '2026-07-25 09:00',
      ganshou: '<p>今天和妈妈一起吃了早饭</p>',
      tiyan: '温暖',
      xinqing: '#FFD700',
      shanggexiangmu: '家庭',
      chixushijian: 90,
      chengjiu: true,
    }
    const result = normalizeJournalRecord(raw)
    expect(result.id).toBe('legacy-001')
    expect(result.contentText).toBe('今天和妈妈一起吃了早饭')
    expect(result.project).toBe('家庭')
    expect(result.durationMinutes).toBe(90)
    expect(result.achievement).toBe(true)
    expect(result.source).toBe('local')
  })

  it('should strip HTML tags from contentText', () => {
    const raw = {
      _id: 'legacy-002',
      time: '2026-07-24 14:30',
      ganshou: '<p>项目会议很<strong>顺利</strong></p>',
      shanggexiangmu: '工作',
    }
    const result = normalizeJournalRecord(raw)
    expect(result.contentText).toBe('项目会议很顺利')
    expect(result.contentText).not.toContain('<')
  })

  it('should handle null raw input', () => {
    expect(normalizeJournalRecord(null)).toBeNull()
    expect(normalizeJournalRecord(undefined)).toBeNull()
  })

  it('should handle missing optional fields gracefully', () => {
    const raw = {
      _id: 'legacy-003',
      time: '2026-07-23 20:00',
      ganshou: '纯文本内容',
    }
    const result = normalizeJournalRecord(raw)
    expect(result.contentText).toBe('纯文本内容')
    expect(result.project).toBeUndefined()
    expect(result.durationMinutes).toBeUndefined()
    expect(result.achievement).toBe(false)
  })

  it('should pass Zod validation after normalization', () => {
    const raw = {
      _id: 'legacy-004',
      time: '2026-07-22 08:00',
      ganshou: '<p>早上跑步5公里</p>',
      shanggexiangmu: '运动',
      chixushijian: 45,
    }
    const normalized = normalizeJournalRecord(raw)
    const validation = safeParseJournalRecord(normalized)
    expect(validation.success).toBe(true)
  })
})

describe('EvidencePackSchema', () => {
  it('should validate a correct EvidencePack', () => {
    const pack = {
      id: 'pack-001',
      schemaVersion: '1.0.0',
      question: '总结本周',
      scope: { dateRange: { start: '2026-07-20', end: '2026-07-26' } },
      evidence: [
        { id: 'ev-001', recordId: 'rec-001', occurredAt: '2026-07-25', field: 'contentText', excerpt: 'excerpt...', relevance: 0.9 }
      ],
      metrics: [
        { id: 'm-001', label: 'Total', value: 10, unit: 'entries', operation: 'COUNT', sampleSize: 10 }
      ],
      comparisons: [],
      limitations: [],
      generatedAt: '2026-07-26T10:00:00Z',
    }
    const result = EvidencePackSchema.safeParse(pack)
    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const pack = { id: 'pack-001' }
    const result = EvidencePackSchema.safeParse(pack)
    expect(result.success).toBe(false)
  })
})

describe('InquiryPlanSchema', () => {
  it('should validate a correct InquiryPlan', () => {
    const plan = {
      normalizedQuestion: '查询项目A上周的数据统计',
      operations: [
        { id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] },
        { id: 'op_2', type: 'aggregate', input: {}, dependsOn: ['op_1'] }
      ],
      scope: { dateRange: { start: '2026-07-20', end: '2026-07-26' } },
      expectedOutput: 'mixed',
    }
    const result = InquiryPlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
  })

  it('should reject invalid operation type', () => {
    const plan = {
      normalizedQuestion: 'test',
      operations: [{ id: 'op_1', type: 'invalid_type', input: {}, dependsOn: [] }],
      scope: {},
    }
    const result = InquiryPlanSchema.safeParse(plan)
    expect(result.success).toBe(false)
  })

  it('should reject missing operations array', () => {
    const plan = { normalizedQuestion: 'test', scope: {} }
    const result = InquiryPlanSchema.safeParse(plan)
    expect(result.success).toBe(false)
  })
})

describe('safeParse helpers', () => {
  it('safeParseJournalRecord should return success for valid data', () => {
    const record = {
      id: 'r1', occurredAt: '2026-07-25', contentHtml: '<p>x</p>', contentText: 'x'
    }
    const result = safeParseJournalRecord(record)
    expect(result.success).toBe(true)
    expect(result.data.id).toBe('r1')
  })

  it('safeParseEvidencePack should return success for valid data', () => {
    const pack = {
      id: 'p1', schemaVersion: '1.0.0', question: 'q', scope: {},
      evidence: [], metrics: [], comparisons: [], limitations: [], generatedAt: 'now'
    }
    const result = safeParseEvidencePack(pack)
    expect(result.success).toBe(true)
  })

  it('safeParseInquiryPlan should return success for valid data', () => {
    const plan = {
      normalizedQuestion: 'q', operations: [{ id: 'o1', type: 'exact_query', input: {}, dependsOn: [] }], scope: {}
    }
    const result = safeParseInquiryPlan(plan)
    expect(result.success).toBe(true)
  })
})
