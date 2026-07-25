/**
 * AgentExecutor - 智能助手执行引擎
 * 职责：协调意图分析、LLM、工具调用和消息流处理
 * 
 * 优化要点：
 * 1. 集成结构化意图分析，提前解析时间语义和实体
 * 2. 根据意图复杂度动态调整最大迭代次数
 * 3. 支持短路逻辑，闲聊问候直接返回不调用工具
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
      intentModel: config.intentModel || config.model || 'qwen-plus', // 意图识别模型
      temperature: config.temperature ?? 0.7,
      top_p: config.top_p ?? 0.9,
      maxIterations: config.maxIterations || 3,
      eventEmitter: config.eventEmitter,
      requestId: config.requestId,
      streamFinal: config.streamFinal ?? true,
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
    this._finalStreamStarted = false
  }

  emit(type, data) {
    const fn = this.config.eventEmitter
    if (typeof fn !== 'function') return
    try {
      fn({ type, data })
    } catch {}
  }

  /**
   * 主执行方法 - ReAct 模式（增强版）
   * @param {Object} params - 执行参数
   * @param {Array} params.messages - 消息历史
   * @param {String} params.systemPrompt - 系统提示词
   * @param {String} params.userQuery - 用户查询
   * @param {Array} params.enabledTools - 启用的工具列表
   * @param {Number} params.maxIterations - 最大迭代次数
   * @param {Object} params.intentContext - （可选）结构化意图上下文
   * @returns {Object} { success, content, raw, state, intentContext }
   */
  async execute(params) {
    const {
      messages = [],
      systemPrompt = '',
      userQuery = '',
      enabledTools = [],
      maxIterations = 3,
      intentContext = null  // 新增：结构化意图上下文
    } = params

    console.log('[AgentExecutor] Starting ReAct execution', {
      userQuery,
      enabledTools,
      maxIterations,
      hasIntentContext: !!intentContext
    })

    // 重置状态
    this.resetState()
    
    // 如果有意图上下文，优先使用其推荐的迭代次数
    const effectiveMaxIterations = intentContext?.maxIterations || maxIterations
    this.state.maxIterations = effectiveMaxIterations
    
    // 【改进】闲聊处理：不调用工具，但仍然要用 LLM 回答用户问题
    // 移除固定回答，让 LLM 直接处理用户的闲聊问题
    let effectiveEnabledTools = enabledTools
    if (intentContext?.primary_intent === 'casual') {
      console.log('[AgentExecutor] Detected casual intent, skipping data query tools')
      effectiveEnabledTools = [] // 不使用任何工具
    } else {
      effectiveEnabledTools = enabledTools
    }

    const startTime = Date.now()

    try {
      // 1. 格式化消息
      const formattedMessages = this.formatMessages(messages, systemPrompt)
      this.state.messageHistory = [...formattedMessages]

      // 2. 获取可用工具
      const tools = this.buildToolsForLLM(effectiveEnabledTools)

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

        // 提取 LLM 在这一轮的思考内容和推理
        const reasoning = this.extractContent(response)
        const reasoningContent = response.reasoning_content  // 新增：深度思考推理过程
        
        if (!toolCalls || toolCalls.length === 0) {
          // 没有工具调用 = LLM 认为已经有足够信息给出最终答案
          console.log(`[AgentExecutor] Iteration ${iteration}: No tool calls, task complete`)

          // 记录本轮步骤（最终答案）
          this.state.steps.push({
            iteration,
            action: 'final_answer',
            reasoning: reasoning,
            reasoning_content: reasoningContent,  // 新增：推理过程
            timestamp: new Date().toISOString()
          })

          this.emit('step', {
            step: {
              iteration,
              action: 'final_answer',
              reasoning: '已生成最终回复',
              reasoning_content: reasoningContent,
              timestamp: new Date().toISOString()
            }
          })

          return {
            success: true,
            content: reasoning,
            reasoning_content: reasoningContent,  // 新增：返回推理内容
            raw: response,
            state: this.state,
            intentContext,  // 返回意图上下文
            duration: Date.now() - startTime
          }
        }

        // 3.3 执行工具调用
        console.log(`[AgentExecutor] Iteration ${iteration}: Executing ${toolCalls.length} tool(s)`)
        console.log(`[AgentExecutor] LLM reasoning before tool call:`, reasoning || '(无显式推理)')

        const toolDescriptors = toolCalls.map(tc => {
          try {
            return {
              name: tc.name,
              args: typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args
            }
          } catch (e) {
            return {
              name: tc.name,
              args: { raw: tc.args, error: 'Invalid JSON' }
            }
          }
        })

        this.emit('step', {
          step: {
            iteration,
            action: 'thinking',
            reasoning: reasoning || `需要使用工具 ${toolCalls.map(tc => tc.name).join('、')} 来获取信息`,
            reasoning_content: reasoningContent,
            tools: toolDescriptors,
            timestamp: new Date().toISOString()
          }
        })

        const toolResults = await this.handleToolCalls(toolCalls)

        // 记录本轮步骤（包含思考内容、工具调用和结果）
        this.state.steps.push({
          iteration,
          action: 'tool_calls',
          reasoning: reasoning || `需要使用工具 ${toolCalls.map(tc => tc.name).join('、')} 来获取信息`,
          reasoning_content: reasoningContent,  // 新增：推理过程
          tools: toolDescriptors,
          results: toolResults,
          timestamp: new Date().toISOString()
        })

        this.emit('step', {
          step: {
            iteration,
            action: 'tool_calls',
            reasoning: reasoning || `需要使用工具 ${toolCalls.map(tc => tc.name).join('、')} 来获取信息`,
            reasoning_content: reasoningContent,
            tools: toolDescriptors,
            results: toolResults,
            timestamp: new Date().toISOString()
          }
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
      const finalReasoningContent = finalResponse.reasoning_content  // 新增：最终推理过程

      return {
        success: true,
        content: finalContent,
        reasoning_content: finalReasoningContent,  // 新增：返回推理内容
        raw: finalResponse,
        state: this.state,
        intentContext,  // 返回意图上下文
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

      this.emit('error', { message: error.message, timestamp: new Date().toISOString() })

      return {
        success: false,
        error: error.message,
        state: this.state,
        intentContext,  // 即使错误也返回意图上下文
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
          top_p: this.config.top_p,
          enableThinking: false  // 禁用深度思考（与函数调用不兼容）
        })
        
        // 转换为 LangChain 格式
        response = {
          content: apiResponse.content || '',
          tool_calls: apiResponse.tool_calls || [],
          reasoning_content: apiResponse.reasoning_content,  // 新增：推理内容
          raw: apiResponse
        }
        
        console.log('[AgentExecutor] Direct API response:', {
          hasContent: !!response.content,
          hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0),
          hasReasoning: !!response.reasoning_content  // 记录推理内容
        })
      } else {
        const { callOpenAIAPI } = await import('../llm/directOpenAI.js')
        if (this.config.streamFinal && this.config.eventEmitter && !this._finalStreamStarted) {
          this._finalStreamStarted = true
          this.emit('final_start', { timestamp: new Date().toISOString() })
        }
        const apiResponse = await callOpenAIAPI({
          baseURL: this.config.baseURL || this.config.selectedBaseURL,
          model: this.config.model || this.config.selectedModel,
          messages: messages,
          tools: [],
          temperature: this.config.temperature,
          top_p: this.config.top_p,
          enableThinking: false,
          onContentDelta: this.config.streamFinal && this.config.eventEmitter
            ? (delta) => this.emit('final_delta', { delta })
            : undefined
        })
        if (this.config.streamFinal && this.config.eventEmitter) {
          this.emit('final_end', { timestamp: new Date().toISOString() })
        }

        response = {
          content: apiResponse.content || '',
          tool_calls: apiResponse.tool_calls || [],
          reasoning_content: apiResponse.reasoning_content,
          raw: apiResponse
        }
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
      
      if (response.reasoning_content) {
        console.log('[AgentExecutor] Reasoning content:', response.reasoning_content.substring(0, 200))
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
   * @param {Object} intentContext - 意图上下文
   * @returns {Array} 格式化后的消息
   */
  formatMessages(messages, systemPrompt, intentContext) {
    const formatted = []

    // 【核心改进】Agent 执行的强制性指令
    // 这些指令确保 Agent 遵守正确的时间处理流程
    const coreInstruction = `
你是一个智能日记助手。

【思维链（Chain of Thought）】
在回答用户之前，请务必执行以下思考步骤：
1. **需求分析**：用户是在查询数据、修改记录还是闲聊？
2. **工具决策**：如果是查询或修改，**必须**使用工具。不要依赖你的训练数据，因为你看不到用户的私人日记。
3. **参数提取**：从用户输入中提取时间、关键词等参数。
4. **行动执行**：调用相应的工具。

【核心原则】
1. **数据事实性**：严禁编造日记内容。所有分析必须基于 \`sql_analysis\` 或 \`query_records\` 等工具的返回结果。
2. **时间严谨性**：如果用户提到相对时间（如"上周"、"昨天"、"最近"），**必须第一步调用 calendar_resolver 工具**获取精确的 ISO 日期范围。严禁自己估算日期。
3. **循序渐进**：不要尝试在一个步骤中完成所有操作。先获取时间/元数据，拿到结果后再调用查询工具。
4. **工具优先**：当用户询问"有没有"、"是多少"、"什么时候"时，倾向于先调用工具查询，而不是直接回答。
5. **工具链路**：先用 \`metadata_explorer\` 核对人物/项目/标签的准确值，再用 \`query_records\` 或 \`sql_analysis\` 做检索与基础统计，最后才用 \`insight_analyst\` 做深度关联与规律分析。
6. **边界清晰**：\`sql_analysis\` 只做客观统计；\`insight_analyst\` 只做模式与关联分析；\`metadata_explorer\` 只做元数据查找。
7. **前置依赖**：\`sql_analysis\` 的 mood_distribution/energy_trend/content_type_ratio/life_composition 需要 AI 元数据；缺失时先提示需要运行 AI 元数据处理。
`

    // 注入意图上下文（如果有）
    // 这能极大帮助 LLM 理解当前任务，而不需要翻阅历史
    let intentPrompt = ''
    if (intentContext) {
      intentPrompt = `
【意图分析报告】
- 原始查询: "${intentContext.original_query || ''}"
- 独立查询: "${intentContext.standalone_query || ''}"
- 识别意图: ${intentContext.primary_intent}
- 推荐工具: ${intentContext.suggested_pipeline?.join(', ') || '无'}
- 提取实体: ${JSON.stringify(intentContext.entities || {})}

请参考上述分析结果，优先使用推荐的工具完成任务。
`
    }

    // 添加系统提示词
    const effectiveSystemPrompt = (systemPrompt || '') + coreInstruction + intentPrompt

    if (!messages.some(m => m.role === 'system')) {
      formatted.push({
        role: 'system',
        content: effectiveSystemPrompt
      })
    }

    // 【关键】直接添加传入的消息
    // 注意：由于 IPC 层已经切断了历史，这里的 messages 通常只有 1-2 条
    // 这个干净的消息列表确保 LLM 必须调用工具来获取信息
    formatted.push(...messages)

    console.log('[AgentExecutor] formatMessages result:', {
      totalMessages: formatted.length,
      hasSystem: formatted.some(m => m.role === 'system'),
      userMessages: formatted.filter(m => m.role === 'user').length,
      structure: formatted.map(m => `${m.role}(${m.content?.slice(0, 30)}...)`)
    })

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
