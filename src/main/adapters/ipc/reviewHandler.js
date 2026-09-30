/**
 * @file reviewHandler.js
 * @description IPC adapter for Review operations.
 * Routes renderer IPC calls to ReviewService.
 */

import { ipcMain } from 'electron'
import { getReviewService } from '../../application/index.js'

/**
 * Register all Review-related IPC handlers.
 */
export function registerReviewHandlers() {
  const service = getReviewService()

  // review:generate — generate a periodic review
  ipcMain.handle('review:generate', async (event, { recipe, scope }) => {
    try {
      return { success: true, data: await service.generate({ recipe, scope }) }
    } catch (error) {
      console.error('[reviewHandler] generate error:', error)
      return { success: false, error: error.message }
    }
  })

  // review:list — list saved review artifacts
  ipcMain.handle('review:list', async (event, { recipe, limit }) => {
    try {
      return { success: true, data: service.listArtifacts({ recipe, limit }) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // review:get — get a specific artifact by ID
  ipcMain.handle('review:get', async (event, id) => {
    try {
      const artifact = service.getArtifact(id)
      return artifact
        ? { success: true, data: artifact }
        : { success: false, error: 'Artifact not found' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  console.log('[reviewHandler] Review IPC handlers registered')
}
