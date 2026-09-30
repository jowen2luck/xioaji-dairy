/**
 * @file index.js
 * @description Registers all IPC handlers for the target architecture.
 * Central entry point for IPC adapter layer.
 */

import { registerInquiryHandlers } from './inquiryHandler.js'
import { registerJournalHandlers } from './journalHandler.js'
import { registerReviewHandlers } from './reviewHandler.js'

/**
 * Register all new IPC handlers.
 * Call this during app initialization alongside existing handlers.
 */
export function registerNewIPCHandlers() {
  registerInquiryHandlers()
  registerJournalHandlers()
  registerReviewHandlers()
  console.log('[IPC Adapters] All new IPC handlers registered')
}
