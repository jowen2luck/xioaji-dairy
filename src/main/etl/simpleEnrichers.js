/**
 * 简单 ETL 增强器
 * 功能：不依赖大模型的数据预处理与增强
 */

/**
 * 时间解析工具
 * 将"0时23分"、"1小时30分"等格式转为分钟数
 */
export function parseDuration(str) {
  if (!str) return 0
  let minutes = 0
  
  const hourMatch = str.match(/(\d+)[小时时]/)
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60
  
  const minuteMatch = str.match(/(\d+)[分钟分]/)
  if (minuteMatch) minutes += parseInt(minuteMatch[1])
  
  return minutes
}

/**
 * HTML 文本提取(去除标签)
 */
export function extractPlainText(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/<[^>]+>/g, '').trim()
}

/**
 * 情绪量化(将主观体验映射为 -2 到 +2 的分数)
 */
export function calculateMoodScore(tiyan, xinqing) {
  let score = 0
  
  const tiyanText = (tiyan || '').toLowerCase()
  const positiveWords = ['心流', '愉快', '开心', '顺利', '高兴', '满意', '成功', '棒']
  const negativeWords = ['疲惫', '焦虑', '烦躁', '沮丧', '糟糕', '失败', '崩溃', '难过']
  
  for (const word of positiveWords) {
    if (tiyanText.includes(word)) score += 0.5
  }
  for (const word of negativeWords) {
    if (tiyanText.includes(word)) score -= 0.5
  }
  
  const colorMap = {
    '#FF0000': -2,
    '#FFA500': -1,
    '#FFFF00': 1,
    '#90EE90': 0.5,
    '#87CEEB': -0.5,
    '#9370DB': 2,
    '#FFFFFF': 0
  }
  
  if (xinqing && colorMap[xinqing] !== undefined) {
    score += colorMap[xinqing]
  }
  
  return Math.max(-2, Math.min(2, score))
}

/**
 * 星期几的中文转换
 */
export function getWeekdayName(dayIndex) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[dayIndex] || '未知'
}

/**
 * 时间段判断
 */
export function getTimeRange(hour) {
  if (hour >= 6 && hour < 12) return '上午'
  if (hour >= 12 && hour < 14) return '中午'
  if (hour >= 14 && hour < 18) return '下午'
  if (hour >= 18 && hour < 23) return '晚上'
  return '深夜'
}

/**
 * 核心 ETL 函数:数据增强
 * 将原始数据项注入可计算的元数据字段
 */
export function enrichRecord(item) {
  const dateObj = new Date(item.time)
  const weekdayIndex = dateObj.getDay()
  const hour = dateObj.getHours()
  
  return {
    ...item, // 保留原始字段
    
    // === 时间维度特征 ===
    _meta_timestamp: dateObj.getTime(),
    _meta_year: dateObj.getFullYear(),
    _meta_month: dateObj.getMonth() + 1,
    _meta_day: dateObj.getDate(),
    _meta_hour: hour,
    _meta_weekday: getWeekdayName(weekdayIndex),
    _meta_is_weekend: (weekdayIndex === 0 || weekdayIndex === 6),
    _meta_time_range: getTimeRange(hour),
    
    // === 行为维度特征 ===
    _meta_duration_min: parseDuration(item.chixushijian),
    _meta_project: item.shanggexiangmu || '未分类',
    _meta_has_achievement: item.chengjiu === true,
    
    // === 内容维度特征 ===
    _meta_plain_text: extractPlainText(item.ganshou),
    _meta_text_length: extractPlainText(item.ganshou).length,
    
    // === 情绪维度特征 ===
    _meta_mood_score: calculateMoodScore(item.tiyan, item.xinqing),
    _meta_emotion_raw: item.tiyan || '常规',
    
    // === 辅助字段 ===
    _meta_id: item._id || `${item.time}_${item.shanggexiangmu}_${item.ganshou}`.substring(0, 50),
    _meta_created_at: new Date().toISOString(),
  }
}