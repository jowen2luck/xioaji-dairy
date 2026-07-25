/**
 * IPC 处理器 - LangChain 集成版本（增强意图分析）
 * 将 IPC 事件映射到代理执行
 */

import { ipcMain, app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'https'
import http from 'http'
import { initializeModel } from '../llm/models.js'
import { getToolRegistry } from '../tools/registry.js'
import { AgentExecutor } from './executor.js'
import { analyzeIntent, analyzeIntentWithLLM } from '../intent/analyzer.js'
import { updateRecord } from '../data/index.js'

/**
 * 注册所有 IPC 处理器
 * @param {object} config - 全局配置
 */
export function registerIPCHandlers(config = {}) {
  console.log('[IPC] Registering LangChain-based handlers')

  /**
   * handler: assistant:chat
   * 主要的聊天接口，集成模型、工具和代理
   */
  ipcMain.handle('assistant:chat', async (event, payload) => {
    try {
      const { messages = [], model, baseURL, tools, config: userConfig, userQuery, mock, disableTools, requestId, extraBody } = payload || {}
      const effectiveRequestId = requestId || `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
      const pushEvent = (evt) => {
        try {
          event.sender.send('assistant:event', { requestId: effectiveRequestId, ...evt })
        } catch {}
      }

      console.log('[IPC:chat] Received request', { model, userQuery })

      // Mock 模式
      if (mock === true) {
        return {
          success: true,
          data: {
            type: 'mock',
            raw: { choices: [{ message: { content: '（模拟回复）' } }] },
            toolResults: [],
            intentTools: [],
          },
        }
      }

      // 初始化模型
      const llm = initializeModel({
        selectedBaseURL: baseURL,
        selectedModel: model,
        temperature: userConfig?.temperature ?? 0.7,
        top_p: userConfig?.top_p ?? 0.9,
      })

      // 调试日志
      console.log('[IPC:chat] LLM created with model:', model, 'baseURL:', baseURL)
      const apiKey = getAPIKeyForBaseURL(baseURL)
      console.log('[IPC:chat] API Key for baseURL:', baseURL, 'present:', !!apiKey)
      if (!apiKey) {
        console.error('[IPC:chat] No API Key found! Checked env vars:', 
          'DASHSCOPE_API_KEY_QWEN=' + (process.env.DASHSCOPE_API_KEY_QWEN ? 'SET' : 'NOT SET'),
          'DASHSCOPE_API_KEY_SCTCLOUD=' + (process.env.DASHSCOPE_API_KEY_SCTCLOUD ? 'SET' : 'NOT SET'),
          'OPENAI_API_KEY=' + (process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'),
          'DASHSCOPE_API_KEY=' + (process.env.DASHSCOPE_API_KEY ? 'SET' : 'NOT SET')
        )
      }
      const toolRegistry = getToolRegistry()

      // 确定启用的工具
      const enabledToolNames = tools ? tools.map(t => t.function?.name || t.name).filter(Boolean) : []

      // 结构化意图分析（使用 LLM）
      let intentContext = null
      let intentTools = []
      
      if (userQuery) {
        try {
          // 尝试使用 LLM 进行结构化意图分析
          // 【改进】如果配置中指定了 intentModel，创建独立的意图分析 LLM
          let intentLLM = llm  // 默认使用主 LLM
          if (userConfig?.intentModel && userConfig.intentModel !== model) {
            console.log('[IPC:chat] Creating separate intent analyzer LLM:', userConfig.intentModel)
            intentLLM = initializeModel({
              selectedBaseURL: baseURL,
              selectedModel: userConfig.intentModel,
              temperature: userConfig?.temperature ?? 0.7,
              top_p: userConfig?.top_p ?? 0.9,
            })
          }
          
      // 【修改点】将 messages (历史记录) 传入分析器，实现上下文指代消解
          // 这样意图分析器就能"看到"历史对话，理解"它"、"那个项目"等指代词
          console.log('[IPC:chat] messages format check:', {
            isArray: Array.isArray(messages),
            length: messages.length,
            sample: messages.slice(0, 2).map(m => ({
              role: m.role,
              hasContent: !!m.content,
              contentType: typeof m.content,
              contentLength: m.content?.length || 0
            }))
          })
          console.log('[IPC:chat] Passing history to intent analyzer, messages length:', messages.length)
          intentContext = await analyzeIntentWithLLM(userQuery, intentLLM, messages)
          
          if (intentContext && intentContext.suggested_pipeline) {
            // 使用意图分析推荐的工具链
            intentTools = intentContext.suggested_pipeline.filter(tool => 
              enabledToolNames.includes(tool)
            )
            
            // 【核心改进】强制注入基础辅助工具，防止意图分析器漏判
            // 这些工具对于日记查询至关重要，应该始终可用
            const essentialTools = ['calendar_resolver', 'metadata_explorer']
            essentialTools.forEach(toolName => {
              if (enabledToolNames.includes(toolName) && !intentTools.includes(toolName)) {
                console.log(`[IPC:chat] Injecting essential tool: ${toolName}`)
                intentTools.push(toolName)
              }
            })
            
            console.log('[IPC:chat] Intent context:', intentContext)
            console.log('[IPC:chat] Final tool list (with essential tools):', intentTools)
          }
        } catch (error) {
          console.error('[IPC:chat] Intent analysis failed, using fallback:', error)
          // 降级到旧版关键词匹配
          intentTools = analyzeIntent(userQuery, enabledToolNames)
        }
      }

      console.log('[IPC:chat] Enabled tools:', enabledToolNames)
      console.log('[IPC:chat] Intent tools:', intentTools)

      // 如果禁用工具，直接调用 LLM
      if (disableTools === true) {
        console.log('[IPC:chat] Tools disabled, calling LLM only')

        const { callOpenAIAPI } = await import('../llm/directOpenAI.js')
        const apiResponse = await callOpenAIAPI({
          baseURL: baseURL,
          model: model,
          messages,
          tools: [],
          temperature: userConfig?.temperature ?? 0.7,
          top_p: userConfig?.top_p ?? 0.9,
          enableThinking: false,
          extraBody: extraBody && typeof extraBody === 'object' ? extraBody : undefined,
        })

        return {
          success: true,
          data: {
            content: apiResponse.content || '',
            raw: apiResponse,
            toolResults: [],
            intentTools: [],
            debug: {
              disabledTools: true,
            },
          },
        }
      }

      // 创建代理执行器
      const executor = new AgentExecutor(llm, toolRegistry, {
        baseURL,
        apiKey: getAPIKeyForBaseURL(baseURL),
        model,
        intentModel: userConfig?.intentModel, // 传递意图识别模型配置
        temperature: userConfig?.temperature ?? 0.7,
        top_p: userConfig?.top_p ?? 0.9,
        requestId: effectiveRequestId,
        eventEmitter: (evt) => pushEvent(evt),
        streamFinal: true
      })

      // 【关键修改】"吸星大法" - 构造干净的消息列表
      // 意图分析器已经从历史中"吸收"了营养（指代消解、实体提取等）
      // 现在我们切断历史，只给 Executor 重写后的独立查询
      let standaloneQuery = userQuery // 默认使用原查询
      if (intentContext?.standalone_query) {
        standaloneQuery = intentContext.standalone_query
        console.log('[IPC:chat] Query rewritten:', userQuery, '->', standaloneQuery)
      }

      // 提取前端传入的 System Prompt (如果有)
      // 这样可以保留"鸡大师"等角色设定，同时切断对话历史
      const systemMessage = messages.find(m => m.role === 'system')
      const customSystemPrompt = systemMessage ? systemMessage.content : ''

      // 构造给 Executor 的"干净"消息列表
      // 【核心】不传递完整的历史记录，而是：
      // - 仅包含当前的独立查询
      // - 这样 Executor "看不到"之前的对话，必须调用工具获取信息
      // - Token 消耗从 O(n) 降低到 O(1)，避免"偷懒"现象
      const executorMessages = [
        // 注意：System Prompt 会在 Executor.formatMessages() 中自动添加
        // 这里只需传递当前的用户查询
        { role: 'user', content: standaloneQuery }
      ]

      console.log('[IPC:chat] Executor will receive:',{
        messageCount: executorMessages.length,
        standaloneQuery,
        hasHistory: false,
        hasSystemPrompt: !!customSystemPrompt,
        note: '历史已切断，只有独立查询'
      })

      // 执行代理（传入意图上下文）
      const result = await executor.execute({
        messages: executorMessages, // <--- 传入干净的消息列表（已切断历史）
        systemPrompt: customSystemPrompt, // <--- 传入前端定义的 System Prompt
        userQuery: standaloneQuery, // <--- 使用重写后的查询
        enabledTools: intentTools.length > 0 ? intentTools : enabledToolNames,
        maxIterations: intentContext?.maxIterations || 3,  // 使用意图推荐的迭代次数
        intentContext  // 传入结构化意图上下文
      })

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          state: result.state,
        }
      }

      // 格式化结果
      return {
        success: true,
        data: {
          requestId: effectiveRequestId,
          content: result.content,  // ReAct 最终答案
          raw: result.raw || { choices: [{ message: { content: result.content } }] },
          toolResults: result.state.toolResults || [],
          intentTools,
          intentContext: result.intentContext,  // 返回结构化意图上下文
          state: result.state,  // 包含完整的 ReAct 状态
          debug: {
            iterations: result.state.iteration,
            steps: result.state.steps,
            duration: result.duration,
          },
        },
      }
    } catch (error) {
      console.error('[IPC:chat] Error:', error)
      return {
        success: false,
        error: {
          name: error?.name,
          message: error?.message,
        },
      }
    }
  })

  /**
   * handler: assistant:invoke-tool
   * 直接调用单个工具
   */
  ipcMain.handle('assistant:invoke-tool', async (event, { name, args }) => {
    try {
      console.log('[IPC:invoke-tool] Tool:', name, 'Args:', JSON.stringify(args))

      const toolRegistry = getToolRegistry()
      const tool = toolRegistry.get(name)
      
      if (!tool) {
        return {
          success: false,
          error: `Tool '${name}' not found in registry`,
        }
      }

      // 验证输入
      const validation = tool.validateInput(args || {})
      if (!validation.valid) {
        console.warn(`[IPC:invoke-tool] Validation failed for ${name}:`, validation.errors)
        // 不是严格拒绝，继续执行，允许需要在工具中处理空值
      }

      const result = await toolRegistry.invokeTool(name, args || {})

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      console.error('[IPC:invoke-tool] Error:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  })

  /**
   * handler: tool-execute
   * 通用工具执行接口（用于数据分析页等场景）
   * 参数格式: { toolName: string, params: object }
   */
  ipcMain.handle('tool-execute', async (event, toolName, params = {}) => {
    try {
      console.log('[IPC:tool-execute] Tool:', toolName, 'Params:', JSON.stringify(params))

      const toolRegistry = getToolRegistry()
      const tool = toolRegistry.get(toolName)
      
      if (!tool) {
        return {
          isError: true,
          data: { error: `Tool '${toolName}' not found in registry` },
        }
      }

      // 调用工具
      const result = await tool.invoke(params)

      // 统一返回格式
      return {
        isError: result.isError || false,
        data: result.toJSON ? result.toJSON() : result,
        toolName: result.toolName || toolName,
        timestamp: result.timestamp || new Date().toISOString()
      }
    } catch (error) {
      console.error('[IPC:tool-execute] Error:', error)
      return {
        isError: true,
        data: { error: error.message },
        toolName,
        timestamp: new Date().toISOString()
      }
    }
  })

  /**
   * handler: assistant:list-models
   * 
   * 列出可用的模型和 API 端点
   * ⚠️ 說明：前端 GlobalSettings.vue 直接使用 DEFAULT_CONFIG.baseURLs 来渲染模型選項，
   * 此 IPC 接口不会被前端调用（已被弃用）。
   * 
   * 如果你需要根據存存在 localStorage 中的配置清单列出模型，
   * 可以从前端发送 baseURLs 更新，例如：
   * window.assistant.listModels({ baseURLs: [...] })
   */
  ipcMain.handle('assistant:list-models', async (event, payload = {}) => {
    // 当前应该什么都不返回，因为它已经被前端弃用
    // 应该让前端供给后端配置清单，而不是什么都不输
    // 如果前端会调用此接口（总是不调用），应该使用下面的方式：
    const baseURLs = payload.baseURLs || []
    return baseURLs
  })

  ipcMain.handle('assistant:save-image', async (_event, payload = {}) => {
    try {
      const src = payload?.src
      if (!src || typeof src !== 'string') {
        return { success: false, error: { message: 'Missing image src' } }
      }

      const defaultName = payload?.suggestedName && typeof payload.suggestedName === 'string'
        ? payload.suggestedName
        : `generated-${Date.now()}`
      const defaultDir = (() => {
        try { return app.getPath('pictures') } catch { return app.getPath('downloads') }
      })()
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(defaultDir, `${defaultName}.png`),
        filters: [
          { name: 'PNG', extensions: ['png'] },
          { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
          { name: 'WebP', extensions: ['webp'] },
          { name: 'GIF', extensions: ['gif'] },
          { name: 'SVG', extensions: ['svg'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (canceled || !filePath) return { success: false, canceled: true }

      const savedPath = await saveImageToFile(src, filePath)
      return { success: true, filePath: savedPath }
    } catch (e) {
      return { success: false, error: { message: e?.message || 'Save failed' } }
    }
  })

  /**
   * handler: assistant:list-tools
   * 列出可用的工具
   */
  ipcMain.handle('assistant:list-tools', async () => {
    try {
      const toolRegistry = getToolRegistry()
      const tools = toolRegistry.getAll()

      return {
        success: true,
        data: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          schema: tool.schema,
        })),
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  })

  /**
   * handler: assistant:analyze-intent
   * 分析用户查询的意图
   */
  ipcMain.handle('assistant:analyze-intent', async (event, { query, availableTools }) => {
    try {
      const intentTools = analyzeIntent(query, availableTools)

      return {
        success: true,
        data: {
          tools: intentTools,
          query,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  })

  /**
   * handler: record:update
   * Update a single record with support for both raw fields and AI metadata
   */
  ipcMain.handle('record:update', async (event, { id, data, aiMetaData }) => {
    try {
      console.log('[IPC:record:update] Updating record:', id)
      console.log('[IPC:record:update] Raw data:', data)
      console.log('[IPC:record:update] AI meta data:', aiMetaData)
      
      const result = await updateRecord(id, data, aiMetaData)
      
      if (!result.success) {
        return {
          success: false,
          error: result.error
        }
      }
      
      return {
        success: true,
        record: result.record
      }
    } catch (error) {
      console.error('[IPC:record:update] Error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  })

  console.log('[IPC] Handlers registered successfully')
}

/**
 * 注销 IPC 处理器
 */
export function unregisterIPCHandlers() {
  console.log('[IPC] Unregistering handlers')
  ipcMain.removeAllListeners('assistant:chat')
  ipcMain.removeAllListeners('assistant:invoke-tool')
  ipcMain.removeAllListeners('tool-execute')
  ipcMain.removeAllListeners('assistant:list-models')
  ipcMain.removeAllListeners('assistant:save-image')
  ipcMain.removeAllListeners('assistant:list-tools')
  ipcMain.removeAllListeners('assistant:analyze-intent')
  ipcMain.removeAllListeners('record:update')
}

function ensureFileExt(filePath, ext) {
  const p = String(filePath || '')
  if (/\.[a-zA-Z0-9]+$/.test(p)) return p
  return p + ext
}

function parseDataImage(src) {
  const m = String(src || '').match(/^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const b64 = m[2]
  const ext = mime === 'jpeg' ? '.jpg' : mime === 'svg+xml' ? '.svg' : `.${mime.replace('+', 'plus')}`
  return { b64, ext }
}

function downloadToFile(urlStr, outPath, maxRedirects = 4) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(urlStr) } catch { reject(new Error('Invalid URL')); return }
    const protocol = u.protocol === 'https:' ? https : http
    const req = protocol.get(u, (res) => {
      const status = res.statusCode || 0
      const loc = res.headers.location
      if ([301, 302, 303, 307, 308].includes(status) && loc && maxRedirects > 0) {
        res.resume()
        resolve(downloadToFile(new URL(loc, u).toString(), outPath, maxRedirects - 1))
        return
      }
      if (status < 200 || status >= 300) {
        let body = ''
        res.on('data', (c) => { body += c.toString() })
        res.on('end', () => reject(new Error(`HTTP ${status}: ${body}`)))
        return
      }
      const file = fs.createWriteStream(outPath)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(outPath)))
      file.on('error', (err) => {
        try { fs.unlinkSync(outPath) } catch {}
        reject(err)
      })
    })
    req.on('error', reject)
  })
}

async function saveImageToFile(src, filePath) {
  const data = parseDataImage(src)
  if (data) {
    const outPath = ensureFileExt(filePath, data.ext || '.png')
    const buf = Buffer.from(data.b64, 'base64')
    fs.writeFileSync(outPath, buf)
    return outPath
  }

  if (/^https?:\/\//i.test(src)) {
    let ext = '.png'
    try {
      const u = new URL(src)
      const fromPath = path.extname(u.pathname || '')
      if (fromPath && fromPath.length <= 6) ext = fromPath
    } catch {}
    const outPath = ensureFileExt(filePath, ext)
    await downloadToFile(src, outPath)
    return outPath
  }

  throw new Error('Unsupported image src')
}

// 定义不同 baseURL 对应的 API Key 环境变量映射
const API_KEY_MAP = {
  'https://dashscope.aliyuncs.com/compatible-mode/v1': 'DASHSCOPE_API_KEY_QWEN',
  'http://127.0.0.1:8045/v1': 'OPENAI_API_KEY',
  'https://uni-api.cstcloud.cn/v1': 'DASHSCOPE_API_KEY_SCTCLOUD',
  'https://api.openai.com/v1': 'OPENAI_API_KEY'
}

/**
 * 获取指定 baseURL 对应的 API Key
 * @param {string} baseURL - API 基础地址
 * @returns {string} - API Key
 */
function getAPIKeyForBaseURL(baseURL) {
  // 首先尝试从映射中获取对应的 API Key 环境变量名
  const envVar = API_KEY_MAP[baseURL]
  if (envVar && process.env[envVar]) {
    return process.env[envVar]
  }
  
  // 如果没有找到特定的 API Key，则回退到默认的 API Key
  return process.env.ANTI_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
}
