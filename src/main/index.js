import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import xlsx from 'xlsx'
import { join } from 'node:path'
// 移除静态引入，改用原生 fetch 或动态加载 node-fetch
import mockToolOutputs from './mocks/toolOutputs.js'

// 定义数据文件的存储路径
const dataPath = path.join(app.getPath('userData'), 'appData.json')

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

app.whenReady().then(createWindow)

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
ipcMain.handle('load-data', async () => {
  try {
    if (fs.existsSync(dataPath)) {
      const jsonData = fs.readFileSync(dataPath);
      return jsonData.length > 0 ? JSON.parse(jsonData) : [];
    }
    return [];
  } catch (error) {
    console.error('加载数据时出错:', error);
    return { error: '加载数据失败' };
  }
});

// 处理"保存数据到本地 JSON 文件"的请求
ipcMain.handle('save-data', async (event, newData) => {
  try {
    let mergedData = newData;
    
    // 如果已存在数据文件，则合并数据
    if (fs.existsSync(dataPath)) {
      const existingDataJson = fs.readFileSync(dataPath);
      if (existingDataJson.length > 0) {
        const existingData = JSON.parse(existingDataJson);
        
        // 合并数据并去重
        const dataMap = new Map();
        
        // 先添加现有数据
        existingData.forEach(item => {
          const key = generateDataKey(item);
          dataMap.set(key, item);
        });
        
        // 再添加新数据，如果_id相同但内容不同，则替换
        newData.forEach(item => {
          const key = generateDataKey(item);
          const existingItem = dataMap.get(key);
          
          // 如果存在相同_id但内容不同的项目，则替换
          if (existingItem && item._id && existingItem._id === item._id) {
            // 检查内容是否不同
            if (JSON.stringify(existingItem) !== JSON.stringify(item)) {
              dataMap.set(key, item);
            }
          } else {
            // 如果_id不同或没有_id，则按原逻辑处理
            dataMap.set(key, item);
          }
        });
        
        mergedData = Array.from(dataMap.values());
      }
    }
    
    fs.writeFileSync(dataPath, JSON.stringify(mergedData, null, 2));
    return { success: true, count: mergedData.length };
  } catch (error) {
    console.error('保存数据时出错:', error);
    return { error: '保存数据失败' };
  }
});

// 生成数据项的唯一键，用于去重
function generateDataKey(item) {
  // 使用_id作为唯一标识符进行去重
  return item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`;
}

// 处理"数据分析"请求
ipcMain.handle('analyze-data', async (event, data) => {
  try {
    // 由于在主进程中，我们需要直接使用数据处理逻辑而不是模块
    const report = generateAnalysisReport(data);
    return { success: true, data: report };
  } catch (error) {
    console.error('数据分析时出错:', error);
    return { error: '数据分析失败' };
  }
});

// 处理"智能查询"请求
ipcMain.handle('intelligent-query', async (event, query) => {
  try {
    const data = await loadDataForAnalysis();
    const result = await processIntelligentQuery(query, data);
    return { success: true, data: result };
  } catch (error) {
    console.error('智能查询时出错:', error);
    return { error: '智能查询失败' };
  }
});

// 智能体：模型列表
ipcMain.handle('assistant:list-models', async () => {
  return [
    {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        'qwen-plus-2025-09-11',
        'qvq-max-2025-05-15',
        'qwen3-max-2025-09-23',
        'qwen3-next-80b-a3b-instruct',
        'qwen-flash-2025-07-28',
        'qwen-flash'
      ]
    },
    {
      url: 'https://api.openai.com/v1',
      models: [
        'gpt-4o',
        'gpt-4-turbo',
        'gpt-3.5-turbo'
      ]
    },
    {
      url: 'https://mock-api.example.com/v1', // 模拟的新的baseURL
      models: [
        'mock-model-1',
        'mock-model-2'
      ]
    }
  ]
})

// 简单向量数据库实现
let vectorDB = [];
let model = null;

// 加载向量化模型
async function loadEmbeddingModel() {
  if (model) return model;
  
  try {
    const { pipeline } = await import('@xenova/transformers');
    model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model loaded successfully');
    return model;
  } catch (error) {
    console.error('Failed to load embedding model:', error);
    return null;
  }
}

// 向量化文本
async function embedText(text) {
  if (!model) {
    model = await loadEmbeddingModel();
  }
  
  if (!model) {
    // 如果无法加载模型，返回简单的哈希向量作为备选
    return Array.from({ length: 384 }, (_, i) => Math.sin(i * text.length));
  }
  
  try {
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('Error embedding text:', error);
    return Array.from({ length: 384 }, (_, i) => Math.sin(i * text.length));
  }
}

// 计算余弦相似度
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 构建向量数据库
async function buildVectorDatabase(data) {
  vectorDB = [];
  
  for (const item of data) {
    // 组合多个字段用于向量化
    const text = [
      item.ganshou || '',
      item.shanggexiangmu || '',
      item.chixushijian || '',
      item.time || ''
    ].filter(Boolean).join(' ');
    
    if (text.trim()) {
      const embedding = await embedText(text);
      vectorDB.push({
        id: item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`,
        embedding,
        original: item
      });
    }
  }
  
  console.log(`Vector database built with ${vectorDB.length} entries`);
}

