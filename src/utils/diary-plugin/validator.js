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
}

// 合法的颜色值映射
const VALID_MOOD_COLORS = ['#FF0000', '#FFA500', '#FFFF00', '#90EE90', '#87CEEB', '#9370DB', '#FFFFFF']

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

  const cleaned = {}

  // 1. _id — 如果缺失则自动生成
  if (record._id && typeof record._id === 'string') {
    cleaned._id = record._id.trim()
  } else {
    cleaned._id = `${record.time || Date.now()}_${record.shanggexiangmu || 'unknown'}_${(record.ganshou || '').substring(0, 20)}`
    warnings.push(`[#${index}] 缺少 _id，已自动生成: ${cleaned._id}`)
  }

  // 2. time — 必填，必须是可解析的日期
  if (!record.time) {
    errors.push(`[#${index}] 缺少必填字段 time`)
  } else {
    const parsed = new Date(record.time)
    if (isNaN(parsed.getTime())) {
      errors.push(`[#${index}] time 字段不是合法的日期格式: "${record.time}"`)
    } else {
      // 规范化为 ISO 格式
      cleaned.time = parsed.toISOString().replace('Z', '').replace(/\.\d{3}$/, '')
    }
  }

  // 3. ganshou — 可选，但至少 time 或 ganshou 必须有一个有意义的内容
  if (record.ganshou != null) {
    cleaned.ganshou = String(record.ganshou)
  } else {
    cleaned.ganshou = ''
    warnings.push(`[#${index}] ganshou 为空`)
  }

  // 4. tiyan — 可选体验标签
  if (record.tiyan != null) {
    cleaned.tiyan = String(record.tiyan).trim()
  }

  // 5. xinqing — 可选，需为合法颜色代码
  if (record.xinqing != null) {
    const color = String(record.xinqing).trim().toUpperCase()
    if (VALID_MOOD_COLORS.includes(color)) {
      cleaned.xinqing = color
    } else if (/^#[0-9A-F]{6}$/i.test(color)) {
      cleaned.xinqing = color
      warnings.push(`[#${index}] xinqing 颜色 "${color}" 不在标准映射中，保留但情绪评分可能不准确`)
    } else {
      warnings.push(`[#${index}] xinqing 值 "${record.xinqing}" 不是合法颜色代码，已忽略`)
    }
  }

  // 6. shanggexiangmu — 可选
  if (record.shanggexiangmu != null) {
    cleaned.shanggexiangmu = String(record.shanggexiangmu).trim()
  }

  // 7. chixushijian — 可选
  if (record.chixushijian != null) {
    cleaned.chixushijian = String(record.chixushijian).trim()
  }

  // 8. chengjiu — 可选
  if (record.chengjiu != null) {
    cleaned.chengjiu = Boolean(record.chengjiu)
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
