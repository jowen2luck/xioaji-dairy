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
import { SessionManager } from './sessionManager.js'
import { CoreMemoryManager } from './memory/coreMemory.js'
import { setGlobalCoreMemoryManager } from '../tools/coreMemory.js'
import { globalPreCallMiddleware } from './middleware/preCallMiddleware.js'
import { globalContextCompactor } from './middleware/contextCompactor.js'
import { getMemoManager } from '../memo/memoManager.js'
import dayjs from '../../utils/date.js'
import { bailianPoolManager } from '../llm/bailianPool.js'

let sessionManager = null
let coreMemoryManager = null

export function getSessionManager() {
  if (!sessionManager) {
    const userDataDir = app.getPath('userData')
    sessionManager = new SessionManager({
      storagePath: path.join(userDataDir, 'agent-sessions.json')
    })
  }
  return sessionManager
}

export function getCoreMemoryManager() {
  if (!coreMemoryManager) {
    const userDataDir = app.getPath('userData')
    coreMemoryManager = new CoreMemoryManager({
      storagePath: path.join(userDataDir, 'core-memory.json')
    })
    setGlobalCoreMemoryManager(coreMemoryManager)
  }
  return coreMemoryManager
}

/**
 * 注册所有 IPC 处理器
 * @param {object} config - 全局配置
 */
