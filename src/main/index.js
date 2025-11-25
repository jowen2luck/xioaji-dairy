import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import xlsx from 'xlsx'
import { join } from 'node:path'

// LangChain 1.0 集成
import { registerIPCHandlers } from './agent/ipcHandlers.js'

// 数据层集成:ETL + SQL 引擎
import { loadAndEnrichData, saveData as saveDataETL } from './data/index.js'

// LLM ETL 增强引擎
import { registerETLHandlers, setMainWindow } from './etl/index.js'



// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.DIST_ELECTRON = path.join(__dirname, '../')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../out/renderer')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// 加载环境变量
require('dotenv').config()

// 删除或注释原有的 VITE_DEV_SERVER_URL 判断逻辑
// if (process.env.VITE_DEV_SERVER_URL) {
//   // ...
// } else {
//   // ...
// }

let win
// Here, you can also use other preload scripts
const preload = join(__dirname, '../preload/index.js')
// 生产环境中渲染器进程的 HTML 文件路径
const indexHtml = join(__dirname, '../renderer/index.html')
// 开发环境中 Vite 开发服务器的 URL
// process.env['ELECTRON_RENDERER_URL'] 是由 electron-vite CLI 自动设置的
const url = process.env['ELECTRON_RENDERER_URL']

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: 1400,
    height: 900,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,
      // contextIsolation: false,
      // Consider using contextBridge and ipcRenderer in production
      webSecurity: false,
      webviewTag: true,
    },
  })

  // 设置 ETL 窗口引用
  setMainWindow(win)

  // Enable webview tag
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = preload
    webPreferences.contextIsolation = true
    webPreferences.nodeIntegration = false
    webPreferences.webSecurity = false
    webPreferences.devTools = true
  })

  // 添加处理打开开发者工具的IPC事件监听器
  ipcMain.handle('open-dev-tools', () => {
    if (win) {
      win.webContents.openDevTools()
    }
  })

  if (url) { // Electron-Vite dev server
    win.loadURL(url)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) dialog.showMessageBox(win, { message: url })
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // 注册 LangChain 1.0 处理器
  registerIPCHandlers()
  // 注册 LLM ETL 处理器
  registerETLHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// 处理"打开 Excel 文件"的请求
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }]
  });
  if (canceled || filePaths.length === 0) return null;

  try {
    const filePath = filePaths[0];
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error('读取 Excel 文件时出错:', error);
    return { error: '无法读取或解析文件' };
  }
});

// 处理"加载本地 JSON 数据"的请求
// 注意:现在返回的是 ETL 增强后的数据(包含 _meta_ 字段)
ipcMain.handle('load-data', async () => {
  try {
    const enrichedData = await loadAndEnrichData()
    console.log(`[Main] Loaded ${enrichedData.length} enriched records with meta fields`)
    return enrichedData
  } catch (error) {
    console.error('加载数据时出错:', error)
    return { error: '加载数据失败' }
  }
})

// 处理“保存数据到本地 JSON 文件”的请求
// 使用新的 ETL 保存函数(自动去重、合并、清理 _meta_ 字段)
ipcMain.handle('save-data', async (event, newData) => {
  try {
    const result = await saveDataETL(newData)
    console.log(`[Main] Save result:`, result)
    
    // 数据更新后，清空向量数据库缓存，下次检索时重建
    const { clearVectorCache } = await import('./tools/searchRecords.js')
    clearVectorCache()
    
    return result
  } catch (error) {
    console.error('保存数据时出错:', error)
    return { error: '保存数据失败' }
  }
})





