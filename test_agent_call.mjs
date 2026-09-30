import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { getToolRegistry } from './src/main/tools/registry.js'
import { callOpenAIAPI } from './src/main/llm/directOpenAI.js'

// 加载 .env
dotenv.config({ path: './.env' })

async function run() {
  const toolRegistry = getToolRegistry()
  const enabledToolNames = [
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

  const tools = enabledToolNames.map(name => {
    const tool = toolRegistry.get(name)
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema
      }
    }
  })

  console.log(`Prepared ${tools.length} tools. Total tools JSON size: ${JSON.stringify(tools).length} chars`)

  const systemPrompt = `你是一个智能日记助手与生活伙伴。
【思维链（Chain of Thought）】
在回应用户之前，请务必执行以下思考步骤：
1. **意图判断**：
   - 【显式记日记】：用户明确表达“帮我记一下”、“今天日记写...”、“记入日记本”等明确的记录指令。
   - 【伴侣倾听与日常漫谈】：用户在长篇大论倾诉日常、分享经历、抱怨吐槽、宣泄情绪或随意闲聊，没有明确说“记日记”。
2. **工具决策与执行原则**：
   - 当用户自然倾诉、分享经历时，必须调用 manage_memo(upsert)
`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '今天感觉有点累，秋招准备得很疲惫。' }
  ]

  console.log('Calling callOpenAIAPI with LongCat-2.0 and all 11 tools...')
  try {
    const res = await callOpenAIAPI({
      baseURL: 'https://api.longcat.chat/openai/v1',
      model: 'LongCat-2.0',
      messages,
      tools,
      temperature: 0.7,
      top_p: 0.9,
      enableThinking: false
    })
    console.log('SUCCESS! Content length:', res.content?.length, 'Tool calls:', res.tool_calls?.length)
    console.log('Tool calls:', JSON.stringify(res.tool_calls, null, 2))
    console.log('Content:', res.content)
  } catch (err) {
    console.error('FAILED with error:', err.message)
  }
}

run()
