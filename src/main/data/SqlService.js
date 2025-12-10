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
   * 情绪与能量值关联分析（增强版）
   * 分析不同情绪类型（正面/负面/中性）对应的能量统计
   * 返回：平均值、标准差、极值、分布等
   */
  analyzeEmotionEnergyCorrelation(data) {
    try {
      console.log('[SqlService] Analyzing emotion-energy correlation (enhanced)...')
      
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
      
      // 分组收集能量值
      const positive = { energyValues: [], count: 0 }
      const negative = { energyValues: [], count: 0 }
      const neutral = { energyValues: [], count: 0 }
      
      for (const record of recordsWithAI) {
        const moods = record._ai_meta.mood_tags
        const energy = record._ai_meta.energy_level
        
        const hasPositive = moods.some(m => positiveKeywords.includes(m))
        const hasNegative = moods.some(m => negativeKeywords.includes(m))
        
        if (hasPositive && !hasNegative) {
          positive.energyValues.push(energy)
          positive.count += 1
        } else if (hasNegative && !hasPositive) {
          negative.energyValues.push(energy)
          negative.count += 1
        } else {
          neutral.energyValues.push(energy)
          neutral.count += 1
        }
      }
      
      // 计算统计指标的辅助函数
      const calculateStats = (values) => {
        if (values.length === 0) return null
        
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length
        const max = Math.max(...values)
        const min = Math.min(...values)
        
        // 计算标准差
        const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
        const stdDev = Math.sqrt(variance)
        
        return {
          avg: Math.round(avg * 10) / 10,
          stdDev: Math.round(stdDev * 10) / 10,
          max,
          min,
          count: values.length
        }
      }
      
      const positiveStats = calculateStats(positive.energyValues)
      const negativeStats = calculateStats(negative.energyValues)
      const neutralStats = calculateStats(neutral.energyValues)
      
      // 计算对比指标
      let comparison = null
      if (positiveStats && negativeStats) {
        const diff = positiveStats.avg - negativeStats.avg
        const diffPercent = Math.round((diff / neutralStats?.avg || 5) * 100)
        
        comparison = {
          avgDiff: Math.round(diff * 10) / 10,
          diffPercent,
          positiveAdvantage: diff > 0,
          significance: Math.abs(diff) > 1 ? 'high' : Math.abs(diff) > 0.5 ? 'medium' : 'low'
        }
      }
      
      const results = {
        positive: positiveStats?.avg || null,
        negative: negativeStats?.avg || null,
        neutral: neutralStats?.avg || null,
        counts: {
          positive: positive.count,
          negative: negative.count,
          neutral: neutral.count
        },
        // 新增：详细统计
        stats: {
          positive: positiveStats,
          negative: negativeStats,
          neutral: neutralStats
        },
        // 新增：对比分析
        comparison,
        // 新增：样本质量指标
        quality: {
          totalSamples: recordsWithAI.length,
          coverage: Math.round(((positive.count + negative.count + neutral.count) / recordsWithAI.length) * 100)
        }
      }
      
      console.log(`[SqlService] Emotion-Energy correlation (enhanced):`, results)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeEmotionEnergyCorrelation:', error)
      return {}
    }
  }

  // ==================== 新增：数据分析页专用方法 ====================

  /**
   * 生活重心统计（Life Composition）
   * 按 content_type 统计时长分布
   */
  analyzeLifeComposition(data) {
    try {
      console.log('[SqlService] Analyzing life composition...')
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta && r._ai_meta.content_type)
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI content type found')
        return []
      }
      
      // 按 content_type 分组统计
      const groups = {}
      for (const record of recordsWithAI) {
        const type = record._ai_meta.content_type
        if (!groups[type]) {
          groups[type] = { count: 0, totalDuration: 0 }
        }
        groups[type].count += 1
        groups[type].totalDuration += (record._meta_duration_min || 0)
      }
      
      // 转换为结果数组
      const results = Object.entries(groups)
        .map(([type, stats]) => ({
          dimension: type,
          count: stats.count,
          totalDurationHours: Math.round((stats.totalDuration / 60) * 10) / 10
        }))
        .sort((a, b) => b.totalDurationHours - a.totalDurationHours)
      
      console.log(`[SqlService] Found ${results.length} content types`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeLifeComposition:', error)
      return []
    }
  }

  /**
   * 物与境词云数据（Context & Objects）
   * 统计 location 和 items 的词频
   */
  analyzeContextCloud(data, limit = 20) {
    try {
      console.log('[SqlService] Analyzing context cloud...')
      
      // 过滤出有 AI 元数据的记录
      const recordsWithAI = data.filter(r => r._ai_meta)
      
      if (recordsWithAI.length === 0) {
        console.log('[SqlService] No records with AI metadata found')
        return { locations: [], items: [] }
      }
      
      // 统计 location 词频
      const locationCount = {}
      for (const record of recordsWithAI) {
        const location = record._ai_meta.location
        if (location && typeof location === 'string' && location.trim()) {
          locationCount[location] = (locationCount[location] || 0) + 1
        }
      }
      
      // 统计 items 词频
      const itemCount = {}
      for (const record of recordsWithAI) {
        const items = record._ai_meta.items
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && typeof item === 'string' && item.trim()) {
              itemCount[item] = (itemCount[item] || 0) + 1
            }
          }
        }
      }
      
      // 转换为结果数组并排序
      const locations = Object.entries(locationCount)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
      
      const items = Object.entries(itemCount)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
      
      console.log(`[SqlService] Found ${locations.length} locations, ${items.length} items`)
      return { locations, items }
    } catch (error) {
      console.error('[SqlService] Error in analyzeContextCloud:', error)
      return { locations: [], items: [] }
    }
  }

  /**
   * 活动日历数据（Activity Calendar）
   * 按日期统计记录数和深度
   */
  analyzeActivityCalendar(data, dateRange = {}) {
    try {
      console.log('[SqlService] Analyzing activity calendar...')
      
      // 按日期分组
      const dailyStats = {}
      for (const record of data) {
        if (!record.time) continue
        
        const date = new Date(record.time)
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        
        // 检查是否在日期范围内
        if (dateRange.start && dateStr < dateRange.start) continue
        if (dateRange.end && dateStr > dateRange.end) continue
        
        if (!dailyStats[dateStr]) {
          dailyStats[dateStr] = { count: 0, hasDeep: false }
        }
        
        dailyStats[dateStr].count += 1
        
        // 检查是否为深度内容
        const contentDepth = record._ai_meta?.content_depth
        if (contentDepth === 'deep' || record._ai_meta?.content_type === 'Reflection') {
          dailyStats[dateStr].hasDeep = true
        }
      }
      
      // 转换为结果数组
      const results = Object.entries(dailyStats)
        .map(([date, stats]) => ({
          date,
          count: stats.count,
          maxDepth: stats.hasDeep ? 'deep' : 'shallow'
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
      
      console.log(`[SqlService] Found ${results.length} active days`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeActivityCalendar:', error)
      return []
    }
  }

  /**
   * 生物节律统计（Biorhythm Stats）
   * 分析能量值和专注度趋势及生理感受
   */
  analyzeBiorhythmStats(data, groupBy = 'day') {
    try {
      console.log(`[SqlService] Analyzing biorhythm stats grouped by ${groupBy}...`)
      
      // 过滤出有能量数据的记录
      const recordsWithEnergy = data.filter(r => 
        r._ai_meta && 
        (typeof r._ai_meta.energy_level === 'number' || typeof r._ai_meta.focus_level === 'number')
      )
      
      if (recordsWithEnergy.length === 0) {
        console.log('[SqlService] No records with energy/focus data found')
        return { trends: [], sensations: [], valenceRatio: {} }
      }
      
      // 按时间分组统计能量和专注度
      const grouped = {}
      for (const record of recordsWithEnergy) {
        let periodKey
        const date = new Date(record.time)
        
        if (groupBy === 'week') {
          const weekNum = Math.ceil(date.getDate() / 7)
          periodKey = `${record._meta_year}-${String(record._meta_month).padStart(2, '0')}-W${weekNum}`
        } else {
          periodKey = `${record._meta_year}-${String(record._meta_month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        
        if (!grouped[periodKey]) {
          grouped[periodKey] = { energySum: 0, energyCount: 0, focusSum: 0, focusCount: 0 }
        }
        
        if (typeof record._ai_meta.energy_level === 'number') {
          grouped[periodKey].energySum += record._ai_meta.energy_level
          grouped[periodKey].energyCount += 1
        }
        
        if (typeof record._ai_meta.focus_level === 'number') {
          grouped[periodKey].focusSum += record._ai_meta.focus_level
          grouped[periodKey].focusCount += 1
        }
      }
      
      // 转换趋势数据
      const trends = Object.entries(grouped)
        .map(([period, stats]) => ({
          period,
          avgEnergy: stats.energyCount > 0 ? Math.round((stats.energySum / stats.energyCount) * 10) / 10 : null,
          avgFocus: stats.focusCount > 0 ? Math.round((stats.focusSum / stats.focusCount) * 10) / 10 : null
        }))
        .sort((a, b) => a.period.localeCompare(b.period))
      
      // 统计生理感受
      const sensationCount = {}
      const valenceStats = { Positive: 0, Negative: 0, Neutral: 0, Mixed: 0 }
      
      for (const record of recordsWithEnergy) {
        const sensations = record._ai_meta.physiological_sensations
        if (Array.isArray(sensations)) {
          for (const sensation of sensations) {
            if (sensation && typeof sensation === 'string') {
              sensationCount[sensation] = (sensationCount[sensation] || 0) + 1
            }
          }
        }
        
        const valence = record._ai_meta.physiological_valence
        if (valence && valenceStats.hasOwnProperty(valence)) {
          valenceStats[valence] += 1
        }
      }
      
      // 转换感受数据
      const sensations = Object.entries(sensationCount)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
      
      // 计算正负比率
      const totalValence = Object.values(valenceStats).reduce((sum, c) => sum + c, 0)
      const valenceRatio = totalValence > 0 ? {
        positive: Math.round((valenceStats.Positive / totalValence) * 100),
        negative: Math.round((valenceStats.Negative / totalValence) * 100),
        neutral: Math.round((valenceStats.Neutral / totalValence) * 100),
        mixed: Math.round((valenceStats.Mixed / totalValence) * 100)
      } : {}
      
      console.log(`[SqlService] Found ${trends.length} periods, ${sensations.length} sensations`)
      return { trends, sensations, valenceRatio }
    } catch (error) {
      console.error('[SqlService] Error in analyzeBiorhythmStats:', error)
      return { trends: [], sensations: [], valenceRatio: {} }
    }
  }

  /**
   * 心理需求分布（Psych Distribution）
   * 统计马斯洛需求层次分布
   */
  analyzePsychDistribution(data) {
    try {
      console.log('[SqlService] Analyzing psychological need distribution...')
      
      // 过滤出有需求数据的记录
      const recordsWithNeed = data.filter(r => r._ai_meta && r._ai_meta.maslow_need)
      
      if (recordsWithNeed.length === 0) {
        console.log('[SqlService] No records with maslow_need found')
        return []
      }
      
      // 标准化马斯洛需求层级（将组合需求归类到最高层级）
      const standardNeeds = ['生理需求', '安全需求', '爱与归属', '尊重与认可', '自我实现']
      const needAliases = {
        '生理需求': ['生理', '生存', '生理需要'],
        '安全需求': ['安全', '安全感', '安全需要'],
        '爱与归属': ['社交', '归属', '爱', '社交归属', '归属感', '爱与归属需求'],
        '尊重与认可': ['尊重', '认可', '尊严', '尊重需求', '认可需求'],
        '自我实现': ['自我', '实现', '成长', '超越', '自我实现需求'],
        '认知需求': ['认知', '学习', '理解'],
        '审美需求': ['审美', '美', '艺术']
      }
      
      // 将认知/审美需求映射到自我实现（马斯洛后期理论）
      const advancedNeedsMapping = {
        '认知需求': '自我实现',
        '审美需求': '自我实现'
      }
      
      // 需求层级优先级（越高越优先）
      const needPriority = {
        '自我实现': 5,
        '尊重与认可': 4,
        '爱与归属': 3,
        '安全需求': 2,
        '生理需求': 1
      }
      
      // 解析并归类需求
      function normalizeNeed(rawNeed) {
        if (!rawNeed) return null
        
        // 直接匹配标准需求
        if (standardNeeds.includes(rawNeed)) return rawNeed
        
        // 检查高级需求映射
        if (advancedNeedsMapping[rawNeed]) return advancedNeedsMapping[rawNeed]
        
        // 检查别名映射
        for (const [standard, aliases] of Object.entries(needAliases)) {
          if (aliases.some(alias => rawNeed.includes(alias))) {
            return standard
          }
        }
        
        // 处理组合需求（如"爱与归属, 尊重与认可"）- 取最高层级
        let highestPriority = 0
        let highestNeed = null
        for (const standard of standardNeeds) {
          if (rawNeed.includes(standard.replace('需求', '')) || rawNeed.includes(standard)) {
            if (needPriority[standard] > highestPriority) {
              highestPriority = needPriority[standard]
              highestNeed = standard
            }
          }
        }
        if (highestNeed) return highestNeed
        
        // 处理其他别名
        for (const [standard, aliases] of Object.entries(needAliases)) {
          for (const alias of aliases) {
            if (rawNeed.includes(alias)) {
              const stdNeed = advancedNeedsMapping[standard] || standard
              if (standardNeeds.includes(stdNeed)) {
                return stdNeed
              }
            }
          }
        }
        
        return null // 无法识别
      }
      
      // 统计各需求层次
      const needCount = {}
      for (const record of recordsWithNeed) {
        const normalized = normalizeNeed(record._ai_meta.maslow_need)
        if (normalized) {
          needCount[normalized] = (needCount[normalized] || 0) + 1
        }
      }
      
      // 计算百分比，按马斯洛层级顺序返回
      const total = Object.values(needCount).reduce((a, b) => a + b, 0)
      const results = standardNeeds
        .filter(need => needCount[need] > 0)
        .map(need => ({
          need,
          count: needCount[need] || 0,
          percentage: Math.round(((needCount[need] || 0) / total) * 100)
        }))
      
      console.log(`[SqlService] Found ${results.length} normalized need types from ${total} records`)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzePsychDistribution:', error)
      return []
    }
  }

  /**
   * 时空取向统计（Temporal Stats）
   * 统计时间取向分布（过去/现在/未来）
   */
  analyzeTemporalStats(data) {
    try {
      console.log('[SqlService] Analyzing temporal orientation stats...')
      
      // 过滤出有时间取向数据的记录
      const recordsWithOrientation = data.filter(r => r._ai_meta && r._ai_meta.time_orientation)
      
      if (recordsWithOrientation.length === 0) {
        console.log('[SqlService] No records with time_orientation found')
        return { past: { count: 0, percentage: 0 }, present: { count: 0, percentage: 0 }, future: { count: 0, percentage: 0 } }
      }
      
      // 时间取向映射（支持英文和中文值）
      const orientationMap = {
        past: ['Past', '反刍过去', '怀念过去', 'past'],
        present: ['Present', 'Timeless', '沉浸当下', '超越时空', 'present', 'timeless'],
        future: ['Future', '担忧未来', '规划未来', 'future']
      }
      
      // 统计各类型
      const stats = { past: 0, present: 0, future: 0 }
      
      for (const record of recordsWithOrientation) {
        const orientation = record._ai_meta.time_orientation
        
        if (orientationMap.past.includes(orientation)) {
          stats.past += 1
        } else if (orientationMap.present.includes(orientation)) {
          stats.present += 1
        } else if (orientationMap.future.includes(orientation)) {
          stats.future += 1
        }
      }
      
      // 计算百分比
      const total = recordsWithOrientation.length
      const results = {
        past: { count: stats.past, percentage: Math.round((stats.past / total) * 100) },
        present: { count: stats.present, percentage: Math.round((stats.present / total) * 100) },
        future: { count: stats.future, percentage: Math.round((stats.future / total) * 100) }
      }
      
      console.log(`[SqlService] Temporal stats:`, results)
      return results
    } catch (error) {
      console.error('[SqlService] Error in analyzeTemporalStats:', error)
      return { past: { count: 0, percentage: 0 }, present: { count: 0, percentage: 0 }, future: { count: 0, percentage: 0 } }
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
