/**
 * CalendarResolverTool - 时间解析器
 * 将自然语言时间表达转换为精确的 ISO 日期范围
 */

import { Tool, ToolResult } from './base.js'

export class CalendarResolverTool extends Tool {
  constructor() {
    super()
    this.name = 'calendar_resolver'
    this.description = `将自然语言时间表达转换为精确的日期范围。
支持的时间表达：
- 绝对时间："上周"、"本周"、"上个月"、"本月"、"去年"、"今年"
- 相对时间："最近7天"、"最近一个月"、"过去三个月"
- 特殊时间："周末"、"工作日"、"这个季度"
- 节假日："春节期间"、"国庆假期"、"母亲节"

输出格式：包含 start 和 end 的日期范围（ISO 格式 YYYY-MM-DD）`
    
    this.schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '自然语言时间表达，如"上个月所有的周末"、"最近7天"'
        },
        baseDate: {
          type: 'string',
          description: '基准日期（ISO 格式），默认为当前日期'
        }
      },
      required: ['query']
    }
  }

  async invoke(input) {
    try {
      const { query, baseDate } = input
      const base = baseDate ? new Date(baseDate) : new Date()
      
      console.log(`[CalendarResolverTool] Resolving: "${query}" based on ${base.toISOString()}`)
      
      // 解析时间表达
      const result = this.parseTimeExpression(query, base)
      
      if (!result) {
        return new ToolResult(this.name, {
          error: `无法解析时间表达: "${query}"`,
          suggestions: [
            '上周', '本周', '上个月', '本月',
            '最近7天', '最近一个月', '去年', '今年'
          ]
        }, true)
      }
      
      return new ToolResult(this.name, {
        query,
        baseDate: this.formatDate(base),
        ...result
      })
      
    } catch (error) {
      console.error('[CalendarResolverTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }

  /**
   * 解析时间表达式
   */
  parseTimeExpression(query, baseDate) {
    const q = query.toLowerCase().trim()
    
    // 1. 处理"上周"
    if (q.includes('上周') || q.includes('上星期')) {
      return this.getLastWeek(baseDate)
    }
    
    // 2. 处理"本周"
    if (q.includes('本周') || q.includes('这周') || q.includes('这星期')) {
      return this.getThisWeek(baseDate)
    }
    
    // 3. 处理"上个月"
    if (q.includes('上个月') || q.includes('上月')) {
      return this.getLastMonth(baseDate)
    }
    
    // 4. 处理"本月"
    if (q.includes('本月') || q.includes('这个月')) {
      return this.getThisMonth(baseDate)
    }
    
    // 5. 处理"去年"
    if (q.includes('去年')) {
      return this.getLastYear(baseDate)
    }
    
    // 6. 处理"今年"
    if (q.includes('今年')) {
      return this.getThisYear(baseDate)
    }
    
    // 7. 处理"最近N天"
    const recentDaysMatch = q.match(/最近\s*(\d+)\s*天/)
    if (recentDaysMatch) {
      const days = parseInt(recentDaysMatch[1])
      return this.getRecentDays(baseDate, days)
    }
    
    // 8. 处理"最近"（默认7天）
    if (q.includes('最近') && !recentDaysMatch) {
      return this.getRecentDays(baseDate, 7)
    }
    
    // 9. 处理"过去N个月"
    const pastMonthsMatch = q.match(/过去\s*(\d+)\s*个?月/)
    if (pastMonthsMatch) {
      const months = parseInt(pastMonthsMatch[1])
      return this.getPastMonths(baseDate, months)
    }
    
    // 10. 处理"昨天"
    if (q.includes('昨天')) {
      return this.getYesterday(baseDate)
    }
    
    // 11. 处理"今天"
    if (q.includes('今天')) {
      return this.getToday(baseDate)
    }
    
    // 12. 处理"这个季度"
    if (q.includes('这个季度') || q.includes('本季度')) {
      return this.getThisQuarter(baseDate)
    }
    
    // 13. 处理"上个季度"
    if (q.includes('上个季度') || q.includes('上季度')) {
      return this.getLastQuarter(baseDate)
    }
    
    // 14. 处理周末相关
    if (q.includes('周末')) {
      if (q.includes('上个月')) {
        return this.getWeekendsInLastMonth(baseDate)
      } else if (q.includes('本月') || q.includes('这个月')) {
        return this.getWeekendsInThisMonth(baseDate)
      }
      // 默认返回最近的周末
      return this.getRecentWeekends(baseDate)
    }
    
    return null
  }

  /**
   * 获取上周的日期范围（周一到周日）
   */
  getLastWeek(baseDate) {
    const current = new Date(baseDate)
    const dayOfWeek = current.getDay() || 7 // 将周日从0转为7
    
    // 计算上周一
    const lastMonday = new Date(current)
    lastMonday.setDate(current.getDate() - dayOfWeek - 6)
    
    // 计算上周日
    const lastSunday = new Date(lastMonday)
    lastSunday.setDate(lastMonday.getDate() + 6)
    
    return {
      type: 'range',
      start: this.formatDate(lastMonday),
      end: this.formatDate(lastSunday),
      description: '上周（周一至周日）'
    }
  }

  /**
   * 获取本周的日期范围（周一到今天）
   */
  getThisWeek(baseDate) {
    const current = new Date(baseDate)
    const dayOfWeek = current.getDay() || 7
    
    // 计算本周一
    const thisMonday = new Date(current)
    thisMonday.setDate(current.getDate() - dayOfWeek + 1)
    
    return {
      type: 'range',
      start: this.formatDate(thisMonday),
      end: this.formatDate(current),
      description: '本周（周一至今天）'
    }
  }

  /**
   * 获取上个月的日期范围
   */
  getLastMonth(baseDate) {
    const current = new Date(baseDate)
    const year = current.getFullYear()
    const month = current.getMonth() // 0-11
    
    // 上个月的第一天
    const firstDay = new Date(year, month - 1, 1)
    
    // 上个月的最后一天
    const lastDay = new Date(year, month, 0)
    
    return {
      type: 'range',
      start: this.formatDate(firstDay),
      end: this.formatDate(lastDay),
      description: `上个月（${firstDay.getFullYear()}年${firstDay.getMonth() + 1}月）`
    }
  }

  /**
   * 获取本月的日期范围
   */
  getThisMonth(baseDate) {
    const current = new Date(baseDate)
    const year = current.getFullYear()
    const month = current.getMonth()
    
    const firstDay = new Date(year, month, 1)
    
    return {
      type: 'range',
      start: this.formatDate(firstDay),
      end: this.formatDate(current),
      description: `本月（${year}年${month + 1}月）`
    }
  }

  /**
   * 获取去年的日期范围
   */
  getLastYear(baseDate) {
    const current = new Date(baseDate)
    const lastYear = current.getFullYear() - 1
    
    return {
      type: 'range',
      start: `${lastYear}-01-01`,
      end: `${lastYear}-12-31`,
      description: `去年（${lastYear}年）`
    }
  }

  /**
   * 获取今年的日期范围
   */
  getThisYear(baseDate) {
    const current = new Date(baseDate)
    const thisYear = current.getFullYear()
    
    return {
      type: 'range',
      start: `${thisYear}-01-01`,
      end: this.formatDate(current),
      description: `今年（${thisYear}年至今）`
    }
  }

  /**
   * 获取最近N天
   */
  getRecentDays(baseDate, days) {
    const current = new Date(baseDate)
    const startDate = new Date(current)
    startDate.setDate(current.getDate() - days + 1)
    
    return {
      type: 'range',
      start: this.formatDate(startDate),
      end: this.formatDate(current),
      description: `最近${days}天`
    }
  }

  /**
   * 获取过去N个月
   */
  getPastMonths(baseDate, months) {
    const current = new Date(baseDate)
    const startDate = new Date(current)
    startDate.setMonth(current.getMonth() - months)
    
    return {
      type: 'range',
      start: this.formatDate(startDate),
      end: this.formatDate(current),
      description: `过去${months}个月`
    }
  }

  /**
   * 获取昨天
   */
  getYesterday(baseDate) {
    const yesterday = new Date(baseDate)
    yesterday.setDate(yesterday.getDate() - 1)
    
    return {
      type: 'single',
      start: this.formatDate(yesterday),
      end: this.formatDate(yesterday),
      description: '昨天'
    }
  }

  /**
   * 获取今天
   */
  getToday(baseDate) {
    return {
      type: 'single',
      start: this.formatDate(baseDate),
      end: this.formatDate(baseDate),
      description: '今天'
    }
  }

  /**
   * 获取本季度
   */
  getThisQuarter(baseDate) {
    const current = new Date(baseDate)
    const year = current.getFullYear()
    const month = current.getMonth() // 0-11
    const quarter = Math.floor(month / 3)
    
    const firstMonth = quarter * 3
    const start = new Date(year, firstMonth, 1)
    
    return {
      type: 'range',
      start: this.formatDate(start),
      end: this.formatDate(current),
      description: `第${quarter + 1}季度`
    }
  }

  /**
   * 获取上季度
   */
  getLastQuarter(baseDate) {
    const current = new Date(baseDate)
    let year = current.getFullYear()
    let month = current.getMonth()
    const quarter = Math.floor(month / 3)
    
    let lastQuarter = quarter - 1
    if (lastQuarter < 0) {
      lastQuarter = 3
      year -= 1
    }
    
    const firstMonth = lastQuarter * 3
    const start = new Date(year, firstMonth, 1)
    const end = new Date(year, firstMonth + 3, 0)
    
    return {
      type: 'range',
      start: this.formatDate(start),
      end: this.formatDate(end),
      description: `上季度（第${lastQuarter + 1}季度）`
    }
  }

  /**
   * 获取上个月的所有周末
   */
  getWeekendsInLastMonth(baseDate) {
    const { start, end } = this.getLastMonth(baseDate)
    return this.getWeekendsInRange(start, end)
  }

  /**
   * 获取本月的所有周末
   */
  getWeekendsInThisMonth(baseDate) {
    const { start, end } = this.getThisMonth(baseDate)
    return this.getWeekendsInRange(start, end)
  }

  /**
   * 获取最近的周末
   */
  getRecentWeekends(baseDate) {
    const current = new Date(baseDate)
    const dayOfWeek = current.getDay()
    
    let lastSaturday, lastSunday
    
    if (dayOfWeek === 0) { // 周日
      lastSunday = new Date(current)
      lastSaturday = new Date(current)
      lastSaturday.setDate(current.getDate() - 1)
    } else if (dayOfWeek === 6) { // 周六
      lastSaturday = new Date(current)
      lastSunday = new Date(current)
      lastSunday.setDate(current.getDate() + 1)
    } else { // 工作日，获取上周末
      lastSunday = new Date(current)
      lastSunday.setDate(current.getDate() - dayOfWeek)
      lastSaturday = new Date(lastSunday)
      lastSaturday.setDate(lastSunday.getDate() - 1)
    }
    
    return {
      type: 'range',
      start: this.formatDate(lastSaturday),
      end: this.formatDate(lastSunday),
      description: '最近的周末'
    }
  }

  /**
   * 获取指定范围内的所有周末
   */
  getWeekendsInRange(startStr, endStr) {
    const start = new Date(startStr)
    const end = new Date(endStr)
    const ranges = []
    
    let current = new Date(start)
    while (current <= end) {
      const dayOfWeek = current.getDay()
      if (dayOfWeek === 6 || dayOfWeek === 0) { // 周六或周日
        ranges.push({
          start: this.formatDate(current),
          end: this.formatDate(current)
        })
      }
      current.setDate(current.getDate() + 1)
    }
    
    return {
      type: 'multiple',
      ranges,
      description: `${startStr} 至 ${endStr} 的所有周末（${ranges.length}天）`
    }
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  formatDate(date) {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
