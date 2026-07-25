// ======================== 导入 ========================
import { importExcelToJson, importFromJson } from './importer.js'

// ======================== 导出 ========================
import { exportJsonToFile } from './exporter.js'

// ======================== 格式化 & ETL ========================
import { enrichRecord, cleanDataForSave } from './formatter.js'

// ======================== 校验 ========================
import { validateRecord, validateBatch } from './validator.js'

// ======================== 统一 API ========================

export const DiaryPlugin = {
  // 导入 (验证 + ETL 一体化)
  importExcelToJson,
  importFromJson,

  // 导出 (自动脱水)
  exportJsonToFile,

  // 格式化 & ETL
  enrichRecord,
  cleanDataForSave,

  // 校验
  validateRecord,
  validateBatch,
}

export {
  importExcelToJson,
  importFromJson,
  exportJsonToFile,
  enrichRecord,
  cleanDataForSave,
  validateRecord,
  validateBatch,
}
