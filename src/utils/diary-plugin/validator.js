/**
 * 数据验证器 (Validator)
 * 根据日记数据结构规范，对原始记录进行字段校验、修复和规范化
 */

// ==================== 原始字段 Schema ====================

const RAW_FIELD_SCHEMA = {
  _id:              { type: 'string',  required: false },
  time:             { type: 'string',  required: true  },
  ganshou:          { type: 'string',  required: false },
  tiyan:            { type: 'string',  required: false },
  xinqing:          { type: 'string',  required: false },
  shanggexiangmu:   { type: 'string',  required: false },
  chixushijian:     { type: 'string',  required: false },
  chengjiu:         { type: 'boolean', required: false },
  yinsi:            { type: 'boolean', required: false },
}

// 合法的颜色值映射
const VALID_MOOD_COLORS = ['#FF0000', '#FFA500', '#FFFF00', '#90EE90', '#87CEEB', '#9370DB', '#FFFFFF']

// 中文常见心情/体验与颜色映射表
const MOOD_COLOR_MAP = {
  '普通': { color: '#FFFFFF', tiyan: '常规' },
  '常规': { color: '#FFFFFF', tiyan: '常规' },
  '平淡': { color: '#FFFFFF', tiyan: '常规' },
  '平静': { color: '#FFFFFF', tiyan: '常规' },
  '超赞': { color: '#fed71a', tiyan: '超赞' },
  '开心': { color: '#90EE90', tiyan: '超赞' },
  '兴奋': { color: '#FFFF00', tiyan: '超赞' },
  '愉快': { color: '#90EE90', tiyan: '超赞' },
  '满意': { color: '#90EE90', tiyan: '超赞' },
  '待提升': { color: '#7A7374', tiyan: '待提升' },
  '差': { color: '#7A7374', tiyan: '待提升' },
  '糟糕': { color: '#7A7374', tiyan: '待提升' },
  '低落': { color: '#7A7374', tiyan: '待提升' },
  '难过': { color: '#87CEEB', tiyan: '待提升' },
  '焦虑': { color: '#FFA500', tiyan: '待提升' },
  '愤怒': { color: '#FF0000', tiyan: '待提升' }
}

/**
 * 健壮的日期解析辅助函数
 * 支持 ISO 字符串、本地时间字符串 (YYYY-MM-DD HH:mm)、Date 对象、Excel 序列号、时间戳等
 */
export function parseDateValue(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    if (value > 30000 && value < 100000) {
      return new Date(Math.round((value - 25569) * 86400 * 1000))
    }
    if (value > 1e11) return new Date(value)
    if (value > 1e9) return new Date(value * 1000)
  }

  const str = String(value).trim()
  const direct = new Date(str)
  if (!isNaN(direct.getTime())) return direct

  const cleaned = str
    .replace(/年|月/g, '-')
    .replace(/日/g, ' ')
    .replace(/时|分/g, ':')
    .replace(/秒/g, '')
    .trim()
  const fallback = new Date(cleaned)
  if (!isNaN(fallback.getTime())) return fallback

  return null
}

/**
 * 规范化原始记录（兼容中文表头及常见别名）
 * @param {Object} raw - 原始记录对象
 * @returns {Object} 规范化后的对象
 */
export function normalizeRawRecord(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const normalized = { ...raw }

  // 1. time 别名兼容
  if (normalized.time === undefined) {
    const timeVal = normalized['时间'] ?? normalized.occurredAt ?? normalized.timestamp ?? normalized.datetime ?? normalized.date
    if (timeVal !== undefined) normalized.time = timeVal
  }

  // 2. ganshou (感受) 别名兼容
  if (normalized.ganshou === undefined) {
    const ganshouVal = normalized['感受'] ?? normalized['内容'] ?? normalized.content ?? normalized.text ?? normalized.body
    if (ganshouVal !== undefined) normalized.ganshou = ganshouVal
  }

  // 3. shanggexiangmu (项目/上个项目) 别名兼容
  if (normalized.shanggexiangmu === undefined) {
    const projVal = normalized['项目'] ?? normalized['上个项目'] ?? normalized['分类'] ?? normalized.project ?? normalized.category
    if (projVal !== undefined) normalized.shanggexiangmu = projVal
  }

  // 4. chixushijian (持续时间) 别名兼容
  if (normalized.chixushijian === undefined) {
    const durVal = normalized['持续时间'] ?? normalized['时长'] ?? normalized.duration ?? normalized.durationMinutes
    if (durVal !== undefined) {
      normalized.chixushijian = typeof durVal === 'number' ? `${durVal}分钟` : String(durVal)
    }
  }

  // 5. xinqing (心情) 与 tiyan (体验) 别名与转换
  const rawXinqing = normalized['心情'] ?? normalized.xinqing ?? normalized.mood ?? normalized.moodColor
  if (rawXinqing != null) {
    const xqStr = String(rawXinqing).trim()
    if (/^#[0-9A-Fa-f]{6}$/.test(xqStr)) {
      normalized.xinqing = xqStr.toUpperCase()
    } else if (MOOD_COLOR_MAP[xqStr]) {
      normalized.xinqing = MOOD_COLOR_MAP[xqStr].color
      if (!normalized.tiyan && !normalized['体验']) {
        normalized.tiyan = MOOD_COLOR_MAP[xqStr].tiyan
      }
    } else {
      normalized.xinqing = xqStr
      if (!normalized.tiyan && !normalized['体验']) {
        normalized.tiyan = xqStr
      }
    }
  }

  if (normalized.tiyan === undefined) {
    const tiyanVal = normalized['体验'] ?? normalized.experience
    if (tiyanVal !== undefined) normalized.tiyan = String(tiyanVal).trim()
  }

  // 6. chengjiu (成就/特殊记忆) 别名与布尔值转换
  const rawChengjiu = normalized['特殊记忆'] ?? normalized['成就'] ?? normalized.chengjiu ?? normalized.achievement
  if (rawChengjiu !== undefined) {
    if (typeof rawChengjiu === 'boolean') {
      normalized.chengjiu = rawChengjiu
    } else {
      const s = String(rawChengjiu).trim().toLowerCase()
      normalized.chengjiu = ['是', 'true', '1', 'yes', 'y'].includes(s)
    }
  }

  // 7. yinsi (隐私) 别名与布尔值转换
  const rawYinsi = normalized['隐私'] ?? normalized.yinsi ?? normalized.isPrivate ?? normalized.private
  if (rawYinsi !== undefined) {
    if (typeof rawYinsi === 'boolean') {
      normalized.yinsi = rawYinsi
    } else {
      const s = String(rawYinsi).trim().toLowerCase()
      normalized.yinsi = ['是', 'true', '1', 'yes', 'y'].includes(s)
    }
  }

  // 8. _id 别名兼容
  if (normalized._id === undefined) {
    const idVal = normalized.id ?? normalized['ID'] ?? normalized['编号']
    if (idVal !== undefined) normalized._id = String(idVal).trim()
  }

  return normalized
}

