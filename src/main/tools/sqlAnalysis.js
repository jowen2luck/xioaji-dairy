/**
 * SQL 分析工具 (Tool) - 基础统计专用
 * 职责：执行客观数据的聚合统计
 * 处理"有多少"、"多久"、"什么时候"的问题
 * 
 * 注意：深度洞察分析（相关性、归因、心理分析）请使用 insight_analyst 工具
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData, getSqlService } from '../data/index.js'
import dayjs from '../../utils/date.js'

export class SqlAnalysisTool extends Tool {
  constructor() {
    super()
    this.name = 'sql_analysis'
    this.description = `执行基础统计分析。

参数映射表 (AnalysisType -> Required Params):
- summary → 无需 params
- by_project → params.limit (可选)
- by_time → 无需 params
- weekday_weekend → 无需 params
- mood_trend → 无需 params
- top_projects → params.limit (可选)
- mood_distribution → 无选 params (⚠️ 需要 AI 元数据)
- energy_trend → params.groupBy (必须。'week'/'month') (⚠️ 需要 AI 元数据)
- content_type_ratio → 无需 params (⚠️ 需要 AI 元数据)
- life_composition → 无需 params (⚠️ 需要 AI 元数据)
- general_aggregation → params.groupByField / params.timeUnit / params.metric / params.targetField

注意：此工具专注于基础统计（计数、求和、平均值）。深度洞察分析（相关性、归因、心理分析）请使用 insight_analyst 工具。
⚠️ 重要：带有 (⚠️ 需要 AI 元数据) 标记的分析类型，依赖于 LLM 预处理生成的元数据（如 mood_tags, energy_level）。如果尚未运行 AI 分析，这些查询将返回错误或空结果。`
    this.schema = {
      type: 'object',
      properties: {
        analysisType: {
          type: 'string',
          description: '必须从预定义类型中选择',
          enum: [
            // 基础统计
            'summary',
            'by_project',
            'by_time',
            'weekday_weekend',
            'mood_trend',
            'top_projects',
            // AI 元数据统计
            'mood_distribution',
            'energy_trend',
            'content_type_ratio',
            'life_composition',
            // 通用聚合
            'general_aggregation'
          ],
        },
        params: {
          type: 'object',
          description: '分析参数（根据 analysisType 不同易有不同需求，详见 description 中的参数映射表）',
          properties: {
            limit: { type: 'number', description: 'Top N 限制（用于 by_project, top_projects）' },
            dimension: { type: 'string', description: '分组维度字段（用于 by_project）' },
            groupBy: { type: 'string', description: '时间分组方式（用于 energy_trend: \'week\' or \'month\')。强优先使用 \'month\' 除非数据量严重不足' },
            // 通用聚合参数
            groupByField: { type: 'string', description: '分组字段, 支持嵌套如 _ai_meta.mood_tags' },
            timeUnit: { type: 'string', description: '如果是时间统计，指定单位: day/week/month/year' },
            metric: { type: 'string', enum: ['count', 'sum', 'avg'], description: '统计指标' },
            targetField: { type: 'string', description: 'sum/avg 的目标字段' },
          },
        },
      },
      required: ['analysisType'],
    }
  }

  async invoke(input) {
    try {
      const { analysisType, params = {} } = input
      
      console.log(`[SqlAnalysisTool] Received input:`, JSON.stringify(input, null, 2))
      
      // 验证 analysisType
      const validTypes = [
        'summary', 'by_project', 'by_time', 'weekday_weekend', 'mood_trend', 'top_projects',
        'mood_distribution', 'energy_trend', 'content_type_ratio', 'life_composition', 'general_aggregation'
      ]
      if (!validTypes.includes(analysisType)) {
        return new ToolResult(this.name, {
          error: `不支持的分析类型: ${analysisType}`,
          message: `仅支持以下预定义类型: ${validTypes.join(', ')}`,
          validTypes,
        }, true)
      }
      
      const sqlService = getSqlService()
      const data = await loadAndEnrichData()

      if (data.length === 0) {
        return new ToolResult(this.name, {
          error: '暂无数据',
          message: '请先导入或创建记录',
        }, true)
      }

      console.log(`[SqlAnalysisTool] Executing ${analysisType} on ${data.length} records`)

      // 智能预检：检查是否请求了 AI 分析但缺少 AI 数据
      const aiEnhancedCount = data.filter(item => item._ai_meta).length
      const isAIAnalysis = [
        'mood_distribution', 'energy_trend', 'content_type_ratio', 'life_composition'
      ].includes(analysisType)

      if (isAIAnalysis) {
        // 1. 检查是否存在任何 AI 元数据
        if (aiEnhancedCount === 0) {
          console.warn('[SqlAnalysisTool] Blocked AI analysis due to missing metadata')
          return new ToolResult(this.name, {
            error: '数据缺失 AI 元信息',
            message: '当前尚未生成 AI 分析数据（如情绪、能量值等）。请先运行 AI 分析流程。',
            suggestion: '无法执行此分析，因为没有 AI 元数据。请告知用户需要先运行数据处理流程。',
            recordCount: data.length,
            aiEnhancedCount: 0
          }, true) // isError=true 强制停止模型重试
        }

        // 2. 针对特定分析类型的字段级检查
        if (analysisType === 'energy_trend') {
          const hasEnergy = data.some(r => r._ai_meta && typeof r._ai_meta.energy_level === 'number')
          if (!hasEnergy) {
            return new ToolResult(this.name, {
              error: '数据缺失能量值',
              message: '虽然存在部分 AI 元数据，但未找到 energy_level 字段。',
              suggestion: '请告知用户当前数据未包含能量趋势信息。',
              aiEnhancedCount
            }, true)
          }
        }
      }

      // 通用聚合优先处理
      if (analysisType === 'general_aggregation') {
        return this.performGenericAggregation(data, params)
      }

      let result

      // ==================== 基础统计 ====================
      switch (analysisType) {
        case 'summary':
          result = sqlService.getStatsSummary(data)
          break

        case 'by_project':
          const dimension = params.dimension || '_meta_project'
          result = sqlService.analyzeByDimension(data, dimension, params.limit || 10)
          break

        case 'by_time':
          result = sqlService.analyzeTimeDistribution(data)
          break

        case 'weekday_weekend':
          result = sqlService.analyzeWeekdayVsWeekend(data)
          break

        case 'mood_trend':
          result = sqlService.analyzeMoodTrend(data)
          break

        case 'top_projects':
          result = sqlService.getTopProjects(data, params.limit || 5)
          break

        // ==================== AI 元数据统计 ====================
        case 'mood_distribution':
          result = sqlService.analyzeMoodDistribution(data)
          break

        case 'energy_trend':
          const groupBy = params.groupBy || 'month'
          result = sqlService.analyzeEnergyTrend(data, groupBy)
          break

        case 'content_type_ratio':
          result = sqlService.analyzeContentTypeRatio(data)
          break

        case 'life_composition':
          result = sqlService.analyzeLifeComposition(data)
          break

        default:
          throw new Error(`未知的分析类型: ${analysisType}`)
      }

      console.log(`[SqlAnalysisTool] Analysis type: ${analysisType}, returned ${Array.isArray(result) ? result.length : 1} results`)

      // 统计 AI 增强数据情况 (复用顶部已计算的变量)

      return new ToolResult(this.name, {
        analysisType,
        data: result,
        recordCount: data.length,
        aiEnhancedCount,
        isAIAnalysis,
        params: params,
      })
    } catch (error) {
      console.error('[SqlAnalysisTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }

  /**
   * 通用聚合引擎
   * 能够处理： "按项目统计平均能量值"、"按月份统计记录数" 等
   */
  performGenericAggregation(data, params) {
    const { groupByField, timeUnit, metric = 'count', targetField, limit = 10 } = params
    const groups = {}

    data.forEach(item => {
        let key = 'Unknown'
        
        // 1. 获取分组 Key
        // 优先使用 groupByField，如果没有指定则尝试使用 item.time (兼容默认时间字段)
        let rawValue = null
        if (groupByField) {
            rawValue = this.getNestedValue(item, groupByField)
        }
        
        // 如果没有找到值且没有指定 groupByField (或者值为空)，回退到默认 time 字段
        if (!rawValue && item.time) {
            rawValue = item.time
        }

        if (timeUnit && rawValue) {
            // Day.js 强大的时间格式化
            key = dayjs(rawValue).format(
                timeUnit === 'year' ? 'YYYY' :
                timeUnit === 'month' ? 'YYYY-MM' :
                timeUnit === 'week' ? 'YYYY-[W]WW' : // ISO Week
                'YYYY-MM-DD'
            )
        } else if (rawValue) {
             key = rawValue
        }

        // 处理数组类型的 Key (如 mood_tags)，这会导致一条记录归属多个组
        const keys = Array.isArray(key) ? key : [key]

        keys.forEach(k => {
            if (!groups[k]) groups[k] = { count: 0, sum: 0, items: [] }
            groups[k].count += 1
            if (metric !== 'count' && targetField) {
                const val = parseFloat(this.getNestedValue(item, targetField)) || 0
                groups[k].sum += val
            }
        })
    })

    // 2. 计算结果
    let result = Object.entries(groups).map(([key, stat]) => ({
        group: key,
        value: metric === 'avg' ? (stat.sum / stat.count).toFixed(2) :
               metric === 'sum' ? stat.sum :
               stat.count
    }))

    // 3. 排序与截断
    result.sort((a, b) => parseFloat(b.value) - parseFloat(a.value))
    if (limit) result = result.slice(0, limit)

    return new ToolResult(this.name, {
      analysisType: 'general_aggregation',
      data: result,
      recordCount: data.length,
      params: params,
    })
  }

  getNestedValue(obj, path) {
    if (!path) return null
    return path.split('.').reduce((o, k) => (o || {})[k], obj)
  }
}