async function vectorSearch(query, topK = 5, withScores = false) {
  if (vectorDB.length === 0) {
    const data = await loadDataForAnalysis();
    await buildVectorDatabase(data);
  }
  
  const queryEmbedding = await embedText(query);
  const similarities = vectorDB.map(item => ({
    item,
    similarity: cosineSimilarity(queryEmbedding, item.embedding)
  }));
  
  similarities.sort((a, b) => b.similarity - a.similarity);
  const top = similarities.slice(0, topK);
  if (withScores) return top;
  return top.map(s => s.item.original);
}

// 高级意图分析函数
async function analyzeIntent(query) {
  // 使用更复杂的意图分析，结合关键词和语义
  const lowerQuery = query.toLowerCase();
  
  // 定义更详细的意图映射
  const intentMap = {
    load_data: {
      keywords: ['加载', '获取', '读取', '数据', '记录', '导入', '全部', '所有'],
      weight: 1
    },
    analyze_data: {
      keywords: ['分析', '统计', '报告', '总结', '洞察', '趋势', '概览', '整体', '全面'],
      weight: 1
    },
    search_records: {
      keywords: ['搜索', '查找', '检索', '查询', '包含', '关于', '查找', '找', '有没有', '哪些', '什么'],
      weight: 1
    },
    project_stats: {
      keywords: ['项目', '统计', '比较', '对比', '项目统计', '项目比较', '哪个项目', '项目排行', '项目排名'],
      weight: 1
    }
  };
  
  const toolScores = {};
  
  // 计算每个工具的匹配分数
  for (const [tool, config] of Object.entries(intentMap)) {
    let score = 0;
    for (const keyword of config.keywords) {
      if (lowerQuery.includes(keyword)) {
        score += config.weight;
      }
    }
    toolScores[tool] = score;
  }
  
  // 根据分数排序，选择得分最高的工具
  const sortedTools = Object.entries(toolScores)
    .filter(([tool, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, score]) => tool);
  
  // 如果没有明确匹配，但涉及数据相关，使用搜索工具
  if (sortedTools.length === 0 && (lowerQuery.includes('数据') || lowerQuery.includes('记录'))) {
    sortedTools.push('search_records');
  }
  
  // 如果查询涉及多个方面，可以同时返回多个工具
  if (sortedTools.length === 0) {
    // 默认返回所有工具，让模型自行判断
    return Object.keys(assistantTools);
  }
  
  return sortedTools;
}

// 条件检索函数
async function conditionalSearch(conditions) {
  const data = await loadDataForAnalysis();
  
  // 支持多种条件的组合检索
  return data.filter(item => {
    let match = true;
    
    if (conditions.project) {
      match = match && item.shanggexiangmu && item.shanggexiangmu.includes(conditions.project);
    }
    
    if (conditions.dateRange) {
      if (item.time) {
        const itemDate = new Date(item.time);
        if (conditions.dateRange.start) {
          match = match && itemDate >= new Date(conditions.dateRange.start);
        }
        if (conditions.dateRange.end) {
          match = match && itemDate <= new Date(conditions.dateRange.end);
        }
      }
    }
    
    if (conditions.duration) {
      // 持续时间条件
      if (item.chixushijian) {
        const durationMatch = item.chixushijian.match(/(\d+)小时(\d+)?/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]) || 0;
          const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
          const totalMinutes = hours * 60 + minutes;
          
          if (conditions.duration.min) {
            match = match && totalMinutes >= conditions.duration.min;
          }
          if (conditions.duration.max) {
            match = match && totalMinutes <= conditions.duration.max;
          }
        }
      }
    }
    
    if (conditions.content) {
      // 内容关键词匹配
      const content = [item.ganshou, item.shanggexiangmu, item.chixushijian].filter(Boolean).join(' ');
      match = match && content.toLowerCase().includes(conditions.content.toLowerCase());
    }
    
    return match;
  });
}

