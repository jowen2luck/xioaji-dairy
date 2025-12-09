/**
 * SQL 分析工具 (Tool) - 基础统计专用
 * 职责：执行客观数据的聚合统计
 * 处理"有多少"、"多久"、"什么时候"的问题
 * 
 * 注意：深度洞察分析（相关性、归因、心理分析）请使用 insight_analyst 工具
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData, getSqlService } from '../data/index.js'

export class SqlAnalysisTool extends Tool {
  constructor() {
    super()
    this.name = 'sql_analysis'
    this.description = `执行基础统计分析（客观数据聚合）:
基础统计：
- summary: 总体统计摘要(记录数、项目数、总时长等)
- by_project: 按项目分组统计(默认Top10)
- by_time: 按时间段统计(上午/中午/下午/晚上/深夜)
- weekday_weekend: 工作日vs周末对比
- mood_trend: 情绪趋势(按月)
- top_projects: 高频项目排行(默认Top5)

AI 元数据统计：
- mood_distribution: 情绪标签分布统计（AI提取）
- energy_trend: 能量值时间趋势分析（按周或月）
- content_type_ratio: 内容体裁占比分析
- life_composition: 生活重心统计（按内容类型）

注意:
- 此工具专注于基础统计（计数、求和、平均值）
- 深度洞察分析（相关性、归因、心理分析）请使用 insight_analyst 工具
- 所有统计基于已加载的ETL清洗数据,包含_meta_和_ai_meta字段`
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
            'life_composition'
          ],
        },
        params: {
          type: 'object',
          description: '分析参数(可选)',
          properties: {
            limit: { type: 'number', description: 'Top N 限制' },
            dimension: { type: 'string', description: '分组维度字段' },
            groupBy: { type: 'string', description: '时间分组方式(week/month)，仅用于 energy_trend' },
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
        'mood_distribution', 'energy_trend', 'content_type_ratio', 'life_composition'
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

      // 统计 AI 增强数据情况
      const aiEnhancedCount = data.filter(item => item._ai_meta).length
      const isAIAnalysis = [
        'mood_distribution', 'energy_trend', 'content_type_ratio', 'life_composition'
      ].includes(analysisType)

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
}
