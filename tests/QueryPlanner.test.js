/**
 * QueryPlanner Tests
 */

import { describe, it, expect } from 'vitest'
import QueryPlanner from '../src/main/domain/inquiry/QueryPlanner.js'
import { safeParseInquiryPlan } from '../src/main/domain/contracts.js'

describe('QueryPlanner', () => {
  let planner

  beforeEach(() => {
    planner = new QueryPlanner()
  })

  describe('generatePlan (rule-based fallback)', () => {
    it('should generate plan with exact_query and aggregate for simple question', async () => {
      const plan = await planner.generatePlan('How many entries this week?')
      expect(plan.operations.length).toBeGreaterThanOrEqual(2)
      expect(plan.operations[0].type).toBe('exact_query')
      expect(plan.normalizedQuestion).toBe('How many entries this week?')
    })

    it('should add compare operation for comparison questions', async () => {
      const plan = await planner.generatePlan('比较上周和这周的工作量')
      const types = plan.operations.map(o => o.type)
      expect(types).toContain('compare')
    })

    it('should add timeline operation for trend questions', async () => {
      const plan = await planner.generatePlan('最近一个月的焦虑趋势')
      const types = plan.operations.map(o => o.type)
      expect(types).toContain('timeline')
    })

    it('should add semantic_search for mood/feeling questions', async () => {
      const plan = await planner.generatePlan('回忆那些开心的时刻')
      const types = plan.operations.map(o => o.type)
      expect(types).toContain('semantic_search')
    })

    it('should produce a valid plan that passes schema validation', async () => {
      const plan = await planner.generatePlan('Show me last week stats')
      const result = safeParseInquiryPlan(plan)
      expect(result.success).toBe(true)
    })

    it('should preserve scope from session state', async () => {
      const sessionState = { scope: { projects: ['工作'] } }
      const plan = await planner.generatePlan('How many?', sessionState)
      expect(plan.scope.projects).toEqual(['工作'])
    })
  })

  describe('validate', () => {
    it('should accept valid plan', () => {
      const raw = {
        normalizedQuestion: 'test',
        operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
        scope: {}
      }
      const result = planner.validate(raw)
      expect(result).not.toBeNull()
      expect(result.operations.length).toBe(1)
    })

    it('should filter out invalid operation types', () => {
      const raw = {
        normalizedQuestion: 'test',
        operations: [
          { id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] },
          { id: 'op_2', type: 'INVALID_OP', input: {}, dependsOn: [] }
        ],
        scope: {}
      }
      const result = planner.validate(raw)
      expect(result.operations.length).toBe(1)
      expect(result.operations[0].type).toBe('exact_query')
    })

    it('should return null for empty operations', () => {
      const raw = { normalizedQuestion: 'test', operations: [] }
      expect(planner.validate(raw)).toBeNull()
    })

    it('should return null for non-array operations', () => {
      const raw = { normalizedQuestion: 'test' }
      expect(planner.validate(raw)).toBeNull()
    })

    it('should sanitize scope to allowed fields only', () => {
      const raw = {
        normalizedQuestion: 'test',
        operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
        scope: { projects: ['工作'], maliciousField: 'bad' }
      }
      const result = planner.validate(raw)
      expect(result.scope.projects).toEqual(['工作'])
      expect(result.scope.maliciousField).toBeUndefined()
    })

    it('should generate IDs for operations missing them', () => {
      const raw = {
        normalizedQuestion: 'test',
        operations: [{ type: 'exact_query', input: {}, dependsOn: [] }],
        scope: {}
      }
      const result = planner.validate(raw)
      expect(result.operations[0].id).toBeDefined()
    })
  })

  describe('evolveScope', () => {
    it('reuse strategy should return previous scope as-is', () => {
      const prev = { dateRange: { start: '2026-07-01', end: '2026-07-31' } }
      const result = planner.evolveScope(prev, 'reuse', { projects: ['工作'] })
      expect(result).toEqual(prev)
      expect(result.projects).toBeUndefined()
    })

    it('narrow strategy should merge patch into previous scope', () => {
      const prev = { dateRange: { start: '2026-07-01', end: '2026-07-31' } }
      const result = planner.evolveScope(prev, 'narrow', { projects: ['工作'] })
      expect(result.dateRange).toEqual(prev.dateRange)
      expect(result.projects).toEqual(['工作'])
    })

    it('extend strategy should merge patch into previous scope', () => {
      const prev = { dateRange: { start: '2026-07-01', end: '2026-07-31' } }
      const result = planner.evolveScope(prev, 'extend', { projects: ['家庭'] })
      expect(result.dateRange).toEqual(prev.dateRange)
      expect(result.projects).toEqual(['家庭'])
    })

    it('replace strategy should completely replace scope', () => {
      const prev = { dateRange: { start: '2026-07-01', end: '2026-07-31' } }
      const result = planner.evolveScope(prev, 'replace', { projects: ['工作'] })
      expect(result).toEqual({ projects: ['工作'] })
      expect(result.dateRange).toBeUndefined()
    })
  })

  describe('detectScopeStrategy', () => {
    it('should detect narrow strategy from "只" / "仅"', () => {
      expect(planner.detectScopeStrategy('只看工作的', {})).toBe('narrow')
      expect(planner.detectScopeStrategy('仅显示本周', {})).toBe('narrow')
    })

    it('should detect replace strategy from "换成" / "改"', () => {
      expect(planner.detectScopeStrategy('换成家庭项目', {})).toBe('replace')
      expect(planner.detectScopeStrategy('改成看上周', {})).toBe('replace')
    })

    it('should detect extend strategy from "扩大" / "更多"', () => {
      expect(planner.detectScopeStrategy('扩大时间范围', {})).toBe('extend')
      expect(planner.detectScopeStrategy('显示更多记录', {})).toBe('extend')
    })

    it('should detect narrow from patch with fields', () => {
      expect(planner.detectScopeStrategy('Show me', { projects: ['工作'] })).toBe('narrow')
    })

    it('should default to reuse when no signals detected', () => {
      expect(planner.detectScopeStrategy('继续', {})).toBe('reuse')
    })
  })
})