// 智能数据汇总函数
async function smartDataAggregation(query, searchResults) {
  // 根据查询意图对检索结果进行智能汇总
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('情绪最糟糕') || lowerQuery.includes('最糟糕') || lowerQuery.includes('最差') || lowerQuery.includes('最低落')) {
    const dayMap = new Map();
    for (const it of searchResults) {
      if (!it.time) continue;
      const day = new Date(it.time).toISOString().split('T')[0];
      const score = computeEmotionScore(it.ganshou || '');
      if (!dayMap.has(day)) dayMap.set(day, { day, scores: [], records: [] });
      const obj = dayMap.get(day);
      obj.scores.push(score);
      obj.records.push(it);
    }
    const days = Array.from(dayMap.values()).map(d => ({
      day: d.day,
      avg: d.scores.length ? d.scores.reduce((a,b)=>a+b,0)/d.scores.length : 0,
      min: d.scores.length ? Math.min(...d.scores) : 0,
      records: d.records
    })).sort((a,b) => a.avg === b.avg ? a.min - b.min : a.avg - b.avg).slice(0, 5);
    return { summary: `情绪最糟糕的${days.length}天`, worstDays: days };
  }
  
  // 如果查询涉及统计或总结，进行数据聚合
  if (lowerQuery.includes('统计') || lowerQuery.includes('总结') || lowerQuery.includes('汇总')) {
    // 按项目分组统计
    const projectStats = {};
    searchResults.forEach(item => {
      const project = item.shanggexiangmu || '未分类';
      if (!projectStats[project]) {
        projectStats[project] = { count: 0, records: [] };
      }
      projectStats[project].count++;
      projectStats[project].records.push(item);
    });
    
    return {
      summary: `共找到 ${searchResults.length} 条记录，涉及 ${Object.keys(projectStats).length} 个项目`,
      projectStats,
      records: searchResults.slice(0, 10) // 限制返回前10条详细记录
    };
  }
  
  // 默认返回前10条记录
  return searchResults.slice(0, 10);
}

// 智能体：工具注册表
const assistantTools = {
  search_records: {
    description: '按关键词或条件检索记录（感想/项目/时长）',
    parameters: { 
      type: 'object', 
      properties: { 
        query: { type: 'string', description: '检索关键词' },
        conditions: {
          type: 'object',
          properties: {
            project: { type: 'string', description: '项目名称' },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', description: '开始日期 (YYYY-MM-DD)' },
                end: { type: 'string', description: '结束日期 (YYYY-MM-DD)' }
              }
            },
            duration: {
              type: 'object',
              properties: {
                min: { type: 'number', description: '最小持续时间（分钟）' },
                max: { type: 'number', description: '最大持续时间（分钟）' }
              }
            },
            content: { type: 'string', description: '内容关键词' }
          }
        }
      } 
    },
    handler: async ({ query, conditions }) => {
      const data = await loadDataForAnalysis()
      const hasQuery = !!query
      const hasConditions = conditions && Object.keys(conditions).length > 0
      const effectiveCond = hasConditions ? conditions : (hasQuery ? extractConditionsFromQuery(query) || null : null)
      const vecScores = new Map()
      const candidatesMap = new Map()
      const keyOf = (item) => item._id || `${item.time || ''}_${item.shanggexiangmu || ''}_${item.ganshou || ''}`

      if (effectiveCond) {
        const condRes = await conditionalSearch(effectiveCond)
        for (const it of condRes) candidatesMap.set(keyOf(it), it)
      }

      if (hasQuery) {
        try {
          const sims = await vectorSearch(query, 50, true)
          for (const s of sims) {
            const it = s.item.original
            const k = keyOf(it)
            candidatesMap.set(k, it)
            vecScores.set(k, s.similarity)
          }
        } catch (error) {
        }
        const keywordRes = simpleSearch(query, data)
        for (const it of keywordRes) candidatesMap.set(keyOf(it), it)
      }

      if (candidatesMap.size === 0) {
        for (const it of data) candidatesMap.set(keyOf(it), it)
      }

      const candidates = Array.from(candidatesMap.values())
      const results = rerankResults(query || '', candidates, effectiveCond || {}, vecScores)

      const aggregated = await smartDataAggregation(query || '', results)
      const dataCount = (await loadDataForAnalysis()).length
      const debug = {
        query: query || null,
        conditions: effectiveCond || null,
        dataCount,
        resultCount: Array.isArray(results) ? results.length : (aggregated?.records?.length || 0),
        combined: !!effectiveCond && hasQuery,
      }
      return { ...(typeof aggregated === 'object' ? aggregated : { records: aggregated }), debug }
    }
  }
}

