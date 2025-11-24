/**
 * SQL 分析服务
 * 基于 AlaSQL 的内存数据库,支持复杂统计查询
 * 
 * 新增功能：
 * - AI 元数据统计分析（情绪分布、能量趋势、人际网络等）
 */

import alasql from 'alasql'

let sqlServiceInstance = null

export class SqlService {
  constructor() {
    this.db = alasql
    // 配置 AlaSQL
    this.db.options.cache = false
  }

  /**
   * 总体统计摘要
   */
  getStatsSummary(data) {
    try {
      const summary = this.db(`
        SELECT
          COUNT(*) as totalRecords,
          COUNT(DISTINCT _meta_project) as projectCount,
          SUM(_meta_duration_min) as totalDurationMin,
          AVG(_meta_duration_min) as avgDurationMin,
          MIN(time) as earliestDate,
          MAX(time) as latestDate
        FROM ?
      `, [data])[0]

      return {
        totalRecords: summary.totalRecords || 0,
        projectCount: summary.projectCount || 0,
        totalDurationHours: Math.round((summary.totalDurationMin || 0) / 60 * 10) / 10,
        avgDurationMin: Math.round(summary.avgDurationMin || 0),
        dateRange: {
          start: summary.earliestDate,
          end: summary.latestDate
        }
      }
    } catch (error) {
      console.error('[SqlService] Error in getStatsSummary:', error)
      return {}
    }
  }

  /**
   * 按维度分组统计
   */
  analyzeByDimension(data, dimension = '_meta_project', limit = 10) {
    try {
      const results = this.db(`
        SELECT
          ${dimension} as dimension,
          COUNT(*) as count,
          SUM(_meta_duration_min) as totalDuration,
          AVG(_meta_duration_min) as avgDuration,
          AVG(_meta_mood_score) as avgMood
        FROM ?
        WHERE ${dimension} IS NOT NULL
        GROUP BY ${dimension}
        ORDER BY count DESC
        LIMIT ${limit}
      `, [data])

      return results.map(r => ({
        name: r.dimension,
        count: r.count,
        totalDurationHours: Math.round((r.totalDuration || 0) / 60 * 10) / 10,
        avgDurationMin: Math.round(r.avgDuration || 0),
        avgMoodScore: Math.round((r.avgMood || 0) * 100) / 100
      }))
    } catch (error) {
      console.error('[SqlService] Error in analyzeByDimension:', error)
      return []
    }
  }

  /**
   * 时间段分布统计
   */
  analyzeTimeDistribution(data) {
    try {
      const results = this.db(`
        SELECT
          _meta_time_range as timeRange,
          COUNT(*) as count,
          SUM(_meta_duration_min) as totalDuration,
          AVG(_meta_mood_score) as avgMood
        FROM ?
        WHERE _meta_time_range IS NOT NULL
        GROUP BY _meta_time_range
        ORDER BY 
          CASE _meta_time_range
            WHEN '上午' THEN 1
            WHEN '中午' THEN 2
            WHEN '下午' THEN 3
            WHEN '晚上' THEN 4
            WHEN '深夜' THEN 5
            ELSE 6
          END
      `, [data])

      return results.map(r => ({
        timeRange: r.timeRange,
        count: r.count,
        totalDurationHours: Math.round((r.totalDuration || 0) / 60 * 10) / 10,
        avgMoodScore: Math.round((r.avgMood || 0) * 100) / 100
      }))
    } catch (error) {
      console.error('[SqlService] Error in analyzeTimeDistribution:', error)
      return []
    }
  }

  /**
   * 工作日 vs 周末对比
   */
  analyzeWeekdayVsWeekend(data) {
    try {
      const results = this.db(`
        SELECT
          _meta_is_weekend as isWeekend,
          COUNT(*) as count,
          SUM(_meta_duration_min) as totalDuration,
          AVG(_meta_duration_min) as avgDuration,
          AVG(_meta_mood_score) as avgMood
        FROM ?
        GROUP BY _meta_is_weekend
      `, [data])

      return results.map(r => ({
        type: r.isWeekend ? '周末' : '工作日',
        count: r.count,
        totalDurationHours: Math.round((r.totalDuration || 0) / 60 * 10) / 10,
        avgDurationMin: Math.round(r.avgDuration || 0),
        avgMoodScore: Math.round((r.avgMood || 0) * 100) / 100
      }))
    } catch (error) {
      console.error('[SqlService] Error in analyzeWeekdayVsWeekend:', error)
      return []
    }
  }