// 从自然语言中提取检索条件
function extractConditionsFromQuery(query) {
  if (!query || typeof query !== 'string') return null
  const q = query.trim()
  const conditions = {}

  // 项目名称：匹配“项目XX”或已出现过的项目名
  const projectMatch = q.match(/项目\s*([\u4e00-\u9fa5A-Za-z0-9_\-]+)/)
  if (projectMatch) conditions.project = projectMatch[1]

  // 日期范围：今天、昨天、本周、本月、最近N天
  const now = new Date()
  const toISO = (d) => new Date(d).toISOString().split('T')[0]
  if (q.includes('今天')) {
    conditions.dateRange = { start: toISO(now), end: toISO(now) }
  } else if (q.includes('昨天')) {
    const y = new Date(now.getTime() - 24*60*60*1000)
    conditions.dateRange = { start: toISO(y), end: toISO(y) }
  } else if (q.includes('本周')) {
    const d = now.getDay()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
    const end = new Date(start.getTime() + 6*24*60*60*1000)
    conditions.dateRange = { start: toISO(start), end: toISO(end) }
  } else if (q.includes('本月')) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    conditions.dateRange = { start: toISO(start), end: toISO(end) }
  } else {
    const recentMatch = q.match(/最近(\d+)天?/)
    if (recentMatch) {
      const days = parseInt(recentMatch[1])
      const start = new Date(now.getTime() - days*24*60*60*1000)
      conditions.dateRange = { start: toISO(start), end: toISO(now) }
    }
    const monthMap = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12 }
    const monthMatch = q.match(/(十[一二]?|[一二三四五六七八九十])月/)
    if (monthMatch) {
      const mText = monthMatch[1]
      const m = monthMap[mText]
      if (m) {
        const start = new Date(now.getFullYear(), m - 1, 1)
        const end = new Date(now.getFullYear(), m, 0)
        conditions.dateRange = { start: toISO(start), end: toISO(end) }
      }
    }
    const monthsAgoMatch = q.match(/(距今)?(十[一二]?|[一二三四五六七八九十])个月前/)
    if (monthsAgoMatch) {
      const mText = monthsAgoMatch[2]
      const mNum = monthMap[mText]
      if (mNum) {
        const ref = new Date(now.getFullYear(), now.getMonth() - mNum, now.getDate())
        const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
        conditions.dateRange = { start: toISO(start), end: toISO(start) }
      }
    }
  }

  // 内容关键词：取引号内或“包含XX”后的词
  const quoteMatch = q.match(/[“"']([^“"']+)[”"']/)
  if (quoteMatch) conditions.content = quoteMatch[1]
  const includeMatch = q.match(/包含([\u4e00-\u9fa5A-Za-z0-9_\-]+)/)
  if (includeMatch) conditions.content = includeMatch[1]

  if (!conditions.content) {
    if (q.includes('雪糕') || q.includes('冰淇淋')) conditions.content = '雪糕'
  }

  if (q.includes('情绪最糟糕') || q.includes('最糟糕') || q.includes('最差') || q.includes('最低落')) {
    conditions.emotionFocus = 'worst'
  }

  return Object.keys(conditions).length > 0 ? conditions : null
}

function computeEmotionScore(text) {
  if (!text || typeof text !== 'string') return 0
  const t = text.toLowerCase()
  const pos = ['开心','高兴','愉快','满意','顺利','成功','进展','好','棒']
  const neg = ['难过','沮丧','糟糕','生气','愤怒','焦虑','压力','失败','崩溃','坏']
  let score = 0
  for (const w of pos) if (t.includes(w)) score += 1
  for (const w of neg) if (t.includes(w)) score -= 1
  return score
}

function rerankResults(query, items, conditions, vecScoreMap) {
  const q = (query || '').toLowerCase()
  const hasContent = conditions && conditions.content
  const singleDay = conditions && conditions.dateRange && conditions.dateRange.start === conditions.dateRange.end
  const targetDate = singleDay ? new Date(conditions.dateRange.start) : null
  return items
    .map(it => {
      const key = it._id || `${it.time || ''}_${it.shanggexiangmu || ''}_${it.ganshou || ''}`
      const vec = vecScoreMap.get(key) || 0
      const text = [it.ganshou, it.shanggexiangmu, it.chixushijian].filter(Boolean).join(' ').toLowerCase()
      let kw = 0
      if (hasContent) kw += text.includes(String(conditions.content).toLowerCase()) ? 1 : 0
      const cond = (() => {
        let s = 0
        if (conditions?.project && it.shanggexiangmu && it.shanggexiangmu.includes(conditions.project)) s += 1
        if (conditions?.dateRange && it.time) {
          const d = new Date(it.time)
          if (conditions.dateRange.start) s += d >= new Date(conditions.dateRange.start) ? 0.5 : 0
          if (conditions.dateRange.end) s += d <= new Date(conditions.dateRange.end) ? 0.5 : 0
          if (singleDay && targetDate) {
            const diff = Math.abs(d.getTime() - targetDate.getTime()) / (24*60*60*1000)
            s += Math.max(0, 1 - Math.min(1, diff))
          }
        }
        return s
      })()
      const emo = computeEmotionScore(it.ganshou || '')
      let total = 0.6*vec + 0.2*kw + 0.2*cond
      if (conditions?.emotionFocus === 'worst') total += 0.2 * (emo < 0 ? Math.min(1, -emo) : 0)
      return { item: it, score: total }
    })
    .sort((a,b) => b.score - a.score)
    .map(x => x.item)
}

// 处理"导出数据"请求
ipcMain.handle('export-data', async (event, jsonData) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出数据为 JSON',
      defaultPath: path.join(app.getPath('downloads'), `daily_log_export_${Date.now()}.json`),
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ]
    });

    if (canceled) {
      return { success: false, message: '导出已取消' };
    }

    fs.writeFileSync(filePath, jsonData);
    return { success: true, message: '数据导出成功' };
  } catch (error) {
    console.error('导出数据时出错:', error);
    return { success: false, error: '导出数据失败: ' + error.message };
  }
});





