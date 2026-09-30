// 界面缩放管理工具
// 通过 CSS transform: scale() 对 #app 容器进行整体缩放，
// 同时用 zoom CSS 变量供 Naive UI / 弹出层的挂载节点使用。

import { ref } from 'vue'

const SETTINGS_KEY = 'uiZoom'
const LS_KEY = 'app-ui-zoom'

/** 缩放比例范围 */
export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 1.4
export const ZOOM_STEP = 0.05
export const ZOOM_DEFAULT = 1.0

/** 当前缩放比例（响应式） */
export const currentZoom = ref(ZOOM_DEFAULT)

/**
 * 将缩放比例应用到 #app 根节点。
 * 使用 transform + transform-origin 而非 zoom，以获得更好的跨平台一致性。
 * 同时设置 CSS 变量 --app-zoom 供其他元素引用。
 */
export function applyZoom(scale) {
  const appEl = document.getElementById('app')
  if (!appEl) return

  const s = Number(scale) || ZOOM_DEFAULT

  // 设置整体 transform scale
  appEl.style.transformOrigin = 'top left'
  appEl.style.transform = `scale(${s})`

  // 因为 scale 不改变盒模型，需要手动缩放宽高以避免滚动条
  appEl.style.width = `${(100 / s).toFixed(4)}vw`
  appEl.style.height = `${(100 / s).toFixed(4)}vh`

  // 同步设置 CSS 变量（供其他地方引用）
  document.documentElement.style.setProperty('--app-zoom', String(s))

  currentZoom.value = s
}

/**
 * 设置新的缩放比例并持久化。
 * @param {number} scale  目标缩放值，范围 [ZOOM_MIN, ZOOM_MAX]
 */
export function setZoom(scale) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(scale) || ZOOM_DEFAULT))
  applyZoom(clamped)

  // 优先写入 Electron settings 文件，降级到 localStorage
  const ipc = globalThis?.electron?.ipcRenderer
  try {
    if (ipc?.sendSync) {
      ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: clamped })
      return
    }
  } catch {}
  try {
    localStorage.setItem(LS_KEY, String(clamped))
  } catch {}
}

/**
 * 初始化缩放（应用启动时调用一次）。
 * 读取持久化的缩放值并应用，若无则使用默认值。
 */
export function initZoom() {
  const ipc = globalThis?.electron?.ipcRenderer

  const readFromFile = () => {
    try {
      if (!ipc?.sendSync) return null
      return ipc.sendSync('settings:get-sync', SETTINGS_KEY)
    } catch {
      return null
    }
  }

  const tryMigrateFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return null
      const val = parseFloat(raw)
      if (isNaN(val)) return null
      if (ipc?.sendSync) {
        ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: val })
        localStorage.removeItem(LS_KEY)
      }
      return val
    } catch {
      return null
    }
  }

  const saved = readFromFile() ?? tryMigrateFromLocalStorage()
  const zoom = saved !== null && !isNaN(Number(saved)) ? Number(saved) : ZOOM_DEFAULT
  applyZoom(zoom)
}

/** 获取当前缩放比例（数值） */
export function getZoom() {
  return currentZoom.value
}

/** 重置为默认缩放 */
export function resetZoom() {
  setZoom(ZOOM_DEFAULT)
}
