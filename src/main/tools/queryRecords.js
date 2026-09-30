/**
 * 精确查询工具 (Query Records Tool) - 增强版
 * 新增功能：支持 AI 元数据维度筛选
 * 
 * 新增查询维度：
 * - moodTags: 情绪标签筛选
 * - minEnergyLevel/maxEnergyLevel: 能量值范围
 * - peopleInvolved: 涉及人物
 * - contentType: 内容体裁
 * - hasQuotes: 是否包含金句
 */

import { Tool, ToolResult, formatRecordForLLM, sanitizeRecordForUI } from './base.js'
import { loadAndEnrichData } from '../data/index.js'
import { getSummaryService } from '../etl/summaryService.js'

export class QueryRecordsTool extends Tool {
  constructor() {
    super()
    this.name = 'query_records'
    this.description = `精确的结构化条件查询工具（支持 AI 元数据维度）:
使用场景：
- 查询特定日期范围的记录："上周的记录"、"11月的数据"
- 筛选特定项目："项目 A 的所有记录"
- 过滤特定时长："超过2小时的记录"、"短时任务"
- 时间段筛选："深夜的记录"、"周末的记录"
- 组合条件："上周项目 A 超过1小时的记录"

AI 增强查询（新增）：
- 情绪筛选："找出焦虑的记录"、"快乐的时刻"
- 能量值筛选："能量值大于7的记录"
- 人际筛选："涉及导师的记录"
- 体裁筛选："所有深度反思类记录"
- 总结筛选："某个时间段的总结"
- 智慧筛选："包含金句的记录"

关键词查询策略：
- 当用户查询的概念可能有多种表达时（如"交通"），请使用 keywordsAny: ["公交", "地铁", "打车", "开车"]。
- 当需要精确定位特定事件时（如"和老板吃饭"），请结合使用 keywordsAll: ["老板", "吃饭"]。
- 如果想要过滤掉无关记录（如找"吃药"但不想看"吃饭"），请使用 keywordsExclude: ["饭", "餐"]。

注意：
- 本工具为结构化属性精确筛选器（适合严格按日期范围、特定分类项目、时长等字段进行过滤）。
- 如需根据模糊回忆、特定感受、核心意象或多关键词检索相关日记，请使用 search_records 综合检索工具（内置本地向量语义、BM25 词法倒排与深度重排模型）。
- 如需聚合统计趋势分析，请使用 sql_analysis 工具`
    
    this.schema = {
      type: 'object',
      properties: {
        // 基础维度查询
        dateRange: {
          type: 'object',
          description: '【强制】时间范围。必须使用 calendar_resolver 解析后的 ISO 日期。',
          properties: {
            start: { type: 'string', description: '开始 ISO 日期' },
            end: { type: 'string', description: '结束 ISO 日期' }
          }
        },
        project: {
          type: 'string',
          description: '项目精确名称。如不确定，请先调用 metadata_explorer 查询库中存在的项目名。'
        },
        weekday: {
          type: 'string',
          description: '星期几（使用 _meta_weekday 字段），可选值: 周一/周二/.../周日'
        },
        isWeekend: {
          type: 'boolean',
          description: '是否周末（使用 _meta_is_weekend 字段）'
        },
        timeRange: {
          type: 'string',
          description: '时间段（使用 _meta_time_range 字段），可选值: 上午/中午/下午/晚上/深夜'
        },
        durationMin: {
          type: 'number',
          description: '最小持续时间（分钟，使用 _meta_duration_min 字段）'
        },
        durationMax: {
          type: 'number',
          description: '最大持续时间（分钟，使用 _meta_duration_min 字段）'
        },
        keywordsAny: {
          type: 'array',
          items: { type: 'string' },
          description: '目标文本中只要包含数组中的任意一个词，即视为匹配（逻辑 OR）。场景：同义词检索。示例：["吃", "餐", "饭"]'
        },
        keywordsAll: {
          type: 'array',
          items: { type: 'string' },
          description: '目标文本中必须同时包含数组中的所有词，才视为匹配（逻辑 AND）。场景：限定特定上下文。示例：["项目A", "会议"]'
        },
        keywordsExclude: {
          type: 'array',
          items: { type: 'string' },
          description: '目标文本中如果包含数组中的任意一个词，则排除该记录（逻辑 NOT）。场景：排除干扰项。示例：["不吃", "没吃"]'
        },
        
        // AI 元数据维度查询（新增）
        moodTags: {
          type: 'array',
          items: { type: 'string' },
          description: '情绪标签筛选（支持多选，OR 逻辑）。如：["焦虑", "沮丧"]'
        },
        minEnergyLevel: {
          type: 'number',
          description: '最低能量值（1-10，使用 _ai_meta.energy_level 字段）'
        },
        maxEnergyLevel: {
          type: 'number',
          description: '最高能量值（1-10，使用 _ai_meta.energy_level 字段）'
        },
        peopleInvolved: {
          type: 'string',
          description: '涉及人物（模糊匹配 _ai_meta.people_involved 数组）。如："导师"'
        },
        contentType: {
          type: 'string',
          description: '内容体裁（Summary 走总结类型，其它使用 _ai_meta.content_type 字段）。可选值：DailyLog/Reflection/Letter/Idea/Summary'
        },
        hasQuotes: {
          type: 'boolean',
          description: '是否包含金句（检查 _ai_meta.key_quotes 数组是否非空）'
        },
        
        limit: {
          type: 'number',
          description: '【已弃用】请使用 pageSize'
        },
        page: {
          type: 'number',
          description: '页码（默认 1）'
        },
        pageSize: {
          type: 'number',
          description: '每页数量（默认 20，最大 100）'
        },
        sortBy: {
          type: 'string',
          description: '排序方式',
          enum: ['time_desc', 'time_asc', 'duration_desc', 'energy_desc'],
          default: 'time_desc'
        }
      }
    }
  }

