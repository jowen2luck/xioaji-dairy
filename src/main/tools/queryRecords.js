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

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData } from '../data/index.js'

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
- 智慧筛选："包含金句的记录"

注意：
- 本工具仅支持精确条件匹配，不做模糊语义搜索
- 如需搜索内容相似性，请使用 search_records 工具
- 如需统计分析，请使用 sql_analysis 工具`
    
    this.schema = {
      type: 'object',
      properties: {
        // 基础维度查询
        dateRange: {
          type: 'object',
          description: '日期范围（基于 time 字段）',
          properties: {
            start: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            end: { type: 'string', description: '结束日期 YYYY-MM-DD' }
          }
        },
        project: {
          type: 'string',
          description: '项目名称（模糊匹配 shanggexiangmu 字段）'
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
        contentKeyword: {
          type: 'string',
          description: '内容关键词（⚠️仅限精确匹配单词或短语，如"开心"、"项目A"）。如果用户输入的是长句子或模糊描述（如"好像写到了..."），严禁使用此字段，请改用 search_records 工具进行语义检索！'
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
          description: '内容体裁（使用 _ai_meta.content_type 字段）。可选值：DailyLog/Reflection/Letter/Idea'
        },
        hasQuotes: {
          type: 'boolean',
          description: '是否包含金句（检查 _ai_meta.key_quotes 数组是否非空）'
        },
        
        limit: {
          type: 'number',
          description: '返回结果数量限制（默认 20）'
        }
      }
    }
  }

  async invoke(input) {
    try {
      console.log('[QueryRecordsTool] Received conditions:', JSON.stringify(input, null, 2))

      const data = await loadAndEnrichData()

      if (data.length === 0) {
        return new ToolResult(this.name, {
          records: [],
          message: '暂无数据',
          totalCount: 0
        })
      }

      // 应用所有条件过滤
      const filtered = data.filter(item => {
        let match = true

        // ==================== 基础维度过滤 ====================
        
        // 1. 日期范围
        if (input.dateRange) {
          if (item.time) {
            const itemDate = new Date(item.time)
            if (input.dateRange.start) {
              match = match && itemDate >= new Date(input.dateRange.start)
            }
            if (input.dateRange.end) {
              const endDate = new Date(input.dateRange.end)
              endDate.setHours(23, 59, 59, 999)
              match = match && itemDate <= endDate
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

        // 7. 内容关键词（简单包含匹配）
        if (input.contentKeyword && match) {
          const keyword = input.contentKeyword.toLowerCase()
          const text = [item.ganshou, item.shanggexiangmu, item.chixushijian]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          match = match && text.includes(keyword)
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
          if (item._ai_meta) {
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

      // 应用限制
      const limit = input.limit || 20
      const results = filtered.slice(0, limit)

      // 统计 AI 增强情况
      const aiEnhancedCount = results.filter(item => item._ai_meta).length

      return new ToolResult(this.name, {
        records: results,
        totalCount: data.length,
        matchedCount: filtered.length,
        returnedCount: results.length,
        aiEnhancedCount,
        conditions: input
      })
    } catch (error) {
      console.error('[QueryRecordsTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }
}
