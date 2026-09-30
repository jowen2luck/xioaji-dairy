import path from 'path'
import { app } from 'electron'
import dotenv from 'dotenv'

// 加载 .env 并允许覆盖系统旧环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

async function run() {
  console.log('[TestLive] Electron app ready:', app.isReady())
  console.log('[TestLive] LONGCAT_API_KEY present:', !!process.env.LONGCAT_API_KEY)
  console.log('[TestLive] Key prefix:', process.env.LONGCAT_API_KEY ? process.env.LONGCAT_API_KEY.slice(0, 10) : 'none')

  const { getToolRegistry } = await import('./src/main/tools/registry.js')
  const { AgentExecutor } = await import('./src/main/agent/executor.js')
  const { globalContextCompactor } = await import('./src/main/agent/middleware/contextCompactor.js')
  const { globalPreCallMiddleware } = await import('./src/main/agent/middleware/preCallMiddleware.js')
  const { initializeModel } = await import('./src/main/llm/models.js')

  const toolRegistry = getToolRegistry()
  const baseURL = 'https://api.longcat.chat/openai/v1'
  const model = 'LongCat-2.0'
  const userQuery = '帮我回顾一下我最近的工作与生活日记，总结一下我的状态'

  console.log('[TestLive] Processing preCallMiddleware...')
  const preCall = await globalPreCallMiddleware.process({
    userQuery,
    messages: []
  })
  console.log('[TestLive] preCall result:', { isCasual: preCall.isCasual, timeAnchor: preCall.timeAnchor })

  const rawToolNames = Array.from(toolRegistry.tools.keys())
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

  const llm = initializeModel({
    selectedBaseURL: baseURL,
    selectedModel: model,
    temperature: 0.7,
    top_p: 0.9
  })

  const executor = new AgentExecutor(llm, toolRegistry, {
    baseURL,
    apiKey: process.env.LONGCAT_API_KEY,
    model,
    temperature: 0.7,
    top_p: 0.9,
    requestId: 'test_req_' + Date.now(),
    eventEmitter: (evt) => {
      console.log('[TestLive Event]', evt.type || evt.step?.action)
    },
    streamFinal: false
  })

  const systemPrompt = `# Role: 小鸡 (Xiao Ji) - 个人记录与成长伴侣
你是一个智能日记助手与生活伙伴。
用户在自然倾诉、分享经历、抱怨吐槽时，必须调用 manage_memo(upsert) 将内容暂存进便签盒！
`

  const executorMessages = globalContextCompactor.buildModelMessages({
    systemPrompt,
    coreMemoryPrompt: '',
    messages: [],
    currentUserQuery: userQuery
  })

  console.log('[TestLive] Calling executor.execute...')
  try {
    const result = await executor.execute({
      messages: executorMessages,
      systemPrompt: '',
      userQuery: userQuery,
      enabledTools: enabledToolNames,
      maxIterations: 5,
      intentContext: {
        primary_intent: 'direct',
        standalone_query: userQuery,
        suggested_pipeline: enabledToolNames,
        maxIterations: 5
      }
    })

    console.log('[TestLive] Result success:', result.success)
    if (result.success) {
      console.log('[TestLive] Content:', result.content)
      console.log('[TestLive] Steps:', result.state?.steps?.map(s => s.action))
    } else {
      console.error('[TestLive] Error:', result.error)
    }
  } catch (err) {
    console.error('[TestLive] Execution exception:', err)
  }

  app.quit()
}

app.whenReady().then(run)
