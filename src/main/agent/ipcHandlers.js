/**
 * IPC 处理器 - LangChain 集成版本
 * 将 IPC 事件映射到代理执行
 */

import { ipcMain } from 'electron'
import { initializeModel } from '../llm/models.js'
import { getToolRegistry } from '../tools/registry.js'
import { AgentExecutor } from './executor.js'
import { analyzeIntent } from '../intent/analyzer.js'

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
      const { messages = [], model, baseURL, tools, config: userConfig, userQuery, mock, disableTools } = payload || {}

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
      console.log('[IPC:chat] API Key present:', !!process.env.DASHSCOPE_API_KEY || !!process.env.OPENAI_API_KEY)
      const toolRegistry = getToolRegistry()

      // 确定启用的工具
      const enabledToolNames = tools ? tools.map(t => t.function?.name || t.name).filter(Boolean) : []

      // 意图分析
      const intentTools = userQuery ? analyzeIntent(userQuery, enabledToolNames) : []

      console.log('[IPC:chat] Enabled tools:', enabledToolNames)
      console.log('[IPC:chat] Intended tools:', intentTools)

      // 如果禁用工具，直接调用 LLM
      if (disableTools === true) {
        console.log('[IPC:chat] Tools disabled, calling LLM only')

        const response = await llm.invoke(messages)
        const content = response.content || response.choices?.[0]?.message?.content || ''

        return {
          success: true,
          data: {
            raw: response,
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
        temperature: userConfig?.temperature ?? 0.7,
        top_p: userConfig?.top_p ?? 0.9,
      })

      // 执行代理
      const result = await executor.execute({
        messages, // 直接使用前端发送的消息（已包含 system prompt）
        systemPrompt: '', // 不重复添加 system prompt
        userQuery,
        enabledTools: intentTools.length > 0 ? intentTools : enabledToolNames,
        maxIterations: 3,
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
          raw: result.raw || { choices: [{ message: { content: result.content } }] },
          toolResults: result.state.toolResults || [],
          intentTools,
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
   * handler: assistant:list-models
   * 列出可用的模型和 API 端点
   */
  ipcMain.handle('assistant:list-models', async () => {
    return [
      {
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['qwen-plus-2025-09-11', 'qvq-max-2025-05-15', 'qwen3-max-2025-09-23', 'qwen3-next-80b-a3b-instruct', 'qwen-flash-2025-07-28', 'qwen-flash'],
      },
      {
        url: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      },
    ]
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

  console.log('[IPC] Handlers registered successfully')
}

/**
 * 注销 IPC 处理器
 */
export function unregisterIPCHandlers() {
  console.log('[IPC] Unregistering handlers')
  ipcMain.removeAllListeners('assistant:chat')
  ipcMain.removeAllListeners('assistant:invoke-tool')
  ipcMain.removeAllListeners('assistant:list-models')
  ipcMain.removeAllListeners('assistant:list-tools')
  ipcMain.removeAllListeners('assistant:analyze-intent')
}

// 定义不同 baseURL 对应的 API Key 环境变量映射
const API_KEY_MAP = {
  'https://dashscope.aliyuncs.com/compatible-mode/v1': 'DASHSCOPE_API_KEY_QWEN',
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
  return process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
}
