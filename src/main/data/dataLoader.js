/**
 * 数据预处理与加载模块 (ETL)
 * 功能:将原始 JSON 数据转换为"可计算"的宽表格式,并自动合并 AI 元数据
 * 
 * 架构设计:
 * - 原始字段保持不变(向后兼容)
 * - 新增 _meta_ 开头的计算字段(供 SQL/统计使用)
 * - 自动加载并合并 AI 缓存的 _ai_meta 字段
 */

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { LLMEnricher } from '../etl/llmEnricher.js'
import { enrichRecord, cleanDataForSave } from '../../utils/diary-plugin/index.js'
export { enrichRecord }

// 数据存储路径
const dataPath = (app && typeof app.getPath === 'function')
  ? path.join(app.getPath('userData'), 'appData.json')
  : path.join(process.env.APPDATA || process.cwd(), 'daily_log_vue', 'appData.json')

/**
 * 批量加载并增强数据
 * 核心改进：自动加载并合并 AI 缓存数据
 */
export async function loadAndEnrichData() {
  try {
    // 步骤 1: 加载原始 JSON 数据
    if (!fs.existsSync(dataPath)) {
      console.log('[DataLoader] No data file found, returning empty array')
      return []
    }
    
    const jsonData = fs.readFileSync(dataPath, 'utf-8')
    if (jsonData.length === 0) return []
    
    const rawData = JSON.parse(jsonData)
    console.log(`[DataLoader] Loaded ${rawData.length} raw records`)
    
    // 步骤 2: ETL 处理 - 生成 _meta_ 字段
    const enrichedData = rawData.map(enrichRecord)
    console.log(`[DataLoader] Enriched ${enrichedData.length} records with _meta_ fields`)
    
    // 步骤 3: 加载 AI 缓存并合并 _ai_meta 字段
    try {
      // 创建只读模式的 LLMEnricher 实例
      const defaultConfig = {
        batchSize: 5,
        cacheFile: 'ai_meta_index.json',
        promptVersion: '2.0.0'
      }
      
      const enricher = new LLMEnricher(defaultConfig, () => {})
      console.log('[DataLoader] Created LLMEnricher instance for AI cache reading')
      
      // 检查缓存是否已加载
      if (enricher.isCacheLoaded()) {
        console.log('[DataLoader] AI cache is available, merging _ai_meta fields...')
        
        // 批量计算所有记录的 Hash
        const hashes = enrichedData.map(record => enricher.computeRecordHash(record))
        
        // 批量查询 AI 元数据
        const aiMetaMap = enricher.batchGetMetadata(hashes)
        
        // 合并到数据集
        for (let i = 0; i < enrichedData.length; i++) {
          const hash = hashes[i]
          enrichedData[i]._ai_meta = aiMetaMap.get(hash) || null
        }
        
        const enrichedCount = Array.from(aiMetaMap.values()).length
        console.log(`[DataLoader] Successfully merged _ai_meta for ${enrichedCount}/${enrichedData.length} records`)
      } else {
        console.log('[DataLoader] No AI cache available, setting all _ai_meta to null')
        // 所有记录的 _ai_meta 字段设为 null（向后兼容）
        enrichedData.forEach(record => {
          record._ai_meta = null
        })
      }
    } catch (error) {
      console.error('[DataLoader] Error loading AI cache, falling back to null:', error)
      // 容错：如果 AI 缓存加载失败，不影响基础数据
      enrichedData.forEach(record => {
        record._ai_meta = null
      })
    }
    
    // 步骤 4: 按创建时间倒序排列（最近的时间首先）
    enrichedData.sort((a, b) => {
      const timeA = new Date(a.time).getTime()
      const timeB = new Date(b.time).getTime()
      return timeB - timeA
    })
    console.log(`[DataLoader] Sorted ${enrichedData.length} records by time (descending)`)
    
    return enrichedData
  } catch (error) {
    console.error('[DataLoader] Error loading data:', error)
    return []
  }
}

/**
 * 保存数据(在保存前进行 ETL 预处理)
 * 注意:这里只保存原始字段,_meta_ 和 _ai_meta 字段在加载时动态生成
 */
export async function saveData(newData) {
  try {
    let mergedData = newData
    
    if (fs.existsSync(dataPath)) {
      const existingDataJson = fs.readFileSync(dataPath, 'utf-8')
      if (existingDataJson.length > 0) {
        const existingData = JSON.parse(existingDataJson)
        
        const dataMap = new Map()
        
        existingData.forEach(item => {
          const key = item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`
          dataMap.set(key, item)
        })
        
        newData.forEach(item => {
          const key = item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`
          const existingItem = dataMap.get(key)
          
          if (existingItem && item._id && existingItem._id === item._id) {
            if (JSON.stringify(existingItem) !== JSON.stringify(item)) {
              dataMap.set(key, item)
            }
          } else {
            dataMap.set(key, item)
          }
        })
        
        mergedData = Array.from(dataMap.values())
      }
    }
    
    // 只保存原始字段(去除 _meta_ 和 _ai_meta 字段,避免冗余)
    const cleanedData = cleanDataForSave(mergedData)
    
    fs.writeFileSync(dataPath, JSON.stringify(cleanedData, null, 2))
    console.log(`[DataLoader] Saved ${cleanedData.length} records`)
    
    return { success: true, count: cleanedData.length }
  } catch (error) {
    console.error('[DataLoader] Error saving data:', error)
    return { error: '保存数据失败: ' + error.message }
  }
}