// 智能体：OpenAI风格聊天接口（DashScope 兼容）
ipcMain.handle('assistant:chat', async (event, payload) => {
  try {
    const { messages, model, baseURL, tools, config, userQuery, mock, intentModel, disableTools } = payload || {}
    const url = (baseURL || process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1') + '/chat/completions'
    const apiKey = process.env.DASHSCOPE_API_KEY

    // 执行意图分析 + 基于前端勾选工具的允许集合进行选择
    const enabledNames = Array.isArray(tools) ? tools.map(t => t.function?.name || t.name).filter(Boolean) : []
    const intentNames = userQuery ? await analyzeIntent(userQuery) : []
    const intersection = intentNames.filter(n => enabledNames.includes(n))
    const selectedTools = disableTools === true
      ? []
      : ((intersection.length > 0)
          ? intersection
          : (enabledNames.length > 0 ? enabledNames : (intentNames.length > 0 ? intentNames : Object.keys(assistantTools))))

    // 如果有可用工具，构建工具模式
    const toolSchema = (Array.isArray(selectedTools) && selectedTools.length > 0)
      ? (typeof selectedTools[0] === 'string' ? toToolSchema(selectedTools) : selectedTools)
      : [];

    // 准备消息，限制上下文长度
    let processedMessages = [...messages];
    
    // 如果消息超过10条，保留最近的10条（保留系统消息）
    if (processedMessages.length > 10) {
      const systemMessage = processedMessages[0].role === 'system' ? processedMessages[0] : null;
      const recentMessages = processedMessages.slice(-9); // 保留最近9条
      
      if (systemMessage) {
        processedMessages = [systemMessage, ...recentMessages];
      } else {
        processedMessages = processedMessages.slice(-10);
      }
    }

    const body = {
      model,
      messages: processedMessages,
      tools: (toolSchema && toolSchema.length > 0) ? toolSchema : undefined,
      temperature: config?.temperature,
      top_p: config?.top_p
    }

    // Mock 模式：仅在明确开启时返回模拟
    if (mock === true) {
      const selectedNames = selectedTools
      const mockedToolResults = selectedNames
        .map(name => ({ name, args: {}, result: mockToolOutputs[name] || { summary: '暂无该工具的模拟结果' } }))
      const mockContent = `（模拟回复）意图模型：${intentModel || model}；调用：${selectedNames.join('、')}`
      return { success: true, data: { type: 'mock', raw: { choices: [{ message: { content: mockContent } }] }, toolResults: mockedToolResults, intentTools: intentNames } }
    }

    if (!apiKey) {
      return { success: false, error: '缺少 API 密钥，已关闭模拟模式，无法调用真实接口' }
    }

    const nativeFetch = globalThis.fetch
    const doFetch = nativeFetch ? nativeFetch : (await import('node-fetch')).default
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    const json = await res.json()

    // 如果模型产生函数调用，执行工具并拼接结果摘要
    const toolCalls = json?.choices?.[0]?.message?.tool_calls || []
    const toolResults = []
    for (const call of toolCalls) {
      const name = call.function?.name
      const args = safeParseJSON(call.function?.arguments)
      const tool = assistantTools[name]
      if (tool) {
        const result = await tool.handler(args || {})
        toolResults.push({ name, args, result })
      }
    }

    // 兜底策略：若模型未触发函数，但意图建议且在允许集合内，则主动执行
    try {
      const needSearch = Array.isArray(intentNames) && intentNames.includes('search_records')
      const allowed = selectedTools.includes('search_records')
      let fallbackTriggered = false
      if (!disableTools && toolCalls.length === 0 && needSearch && allowed) {
        const name = 'search_records'
        const args = { query: userQuery, conditions: extractConditionsFromQuery(userQuery || '') || undefined }
        const result = await assistantTools[name].handler(args)
        toolResults.push({ name, args, result })
        fallbackTriggered = true
      }
      const debug = {
        hasApiKey: !!apiKey,
        url,
        intentNames,
        enabledNames,
        selectedTools,
        toolSchemaLen: Array.isArray(toolSchema) ? toolSchema.length : 0,
        messagesLen: processedMessages.length,
        fetchType: typeof doFetch,
        resStatus: res.status,
        toolCallsLen: toolCalls.length,
        fallbackTriggered,
        extracted: extractConditionsFromQuery(userQuery || '') || null
      }
      return { success: true, data: { raw: json, toolResults, intentTools: intentNames, debug } }
    } catch (e) {
      const debug = {
        hasApiKey: !!apiKey,
        url,
        intentNames,
        enabledNames,
        selectedTools,
        toolSchemaLen: Array.isArray(toolSchema) ? toolSchema.length : 0,
        messagesLen: processedMessages.length,
        extracted: extractConditionsFromQuery(userQuery || '') || null
      }
      return { success: true, data: { raw: json, toolResults, intentTools: [], debug } }
    }
  } catch (error) {
    console.error('assistant:chat 调用失败:', error)
    return {
      success: false,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        where: 'assistant:chat',
      },
    }
  }
})