  /**
   * 情绪趋势分析（按月）
   */
  analyzeMoodTrend(data) {
    try {
      const results = this.db(`
        SELECT
          _meta_year as year,
          _meta_month as month,
          AVG(_meta_mood_score) as avgMood,
          COUNT(*) as count
        FROM ?
        WHERE _meta_year IS NOT NULL AND _meta_month IS NOT NULL
        GROUP BY _meta_year, _meta_month
        ORDER BY _meta_year, _meta_month
      `, [data])

      return results.map(r => ({
        period: `${r.year}-${String(r.month).padStart(2, '0')}`,
        avgMoodScore: Math.round((r.avgMood || 0) * 100) / 100,
        count: r.count
      }))
    } catch (error) {
      console.error('[SqlService] Error in analyzeMoodTrend:', error)
      return []
    }
  }

  /**
   * 高频项目排行
   */
  getTopProjects(data, limit = 5) {
    try {
      const results = this.db(`
        SELECT
          _meta_project as project,
          COUNT(*) as count,
          SUM(_meta_duration_min) as totalDuration
        FROM ?
        WHERE _meta_project IS NOT NULL
        GROUP BY _meta_project
        ORDER BY count DESC
        LIMIT ${limit}
      `, [data])

      return results.map(r => ({
        project: r.project,
        count: r.count,
        totalDurationHours: Math.round((r.totalDuration || 0) / 60 * 10) / 10
      }))
    } catch (error) {
      console.error('[SqlService] Error in getTopProjects:', error)
      return []
    }
  }

  // ==================== 新增：AI 元数据统计分析 ====================

  /**
   * 情绪标签分布统计
   * 将 _ai_meta.mood_tags 数组展开，统计每个标签出现次数
   */
  analyzeMoodDistribution(data) {
    try {
      console.log('[SqlService] Analyzing mood distribution from AI metadata...')
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta && r._ai_meta.mood_tags && Array.isArray(r._ai_meta.mood_tags))
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI mood tags found')
        return []
      }
      
      // 展开 mood_tags 数组并统计
      const moodCount = {}
      for (const record of recordsWithAI) {
        for (const mood of record._ai_meta.mood_tags) {
          moodCount[mood] = (moodCount[mood] || 0) + 1
        }
      }
      
      // 转换为数组并排序
      const total = Object.values(moodCount).reduce((sum, count) => sum + count, 0)
      const results = Object.entries(moodCount)
        .map(([mood, count]) => ({
          mood,
          count,
          percentage: Math.round((count / total) * 100 * 10) / 10
        }))
        .sort((a, b) => b.count - a.count)
      
