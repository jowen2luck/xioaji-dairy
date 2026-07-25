/**
 * ETL IPC 处理器
 * 提供给渲染进程的接口
 * 
 * IPC 通道设计：
 * - etl:start - 触发增量处理
 * - etl:get-progress - 获取处理进度
 * - etl:get-enriched-data - 获取增强后的数据
 * - etl:get-metadata - 获取单条记录的 AI 元数据
 * - etl:force-refresh - 强制刷新所有记录
 * - etl:reset-instance - 重置 ETL 引擎实例（设置变更时调用）
 * - summary:get-all - 获取所有总结
 * - summary:auto-generate - 自动生成总结
 * 
 * 事件通信：
 * - etl:event - 统一事件通道，包含：start, progress, record-updated, error, complete
 * - summary:event - 总结事件通道
 */

import { ipcMain, BrowserWindow } from 'electron'
import { LLMEnricher } from './llmEnricher.js'
import { getSummaryService } from './summaryService.js'
import { loadAndEnrichData } from '../data/index.js'

let enricherInstance = null
let mainWindow = null

/**
 * 设置主窗口引用
 */
export function setMainWindow(win) {
  mainWindow = win
  console.log('[ETL] Main window reference set')
}

/**
 * 获取或创建 ETL 引擎实例
 */
function getEnricher(config) {
  // 事件回调：通知前端进度
  const eventCallback = (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[ETL] Sending event to renderer:', event.type)
      mainWindow.webContents.send('etl:event', event)
    } else {
      console.warn('[ETL] Window not available for event:', event.type)
    }
  }
  
  if (!enricherInstance) {
    enricherInstance = new LLMEnricher(config, eventCallback)
  } else {
    // 关键：动态更新现有单例的配置
    enricherInstance.config = config
    enricherInstance.eventCallback = eventCallback
  }
  
  return enricherInstance
}

/**
 * 注册 IPC 处理器
 */
export function registerETLHandlers() {
  // 开始 ETL 增强
  ipcMain.handle('etl:start', async (event, config) => {
    try {
      console.log('[ETL IPC] Starting ETL with config:', config)
      
      // 加载原始数据
      const records = await loadAndEnrichData()
      
      if (!records || records.length === 0) {
        return {
          success: false,
          error: 'No records to process'
        }
      }
      
      // 获取 ETL 引擎
      const enricher = getEnricher(config)
      
      // 启动异步处理（不阻塞）
      enricher.enrich(records)
      
      return {
        success: true,
        message: `Started ETL processing for ${records.length} records`
      }
      
    } catch (error) {
      console.error('[ETL IPC] Error starting ETL:', error)
      return {
        success: false,
        error: error.message
      }
    }
  })
  
  // 获取 ETL 进度
  ipcMain.handle('etl:get-progress', async () => {
    try {
      if (!enricherInstance) {
        return {
          total: 0,
          processed: 0,
          cached: 0,
          failed: 0,
          queueLength: 0,
          processing: false
        }
      }
      
      return enricherInstance.getProgress()
      
    } catch (error) {
      console.error('[ETL IPC] Error getting progress:', error)
      return {
        error: error.message
      }
    }
  })
  
  // 获取增强后的数据（核心改进：自动包含 AI 缓存）
  ipcMain.handle('etl:get-enriched-data', async () => {
    try {
      // 直接调用 loadAndEnrichData，它已经自动合并 AI 缓存
      const records = await loadAndEnrichData()
      return records
      
    } catch (error) {
      console.error('[ETL IPC] Error getting enriched data:', error)
      return {
        error: error.message
      }
    }
  })
  
  // 获取单条记录的 AI 元数据
  ipcMain.handle('etl:get-metadata', async (event, record) => {
    try {
      if (!enricherInstance) {
        return null
      }
      
      return enricherInstance.getMetadata(record)
      
    } catch (error) {
      console.error('[ETL IPC] Error getting metadata:', error)
      return null
    }
  })
  
  // 强制刷新所有记录
  ipcMain.handle('etl:force-refresh', async (event, config) => {
    try {
      console.log('[ETL IPC] Force refreshing all records...')
      
      const records = await loadAndEnrichData()
      
      if (!records || records.length === 0) {
        return {
          success: false,
          error: 'No records to process'
        }
      }
      
      const enricher = getEnricher(config)
      
      // 启动强制刷新处理（跳过缓存检查）
      enricher.enrich(records, { forceRefresh: true })
      
      return {
        success: true,
        message: `Started force refresh for ${records.length} records`
      }
      
    } catch (error) {
      console.error('[ETL IPC] Error force refreshing:', error)
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 重置 ETL 引擎实例（设置变更时调用，确保下次使用新配置）
  ipcMain.handle('etl:reset-instance', async () => {
    console.log('[ETL IPC] Resetting enricher instance due to settings change')
    enricherInstance = null
    return { success: true }
  })

  // ==================== Summary IPC Handlers ====================

  // 获取所有总结
  ipcMain.handle('summary:get-all', async () => {
    try {
      const summaryService = getSummaryService()
      return summaryService.getSummaries()
    } catch (error) {
      console.error('[ETL IPC] Error getting summaries:', error)
      return { error: error.message }
    }
  })

  // 自动生成总结
  ipcMain.handle('summary:auto-generate', async (event, options = {}) => {
    try {
      console.log('[ETL IPC] Starting auto-generate summaries with options:', options)
      const summaryService = getSummaryService()

      // 事件回调：通知前端总结生成进度
      const eventCallback = (evt) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('summary:event', evt)
        }
      }

      const result = await summaryService.autoGenerateSummaries(options, eventCallback)
      return result
    } catch (error) {
      console.error('[ETL IPC] Error auto-generating summaries:', error)
      return { error: error.message }
    }
  })
  
  // 取消生成总结
  ipcMain.handle('summary:abort-generate', async () => {
    try {
      console.log('[ETL IPC] Aborting summary generation...')
      const summaryService = getSummaryService()
      if (typeof summaryService.abort === 'function') {
        summaryService.abort()
      }
      return { success: true }
    } catch (error) {
      console.error('[ETL IPC] Error aborting sumaries:', error)
      return { error: error.message }
    }
  })

  console.log('[ETL] IPC handlers registered (including summary handlers)')
}
