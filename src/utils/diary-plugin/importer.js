import xlsx from 'xlsx'
import { validateBatch } from './validator.js'
import { enrichRecord } from './formatter.js'

/**
 * 将 Excel/CSV 文件读取为 JSON 记录（带验证 + 自动 ETL）
 * 
 * 完整流程：
 *   读取 Excel → 解析为 JSON → 字段校验与修复 → 自动 code-ETL 增强
 * 
 * @param {string} filePath 文件绝对路径
 * @param {Object} [options] 选项
 * @param {boolean} [options.skipInvalid=true]  是否自动跳过无效记录（默认跳过）
 * @param {boolean} [options.autoEnrich=true]   是否自动执行 code-ETL 增强
 * @param {number}  [options.sheetIndex=0]      读取哪个 Sheet
 * @returns {{ records: Array, enrichedRecords: Array|null, validation: Object }}
 */
export function importExcelToJson(filePath, options = {}) {
  const {
    skipInvalid = true,
    autoEnrich = true,
    sheetIndex = 0
  } = options

  // Step 1: 读取 Excel
  let rawRecords
  try {
    const workbook = xlsx.readFile(filePath)
    const sheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    rawRecords = xlsx.utils.sheet_to_json(sheet)
  } catch (error) {
    console.error('[DiaryPlugin:Importer] 读取 Excel 文件失败:', error)
    throw new Error('无法读取或解析文件: ' + error.message)
  }

  if (!rawRecords || rawRecords.length === 0) {
    return {
      records: [],
      enrichedRecords: [],
      validation: { stats: { total: 0, valid: 0, invalid: 0 }, errors: [], warnings: [] }
    }
  }

  // Step 2: 字段校验与修复
  const validation = validateBatch(rawRecords)
  const validRecords = skipInvalid ? validation.validRecords : rawRecords

  console.log(`[DiaryPlugin:Importer] 校验完成: 总共 ${validation.stats.total} 条, 有效 ${validation.stats.valid} 条, 无效 ${validation.stats.invalid} 条`)
  if (validation.allErrors.length > 0) {
    console.warn(`[DiaryPlugin:Importer] 校验错误:`, validation.allErrors.slice(0, 10))
  }
  if (validation.allWarnings.length > 0) {
    console.info(`[DiaryPlugin:Importer] 校验警告:`, validation.allWarnings.slice(0, 10))
  }

  // Step 3: 自动 Code-ETL 增强
  let enrichedRecords = null
  if (autoEnrich && validRecords.length > 0) {
    enrichedRecords = validRecords.map(enrichRecord)
    console.log(`[DiaryPlugin:Importer] ETL 增强完成: ${enrichedRecords.length} 条记录已生成 _meta_ 字段`)
  }

  return {
    records: validRecords,               // 校验后的原始记录（可直接存储）
    enrichedRecords: enrichedRecords,     // ETL 增强后的记录（可直接用于查询/统计）
    validation: {
      stats: validation.stats,
      errors: validation.allErrors,
      warnings: validation.allWarnings
    }
  }
}

/**
 * 从 JSON 数组直接导入（非 Excel 场景）
 * 同样执行完整的 验证 → ETL 流水线
 * 
 * @param {Array} jsonArray 原始 JSON 数组
 * @param {Object} [options] 选项，同 importExcelToJson
 * @returns {{ records: Array, enrichedRecords: Array|null, validation: Object }}
 */
export function importFromJson(jsonArray, options = {}) {
  const {
    skipInvalid = true,
    autoEnrich = true,
  } = options

  if (!Array.isArray(jsonArray) || jsonArray.length === 0) {
    return {
      records: [],
      enrichedRecords: [],
      validation: { stats: { total: 0, valid: 0, invalid: 0 }, errors: [], warnings: [] }
    }
  }

  // 复用相同的 验证 → ETL 流水线
  const validation = validateBatch(jsonArray)
  const validRecords = skipInvalid ? validation.validRecords : jsonArray

  let enrichedRecords = null
  if (autoEnrich && validRecords.length > 0) {
    enrichedRecords = validRecords.map(enrichRecord)
  }

  return {
    records: validRecords,
    enrichedRecords,
    validation: {
      stats: validation.stats,
      errors: validation.allErrors,
      warnings: validation.allWarnings
    }
  }
}
