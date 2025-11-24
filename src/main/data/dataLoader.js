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

// 数据存储路径
const dataPath = path.join(app.getPath('userData'), 'appData.json')

/**
 * 时间解析工具
 * 将"0时23分"、"1小时30分"等格式转为分钟数
 */
function parseDuration(str) {
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
function extractPlainText(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/<[^>]+>/g, '').trim()
}

/**
 * 情绪量化(将主观体验映射为 -2 到 +2 的分数)
 */
function calculateMoodScore(tiyan, xinqing) {
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
function getWeekdayName(dayIndex) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[dayIndex] || '未知'
}

/**
 * 时间段判断
 */
function getTimeRange(hour) {
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
    const cleanedData = mergedData.map(item => {
      const cleaned = { ...item }
      Object.keys(cleaned).forEach(key => {
        if (key.startsWith('_meta_') || key === '_ai_meta') {
          delete cleaned[key]
        }
      })
      return cleaned
    })
    
    fs.writeFileSync(dataPath, JSON.stringify(cleanedData, null, 2))
    console.log(`[DataLoader] Saved ${cleanedData.length} records`)
    
    return { success: true, count: cleanedData.length }
  } catch (error) {
    console.error('[DataLoader] Error saving data:', error)
    return { error: '保存数据失败: ' + error.message }
  }
}

/**
 * 导出数据路径给外部使用
 */
export { dataPath }
