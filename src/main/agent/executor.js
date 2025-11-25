/**
 * AgentExecutor - 智能助手执行引擎
 * 职责：协调 LLM、工具调用和消息流处理
 */

/**
 * Agent 执行器类
 * 管理完整的对话流程：意图理解 → 工具调用 → 结果综合
 */
export class AgentExecutor {
  /**
   * @param {Object} llm - LLM 实例（支持 invoke 方法）
   * @param {Object} toolRegistry - 工具注册表
   * @param {Object} config - 配置参数
   */
  constructor(llm, toolRegistry, config = {}) {
    this.llm = llm
    this.toolRegistry = toolRegistry
    this.config = {
      baseURL: config.baseURL || '',
      apiKey: config.apiKey || '',
      model: config.model || 'qwen-plus',
      temperature: config.temperature ?? 0.7,
      top_p: config.top_p ?? 0.9,
      maxIterations: config.maxIterations || 3,
      ...config
    }

    // 初始化状态
    this.resetState()
  }

  /**
   * 重置执行状态
   */
  resetState() {
    this.state = {
      iteration: 0,
      maxIterations: this.config.maxIterations,
      toolResults: [],
      steps: [],
      messageHistory: [],
      errors: []
    }
  }

  /**
   * 主执行方法
   * @param {Object} params - 执行参数
   * @param {Array} params.messages - 消息历史
   * @param {String} params.systemPrompt - 系统提示词
   * @param {String} params.userQuery - 用户查询
   * @param {Array} params.enabledTools - 启用的工具列表
   * @param {Number} params.maxIterations - 最大迭代次数
   * @returns {Object} { success, content, raw, state }
   */
  async execute(params) {
    const {
      messages = [],
      systemPrompt = '',
      userQuery = '',
      enabledTools = [],
      maxIterations = 3
    } = params

    console.log('[AgentExecutor] Starting execution', {
      userQuery,
      enabledTools,
      maxIterations
    })

    // 重置状态
    this.resetState()
    this.state.maxIterations = maxIterations

    const startTime = Date.now()

    try {
      // 1. 格式化消息
      const formattedMessages = this.formatMessages(messages, systemPrompt)
      this.state.messageHistory = [...formattedMessages]

      // 2. 获取可用工具
      const tools = this.buildToolsForLLM(enabledTools)

      // 3. 第一次调用 LLM（带工具）
      console.log('[AgentExecutor] First LLM call with tools')
      const firstResponse = await this.executeWithTools(formattedMessages, tools)

      // 4. 处理工具调用
      const toolCalls = this.extractToolCalls(firstResponse)
      
      if (!toolCalls || toolCalls.length === 0) {
        // 没有工具调用，直接返回结果
        console.log('[AgentExecutor] No tool calls, returning direct response')
        const content = this.extractContent(firstResponse)
        
        return {
          success: true,
          content,
          raw: firstResponse,
          state: this.state,
          duration: Date.now() - startTime
        }
      }

      // 5. 执行工具调用
      console.log('[AgentExecutor] Executing tool calls', toolCalls.length)
      const toolResults = await this.handleToolCalls(toolCalls)
      this.state.toolResults = toolResults

      // 6. 构建工具结果消息
      const toolResultMessage = this.buildToolResultMessage(toolResults)
      this.state.messageHistory.push(toolResultMessage)

      // 7. 返回结果（不再调用第二次 LLM，由上层决定）
      return {
        success: true,
        content: '',  // 工具调用阶段不生成最终内容
        raw: firstResponse,
        state: this.state,
        duration: Date.now() - startTime
      }

    } catch (error) {
      console.error('[AgentExecutor] Execution error:', error)
      this.state.errors.push({
        type: 'execution',
        message: error.message,
        stack: error.stack
      })

      return {
        success: false,
        error: error.message,
        state: this.state,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 调用 LLM 并处理工具调用
   * @param {Array} messages - 消息列表
   * @param {Array} tools - 工具定义
   * @returns {Promise<Object>} LLM 响应
   */
  async executeWithTools(messages, tools) {
    try {
      // 构建 LLM 调用参数
      const params = {
        messages,
        temperature: this.config.temperature,
        top_p: this.config.top_p
      }

      // 如果有工具，添加到参数中
      if (tools && tools.length > 0) {
        params.tools = tools
        params.tool_choice = 'auto'
      }

      console.log('[AgentExecutor] Calling LLM with params:', {
        messageCount: messages.length,
        toolCount: tools?.length || 0
      })

      // 调用 LLM
      const response = await this.llm.invoke(messages)

      console.log('[AgentExecutor] LLM response received:', {
        hasContent: !!response.content,
        hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0)
      })

      return response

    } catch (error) {
      console.error('[AgentExecutor] LLM call error:', error)
      throw new Error(`LLM 调用失败: ${error.message}`)
    }
  }

  /**
   * 批量执行工具调用
   * @param {Array} toolCalls - 工具调用请求列表
   * @returns {Promise<Array>} 工具调用结果
   */
  async handleToolCalls(toolCalls) {
    const results = []

    for (const call of toolCalls) {
      const { id, name, args } = call

      console.log(`[AgentExecutor] Executing tool: ${name}`, args)

      try {
        // 验证工具是否存在
        const tool = this.toolRegistry.get(name)
        if (!tool) {
          throw new Error(`Tool '${name}' not found in registry`)
        }

        // 解析参数（可能是 JSON 字符串）
        let parsedArgs = args
        if (typeof args === 'string') {
          try {
            parsedArgs = JSON.parse(args)
          } catch (e) {
            console.warn(`[AgentExecutor] Failed to parse tool args as JSON, using as-is`)
          }
        }

        // 调用工具
        const result = await this.toolRegistry.invokeTool(name, parsedArgs || {})

        results.push({
          id,
          name,
          result,
          success: true
        })

        console.log(`[AgentExecutor] Tool ${name} executed successfully`)

      } catch (error) {
        console.error(`[AgentExecutor] Tool ${name} execution failed:`, error)

        // 记录错误但继续执行其他工具
        results.push({
          id,
          name,
          result: { error: error.message },
          success: false
        })

        this.state.errors.push({
          type: 'tool_call',
          tool: name,
          message: error.message
        })
      }
    }

    return results
  }

  /**
   * 格式化消息为 LLM 输入格式
   * @param {Array} messages - 原始消息
   * @param {String} systemPrompt - 系统提示词
   * @returns {Array} 格式化后的消息
   */
  formatMessages(messages, systemPrompt) {
    const formatted = []

    // 添加系统提示词（如果提供且未包含在 messages 中）
    if (systemPrompt && !messages.some(m => m.role === 'system')) {
      formatted.push({
        role: 'system',
        content: systemPrompt
      })
    }

    // 添加其他消息
    formatted.push(...messages)

    return formatted
  }

  /**
   * 从 LLM 响应中提取工具调用
   * @param {Object} response - LLM 响应
   * @returns {Array|null} 工具调用列表
   */
  extractToolCalls(response) {
    // 检查标准的 tool_calls 字段
    if (response.tool_calls && Array.isArray(response.tool_calls)) {
      return response.tool_calls.map(call => ({
        id: call.id || `call_${Date.now()}`,
        name: call.function?.name || call.name,
        args: call.function?.arguments || call.args || {}
      }))
    }

    // 检查嵌套的 message.tool_calls
    if (response.message?.tool_calls && Array.isArray(response.message.tool_calls)) {
      return response.message.tool_calls.map(call => ({
        id: call.id || `call_${Date.now()}`,
        name: call.function?.name || call.name,
        args: call.function?.arguments || call.args || {}
      }))
    }

    // 检查 choices 格式
    if (response.choices && response.choices[0]?.message?.tool_calls) {
      return response.choices[0].message.tool_calls.map(call => ({
        id: call.id || `call_${Date.now()}`,
        name: call.function?.name || call.name,
        args: call.function?.arguments || call.args || {}
      }))
    }

    return null
  }

  /**
   * 提取 LLM 响应的文本内容
   * @param {Object} response - LLM 响应
   * @returns {String} 文本内容
   */
  extractContent(response) {
    // 直接的 content 字段
    if (response.content) {
      return response.content
    }

    // message.content
    if (response.message?.content) {
      return response.message.content
    }

    // choices 格式
    if (response.choices && response.choices[0]?.message?.content) {
      return response.choices[0].message.content
    }

    return ''
  }

  /**
   * 构建工具结果消息
   * @param {Array} toolResults - 工具调用结果
   * @returns {Object} 消息对象
   */
  buildToolResultMessage(toolResults) {
    const resultsText = toolResults.map(r => {
      const status = r.success ? '✓' : '✗'
      const resultText = typeof r.result === 'string' 
        ? r.result 
        : JSON.stringify(r.result, null, 2)
      
      return `${status} ${r.name}:\n${resultText}`
    }).join('\n\n')

    return {
      role: 'tool',
      content: `工具调用结果：\n\n${resultsText}`
    }
  }

  /**
   * 构建 LLM 工具定义
   * @param {Array} enabledTools - 启用的工具名称列表
   * @returns {Array} 工具定义
   */
  buildToolsForLLM(enabledTools) {
    if (!enabledTools || enabledTools.length === 0) {
      return []
    }

    const tools = []

    for (const toolName of enabledTools) {
      const tool = this.toolRegistry.get(toolName)
      if (tool) {
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.schema
          }
        })
      } else {
        console.warn(`[AgentExecutor] Tool '${toolName}' not found in registry`)
      }
    }

    return tools
  }
}
