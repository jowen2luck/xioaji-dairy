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
   * 主执行方法 - ReAct 模式
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

    console.log('[AgentExecutor] Starting ReAct execution', {
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

      // 3. ReAct 循环：持续推理和行动直到得出最终答案
      let currentMessages = [...formattedMessages]
      let iteration = 0

      while (iteration < maxIterations) {
        iteration++
        console.log(`[AgentExecutor] === ReAct Iteration ${iteration}/${maxIterations} ===`)
        this.state.iteration = iteration

        // 3.1 调用 LLM（带工具）
        console.log(`[AgentExecutor] Iteration ${iteration}: Calling LLM with tools`)
        const response = await this.executeWithTools(currentMessages, tools)

        // 3.2 检查是否有工具调用
        const toolCalls = this.extractToolCalls(response)

        if (!toolCalls || toolCalls.length === 0) {
          // 没有工具调用 = LLM 认为已经有足够信息给出最终答案
          console.log(`[AgentExecutor] Iteration ${iteration}: No tool calls, task complete`)
          const content = this.extractContent(response)

          // 记录本轮步骤
          this.state.steps.push({
            iteration,
            action: 'final_answer',
            reasoning: content
          })

          return {
            success: true,
            content,
            raw: response,
            state: this.state,
            duration: Date.now() - startTime
          }
        }

        // 3.3 执行工具调用
        console.log(`[AgentExecutor] Iteration ${iteration}: Executing ${toolCalls.length} tool(s)`)
        const toolResults = await this.handleToolCalls(toolCalls)

        // 记录本轮步骤
        this.state.steps.push({
          iteration,
          action: 'tool_calls',
          tools: toolCalls.map(tc => tc.name),
          results: toolResults
        })

        // 3.4 将工具调用和结果添加到消息历史
        currentMessages.push({
          role: 'assistant',
          content: response.content || '我需要使用工具来获取信息。',
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
            }
          }))
        })

        // 3.5 添加工具结果（返回数组，需要展开）
        const toolResultMessages = this.buildToolResultMessage(toolResults)
        currentMessages.push(...toolResultMessages)  // 使用展开运算符
        this.state.messageHistory = currentMessages

        console.log(`[AgentExecutor] Iteration ${iteration}: Tool results added, continuing to next iteration`)
      }

      // 达到最大迭代次数，强制要求 LLM 给出最终答案
      console.log(`[AgentExecutor] Max iterations (${maxIterations}) reached, forcing final answer`)
      
      currentMessages.push({
        role: 'user',
        content: '请基于以上信息给出最终答案，不要再调用工具。'
      })

      const finalResponse = await this.executeWithTools(currentMessages, [])
      const finalContent = this.extractContent(finalResponse)

      return {
        success: true,
        content: finalContent,
        raw: finalResponse,
        state: this.state,
        duration: Date.now() - startTime,
        maxIterationsReached: true
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
      console.log('[AgentExecutor] Calling LLM with params:', {
        messageCount: messages.length,
        toolCount: tools?.length || 0
      })

      let response
      
      // 如果有工具，使用直接 API 调用
      if (tools && tools.length > 0) {
        console.log('[AgentExecutor] Using direct API call with tools:', tools.map(t => t.function.name))
        
        // 导入直接 API 调用函数
        const { callOpenAIAPI } = await import('../llm/directOpenAI.js')
        
        const apiResponse = await callOpenAIAPI({
          baseURL: this.config.baseURL || this.config.selectedBaseURL,
          model: this.config.model || this.config.selectedModel,
          messages: messages,
          tools: tools,
          temperature: this.config.temperature,
          top_p: this.config.top_p
        })
        
        // 转换为 LangChain 格式
        response = {
          content: apiResponse.content || '',
          tool_calls: apiResponse.tool_calls || [],
          raw: apiResponse
        }
        
        console.log('[AgentExecutor] Direct API response:', {
          hasContent: !!response.content,
          hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0)
        })
      } else {
        // 没有工具，使用 LangChain 调用
        response = await this.llm.invoke(messages)
      }

      console.log('[AgentExecutor] LLM response received:', {
        hasContent: !!response.content,
        hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0),
        responseKeys: Object.keys(response)
      })
      
      // 输出完整响应用于调试
      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log('[AgentExecutor] Tool calls detected:', JSON.stringify(response.tool_calls, null, 2))
      }

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
   * 构建工具结果消息（OpenAI 格式）
   * @param {Array} toolResults - 工具调用结果
   * @returns {Array} 消息对象数组（每个工具调用对应一个 tool 消息）
   */
  buildToolResultMessage(toolResults) {
    // OpenAI API 要求：每个 tool_call 必须有对应的 tool 消息
    return toolResults.map(r => {
      const status = r.success ? '✓' : '✗'
      const resultText = typeof r.result === 'string' 
        ? r.result 
        : JSON.stringify(r.result, null, 2)
      
      return {
        role: 'tool',
        tool_call_id: r.id,  // 必须匹配 tool_call 的 id
        content: `${status} ${r.name}:\n${resultText}`
      }
    })
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