/**
 * Update a single record with support for both raw fields and AI metadata
 * @param {string} id - Record ID
 * @param {Object} updates - Fields to update (raw fields)
 * @param {Object} aiMetaUpdates - AI metadata fields to update (optional)
 * @returns {Promise<{success: boolean, record?: Object, error?: string}>}
 */
export async function updateRecord(id, updates, aiMetaUpdates = null) {
  try {
    console.log(`[DataLoader] Updating record ${id}`)
    console.log(`[DataLoader] Raw field updates:`, updates)
    console.log(`[DataLoader] AI meta updates:`, aiMetaUpdates)
    
    // Step 1: Load existing data
    if (!fs.existsSync(dataPath)) {
      return { success: false, error: 'Data file not found' }
    }
    
    const jsonData = fs.readFileSync(dataPath, 'utf-8')
    if (jsonData.length === 0) {
      return { success: false, error: 'Empty data file' }
    }
    
    const rawData = JSON.parse(jsonData)
    
    // Step 2: Find target record
    const recordIndex = rawData.findIndex(r => r._id === id)
    if (recordIndex === -1) {
      return { success: false, error: `Record with ID ${id} not found` }
    }
    
    // Step 3: Apply raw field updates (only allowed fields)
    const allowedRawFields = ['ganshou', 'time', 'shanggexiangmu', 'chixushijian']
    
    const updatedRecord = { ...rawData[recordIndex] }
    
    Object.keys(updates).forEach(key => {
      if (allowedRawFields.includes(key)) {
        updatedRecord[key] = updates[key]
      } else {
        console.warn(`[DataLoader] Ignoring update to non-allowed raw field: ${key}`)
      }
    })
    
    // Step 4: Save raw data back to file
    rawData[recordIndex] = updatedRecord
    fs.writeFileSync(dataPath, JSON.stringify(rawData, null, 2))
    console.log(`[DataLoader] Successfully updated raw record ${id}`)
    
    // 清除向量索引缓存以保证搜索即时同步
    try {
      const { clearVectorCache } = await import('../tools/searchRecords.js')
      clearVectorCache()
    } catch {}

    // Step 5: Enrich record with _meta_ fields
    let enrichedRecord = enrichRecord(updatedRecord)
    
    // Step 6: Handle AI metadata updates if provided
    if (aiMetaUpdates && Object.keys(aiMetaUpdates).length > 0) {
      try {
        // Create LLMEnricher instance to update cache
        const defaultConfig = {
          batchSize: 5,
          cacheFile: 'ai_meta_index.json',
          promptVersion: '2.0.0'
        }
        const enricher = new LLMEnricher(defaultConfig, () => {})
        
        // Compute hash for the record
        const hash = enricher.computeRecordHash(updatedRecord)
        
        // Update AI metadata cache
        const updatedAiMeta = await enricher.updateCachedMetadata(hash, aiMetaUpdates)
        
        // Attach updated AI metadata to the record
        enrichedRecord._ai_meta = updatedAiMeta
        console.log(`[DataLoader] Successfully updated AI metadata for record ${id}`)
      } catch (aiError) {
        console.error('[DataLoader] Error updating AI metadata:', aiError)
        // Don't fail the whole operation, just log the error
      }
    }
    
    return {
      success: true,
      record: enrichedRecord
    }
  } catch (error) {
    console.error('[DataLoader] Error updating record:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 删除单条记录
 * @param {string} id - 记录 ID
 * @returns {Promise<{success: boolean, deletedRecord?: Object, error?: string}>}
 */
export async function deleteRecord(id) {
  try {
    console.log(`[DataLoader] Deleting record ${id}`)
    if (!fs.existsSync(dataPath)) {
      return { success: false, error: 'Data file not found' }
    }

    const jsonData = fs.readFileSync(dataPath, 'utf-8')
    if (jsonData.length === 0) {
      return { success: false, error: 'Empty data file' }
    }

    const rawData = JSON.parse(jsonData)
    const recordIndex = rawData.findIndex(r => r._id === id)
    if (recordIndex === -1) {
      return { success: false, error: `Record with ID ${id} not found` }
    }

    const deletedRecord = rawData.splice(recordIndex, 1)[0]
    fs.writeFileSync(dataPath, JSON.stringify(rawData, null, 2))
    console.log(`[DataLoader] Successfully deleted record ${id}`)

    // 清除向量索引缓存以保证搜索即时同步
    try {
      const { clearVectorCache } = await import('../tools/searchRecords.js')
      clearVectorCache()
    } catch {}

    return {
      success: true,
      deletedRecord
    }
  } catch (error) {
    console.error('[DataLoader] Error deleting record:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 导出数据路径给外部使用
 */
export { dataPath }
