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
    this.description = `深度模式识别与关联分析。

参数映射表:
- life_composition -> 无需 params (⚠️ 需要 AI 元数据)
- activity_calendar -> params.filter_date_range (建议提供)
- context_cloud -> params.limit
- biorhythm_stats -> params.groupBy
- resonance_analysis -> params.dimension + (可选)阈值参数
- state_matrix -> (可选) params.energyMidpoint / params.agencyMidpoint
- causality_chain -> params.moodTag + (可选)params.limit
- 其他 -> 支持通用过滤 (filter_project, filter_date_range)

注意：此工具计算量大，请勿在大范围无过滤条件下频繁调用。`
    
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
            'activity_calendar',
            'life_composition',
            'resonance_analysis',
            'state_matrix',
            'causality_chain'
          ]
        },
        params: {
          type: 'object',
          description: '分析参数（根据 analysisType 不同）',
          properties: {
            filter_project: { type: 'string', description: '限定项目' },
            filter_date_range: { 
              type: 'object', 
              description: '时间范围(强制批量使用，以便载入易少)',
              properties: {
                start: { type: 'string', description: 'ISO 日期' },
                end: { type: 'string', description: 'ISO 日期' }
              }
            },
            limit: { type: 'number', description: '结果数量限制(用于 context_cloud, wisdom_archive)' },
            groupBy: { type: 'string', description: '时间分组方式(用于 biorhythm_stats: \'day\')\'week\')/\'month\')' },
            dimension_x: { type: 'string', description: '横向维度字段(用于散点图)' },
            dimension_y: { type: 'string', description: '纵向维度字段(用于散点图)' },
            dimension: { type: 'string', description: '维度字段(用于 resonance_analysis: location|people_involved|items)' },
            boosterThreshold: { type: 'number', description: '赋能者阈值(平均能量 >= 此值)' },
            drainerThreshold: { type: 'number', description: '消耗者阈值(平均能量 <= 此值)' },
            minOccurrences: { type: 'number', description: '最少出现次数才纳入统计' },
            topN: { type: 'number', description: '榜单展示数量' },
            energyMidpoint: { type: ['number', 'null'], description: '能量分界线(null 为动态中位数)' },
            agencyMidpoint: { type: ['number', 'null'], description: '掌控感分界线(null 为动态中位数)' },
            moodTag: { type: 'string', description: '情绪标签(用于 causality_chain)' }
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

      const aiEnhancedCount = data.filter(item => item._ai_meta).length
      const isAIAnalysis = [
        'emotion_energy_correlation',
        'people_network',
        'biorhythm_stats',
        'psych_distribution',
        'temporal_stats',
        'wisdom_archive',
        'context_cloud',
        'life_composition',
        'resonance_analysis',
        'state_matrix',
        'causality_chain'
      ].includes(analysisType)

      if (isAIAnalysis && aiEnhancedCount === 0) {
        return new ToolResult(this.name, {
          error: '数据缺失 AI 元信息',
          message: '当前尚未生成 AI 分析数据（如情绪、能量值等）。请先运行 AI 分析流程。',
          recordCount: data.length,
          aiEnhancedCount: 0,
          analysisType
        }, true)
      }

      const hasSome = (predicate) => data.some(r => {
        try {
          return predicate(r)
        } catch {
          return false
        }
      })

      if (analysisType === 'life_composition') {
        const ok = hasSome(r => r._ai_meta && r._ai_meta.content_type)
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据缺失生活重心信息',
            message: '未找到 _ai_meta.content_type 字段，无法统计生活重心。请先运行 AI 分析流程。',
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'context_cloud') {
        const ok = hasSome(r => r._ai_meta && (r._ai_meta.location || (Array.isArray(r._ai_meta.items) && r._ai_meta.items.length > 0)))
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据缺失场域/器物信息',
            message: '未找到 _ai_meta.location 或 _ai_meta.items 字段，无法生成词云。请先运行 AI 分析流程。',
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'biorhythm_stats') {
        const ok = hasSome(r => r._ai_meta && (typeof r._ai_meta.energy_level === 'number' || typeof r._ai_meta.focus_level === 'number'))
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据缺失能量/专注信息',
            message: '未找到 _ai_meta.energy_level 或 _ai_meta.focus_level 字段，无法生成能量气象站。请先运行 AI 分析流程。',
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'psych_distribution') {
        const ok = hasSome(r => r._ai_meta && r._ai_meta.maslow_need)
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据缺失需求层次信息',
            message: '未找到 _ai_meta.maslow_need 字段，无法生成需求金字塔。请先运行 AI 分析流程。',
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'temporal_stats') {
        const ok = hasSome(r => r._ai_meta && r._ai_meta.time_orientation)
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据缺失时间取向信息',
            message: '未找到 _ai_meta.time_orientation 字段，无法生成时空锚点。请先运行 AI 分析流程。',
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'resonance_analysis') {
        const dimension = params.dimension || 'location'
        const ok = hasSome(r => r._ai_meta && typeof r._ai_meta.energy_level === 'number' && r._ai_meta[dimension])
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据不足以进行共振分析',
            message: `未找到同时包含 energy_level 与 ${dimension} 的记录。请先运行 AI 分析流程，或更换维度。`,
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'state_matrix') {
        const ok = hasSome(r => r._ai_meta && typeof r._ai_meta.energy_level === 'number' && typeof r._ai_meta.agency_level === 'number')
        if (!ok) {
          return new ToolResult(this.name, {
            error: '数据不足以生成状态象限',
            message: '未找到同时包含 energy_level 与 agency_level 的记录。请先运行 AI 分析流程。',
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }

      if (analysisType === 'causality_chain') {
        const moodTag = params.moodTag || '焦虑'
        const ok = hasSome(r => r._ai_meta && Array.isArray(r._ai_meta.mood_tags) && r._ai_meta.mood_tags.includes(moodTag))
        if (!ok) {
          return new ToolResult(this.name, {
            error: '暂无可用的因果链路数据',
            message: `未找到包含情绪标签“${moodTag}”的记录。请先运行 AI 分析流程，或更换情绪。`,
            recordCount: data.length,
            aiEnhancedCount
          }, true)
        }
      }
      
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

        case 'life_composition':
          result = sqlService.analyzeLifeComposition(data)
          break

        case 'resonance_analysis':
          result = sqlService.analyzeResonanceAnalysis(data, {
            dimension: params.dimension || 'location',
            boosterThreshold: typeof params.boosterThreshold === 'number' ? params.boosterThreshold : 6,
            drainerThreshold: typeof params.drainerThreshold === 'number' ? params.drainerThreshold : 4,
            minOccurrences: typeof params.minOccurrences === 'number' ? params.minOccurrences : 2,
            topN: typeof params.topN === 'number' ? params.topN : 5
          })
          break

        case 'state_matrix':
          result = sqlService.analyzeStateMatrix(data, {
            energyMidpoint: params.energyMidpoint ?? null,
            agencyMidpoint: params.agencyMidpoint ?? null
          })
          break

        case 'causality_chain':
          result = sqlService.analyzeCausalityChain(data, {
            moodTag: params.moodTag || '焦虑',
            limit: typeof params.limit === 'number' ? params.limit : 200
          })
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
              'activity_calendar',
              'life_composition',
              'resonance_analysis',
              'state_matrix',
              'causality_chain'
            ]
          }, true)
      }
      
      // 统计 AI 增强数据覆盖率
      
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
