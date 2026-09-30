import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  openDevTools: () => {
    ipcRenderer.invoke('open-dev-tools')
  },
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  loadData: () => ipcRenderer.invoke('load-data')
}

// Electron APIs exposed to renderer
const electronAPI = {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      return ipcRenderer.invoke(channel, ...args)
    },
    sendSync: (channel, ...args) => {
      return ipcRenderer.sendSync(channel, ...args)
    },
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    },
    once: (channel, func) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args))
    },
    removeListener: (channel, func) => {
      ipcRenderer.removeListener(channel, func)
    },
    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    }
  }
}

// Assistant APIs
const assistantAPI = {
  listModels: () => ipcRenderer.invoke('assistant:list-models'),
  chat: (payload) => ipcRenderer.invoke('assistant:chat', payload),
  abort: (payload) => ipcRenderer.invoke('assistant:abort', payload),
  invokeTool: (name, args) => ipcRenderer.invoke('assistant:invoke-tool', { name, args }),
  saveImage: (payload) => ipcRenderer.invoke('assistant:save-image', payload),
  updateRecord: (id, data, aiMetaData) => ipcRenderer.invoke('record:update', { id, data, aiMetaData }),
  deleteRecord: (id) => ipcRenderer.invoke('journal:delete', { id }),
  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('assistant:event', listener)
    return () => ipcRenderer.removeListener('assistant:event', listener)
  },
  // Sessions API (多会话管理)
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (payload) => ipcRenderer.invoke('sessions:create', payload),
    save: (session) => ipcRenderer.invoke('sessions:save', session),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
    rename: (id, title) => ipcRenderer.invoke('sessions:rename', { id, title }),
    migrateLegacy: (messages, reacts) => ipcRenderer.invoke('sessions:migrate-legacy', { messages, reacts })
  },
  // Core Memory API (常驻画像与长期记忆)
  coreMemory: {
    get: () => ipcRenderer.invoke('core-memory:get'),
    update: (section, content) => ipcRenderer.invoke('core-memory:update', { section, content }),
    listEpisodic: () => ipcRenderer.invoke('core-memory:list-episodic'),
    invalidateEpisodic: (id, reason) => ipcRenderer.invoke('core-memory:invalidate-episodic', { id, reason }),
    editEpisodic: (id, content) => ipcRenderer.invoke('core-memory:edit-episodic', { id, content }),
    onEvolved: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('agent:memory-evolved', listener)
      return () => ipcRenderer.removeListener('agent:memory-evolved', listener)
    }
  },
  // Memos API (便签盒管理)
  memos: {
    list: (filter) => ipcRenderer.invoke('memos:list', filter),
    save: (memo) => ipcRenderer.invoke('memos:save', memo),
    delete: (id) => ipcRenderer.invoke('memos:delete', id),
    convertToRecord: (memoId, recordOverrides) => ipcRenderer.invoke('memos:convert-to-record', { memoId, recordOverrides }),
    mergeToRecord: (memoIds, recordOverrides) => ipcRenderer.invoke('memos:merge-to-record', { memoIds, recordOverrides })
  }
}

// Inquiry APIs (new target architecture)
const inquiryAPI = {
  inquiryStart: (question, scope) => ipcRenderer.invoke('inquiry:start', { question, scope }),
  inquiryFollowUp: (sessionId, question, scopePatch) => ipcRenderer.invoke('inquiry:followUp', { sessionId, question, scopePatch }),
  inquiryGetSession: (sessionId) => ipcRenderer.invoke('inquiry:getSession', sessionId),
  inquiryGetEvidencePack: (packId) => ipcRenderer.invoke('inquiry:getEvidencePack', packId),
  journalList: (scope) => ipcRenderer.invoke('journal:list', scope),
  reviewGenerate: (recipe, scope) => ipcRenderer.invoke('review:generate', { recipe, scope }),
  reviewList: (recipe, limit) => ipcRenderer.invoke('review:list', { recipe, limit }),
  reviewGet: (id) => ipcRenderer.invoke('review:get', id),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('assistant', assistantAPI)
    contextBridge.exposeInMainWorld('inquiry', inquiryAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
  window.assistant = assistantAPI
  window.inquiry = inquiryAPI
}