export function registerIPCHandlers(config = {}) {
  console.log('[IPC] Registering LangChain-based handlers')

  const sm = getSessionManager()
  const cm = getCoreMemoryManager()

  // 注册多会话管理 IPC
  ipcMain.handle('sessions:list', async () => sm.listSessions())
  ipcMain.handle('sessions:get', async (_event, id) => sm.getSession(id))
  ipcMain.handle('sessions:create', async (_event, payload) => sm.createSession(payload))
  ipcMain.handle('sessions:save', async (_event, session) => sm.saveSession(session))
  ipcMain.handle('sessions:delete', async (_event, id) => sm.deleteSession(id))
  ipcMain.handle('sessions:rename', async (_event, { id, title }) => sm.renameSession(id, title))
  ipcMain.handle('sessions:migrate-legacy', async (_event, { messages, reacts }) => sm.migrateLegacyData(messages, reacts))

  // 注册常驻画像内存 IPC
  ipcMain.handle('core-memory:get', async () => cm.getMemory())
  ipcMain.handle('core-memory:update', async (_event, { section, content }) => cm.updateSection(section, content))

  // 注册便签管理 IPC
  const mm = getMemoManager()
  ipcMain.handle('memos:list', async (_e, filter) => mm.listMemos(filter))
  ipcMain.handle('memos:save', async (_e, memo) => mm.upsertMemo(memo))
  ipcMain.handle('memos:delete', async (_e, id) => mm.deleteMemo(id))
  ipcMain.handle('memos:convert-to-record', async (_e, { memoId, recordOverrides }) => mm.convertToRecord(memoId, recordOverrides))
  ipcMain.handle('memos:merge-to-record', async (_e, { memoIds, recordOverrides }) => mm.mergeToRecord(memoIds, recordOverrides))

  // 注册百炼模型池状态与控制 IPC
  ipcMain.handle('bailian:get-status', async () => bailianPoolManager.getPoolSummary())
  ipcMain.handle('bailian:reset-pool', async () => {
    bailianPoolManager.resetPool()
    return bailianPoolManager.getPoolSummary()
  })

  // 活跃任务的中断控制器映射 (requestId -> AbortController)
  const activeAbortControllers = new Map()

  // 注册任务终止 IPC
  ipcMain.handle('assistant:abort', async (_event, { requestId }) => {
    console.log('[IPC:abort] Received abort request for:', requestId)
    if (!requestId) return { success: false, error: 'Missing requestId' }
    const controller = activeAbortControllers.get(requestId)
    if (controller) {
      controller.abort()
      activeAbortControllers.delete(requestId)
      console.log('[IPC:abort] Successfully aborted request:', requestId)
      return { success: true }
    }
    console.warn('[IPC:abort] No active controller found for:', requestId)
    return { success: false, message: 'Request not found or already finished' }
  })

  // 注册单条日记撤销/删除 IPC (方便前端 UI 卡片一键撤销)
  ipcMain.handle('journal:delete', async (_event, { id }) => {
    console.log('[IPC:journal:delete] Deleting journal record:', id)
    if (!id) return { success: false, error: 'Missing id' }
    const { deleteRecord } = await import('../data/index.js')
    return await deleteRecord(id)
  })

  /**
   * handler: assistant:chat
   * 主要的聊天接口，集成模型、工具和代理
   */
  ipcMain.handle('assistant:chat', async (event, payload) => {
    let effectiveRequestId = null
    try {
      const {
        sessionId,
        messages = [],
        model,
        baseURL,
        tools,
        config: userConfig,
        userQuery,
        mock,
        disableTools,
        requestId,
        extraBody
      } = payload || {}
      effectiveRequestId = requestId || `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
      const abortController = new AbortController()
      activeAbortControllers.set(effectiveRequestId, abortController)

      const pushEvent = (evt) => {
        try {
          if (effectiveRequestId) {
            event.sender.send('assistant:event', { requestId: effectiveRequestId, ...evt })
          }
        } catch {}
      }

      console.log('[IPC:chat] Received request', { sessionId, model, userQuery, effectiveRequestId })

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

      // 会话与常驻记忆管理器
      const sm = getSessionManager()
      const cm = getCoreMemoryManager()

      // 前置中间件：时间锚点、自然语言时间预解析（复用 CalendarResolverTool）、闲聊轻量检测、心头回忆嗅探
      const preCall = await globalPreCallMiddleware.process({
        userQuery,
        messages
      })

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
          'DASHSCOPE_API_KEY=' + (process.env.DASHSCOPE_API_KEY ? 'SET' : 'NOT SET'),
          'LONGCAT_API_KEY=' + (process.env.LONGCAT_API_KEY ? 'SET' : 'NOT SET')
        )
      }
      const toolRegistry = getToolRegistry()

      // 确定启用的工具：全量提供给主模型，由主模型在 ReAct 循环中基于 Function Calling 自然决策
      let rawToolNames = tools ? tools.map(t => t.function?.name || t.name).filter(Boolean) : []
      if (rawToolNames.length === 0) {
        rawToolNames = Array.from(toolRegistry.tools.keys())
      }
      // 确保核心工具始终在可用列表中
      const coreTools = [
        'create_record',
        'update_record',
        'query_records',
        'search_records',
        'sql_analysis',
        'insight_analyst',
        'calendar_resolver',
        'metadata_explorer',
        'get_record_detail',
        'update_core_memory',
        'manage_memo'
      ]
      const enabledToolNames = Array.from(new Set([...rawToolNames, ...coreTools.filter(t => toolRegistry.tools.has(t))]))

      // 意图与工具决策（方案 A：移除额外 Intent LLM 调用，毫秒级直接执行）
      let intentContext = null
      let intentTools = enabledToolNames

      if (preCall.isCasual) {
        console.log('[IPC:chat] PreCall detected casual greeting, bypassing tools')
        intentContext = {
          primary_intent: 'casual',
          suggested_pipeline: [],
          maxIterations: 1
        }
        intentTools = []
      } else {
        intentContext = {
          primary_intent: 'direct',
          standalone_query: userQuery,
          suggested_pipeline: enabledToolNames,
          maxIterations: 5
        }
      }

      console.log('[IPC:chat] Effective tools provided to agent:', intentTools)

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
        intentModel: userConfig?.intentModel,
        temperature: userConfig?.temperature ?? 0.7,
        top_p: userConfig?.top_p ?? 0.9,
        requestId: effectiveRequestId,
        eventEmitter: (evt) => pushEvent(evt),
        streamFinal: true
      })

      // 组装 System Prompt (基础提示词 + 动态时间锚点 + 长期记忆 Core Memory)
      const systemMessage = messages.find(m => m.role === 'system')
      let customSystemPrompt = systemMessage ? systemMessage.content : ''
      if (customSystemPrompt.includes('主动调用 create_record 工具将日记持久化保存入库')) {
        customSystemPrompt = customSystemPrompt.replace(
          /当用户表达记录日常的意图[^\n]*主动调用 create_record 工具将日记持久化保存入库[^\n]*\n?/g,
          '用户记录遵循双路径模型：显式指令调用 create_record；伴侣自然倾诉与吐槽调用 manage_memo(upsert) 存入便签盒并真诚倾听，绝不直接打断结案。\n'
        )
      }
      const coreMemoryPrompt = cm.renderPrompt()

      const temporalAnchorPrompt = `【系统动态时间锚点】\n- 当前系统时间: ${preCall.timeAnchor}` +
        (preCall.resolvedTime ? `\n- 用户输入所涉及时间已精准预解析为: ${JSON.stringify(preCall.resolvedTime)}` : '')

      const proactiveEchoPrompt = preCall.proactiveRecallHint || ''

      // 提取今日活跃便签列表，构建连续性上下文注入
      let todayMemosPrompt = ''
      try {
        const mm = getMemoManager()
        const todayStr = dayjs().format('YYYY-MM-DD')
        const activeMemos = mm.listMemos({ status: 'active', date: todayStr })
        if (activeMemos && activeMemos.length > 0) {
          const memoListStr = activeMemos.map((m, idx) => {
            const timeStr = m.createdAt ? dayjs(m.createdAt).format('HH:mm') : ''
            return `${idx + 1}. [${timeStr}] [${m.project || '生活'}] 《${m.topic}》(ID: ${m.id}): ${m.content}`
          }).join('\n')

          todayMemosPrompt = `【今日便签盒现有切片】（今日已有 ${activeMemos.length} 条生活切片，请维持时间线呼应与连贯性）：\n${memoListStr}\n\n- 连续性指导：若用户新倾诉的内容是上述某条便签的延续或补充，请继续传入相同 topic/memoId 增补；若是全天不同时段的新生活，开启新便签并承接时间线；若用户收尾总结，将今日所有切片按时间顺序第一人称有机融合成一篇日记。`
        }
      } catch (err) {
        console.warn('[IPC:chat] Failed to inject today memos context:', err.message)
      }

      const combinedSystemPrompt = [customSystemPrompt, temporalAnchorPrompt, todayMemosPrompt, proactiveEchoPrompt].filter(Boolean).join('\n\n')

      // 使用 ContextCompactor 组装滑动窗口(保留最近 6 条完整对白) + 历史讨论滚动摘要
      const executorMessages = globalContextCompactor.buildModelMessages({
        systemPrompt: combinedSystemPrompt,
        coreMemoryPrompt,
        messages: messages.filter(m => m.role !== 'system'),
        currentUserQuery: userQuery
      })

      console.log('[IPC:chat] Executor messages prepared:', {
        messageCount: executorMessages.length,
        userQuery,
        hasCoreMemory: !!coreMemoryPrompt,
        hasTimeAnchor: true
      })

      // 执行代理（传入意图上下文与中止信号）
      const result = await executor.execute({
        messages: executorMessages,
        systemPrompt: '',
        userQuery: userQuery,
        enabledTools: intentTools.length > 0 ? intentTools : enabledToolNames,
        maxIterations: intentContext?.maxIterations || (preCall.isCasual ? 1 : 5),
        intentContext,
        signal: abortController.signal
      })

      if (result.aborted) {
        console.log('[IPC:chat] Execution was aborted by user')
        return {
          success: true,
          data: {
            requestId: effectiveRequestId,
            content: result.content || '已停止生成。',
            aborted: true,
            toolResults: result.state?.toolResults || [],
            intentTools,
            state: result.state,
            debug: { steps: result.state?.steps }
          }
        }
      }

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          state: result.state,
        }
      }

      // 若提供了 sessionId，自动保存本轮交互与 ReAct 思维记录到会话
      if (sessionId) {
        try {
          const stepReacts = result.state?.steps || []
          sm.appendMessage(sessionId, {
            role: 'user',
            content: userQuery,
            time: new Date().toISOString()
          })
          sm.appendMessage(sessionId, {
            role: 'assistant',
            content: result.content,
            time: new Date().toISOString(),
            conversationId: payload.conversationId || `conv_${Date.now()}`
          }, stepReacts)
        } catch (sessErr) {
          console.error('[IPC:chat] Failed to auto-save to session:', sessErr)
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
    } finally {
      if (effectiveRequestId) {
        activeAbortControllers.delete(effectiveRequestId)
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
  const channels = [
    'assistant:chat',
    'assistant:invoke-tool',
    'tool-execute',
    'assistant:list-models',
    'assistant:save-image',
    'assistant:list-tools',
    'assistant:analyze-intent',
    'record:update',
    'sessions:list',
    'sessions:get',
    'sessions:create',
    'sessions:save',
    'sessions:delete',
    'sessions:rename',
    'sessions:migrate-legacy',
    'core-memory:get',
    'core-memory:update'
  ]
  for (const ch of channels) {
    try {
      ipcMain.removeHandler(ch)
      ipcMain.removeAllListeners(ch)
    } catch {}
  }
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
  'https://dashscope.aliyuncs.com/api/v1': 'DASHSCOPE_API_KEY',
  'https://llm-fxdsk6826w304s38.cn-beijing.maas.aliyuncs.com/compatible-mode/v1': 'DASHSCOPE_API_KEY',
  'http://127.0.0.1:8045/v1': 'OPENAI_API_KEY',
  'https://uni-api.cstcloud.cn/v1': 'DASHSCOPE_API_KEY_SCTCLOUD',
  'https://api.openai.com/v1': 'OPENAI_API_KEY',
  'https://api.longcat.chat/openai': 'LONGCAT_API_KEY',
  'https://api.longcat.chat/openai/v1': 'LONGCAT_API_KEY'
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
  
  // 百炼相关端点优先支持 DASHSCOPE_API_KEY 或 DASHSCOPE_API_KEY_QWEN
  if (baseURL?.includes('dashscope') || baseURL?.includes('maas.aliyuncs.com')) {
    return process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY_QWEN || process.env.ANTI_DASHSCOPE_API_KEY || ''
  }

  // 如果没有找到特定的 API Key，则回退到默认的 API Key
  return process.env.ANTI_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY_QWEN || process.env.OPENAI_API_KEY || ''
}