      console.log(`[SqlService] Found ${results.length} unique mood tags from ${recordsWithAI.length} records`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeMoodDistribution:', error)
      return []
    }
  }

  /**
   * 能量值时间趋势（按周或月聚合）
   */
  analyzeEnergyTrend(data, groupBy = 'month') {
    try {
      console.log(`[SqlService] Analyzing energy trend grouped by ${groupBy}...`)
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta && typeof r._ai_meta.energy_level === 'number')
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI energy level found')
        return []
      }
      
      // 按时间分组
      const grouped = {}
      for (const record of recordsWithAI) {
        let periodKey
        if (groupBy === 'week') {
          // 计算周数 (简化实现)
          const date = new Date(record.time)
          const weekNum = Math.ceil(date.getDate() / 7)
          periodKey = `${record._meta_year}-${String(record._meta_month).padStart(2, '0')}-W${weekNum}`
        } else {
          // 按月
          periodKey = `${record._meta_year}-${String(record._meta_month).padStart(2, '0')}`
        }
        
        if (!grouped[periodKey]) {
          grouped[periodKey] = {
            energySum: 0,
            count: 0
          }
        }
        
        grouped[periodKey].energySum += record._ai_meta.energy_level
        grouped[periodKey].count += 1
      }
      
      // 转换为结果数组
      const results = Object.entries(grouped)
        .map(([period, stats]) => ({
          period,
          avgEnergy: Math.round((stats.energySum / stats.count) * 10) / 10,
          count: stats.count
        }))
        .sort((a, b) => a.period.localeCompare(b.period))
      
      console.log(`[SqlService] Found ${results.length} periods with energy data`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeEnergyTrend:', error)
      return []
    }
  }

  /**
   * 人际关系网络（涉及人物频次）
   */
  analyzePeopleNetwork(data) {
    try {
      console.log('[SqlService] Analyzing people network from AI metadata...')
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta && r._ai_meta.people_involved && Array.isArray(r._ai_meta.people_involved))
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI people data found')
        return []
      }
      
      // 统计人物出现次数
      const peopleCount = {}
      for (const record of recordsWithAI) {
        for (const person of record._ai_meta.people_involved) {
          if (person) { // 过滤空值
            peopleCount[person] = (peopleCount[person] || 0) + 1
          }
        }
      }
      
      // 转换为数组并排序
      const results = Object.entries(peopleCount)
        .map(([person, count]) => ({ person, count }))
        .sort((a, b) => b.count - a.count)
      
      console.log(`[SqlService] Found ${results.length} people from ${recordsWithAI.length} records`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzePeopleNetwork:', error)
      return []
    }
  }

  /**
   * 内容体裁占比
   */
  analyzeContentTypeRatio(data) {
    try {
      console.log('[SqlService] Analyzing content type ratio from AI metadata...')
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta && r._ai_meta.content_type)
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI content type found')
        return {}
      }
      
      // 统计各体裁数量
      const typeCount = {}
      for (const record of recordsWithAI) {
        const type = record._ai_meta.content_type
        typeCount[type] = (typeCount[type] || 0) + 1
      }
      
      // 计算百分比
      const total = recordsWithAI.length
      const results = {}
      for (const [type, count] of Object.entries(typeCount)) {
        results[type] = Math.round((count / total) * 100 * 10) / 10 + '%'
      }
      
      console.log(`[SqlService] Content type distribution:`, results)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeContentTypeRatio:', error)
      return {}
    }
  }

  /**
   * 智慧资产聚合（提取所有金句）
   */
  getWisdomArchive(data, limit = 50) {
    try {
      console.log('[SqlService] Extracting wisdom archive from AI metadata...')
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta && r._ai_meta.key_quotes && Array.isArray(r._ai_meta.key_quotes) && r._ai_meta.key_quotes.length > 0)
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI key quotes found')
        return []
      }
      
      // 收集所有金句，附带元信息
      const quotes = []
      for (const record of recordsWithAI) {
        for (const quote of record._ai_meta.key_quotes) {
          if (quote && quote.trim()) {
            quotes.push({
              quote: quote.trim(),
              time: record.time,
              project: record._meta_project,
              summary: record._ai_meta.summary
            })
          }
        }
      }
      
      // 按时间倒序排列
      quotes.sort((a, b) => new Date(b.time) - new Date(a.time))
      
      // 限制数量
      const results = quotes.slice(0, limit)
      
      console.log(`[SqlService] Found ${results.length} quotes from ${recordsWithAI.length} records`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in getWisdomArchive:', error)
      return []
    }
  }

  /**
   * 情绪与能量值关联分析
   * 分析不同情绪类型（正面/负面）对应的平均能量值
   */
  analyzeEmotionEnergyCorrelation(data) {
    try {
      console.log('[SqlService] Analyzing emotion-energy correlation...')
      
      // 过滤出有完整 AI 元数据的记录
      const recordsWithAI = data.filter(r => 
        r._ai_meta && 
        r._ai_meta.mood_tags && 
        Array.isArray(r._ai_meta.mood_tags) &&
        typeof r._ai_meta.energy_level === 'number'
      )
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with complete AI emotional data found')
        return {}
      }
      
      // 定义正面和负面情绪关键词
      const positiveKeywords = ['满足', '开心', '愉快', '兴奋', '自豪', '成就感', '心流', '专注', '充实', '放松', '确幸', '温暖', '坚定']
      const negativeKeywords = ['焦虑', '沮丧', '难过', '失望', '孤独', '烦躁', '愤怒', '疲惫', '无奈', '挫败', '不安', '压力']
      
      // 分组统计
      const positive = { energySum: 0, count: 0 }
      const negative = { energySum: 0, count: 0 }
      const neutral = { energySum: 0, count: 0 }
      
      for (const record of recordsWithAI) {
        const moods = record._ai_meta.mood_tags
        const energy = record._ai_meta.energy_level
        
        const hasPositive = moods.some(m => positiveKeywords.includes(m))
        const hasNegative = moods.some(m => negativeKeywords.includes(m))
        
        if (hasPositive && !hasNegative) {
          positive.energySum += energy
          positive.count += 1
        } else if (hasNegative && !hasPositive) {
          negative.energySum += energy
          negative.count += 1
        } else {
          neutral.energySum += energy
          neutral.count += 1
        }
      }
      
      // 计算平均值
      const results = {
        positive: positive.count > 0 ? Math.round((positive.energySum / positive.count) * 10) / 10 : null,
        negative: negative.count > 0 ? Math.round((negative.energySum / negative.count) * 10) / 10 : null,
        neutral: neutral.count > 0 ? Math.round((neutral.energySum / neutral.count) * 10) / 10 : null,
        counts: {
          positive: positive.count,
          negative: negative.count,
          neutral: neutral.count
        }
      }
      
      console.log(`[SqlService] Emotion-Energy correlation:`, results)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeEmotionEnergyCorrelation:', error)
      return {}
    }
  }
}

/**
 * 获取单例实例
 */
export function getSqlService() {
  if (!sqlServiceInstance) {
    sqlServiceInstance = new SqlService()
  }
  return sqlServiceInstance
}