  async invoke(input) {
    try {
      console.log('[QueryRecordsTool] Received conditions:', JSON.stringify(input, null, 2))

      const data = await loadAndEnrichData()
      const summaries = getSummaryService().getSummaries()
      const sourceData = input.contentType === 'Summary' ? summaries : data

      if (sourceData.length === 0) {
        return new ToolResult(this.name, {
          records: [],
          message: '暂无数据',
          totalCount: 0
        })
      }

      // 应用所有条件过滤
      let filtered = sourceData.filter(item => {
        let match = true

        // ==================== 基础维度过滤 ====================
        
        // 1. 日期范围
        if (input.dateRange) {
          const rangeStart = input.dateRange.start ? new Date(input.dateRange.start) : null
          const rangeEnd = input.dateRange.end ? new Date(input.dateRange.end) : null
          if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999)

          if (input.contentType === 'Summary' && item._type === 'summary' && item._summary_period?.start && item._summary_period?.end) {
            const periodStart = new Date(item._summary_period.start)
            const periodEnd = new Date(item._summary_period.end)
            periodEnd.setHours(23, 59, 59, 999)
            if (rangeStart) match = match && periodEnd >= rangeStart
            if (rangeEnd) match = match && periodStart <= rangeEnd
          } else if (item.time) {
            const itemDate = new Date(item.time)
            if (rangeStart) {
              match = match && itemDate >= rangeStart
            }
            if (rangeEnd) {
              match = match && itemDate <= rangeEnd
            }
          } else {
            match = false
          }
        }

        // 2. 项目名称
        if (input.project && match) {
          match = match && item.shanggexiangmu && item.shanggexiangmu.includes(input.project)
        }

        // 3. 星期几
        if (input.weekday && match) {
          match = match && item._meta_weekday === input.weekday
        }

        // 4. 是否周末
        if (typeof input.isWeekend === 'boolean' && match) {
          match = match && item._meta_is_weekend === input.isWeekend
        }

        // 5. 时间段
        if (input.timeRange && match) {
          match = match && item._meta_time_range === input.timeRange
        }

        // 6. 时长范围
        if (typeof input.durationMin === 'number' && match) {
          match = match && (item._meta_duration_min || 0) >= input.durationMin
        }
        if (typeof input.durationMax === 'number' && match) {
          match = match && (item._meta_duration_min || 0) <= input.durationMax
        }

        // 7. 内容关键词结构化匹配 (keywordsAny, keywordsAll, keywordsExclude)
        if (match) {
          // 合并所有文本字段用于关键词匹配
          const text = [item.ganshou, item.shanggexiangmu, item.chixushijian, item.summary, item.content]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          // OR 逻辑检查 (keywordsAny)
          if (input.keywordsAny && input.keywordsAny.length > 0) {
            const hasAny = input.keywordsAny.some(kw => text.includes(kw.toLowerCase()));
            if (!hasAny) match = false;
          }

          // AND 逻辑检查 (keywordsAll)
          if (match && input.keywordsAll && input.keywordsAll.length > 0) {
            const hasAll = input.keywordsAll.every(kw => text.includes(kw.toLowerCase()));
            if (!hasAll) match = false;
          }

          // NOT 逻辑检查 (keywordsExclude)
          if (match && input.keywordsExclude && input.keywordsExclude.length > 0) {
            const hasForbidden = input.keywordsExclude.some(kw => text.includes(kw.toLowerCase()));
            if (hasForbidden) match = false;
          }
        }

        // ==================== AI 元数据维度过滤（新增） ====================
        
        // 8. 情绪标签（OR 逻辑）
        if (Array.isArray(input.moodTags) && input.moodTags.length > 0 && match) {
          if (item._ai_meta && Array.isArray(item._ai_meta.mood_tags)) {
            // 检查是否包含任一指定情绪标签
            match = match && input.moodTags.some(tag => item._ai_meta.mood_tags.includes(tag))
          } else {
            match = false // 没有 AI 元数据，无法匹配
          }
        }

        // 9. 能量值范围
        if (typeof input.minEnergyLevel === 'number' && match) {
          if (item._ai_meta && typeof item._ai_meta.energy_level === 'number') {
            match = match && item._ai_meta.energy_level >= input.minEnergyLevel
          } else {
            match = false
          }
        }
        if (typeof input.maxEnergyLevel === 'number' && match) {
          if (item._ai_meta && typeof item._ai_meta.energy_level === 'number') {
            match = match && item._ai_meta.energy_level <= input.maxEnergyLevel
          } else {
            match = false
          }
        }

        // 10. 涉及人物
        if (input.peopleInvolved && match) {
          if (item._ai_meta && Array.isArray(item._ai_meta.people_involved)) {
            match = match && item._ai_meta.people_involved.some(person => 
              person && person.includes(input.peopleInvolved)
            )
          } else {
            match = false
          }
        }

        // 11. 内容体裁
        if (input.contentType && match) {
          if (input.contentType === 'Summary') {
            match = match && item._type === 'summary'
          } else if (item._type === 'summary') {
            match = false
          } else if (item._ai_meta) {
            match = match && item._ai_meta.content_type === input.contentType
          } else {
            match = false
          }
        }

        // 12. 是否包含金句
        if (typeof input.hasQuotes === 'boolean' && match) {
          if (item._ai_meta) {
            const hasQuotes = Array.isArray(item._ai_meta.key_quotes) && item._ai_meta.key_quotes.length > 0
            match = match && (input.hasQuotes ? hasQuotes : !hasQuotes)
          } else {
            match = false
          }
        }

        return match
      })

      console.log(`[QueryRecordsTool] Filtered ${filtered.length} from ${data.length} records`)

      // ==================== 排序逻辑 (新增) ====================
      const sortBy = input.sortBy || 'time_desc'
      filtered.sort((a, b) => {
        if (sortBy === 'time_asc') return new Date(a.time) - new Date(b.time)
        if (sortBy === 'time_desc') return new Date(b.time) - new Date(a.time)
        if (sortBy === 'duration_desc') return (b._meta_duration_min || 0) - (a._meta_duration_min || 0)
        if (sortBy === 'energy_desc') return (b._ai_meta?.energy_level || 0) - (a._ai_meta?.energy_level || 0)
        return 0
      })

      // ==================== 分页逻辑 (新增) ====================
      const page = Math.max(1, input.page || 1)
      // 兼容旧的 limit 参数，优先使用 pageSize
      let pageSize = Math.max(1, input.pageSize || input.limit || 20)
      if (pageSize > 100) pageSize = 100 // 强制最大限制

      const totalItems = filtered.length
      const totalPages = Math.ceil(totalItems / pageSize)
      const startIndex = (page - 1) * pageSize
      const results = filtered.slice(startIndex, startIndex + pageSize)
      const hasNextPage = page < totalPages

      // 统计 AI 增强情况
      const aiEnhancedCount = results.filter(item => item._ai_meta).length
      const hasSummaryResults = results.some(item => item._type === 'summary')

      // 构造系统提示
      let systemHint = ''
      if (hasNextPage) {
        systemHint = `⚠️ 结果已分页：当前显示第 ${page}/${totalPages} 页（本页 ${results.length} 条，共 ${totalItems} 条）。
【操作建议】
1. 如需查看更多，请继续调用 query_records 工具，将 page 参数设置为 ${page + 1}。
2. 如需查询特定内容，请尝试添加更多过滤条件（如 keywordsAll, moodTags）。`
      } else if (totalItems > 100 && results.length > 0) {
        // 虽然没有下一页（或者已经是最后一页），但如果总数巨大，提醒可以用 search_records
         systemHint = `✅ 已加载全部 ${totalItems} 条数据。
💡 提示：如果发现记录过多难以分析，建议使用 search_records 工具进行语义摘要（如"查询最近的感悟"）。`
      }
      if (input.contentType === 'Summary' || hasSummaryResults) {
        const summaryHint = '📝 提示：总结属于感性描述与分析，适合做阶段性回顾。'
        systemHint = systemHint ? `${systemHint}\n\n${summaryHint}` : summaryHint
      }

      // 格式化输出
      // 1. 为 UI 准备对象数组（保留结构，移除大字段，修复前端显示为空的问题）
      const uiRecords = results.map(sanitizeRecordForUI)
      // 2. 为 LLM 准备纯文本摘要（节省 Token）
      const llmText = results.map(formatRecordForLLM).join('\n\n')

      return new ToolResult(this.name, {
        records: uiRecords, // 修复：UI 需要对象结构才能渲染卡片
        summary: llmText,   // 新增：LLM 请优先阅读此字段进行分析
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasNextPage
        },
        aiEnhancedCount,
        conditions: input,
        system_hint: systemHint
      })
    } catch (error) {
      console.error('[QueryRecordsTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }
}
