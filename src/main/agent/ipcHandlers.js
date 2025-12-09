/**
 * IPC 处理器 - LangChain 集成版本（增强意图分析）
 * 将 IPC 事件映射到代理执行
 */

import { ipcMain } from 'electron'
import { initializeModel } from '../llm/models.js'
import { getToolRegistry } from '../tools/registry.js'
import { AgentExecutor } from './executor.js'
import { analyzeIntent, analyzeIntentWithLLM } from '../intent/analyzer.js'

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
          
          intentContext = await analyzeIntentWithLLM(userQuery, intentLLM)
          
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

        const response = await llm.invoke(messages)
        const content = response.content || response.choices?.[0]?.message?.content || ''

        return {
          success: true,
          data: {
            content: content,  // 添加 content 字段
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

      // 执行代理（传入意图上下文）
      const result = await executor.execute({
        messages, // 直接使用前端发送的消息（已包含 system prompt）
        systemPrompt: '', // 不重复添加 system prompt
        userQuery,
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
  ipcMain.removeAllListeners('tool-execute')
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
