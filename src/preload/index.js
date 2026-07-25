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
  invokeTool: (name, args) => ipcRenderer.invoke('assistant:invoke-tool', { name, args }),
  saveImage: (payload) => ipcRenderer.invoke('assistant:save-image', payload),
  updateRecord: (id, data, aiMetaData) => ipcRenderer.invoke('record:update', { id, data, aiMetaData }),
  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('assistant:event', listener)
    return () => ipcRenderer.removeListener('assistant:event', listener)
  }
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
