/**
 * @file journalHandler.js
 * @description IPC adapter for Journal CRUD operations.
 * Routes renderer IPC calls to JournalService.
 */

import { ipcMain } from 'electron'
import { getJournalService } from '../../application/index.js'

/**
 * Register all Journal-related IPC handlers.
 */
export function registerJournalHandlers() {
  const service = getJournalService()

  // journal:list — list records with scope filter
  ipcMain.handle('journal:list', async (event, scope) => {
    try {
      return { success: true, data: await service.listRecords(scope || {}) }
    } catch (error) {
      console.error('[journalHandler] list error:', error)
      return { success: false, error: error.message }
    }
  })

  // journal:get — get single record by ID
  ipcMain.handle('journal:get', async (event, id) => {
    try {
      const record = await service.getRecord(id)
      return record
        ? { success: true, data: record }
        : { success: false, error: 'Record not found' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // journal:update — update a record
  ipcMain.handle('journal:update', async (event, { id, patch }) => {
    try {
      return { success: true, data: await service.updateRecord(id, patch) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // journal:upsert — bulk import or upsert
  ipcMain.handle('journal:upsert', async (event, records) => {
    try {
      return { success: true, data: await service.importOrUpsertRecords(records) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  console.log('[journalHandler] Journal IPC handlers registered')
}