// 智能体：直接受控工具调用
ipcMain.handle('assistant:invoke-tool', async (event, { name, args }) => {
  try {
    const tool = assistantTools[name]
    if (!tool) return { success: false, error: '未知工具' }
    const result = await tool.handler(args || {})
    return { success: true, data: result }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

function buildToolSchema() {
  return Object.entries(assistantTools).map(([name, t]) => ({
    type: 'function',
    function: {
      name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

function safeParseJSON(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

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

// 辅助函数：加载数据分析用的数据
async function loadDataForAnalysis() {
  try {
    if (fs.existsSync(dataPath)) {
      const jsonData = fs.readFileSync(dataPath);
      return jsonData.length > 0 ? JSON.parse(jsonData) : [];
    }
    return [];
  } catch (error) {
    console.error('加载分析数据时出错:', error);
    return [];
  }
}

// 数据分析报告生成函数
function generateAnalysisReport(data) {
  // 基础统计
  const getBasicStats = () => {
    const totalRecords = data.length;
    const projects = [...new Set(data.map(item => item.shanggexiangmu).filter(Boolean))];
    const validTimeData = data.filter(item => item.time);
    
    return {
      totalRecords,
      totalProjects: projects.length,
      projects: projects,
      dateRange: getDateRange(),
      avgDuration: calculateAverageDuration(),
      recordsWithTime: validTimeData.length
    };
  };

  // 获取日期范围
  const getDateRange = () => {
    const validDates = data
      .map(item => item.time)
      .filter(time => time)
      .map(time => new Date(time));
    
    if (validDates.length === 0) return null;
    
    const minDate = new Date(Math.min(...validDates));
    const maxDate = new Date(Math.max(...validDates));
    
    return {
      start: minDate.toISOString().split('T')[0],
      end: maxDate.toISOString().split('T')[0],
      days: Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1
    };
  };

  // 计算平均持续时间
  const calculateAverageDuration = () => {
    const durations = data
      .map(item => parseDuration(item.chixushijian))
      .filter(duration => duration > 0);
    
    if (durations.length === 0) return 0;
    
    const totalMinutes = durations.reduce((sum, duration) => sum + duration, 0);
    return Math.round(totalMinutes / durations.length);
  };

  // 解析持续时间字符串为分钟数
  const parseDuration = (durationStr) => {
    if (!durationStr) return 0;
    
    // 匹配 "X小时Y分钟" 或 "Y分钟" 格式
    const hourMatch = durationStr.match(/(\d+)\s*小时/);
    const minuteMatch = durationStr.match(/(\d+)\s*分钟/);
    
    let totalMinutes = 0;
    if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
    if (minuteMatch) totalMinutes += parseInt(minuteMatch[1]);
    
    return totalMinutes;
  };

  // 项目统计分析
  const getProjectStats = () => {
    const projectMap = new Map();
    
    data.forEach(item => {
      const project = item.shanggexiangmu || '未分类';
      if (!projectMap.has(project)) {
        projectMap.set(project, {
          name: project,
          count: 0,
          totalDuration: 0,
          records: []
        });
      }
      
      const projectData = projectMap.get(project);
      projectData.count++;
      projectData.totalDuration += parseDuration(item.chixushijian);
      projectData.records.push(item);
    });

    return Array.from(projectMap.values()).map(project => ({
      ...project,
      avgDuration: project.count > 0 ? Math.round(project.totalDuration / project.count) : 0,
      avgDurationStr: minutesToDuration(project.count > 0 ? Math.round(project.totalDuration / project.count) : 0)
    }));
  };

  // 时间分布分析
  const getTimeDistribution = () => {
    const hourlyDistribution = new Array(24).fill(0);
    const dailyDistribution = {};
    const monthlyDistribution = {};
    
    data.forEach(item => {
      if (item.time) {
        const date = new Date(item.time);
        const hour = date.getHours();
        const day = date.toISOString().split('T')[0];
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        hourlyDistribution[hour]++;
        dailyDistribution[day] = (dailyDistribution[day] || 0) + 1;
        monthlyDistribution[month] = (monthlyDistribution[month] || 0) + 1;
      }
    });

    return {
      hourly: hourlyDistribution,
      daily: Object.entries(dailyDistribution).map(([date, count]) => ({ date, count })),
      monthly: Object.entries(monthlyDistribution).map(([month, count]) => ({ month, count }))
    };
  };

  // 情感分析（基于心情颜色）
  const getEmotionStats = () => {
    const emotionMap = {
      '#FF0000': '愤怒',
      '#FFA500': '焦虑',
      '#FFFF00': '开心',
      '#90EE90': '平静',
      '#87CEEB': '忧郁',
      '#9370DB': '兴奋',
      '#FFFFFF': '正常'
    };

    const emotionStats = {};
    data.forEach(item => {
      const color = item.xinqing || '#FFFFFF';
      const emotion = emotionMap[color] || '未知';
      emotionStats[emotion] = (emotionStats[emotion] || 0) + 1;
    });

    return Object.entries(emotionStats).map(([emotion, count]) => ({
      emotion,
      count,
      percentage: data.length > 0 ? ((count / data.length) * 100).toFixed(1) : 0
    }));
  };

  // 成就统计
  const getAchievementStats = () => {
    const achievementRecords = data.filter(item => item.chengjiu === true);
    const totalAchievements = achievementRecords.length;
    const achievementRate = data.length > 0 ? ((totalAchievements / data.length) * 100).toFixed(1) : 0;

    return {
      totalAchievements,
      achievementRate: parseFloat(achievementRate),
      achievements: achievementRecords
    };
  };

  // 生成洞察和建议
  const generateInsights = (basicStats, projectStats, emotionStats, achievementStats) => {
    const insights = [];

    // 项目活跃度洞察
    if (projectStats.length > 0) {
      const mostActiveProject = projectStats.reduce((prev, current) => 
        prev.count > current.count ? prev : current
      );
      insights.push(`最活跃的项目是"${mostActiveProject.name}"，共有${mostActiveProject.count}条记录。`);
    }

    // 情绪洞察
    if (emotionStats.length > 0) {
      const mostCommonEmotion = emotionStats.reduce((prev, current) => 
        prev.count > current.count ? prev : current
      );
      insights.push(`最常见的情绪是"${mostCommonEmotion.emotion}"，占比${mostCommonEmotion.percentage}%。`);
    }

    // 成就洞察
    if (achievementStats.achievementRate > 0) {
      insights.push(`成就完成率为${achievementStats.achievementRate}%，共完成${achievementStats.totalAchievements}项成就。`);
    }

    // 时间洞察
    if (basicStats.dateRange) {
      insights.push(`记录时间跨度为${basicStats.dateRange.days}天，从${basicStats.dateRange.start}到${basicStats.dateRange.end}。`);
    }

    return insights;
  };

  // 工具函数：分钟转换为时长字符串
  const minutesToDuration = (minutes) => {
    if (minutes === 0) return '0分钟';
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) return `${remainingMinutes}分钟`;
    if (remainingMinutes === 0) return `${hours}小时`;
    return `${hours}小时${remainingMinutes}分钟`;
  };

  // 生成综合分析报告
  const basicStats = getBasicStats();
  const projectStats = getProjectStats();
  const timeDistribution = getTimeDistribution();
  const emotionStats = getEmotionStats();
  const achievementStats = getAchievementStats();

  return {
    summary: basicStats,
    projects: projectStats,
    timeDistribution,
    emotions: emotionStats,
    achievements: achievementStats,
    insights: generateInsights(basicStats, projectStats, emotionStats, achievementStats)
  };
}

// 智能查询处理函数
async function processIntelligentQuery(query, data) {
  if (!query || typeof query !== 'string') {
    return { error: '请输入有效的查询内容' };
  }

  // 简化版智能查询处理
  const lowerQuery = query.toLowerCase();
  
  // 根据查询类型返回不同结果
  if (lowerQuery.includes('统计') || lowerQuery.includes('分析')) {
    return {
      type: 'statistics',
      statistics: generateSimpleStatistics(data)
    };
  } else if (lowerQuery.includes('比较') || lowerQuery.includes('对比')) {
    return {
      type: 'comparison',
      comparison: generateSimpleComparison(data)
    };
  } else if (lowerQuery.includes('趋势') || lowerQuery.includes('变化')) {
    return {
      type: 'trend',
      trend: generateSimpleTrend(data)
    };
  } else {
    // 默认搜索
    return {
      type: 'search',
      results: simpleSearch(query, data)
    };
  }
}

// 简单统计生成
function generateSimpleStatistics(data) {
  const projects = {};
  const emotions = {};
  let totalDuration = 0;
  let countWithAchievements = 0;
  
  data.forEach(item => {
    // 项目统计
    const project = item.shanggexiangmu || '未分类';
    projects[project] = (projects[project] || 0) + 1;
    
    // 情绪统计 (简化)
    if (item.xinqing) {
      emotions[item.xinqing] = (emotions[item.xinqing] || 0) + 1;
    }
    
    // 成就统计
    if (item.chengjiu) {
      countWithAchievements++;
    }
  });
  
  return {
    total: data.length,
    projects,
    emotions,
    achievements: countWithAchievements
  };
}

// 简单比较生成
function generateSimpleComparison(data) {
  const projects = [...new Set(data.map(item => item.shanggexiangmu).filter(Boolean))];
  const comparison = {};
  
  // 只比较前几个项目
  projects.slice(0, 3).forEach(project => {
    const projectData = data.filter(item => item.shanggexiangmu === project);
    comparison[project] = {
      count: projectData.length,
      avgDuration: calculateAvgDurationForComparison(projectData)
    };
  });
  
  return comparison;
}

// 计算平均持续时间（比较用）
function calculateAvgDurationForComparison(projectData) {
  if (projectData.length === 0) return 0;
  
  const totalDuration = projectData.reduce((sum, item) => {
    const match = item.chixushijian?.match(/(\d+)小时/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);
  
  return Math.round(totalDuration / projectData.length);
}

// 简单趋势生成
function generateSimpleTrend(data) {
  // 按日期分组
  const dailyData = {};
  
  data.forEach(item => {
    if (item.time) {
      const date = new Date(item.time).toISOString().split('T')[0];
      dailyData[date] = (dailyData[date] || 0) + 1;
    }
  });
  
  // 转换为数组并排序
  const trendData = Object.entries(dailyData)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-7); // 只取最近7天
  
  return {
    daily: trendData
  };
}

// 简单搜索
function simpleSearch(query, data) {
  const lowerQuery = query.toLowerCase();
  return data.filter(item => {
    return (item.ganshou && item.ganshou.toLowerCase().includes(lowerQuery)) ||
           (item.shanggexiangmu && item.shanggexiangmu.toLowerCase().includes(lowerQuery)) ||
           (item.chixushijian && item.chixushijian.toLowerCase().includes(lowerQuery));
  });
}
function toToolSchema(names) {
  return names
    .filter(n => !!assistantTools[n])
    .map(name => ({
      type: 'function',
      function: {
        name,
        description: assistantTools[name].description,
        parameters: assistantTools[name].parameters
      }
    }))
}