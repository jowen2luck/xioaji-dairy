/**
 * @file inquiryHandler.js
 * @description IPC adapter for Inquiry operations.
 * Routes renderer IPC calls to InquiryService (start/followUp).
 */

import { ipcMain } from 'electron'
import { getInquiryService } from '../../application/index.js'

/**
 * Register all Inquiry-related IPC handlers.
 */
export function registerInquiryHandlers() {
  const service = getInquiryService()

  // inquiry:start — begin a new inquiry session
  ipcMain.handle('inquiry:start', async (event, { question, scope }) => {
    try {
      return { success: true, data: await service.start({ question, scope }) }
    } catch (error) {
      console.error('[inquiryHandler] start error:', error)
      return { success: false, error: error.message }
    }
  })

  // inquiry:followUp — continue an existing session
  ipcMain.handle('inquiry:followUp', async (event, { sessionId, question, scopePatch }) => {
    try {
      return { success: true, data: await service.followUp({ sessionId, question, scopePatch }) }
    } catch (error) {
      console.error('[inquiryHandler] followUp error:', error)
      return { success: false, error: error.message }
    }
  })

  // inquiry:getSession — retrieve session state
  ipcMain.handle('inquiry:getSession', async (event, sessionId) => {
    try {
      return { success: true, data: await service.getSession(sessionId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // inquiry:getEvidencePack — retrieve evidence pack by ID
  ipcMain.handle('inquiry:getEvidencePack', async (event, packId) => {
    try {
      return { success: true, data: await service.getEvidencePack(packId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // inquiry:getModelCallReceipts — audit trail
  ipcMain.handle('inquiry:getModelCallReceipts', async () => {
    try {
      return { success: true, data: service.getModelCallReceipts() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  console.log('[inquiryHandler] Inquiry IPC handlers registered')
}
