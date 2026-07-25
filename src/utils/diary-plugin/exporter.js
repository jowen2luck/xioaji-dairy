import fs from 'node:fs'
import { cleanDataForSave } from './formatter.js'

/**
 * 将日记数据导出到指定文件路径 
 * 在写入前自动执行数据脱水（移除运行时 _meta_ 和 _ai_meta 字段）
 * 
 * @param {string} filePath 保存的目标路径
 * @param {Array|string} data 要保存的数据（对象数组或已序列化的 JSON 字符串）
 * @param {Object} [options] 选项
 * @param {boolean} [options.dehydrate=true] 是否在导出前自动脱水（移除 _meta_ 和 _ai_meta）
 * @param {boolean} [options.pretty=true]    是否格式化输出
 * @returns {{ success: boolean, message: string, count: number }}
 */
export function exportJsonToFile(filePath, data, options = {}) {
  const {
    dehydrate = true,
    pretty = true
  } = options

  try {
    let outputData
    let count = 0

    if (typeof data === 'string') {
      // 已经是字符串，尝试解析后脱水再序列化
      try {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed) && dehydrate) {
          const cleaned = cleanDataForSave(parsed)
          count = cleaned.length
          outputData = pretty ? JSON.stringify(cleaned, null, 2) : JSON.stringify(cleaned)
        } else {
          outputData = data
          count = Array.isArray(parsed) ? parsed.length : 1
        }
      } catch {
        // 无法解析，原样写入
        outputData = data
      }
    } else if (Array.isArray(data)) {
      const toWrite = dehydrate ? cleanDataForSave(data) : data
      count = toWrite.length
      outputData = pretty ? JSON.stringify(toWrite, null, 2) : JSON.stringify(toWrite)
    } else {
      throw new Error('data 参数必须是数组或 JSON 字符串')
    }

    fs.writeFileSync(filePath, outputData)
    console.log(`[DiaryPlugin:Exporter] 已导出 ${count} 条记录到 ${filePath}`)

    return { success: true, message: `数据导出成功，共 ${count} 条记录`, count }
  } catch (error) {
    console.error('[DiaryPlugin:Exporter] 写入导出文件时出错:', error)
    throw new Error('导出数据失败: ' + error.message)
  }
}
