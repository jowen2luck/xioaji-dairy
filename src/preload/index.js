import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  openDevTools: () => {
    ipcRenderer.invoke('open-dev-tools')
  }
}

// Electron APIs exposed to renderer
const electronAPI = {
  ipcRenderer: {
    invoke: (channel, ...args) => {
      return ipcRenderer.invoke(channel, ...args)
    },
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    },
    once: (channel, func) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args))
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
  invokeTool: (name, args) => ipcRenderer.invoke('assistant:invoke-tool', { name, args }),
  updateRecord: (id, data, aiMetaData) => ipcRenderer.invoke('record:update', { id, data, aiMetaData })
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('assistant', assistantAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
  window.assistant = assistantAPI
}