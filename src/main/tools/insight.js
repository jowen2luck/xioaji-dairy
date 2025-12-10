/**
 * InsightAnalystTool - 深度洞察分析器
 * 处理"为什么"、"什么关系"、"有什么规律"的问题
 * 从 SqlAnalysisTool 拆分出来的高级分析功能
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData, getSqlService } from '../data/index.js'

export class InsightAnalystTool extends Tool {
  constructor() {
    super()
    this.name = 'insight_analyst'
    this.description = `深度洞察分析工具，挖掘数据背后的模式和关联：
支持的分析类型：
- emotion_energy_correlation: 情绪与能量值关联分析（正面/负面情绪对应的能量水平）
- people_network: 人际关系网络分析（涉及人物频次）
- biorhythm_stats: 生物节律统计（能量和专注度的时间分布）
- psych_distribution: 心理需求分布（马斯洛需求层次）
- temporal_stats: 时空取向统计（过去/现在/未来）
- wisdom_archive: 智慧资产聚合（提取金句）
- context_cloud: 物与境词云（地点和物品的高频词）
- activity_calendar: 活动日历（按日期统计活跃度）

高级参数：
- filter_project: 限定在特定项目范围内分析
- filter_date_range: 限定时间范围 {start: 'YYYY-MM-DD', end: 'YYYY-MM-DD'}
- limit: 结果数量限制
- dimension_x: 横向维度（如 mood_tags）
- dimension_y: 纵向维度（如 energy_level）

注意：此工具专注于模式识别和深度洞察，基础统计请使用 sql_analysis 工具`
    
    this.schema = {
      type: 'object',
      properties: {
        analysisType: {
          type: 'string',
          description: '分析类型',
          enum: [
            'emotion_energy_correlation',
            'people_network',
            'biorhythm_stats',
            'psych_distribution',
            'temporal_stats',
            'wisdom_archive',
            'context_cloud',
            'activity_calendar'
          ]
        },
        params: {
          type: 'object',
          description: '分析参数（可选）',
          properties: {
            filter_project: { type: 'string', description: '限定项目' },
            filter_date_range: { 
              type: 'object', 
              description: '时间范围',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' }
              }
            },
            limit: { type: 'number', description: '结果数量限制' },
            groupBy: { type: 'string', description: '时间分组方式（day/week/month）' },
            dimension_x: { type: 'string', description: '横向维度字段' },
            dimension_y: { type: 'string', description: '纵向维度字段' }
          }
        }
      },
      required: ['analysisType']
    }
  }

  async invoke(input) {
    try {
      const { analysisType, params = {} } = input
      
      console.log(`[InsightAnalystTool] Analyzing: ${analysisType}`, params)
      
      // 加载数据
      let data = await loadAndEnrichData()
      
      if (data.length === 0) {
        return new ToolResult(this.name, {
          error: '暂无数据',
          message: '请先导入或创建记录'
        }, true)
      }
      
      // 应用过滤条件
      data = this.applyFilters(data, params)
      
      const sqlService = getSqlService()
      let result
      
      // 执行相应的分析
      switch (analysisType) {
        case 'emotion_energy_correlation':
          result = sqlService.analyzeEmotionEnergyCorrelation(data)
          break
          
        case 'people_network':
          result = sqlService.analyzePeopleNetwork(data)
          break
          
        case 'biorhythm_stats':
          const groupBy = params.groupBy || 'day'
          result = sqlService.analyzeBiorhythmStats(data, groupBy)
          break
          
        case 'psych_distribution':
          result = sqlService.analyzePsychDistribution(data)
          break
          
        case 'temporal_stats':
          result = sqlService.analyzeTemporalStats(data)
          break
          
        case 'wisdom_archive':
          result = sqlService.getWisdomArchive(data, params.limit || 50)
          break
          
        case 'context_cloud':
          result = sqlService.analyzeContextCloud(data, params.limit || 20)
          break
          
        case 'activity_calendar':
          result = sqlService.analyzeActivityCalendar(data, params.filter_date_range || {})
          break
          
        default:
          return new ToolResult(this.name, {
            error: `不支持的分析类型: ${analysisType}`,
            supportedTypes: [
              'emotion_energy_correlation',
              'people_network',
              'biorhythm_stats',
              'psych_distribution',
              'temporal_stats',
              'wisdom_archive',
              'context_cloud',
              'activity_calendar'
            ]
          }, true)
      }
      
      // 统计 AI 增强数据覆盖率
      const aiEnhancedCount = data.filter(item => item._ai_meta).length
      
      return new ToolResult(this.name, {
        analysisType,
        data: result,
        recordCount: data.length,
        aiEnhancedCount,
        aiCoverage: data.length > 0 ? Math.round((aiEnhancedCount / data.length) * 100) : 0,
        filters: this.getAppliedFilters(params),
        insight: this.generateInsight(analysisType, result)
      })
      
    } catch (error) {
      console.error('[InsightAnalystTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }

  /**
   * 应用过滤条件
   */
  applyFilters(data, params) {
    let filtered = data
    
    // 项目过滤
    if (params.filter_project) {
      filtered = filtered.filter(record => 
        record._meta_project === params.filter_project ||
        record.project === params.filter_project
      )
    }
    
    // 时间范围过滤
    if (params.filter_date_range) {
      const { start, end } = params.filter_date_range
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.time)
        const inRange = (!start || recordDate >= new Date(start)) &&
                       (!end || recordDate <= new Date(end))
        return inRange
      })
    }
    
    return filtered
  }

  /**
   * 获取已应用的过滤条件描述
   */
  getAppliedFilters(params) {
    const filters = []
    
    if (params.filter_project) {
      filters.push(`项目: ${params.filter_project}`)
    }
    
    if (params.filter_date_range) {
      const { start, end } = params.filter_date_range
      if (start && end) {
        filters.push(`时间: ${start} 至 ${end}`)
      } else if (start) {
        filters.push(`时间: ${start} 之后`)
      } else if (end) {
        filters.push(`时间: ${end} 之前`)
      }
    }
    
    return filters.length > 0 ? filters : ['无过滤条件']
  }

  /**
   * 生成洞察摘要
   */
  generateInsight(analysisType, result) {
    if (!result) return null
    
    try {
      switch (analysisType) {
        case 'emotion_energy_correlation':
          // 优先使用增强版的 comparison 数据
          if (result.comparison) {
            const { avgDiff, diffPercent, positiveAdvantage, significance } = result.comparison
            const sigText = significance === 'high' ? '显著' : significance === 'medium' ? '中等' : '轻微'
            
            if (positiveAdvantage) {
              return `正面情绪的平均能量值 (${result.positive}) 比负面情绪 (${result.negative}) 高 ${avgDiff} 分，差异${sigText}。这表明积极情绪能显著提升能量水平。`
            } else {
              return `负面情绪的平均能量值 (${result.negative}) 反而比正面情绪 (${result.positive}) 高 ${Math.abs(avgDiff)} 分，可能存在"焦虑驱动"模式，建议关注压力管理。`
            }
          }
          // 兼容旧格式
          if (result.positive !== null && result.negative !== null) {
            const diff = result.positive - result.negative
            if (diff > 1) {
              return `正面情绪的平均能量值 (${result.positive}) 显著高于负面情绪 (${result.negative})，说明情绪对能量有明显影响。`
            } else if (diff < -1) {
              return `负面情绪的平均能量值 (${result.negative}) 高于正面情绪 (${result.positive})，可能存在"焦虑驱动"模式。`
            } else {
              return `正负面情绪的能量值差异不大，情绪与能量的关联性较弱。`
            }
          }
          break
          
        case 'people_network':
          if (Array.isArray(result) && result.length > 0) {
            const topPerson = result[0]
            const totalCount = result.reduce((sum, p) => sum + p.count, 0)
            const topPercentage = Math.round((topPerson.count / totalCount) * 100)
            return `最常出现的人物是"${topPerson.person}"，出现 ${topPerson.count} 次，占比 ${topPercentage}%。`
          }
          break
          
        case 'wisdom_archive':
          if (Array.isArray(result) && result.length > 0) {
            return `提取了 ${result.length} 条金句，最新的来自 ${result[0].time.split('T')[0]}。`
          }
          break
          
        case 'context_cloud':
          if (result.locations && result.items) {
            const topLocation = result.locations[0]?.word || '未知'
            const topItem = result.items[0]?.word || '未知'
            return `最常出现的地点是"${topLocation}"，最常出现的物品是"${topItem}"。`
          }
          break
          
        default:
          return null
      }
    } catch (error) {
      console.error('[InsightAnalystTool] Error generating insight:', error)
      return null
    }
    
    return null
  }
}
