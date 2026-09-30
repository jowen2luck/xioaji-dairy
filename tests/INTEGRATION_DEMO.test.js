/**
 * Integration Demo Tests — 端到端验证核心模块协同工作
 *
 * 用真实样例数据演示：
 * 1. 新询问流程 (InquiryService.start)
 * 2. 追问流程 (InquiryService.followUp + scope 演化)
 * 3. 证据包生成 (AnalysisService.execute)
 * 4. 计划生成 (QueryPlanner)
 * 5. 答案编排 (AnswerComposer)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import InquiryService from '../src/main/application/InquiryService.js'
import AnalysisService from '../src/main/application/AnalysisService.js'
import QueryPlanner from '../src/main/domain/inquiry/QueryPlanner.js'
import AnswerComposer from '../src/main/application/AnswerComposer.js'
import InquirySessionStore from '../src/main/domain/inquiry/InquirySessionStore.js'
import { safeParseEvidencePack, safeParseInquiryPlan } from '../src/main/domain/contracts.js'

// ============================================================
// 样例数据：模拟一个用户的日记记录
// ============================================================
const sampleJournalRecords = [
  {
    id: 'day1', occurredAt: '2026-08-20T09:00:00',
    contentText: '今天和妈妈一起去了公园散步，感觉很温馨。下午读了一本关于心理学的书。',
    project: '家庭', durationMinutes: 120, experience: '温馨',
    moodColor: '#FFD700', achievement: true,
  },
  {
    id: 'day2', occurredAt: '2026-08-21T14:00:00',
    contentText: '项目会议很顺利，团队讨论了新功能的技术方案。感觉充满干劲。',
    project: '工作', durationMinutes: 180, experience: '顺利',
    moodColor: '#90EE90', achievement: true,
  },
  {
    id: 'day3', occurredAt: '2026-08-22T20:00:00',
    contentText: '有点焦虑，明天有重要汇报。晚上失眠了，翻来覆去睡不着。',
    project: '工作', durationMinutes: 30, experience: '焦虑',
    moodColor: '#87CEEB', achievement: false,
  },
  {
    id: 'day4', occurredAt: '2026-08-23T10:00:00',
    contentText: '早上跑步5公里，感觉神清气爽。下午写了技术博客。',
    project: '运动', durationMinutes: 90, experience: '充实',
    moodColor: '#FFD700', achievement: true,
  },
  {
    id: 'day5', occurredAt: '2026-08-24T15:00:00',
    contentText: '和朋友一起吃了火锅，聊了很多近况。感觉很放松。',
    project: '社交', durationMinutes: 150, experience: '放松',
    moodColor: '#FFD700', achievement: false,
  },
]

// Mock JournalService
function createMockJournalService(records) {
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

// ============================================================
// Demo 1: QueryPlanner — 根据问题生成查询计划
// ============================================================
describe('Demo 1: QueryPlanner 生成查询计划', () => {
  let planner

  beforeEach(() => {
    planner = new QueryPlanner() // 无 LLM，使用规则降级
  })

  it('问题: "这周有多少条记录？" → 应生成 exact_query + aggregate', async () => {
    const plan = await planner.generatePlan('这周有多少条记录？')

    // 验证计划结构
    const validation = safeParseInquiryPlan(plan)
    expect(validation.success).toBe(true)

    const types = plan.operations.map(o => o.type)
    expect(types).toContain('exact_query')
    expect(types).toContain('aggregate')
    console.log('  ✅ 计划操作:', types.join(' → '))
  })

  it('问题: "最近的情绪趋势如何？" → 应包含 timeline', async () => {
    const plan = await planner.generatePlan('最近的情绪趋势如何？')

    const types = plan.operations.map(o => o.type)
    expect(types).toContain('timeline')
    console.log('  ✅ 计划操作:', types.join(' → '))
  })

  it('问题: "比较工作和家庭的时间分配" → 应包含 compare', async () => {
    const plan = await planner.generatePlan('比较工作和家庭的时间分配')

    const types = plan.operations.map(o => o.type)
    expect(types).toContain('compare')
    console.log('  ✅ 计划操作:', types.join(' → '))
  })

  it('问题: "回忆那些开心的时刻" → 应包含 semantic_search', async () => {
    const plan = await planner.generatePlan('回忆那些开心的时刻')

    const types = plan.operations.map(o => o.type)
    expect(types).toContain('semantic_search')
    console.log('  ✅ 计划操作:', types.join(' → '))
  })
})

// ============================================================
// Demo 2: AnalysisService — 生成 EvidencePack
// ============================================================
describe('Demo 2: AnalysisService 生成证据包', () => {
  let service

  beforeEach(() => {
    service = new AnalysisService({
      journalService: createMockJournalService(sampleJournalRecords),
    })
  })

  it('查询所有记录 → EvidencePack 包含 5 条 evidence', async () => {
    const plan = {
      normalizedQuestion: '列出所有记录',
      operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
      scope: {},
    }

    const pack = await service.execute(plan)

    // 验证 EvidencePack 结构
    const validation = safeParseEvidencePack(pack)
    expect(validation.success).toBe(true)

    expect(pack.evidence.length).toBe(5)
    expect(pack.metrics.length).toBeGreaterThan(0)
    expect(pack.generatedAt).toBeDefined()
    console.log('  ✅ EvidencePack:', pack.evidence.length, '条证据,', pack.metrics.length, '个指标')
  })

  it('按项目过滤 → 只返回"工作"相关记录', async () => {
    const plan = {
      normalizedQuestion: '工作相关记录',
      operations: [{ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] }],
      scope: { projects: ['工作'] },
    }

    const pack = await service.execute(plan)

    expect(pack.evidence.length).toBe(2) // day2 + day3
    expect(pack.scope.projects).toEqual(['工作'])
    console.log('  ✅ 过滤结果:', pack.evidence.length, '条工作相关记录')
  })

  it('聚合统计 → 包含 COUNT 和 AVG 指标', async () => {
    const plan = {
      normalizedQuestion: '统计本周数据',
      operations: [
        { id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] },
        { id: 'op_2', type: 'aggregate', input: {}, dependsOn: ['op_1'] },
      ],
      scope: {},
    }

    const pack = await service.execute(plan)

    const countMetric = pack.metrics.find(m => m.operation === 'COUNT')
    expect(countMetric).toBeDefined()
    expect(countMetric.value).toBe(5)

    const avgMetric = pack.metrics.find(m => m.operation === 'AVG(durationMinutes)')
    expect(avgMetric).toBeDefined()
    expect(avgMetric.value).toBe(114) // (120+180+30+90+150)/5 = 114

    console.log('  ✅ COUNT:', countMetric.value, '| AVG(duration):', avgMetric.value, '分钟')
  })

  it('语义搜索 → "焦虑" 匹配到 day3', async () => {
    const results = await service.semanticSearch('焦虑', {}, 5)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].recordId).toBe('day3')
    console.log('  ✅ 语义搜索 "焦虑" → 匹配:', results.map(r => r.recordId).join(', '))
  })
})

// ============================================================
// Demo 3: AnswerComposer — 编排最终答案
// ============================================================
describe('Demo 3: AnswerComposer 编排答案', () => {
  let composer

  beforeEach(() => {
    composer = new AnswerComposer()
  })

  it('编排结果 → 包含 facts/computations/hypotheses/suggestions', () => {
    const evidencePack = {
      id: 'pack-demo',
      schemaVersion: '1.0.0',
      question: '这周总结',
      scope: {},
      evidence: [
        { id: 'ev-1', recordId: 'day1', occurredAt: '2026-08-20', field: 'contentText', excerpt: '和妈妈去了公园', relevance: 0.9 },
        { id: 'ev-2', recordId: 'day2', occurredAt: '2026-08-21', field: 'contentText', excerpt: '项目会议顺利', relevance: 0.8 },
      ],
      metrics: [
        { id: 'm-1', label: 'Total Entries', value: 5, unit: 'entries', operation: 'COUNT', sampleSize: 5 },
        { id: 'm-2', label: 'Avg Duration', value: 114, unit: 'min', operation: 'AVG(durationMinutes)', sampleSize: 5 },
      ],
      comparisons: [],
      limitations: [],
      generatedAt: '2026-08-24T10:00:00Z',
    }

    const session = { id: 'sess-demo', currentQuestion: '这周总结', scope: {} }
    const result = composer.compose({ evidencePack, session })

    // 验证四级认知分离
    expect(result.facts.length).toBe(2)
    expect(result.computations.length).toBe(2)
    expect(result.hypotheses.length).toBe(1)
    expect(result.suggestions.length).toBe(1)
    expect(result.followUps.length).toBeGreaterThan(0)

    // 验证答案文本
    expect(result.answer).toContain('Evidence Summary')
    expect(result.answer).toContain('5') // evidence count

    console.log('  ✅ Facts:', result.facts.length)
    console.log('  ✅ Computations:', result.computations.length)
    console.log('  ✅ Hypotheses:', result.hypotheses.length)
    console.log('  ✅ Suggestions:', result.suggestions.length)
    console.log('  ✅ FollowUps:', result.followUps)
  })
})

// ============================================================
// Demo 4: InquiryService.start — 完整新询问流程
// ============================================================
describe('Demo 4: InquiryService.start 完整流程', () => {
  let service

  beforeEach(() => {
    service = new InquiryService({
      journalService: createMockJournalService(sampleJournalRecords),
      analysisService: new AnalysisService({
        journalService: createMockJournalService(sampleJournalRecords),
      }),
    })
  })

  it('用户提问: "这周有多少条记录？" → 返回完整 ExplorationResult', async () => {
    const result = await service.start({
      question: '这周有多少条记录？',
      scope: {},
    })

    // 验证返回结构
    expect(result.sessionId).toBeDefined()
    expect(result.evidencePackId).toBeDefined()
    expect(result.answer).toBeDefined()
    expect(result.facts).toBeDefined()
    expect(result.computations).toBeDefined()
    expect(result.hypotheses).toBeDefined()
    expect(result.followUps).toBeDefined()

    // 验证会话已创建
    const session = await service.getSession(result.sessionId)
    expect(session).not.toBeNull()
    expect(session.currentQuestion).toBe('这周有多少条记录？')

    // 验证 EvidencePack 可检索
    const pack = await service.getEvidencePack(result.evidencePackId)
    expect(pack).not.toBeNull()
    expect(pack.evidence.length).toBe(5)

    console.log('  ✅ Session:', result.sessionId)
    console.log('  ✅ EvidencePack:', result.evidencePackId)
    console.log('  ✅ 证据数:', pack.evidence.length)
    console.log('  ✅ 指标数:', pack.metrics.length)
    console.log('  ✅ 追问建议:', result.followUps.length, '条')
  })

  it('用户提问: "工作相关的记录" → scope 过滤生效', async () => {
    const result = await service.start({
      question: '工作相关的记录',
      scope: { projects: ['工作'] },
    })

    const pack = await service.getEvidencePack(result.evidencePackId)
    expect(pack.evidence.length).toBe(2) // day2 + day3

    console.log('  ✅ 工作相关记录:', pack.evidence.length, '条')
  })
})

// ============================================================
// Demo 5: InquiryService.followUp — 追问 + scope 演化
// ============================================================
describe('Demo 5: InquiryService.followUp 追问 + scope 演化', () => {
  let service

  beforeEach(() => {
    service = new InquiryService({
      journalService: createMockJournalService(sampleJournalRecords),
      analysisService: new AnalysisService({
        journalService: createMockJournalService(sampleJournalRecords),
      }),
    })
  })

  it('追问: "只看工作的" → scope 缩窄 (narrow)', async () => {
    // 先创建一个会话
    const startResult = await service.start({
      question: '这周总结',
      scope: {},
    })

    // 追问缩窄范围
    const followResult = await service.followUp({
      sessionId: startResult.sessionId,
      question: '只看工作的',
      scopePatch: { projects: ['工作'] },
    })

    // 验证 scope 已缩窄
    const session = await service.getSession(startResult.sessionId)
    expect(session.scope.projects).toEqual(['工作'])

    // 验证新 EvidencePack 只包含工作记录
    const pack = await service.getEvidencePack(followResult.evidencePackId)
    expect(pack.evidence.length).toBe(2)

    console.log('  ✅ 追问后 scope:', JSON.stringify(session.scope))
    console.log('  ✅ 过滤后记录:', pack.evidence.length, '条')
  })

  it('追问: "换成看家庭的" → scope 替换 (replace)', async () => {
    const startResult = await service.start({
      question: '这周总结',
      scope: { projects: ['工作'] },
    })

    const followResult = await service.followUp({
      sessionId: startResult.sessionId,
      question: '换成看家庭的',
      scopePatch: { projects: ['家庭'] },
    })

    const session = await service.getSession(startResult.sessionId)
    expect(session.scope.projects).toEqual(['家庭'])

    const pack = await service.getEvidencePack(followResult.evidencePackId)
    expect(pack.evidence.length).toBe(1) // only day1

    console.log('  ✅ 替换后 scope:', JSON.stringify(session.scope))
    console.log('  ✅ 家庭记录:', pack.evidence.length, '条')
  })

  it('追问: "继续" → scope 复用 (reuse)', async () => {
    const startResult = await service.start({
      question: '这周总结',
      scope: { projects: ['运动'] },
    })

    const followResult = await service.followUp({
      sessionId: startResult.sessionId,
      question: '继续',
      scopePatch: {},
    })

    const session = await service.getSession(startResult.sessionId)
    expect(session.scope.projects).toEqual(['运动']) // 保持不变

    console.log('  ✅ 复用 scope:', JSON.stringify(session.scope))
  })

  it('ModelCallReceipt 追踪 → 每次 planning 调用都被记录', async () => {
    await service.start({ question: '问题1', scope: {} })
    await service.start({ question: '问题2', scope: {} })

    const receipts = service.getModelCallReceipts()
    expect(receipts.length).toBe(2)
    expect(receipts[0].purpose).toBe('planning')
    expect(receipts[0].success).toBe(true)

    console.log('  ✅ ModelCallReceipts:', receipts.length, '条')
  })
})

// ============================================================
// Demo 6: 端到端场景 — 模拟真实用户交互
// ============================================================
describe('Demo 6: 端到端场景 — 模拟真实用户交互', () => {
  it('场景: 用户探索本周状态 → 追问情绪 → 追问比较', async () => {
    const journalService = createMockJournalService(sampleJournalRecords)
    const service = new InquiryService({
      journalService,
      analysisService: new AnalysisService({ journalService }),
    })

    // Step 1: 用户问 "这周状态如何？"
    console.log('\n  📝 Step 1: 用户提问 "这周状态如何？"')
    const r1 = await service.start({ question: '这周状态如何？', scope: {} })
    const pack1 = await service.getEvidencePack(r1.evidencePackId)
    console.log('     → 找到', pack1.evidence.length, '条记录,', pack1.metrics.length, '个指标')

    // Step 2: 用户追问 "情绪开心的有哪些？"
    console.log('  📝 Step 2: 追问 "情绪开心的有哪些？"')
    const r2 = await service.followUp({
      sessionId: r1.sessionId,
      question: '情绪开心的有哪些？',
      scopePatch: {},
    })
    const pack2 = await service.getEvidencePack(r2.evidencePackId)
    console.log('     → 找到', pack2.evidence.length, '条相关记录')

    // Step 3: 用户追问 "比较工作和家庭"
    console.log('  📝 Step 3: 追问 "比较工作和家庭"')
    const r3 = await service.followUp({
      sessionId: r1.sessionId,
      question: '比较工作和家庭的时间',
      scopePatch: {},
    })
    const pack3 = await service.getEvidencePack(r3.evidencePackId)
    console.log('     → 找到', pack3.evidence.length, '条记录')

    // 验证会话完整性
    const session = await service.getSession(r1.sessionId)
    expect(session.evidencePackIds.length).toBe(3)
    expect(session.currentQuestion).toBe('比较工作和家庭的时间')

    // 验证审计追踪
    const receipts = service.getModelCallReceipts()
    expect(receipts.length).toBe(3)

    console.log('  ✅ 会话完成: 3 轮交互,', session.evidencePackIds.length, '个 EvidencePack,', receipts.length, '条 Receipt')
  })
})
