/**
 * AnalysisService Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import AnalysisService from '../src/main/application/AnalysisService.js'

// Mock JournalService
function createMockJournalService(records = []) {
  return {
    listRecords: async (scope = {}) => {
      let filtered = [...records]
      if (scope.dateRange) {
        const { start, end } = scope.dateRange
        if (start) filtered = filtered.filter(r => new Date(r.occurredAt) >= new Date(start))
        if (end) filtered = filtered.filter(r => new Date(r.occurredAt) <= new Date(end))
      }
      if (scope.projects && scope.projects.length > 0) {
        const set = new Set(scope.projects.map(p => p.toLowerCase()))
        filtered = filtered.filter(r => r.project && set.has(r.project.toLowerCase()))
      }
      return filtered
    },
    getRecord: async (id) => records.find(r => r.id === id) || null,
  }
}

const sampleRecords = [
  { id: 'r1', occurredAt: '2026-07-25T09:00:00', contentText: '今天和妈妈一起吃了早饭，感觉很温暖。', project: '家庭', durationMinutes: 90 },
  { id: 'r2', occurredAt: '2026-07-24T14:30:00', contentText: '项目会议很顺利，讨论了新功能开发。', project: '工作', durationMinutes: 120 },
  { id: 'r3', occurredAt: '2026-07-23T20:00:00', contentText: '有点焦虑，明天有重要汇报。', project: '工作', durationMinutes: 30 },
]

describe('AnalysisService', () => {
  let service

  beforeEach(() => {
    service = new AnalysisService({ journalService: createMockJournalService(sampleRecords) })
  })

  describe('exactQuery', () => {
    it('should return all records when scope is empty', async () => {
      const results = await service.exactQuery({})
      expect(results.length).toBe(3)
    })

    it('should filter by dateRange', async () => {
      const results = await service.exactQuery({ dateRange: { start: '2026-07-24', end: '2026-07-26' } })
      expect(results.length).toBe(2)
    })

    it('should filter by projects', async () => {
      const results = await service.exactQuery({ projects: ['工作'] })
      expect(results.length).toBe(2)
    })

    it('should return EvidenceRef with correct structure', async () => {
      const results = await service.exactQuery({})
      expect(results[0].id).toBeDefined()
      expect(results[0].recordId).toBeDefined()
      expect(results[0].occurredAt).toBeDefined()
      expect(results[0].field).toBe('contentText')
      expect(results[0].excerpt).toBeDefined()
      expect(results[0].relevance).toBe(1.0)
    })

    it('should truncate long excerpts', async () => {
      const longRecords = [
        { id: 'long1', occurredAt: '2026-07-25', contentText: 'x'.repeat(500) }
      ]
      const svc = new AnalysisService({ journalService: createMockJournalService(longRecords) })
      const results = await svc.exactQuery({})
      expect(results[0].excerpt.length).toBeLessThanOrEqual(203) // 200 + '...'
    })
  })

  describe('semanticSearch', () => {
    it('should return keyword-matching results', async () => {
      const results = await service.semanticSearch('项目', {}, 10)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].recordId).toBe('r2')
    })

    it('should return empty for non-matching query', async () => {
      const results = await service.semanticSearch('不存在的词', {}, 10)
      expect(results).toEqual([])
    })

    it('should respect limit parameter', async () => {
      const results = await service.semanticSearch('的', {}, 2)
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should return exactQuery when query is empty', async () => {
      const results = await service.semanticSearch('', {})
      expect(results.length).toBe(3)
    })

    it('should sort by relevance descending', async () => {
      const results = await service.semanticSearch('的', {}, 10)
      if (results.length >= 2) {
        expect(results[0].relevance).toBeGreaterThanOrEqual(results[1].relevance)
      }
    })
  })

  describe('aggregate', () => {
    it('should compute COUNT metric', async () => {
      const metrics = await service.aggregate({}, {})
      const countMetric = metrics.find(m => m.operation === 'COUNT')
      expect(countMetric).toBeDefined()
      expect(countMetric.value).toBe(3)
      expect(countMetric.unit).toBe('entries')
    })

    it('should compute AVG duration metric', async () => {
      const metrics = await service.aggregate({}, {})
      const avgMetric = metrics.find(m => m.operation === 'AVG(durationMinutes)')
      expect(avgMetric).toBeDefined()
      expect(avgMetric.value).toBe(80) // (90+120+30)/3 = 80
    })

    it('should filter metrics by scope', async () => {
      const metrics = await service.aggregate({}, { projects: ['家庭'] })
      const countMetric = metrics.find(m => m.operation === 'COUNT')
      expect(countMetric.value).toBe(1)
    })

    it('should return null avg when no duration data', async () => {
      const noDurationRecords = [
        { id: 'r1', occurredAt: '2026-07-25', contentText: 'A' },
      ]
      const svc = new AnalysisService({ journalService: createMockJournalService(noDurationRecords) })
      const metrics = await svc.aggregate({}, {})
      const avgMetric = metrics.find(m => m.operation === 'AVG(durationMinutes)')
      expect(avgMetric.value).toBeNull()
    })
  })

  describe('execute', () => {
    it('should produce valid EvidencePack', async () => {
      const plan = {
        normalizedQuestion: 'How many entries?',
        operations: [
          { id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }
        ],
        scope: {},
        expectedOutput: 'mixed'
      }
      const pack = await service.execute(plan)
      expect(pack.id).toBeDefined()
      expect(pack.schemaVersion).toBe('1.0.0')
      expect(pack.evidence).toBeDefined()
      expect(pack.metrics).toBeDefined()
      expect(pack.limitations).toBeDefined()
      expect(pack.generatedAt).toBeDefined()
    })

    it('should deduplicate evidence by recordId', async () => {
      const plan = {
        normalizedQuestion: 'entries',
        operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
        scope: {},
      }
      const pack = await service.execute(plan)
      const recordIds = pack.evidence.map(e => e.recordId)
      const uniqueIds = new Set(recordIds)
      expect(recordIds.length).toBe(uniqueIds.size)
    })

    it('should add NO_RECORDS_FOUND limitation when no evidence', async () => {
      const emptySvc = new AnalysisService({ journalService: createMockJournalService([]) })
      const plan = {
        normalizedQuestion: 'test',
        operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
        scope: {},
      }
      const pack = await emptySvc.execute(plan)
      expect(pack.limitations.length).toBeGreaterThan(0)
      expect(pack.limitations[0].code).toBe('NO_RECORDS_FOUND')
    })

    it('should pass scope through to pack', async () => {
      const plan = {
        normalizedQuestion: 'test',
        operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
        scope: { projects: ['工作'] },
      }
      const pack = await service.execute(plan)
      expect(pack.scope.projects).toEqual(['工作'])
    })
  })

  describe('_makeExcerpt', () => {
    it('should return empty string for null/undefined', () => {
      expect(service._makeExcerpt(null)).toBe('')
      expect(service._makeExcerpt(undefined)).toBe('')
    })

    it('should truncate long text', () => {
      const item = { contentText: 'x'.repeat(300) }
      expect(service._makeExcerpt(item).length).toBeLessThanOrEqual(203)
    })
  })
})