/**
 * 校验并规范化单条原始记录
 * @param {Object} record - 原始记录
 * @param {number} index - 记录在数组中的索引（用于错误提示）
 * @returns {{ valid: boolean, record: Object|null, errors: string[], warnings: string[] }}
 */
export function validateRecord(record, index = 0) {
  const errors = []
  const warnings = []

  if (!record || typeof record !== 'object') {
    return { valid: false, record: null, errors: [`[#${index}] 记录不是有效对象`], warnings }
  }

  // 预处理：别名兼容与类型规范化
  const normalized = normalizeRawRecord(record)
  const cleaned = {}

  // 1. _id — 如果缺失则自动生成
  if (normalized._id && typeof normalized._id === 'string') {
    cleaned._id = normalized._id.trim()
  } else {
    cleaned._id = `${normalized.time || Date.now()}_${normalized.shanggexiangmu || 'unknown'}_${(normalized.ganshou || '').substring(0, 20)}`
    warnings.push(`[#${index}] 缺少 _id，已自动生成: ${cleaned._id}`)
  }

  // 2. time — 必填，必须是可解析的日期
  if (!normalized.time) {
    errors.push(`[#${index}] 缺少必填字段 time`)
  } else {
    const parsed = parseDateValue(normalized.time)
    if (!parsed || isNaN(parsed.getTime())) {
      errors.push(`[#${index}] time 字段不是合法的日期格式: "${normalized.time}"`)
    } else {
      // 规范化为标准 ISO 格式（保留 Z 以防本地解析时产生时区偏差）
      cleaned.time = parsed.toISOString()
    }
  }

  // 3. ganshou — 可选，但至少 time 或 ganshou 必须有一个有意义的内容
  if (normalized.ganshou != null) {
    cleaned.ganshou = String(normalized.ganshou)
  } else {
    cleaned.ganshou = ''
    warnings.push(`[#${index}] ganshou 为空`)
  }

  // 4. tiyan — 可选体验标签
  if (normalized.tiyan != null) {
    cleaned.tiyan = String(normalized.tiyan).trim()
  }

  // 5. xinqing — 可选，需为合法颜色代码
  if (normalized.xinqing != null) {
    const color = String(normalized.xinqing).trim().toUpperCase()
    if (VALID_MOOD_COLORS.includes(color)) {
      cleaned.xinqing = color
    } else if (/^#[0-9A-F]{6}$/i.test(color)) {
      cleaned.xinqing = color
      warnings.push(`[#${index}] xinqing 颜色 "${color}" 不在标准映射中，保留但情绪评分可能不准确`)
    } else {
      warnings.push(`[#${index}] xinqing 值 "${normalized.xinqing}" 不是合法颜色代码，已忽略`)
    }
  }

  // 6. shanggexiangmu — 可选
  if (normalized.shanggexiangmu != null) {
    cleaned.shanggexiangmu = String(normalized.shanggexiangmu).trim()
  }

  // 7. chixushijian — 可选
  if (normalized.chixushijian != null) {
    cleaned.chixushijian = String(normalized.chixushijian).trim()
  }

  // 8. chengjiu — 可选
  if (normalized.chengjiu != null) {
    cleaned.chengjiu = Boolean(normalized.chengjiu)
  }

  // 9. yinsi — 可选
  if (normalized.yinsi != null) {
    cleaned.yinsi = Boolean(normalized.yinsi)
  }

  // 若有致命错误（如 time 缺失），允许调用者决定是否跳过
  return {
    valid: errors.length === 0,
    record: errors.length === 0 ? cleaned : null,
    errors,
    warnings
  }
}

/**
 * 批量校验记录数组
 * @param {Array} records
 * @returns {{ validRecords: Array, allErrors: string[], allWarnings: string[], stats: Object }}
 */
export function validateBatch(records) {
  if (!Array.isArray(records)) {
    return {
      validRecords: [],
      allErrors: ['输入数据不是数组'],
      allWarnings: [],
      stats: { total: 0, valid: 0, invalid: 0 }
    }
  }

  const validRecords = []
  const allErrors = []
  const allWarnings = []

  records.forEach((record, index) => {
    const result = validateRecord(record, index)
    allErrors.push(...result.errors)
    allWarnings.push(...result.warnings)
    if (result.valid && result.record) {
      validRecords.push(result.record)
    }
  })

  return {
    validRecords,
    allErrors,
    allWarnings,
    stats: {
      total: records.length,
      valid: validRecords.length,
      invalid: records.length - validRecords.length
    }
  }
}
