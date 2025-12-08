/**
 * SQL 分析工具 (Tool) - 增强版
 * 新增功能：支持 AI 元数据的多维度统计分析
 * 
 * 新增分析类型：
 * - mood_distribution: 情绪标签分布统计
 * - energy_trend: 能量值时间趋势
 * - people_network: 人际关系网络
 * - content_type_ratio: 内容体裁占比
 * - wisdom_archive: 智慧资产聚合
 * - emotion_energy_correlation: 情绪与能量值关联分析
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData, getSqlService } from '../data/index.js'

export class SqlAnalysisTool extends Tool {
  constructor() {
    super()
    this.name = 'sql_analysis'
    this.description = `执行多维度统计分析（支持 AI 元数据分析）:
基础统计：
- summary: 总体统计摘要(记录数、项目数、总时长等)
- by_project: 按项目分组统计(默认Top10)
- by_time: 按时间段统计(上午/中午/下午/晚上/深夜)
- weekday_weekend: 工作日vs周末对比
- mood_trend: 情绪趋势(按月)
- top_projects: 高频项目排行(默认Top5)

AI 增强统计：
- mood_distribution: 情绪标签分布统计（AI提取）
- energy_trend: 能量值时间趋势分析（按周或月）
- people_network: 人际关系网络（涉及人物频次）
- content_type_ratio: 内容体裁占比分析
- wisdom_archive: 智慧资产聚合（提取所有金句）
- emotion_energy_correlation: 情绪与能量值关联分析

数据分析页专用：
- life_composition: 生活重心统计（按内容类型）
- context_cloud: 物与境词云数据（地点和物品）
- activity_calendar: 活动日历数据（按日期统计）
- biorhythm_stats: 生物节律统计（能量和专注度）
- psych_distribution: 心理需求分布（马斯洛层次）
- temporal_stats: 时空取向统计（过去/现在/未来）

注意:所有统计基于已加载的ETL清洗数据,包含_meta_和_ai_meta字段`
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
            // AI 增强统计
            'mood_distribution',
            'energy_trend',
            'people_network',
            'content_type_ratio',
            'wisdom_archive',
            'emotion_energy_correlation',
            // 数据分析页专用
            'life_composition',
            'context_cloud',
            'activity_calendar',
            'biorhythm_stats',
            'psych_distribution',
            'temporal_stats'
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
        'mood_distribution', 'energy_trend', 'people_network', 'content_type_ratio', 'wisdom_archive', 'emotion_energy_correlation',
        'life_composition', 'context_cloud', 'activity_calendar', 'biorhythm_stats', 'psych_distribution', 'temporal_stats'
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

        // ==================== AI 增强统计 ====================
        case 'mood_distribution':
          result = sqlService.analyzeMoodDistribution(data)
          break

        case 'energy_trend':
          const groupBy = params.groupBy || 'month'
          result = sqlService.analyzeEnergyTrend(data, groupBy)
          break

        case 'people_network':
          result = sqlService.analyzePeopleNetwork(data)
          break

        case 'content_type_ratio':
          result = sqlService.analyzeContentTypeRatio(data)
          break

        case 'wisdom_archive':
          result = sqlService.getWisdomArchive(data, params.limit || 50)
          break

        case 'emotion_energy_correlation':
          result = sqlService.analyzeEmotionEnergyCorrelation(data)
          break

        // ==================== 数据分析页专用 ====================
        case 'life_composition':
          result = sqlService.analyzeLifeComposition(data)
          break

        case 'context_cloud':
          result = sqlService.analyzeContextCloud(data, params.limit || 20)
          break

        case 'activity_calendar':
          result = sqlService.analyzeActivityCalendar(data, params.dateRange || {})
          break

        case 'biorhythm_stats':
          result = sqlService.analyzeBiorhythmStats(data, params.groupBy || 'day')
          break

        case 'psych_distribution':
          result = sqlService.analyzePsychDistribution(data)
          break

        case 'temporal_stats':
          result = sqlService.analyzeTemporalStats(data)
          break

        default:
          throw new Error(`未知的分析类型: ${analysisType}`)
      }

      console.log(`[SqlAnalysisTool] Analysis type: ${analysisType}, returned ${Array.isArray(result) ? result.length : 1} results`)

      // 统计 AI 增强数据情况
      const aiEnhancedCount = data.filter(item => item._ai_meta).length
      const isAIAnalysis = [
        'mood_distribution', 'energy_trend', 'people_network', 'content_type_ratio', 'wisdom_archive', 'emotion_energy_correlation',
        'life_composition', 'context_cloud', 'activity_calendar', 'biorhythm_stats', 'psych_distribution', 'temporal_stats'
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
