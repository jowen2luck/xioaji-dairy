/**
 * 直接调用 OpenAI 兼容 API，绕过 LangChain 的可能问题
 * 支持深度思考功能 (enable_thinking)
 */

import https from 'https'
import http from 'http'

// 定义不同 baseURL 对应的 API Key 环境变量映射
const API_KEY_MAP = {
  'https://dashscope.aliyuncs.com/compatible-mode/v1': 'DASHSCOPE_API_KEY_QWEN',
  'https://dashscope.aliyuncs.com/api/v1': 'DASHSCOPE_API_KEY',  // 新增：百炼 API 端点
  'https://uni-api.cstcloud.cn/v1': 'DASHSCOPE_API_KEY_SCTCLOUD',
  'http://127.0.0.1:8045/v1': 'OPENAI_API_KEY',
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

function isImageModel(model) {
  const m = String(model || '').toLowerCase()
  return m.includes('pro-image') || /(^|-)image($|-)/.test(m)
}

function extractImageFromText(text) {
  const s = String(text || '')
  const md = s.match(/!\[[^\]]*?\]\((.*?)\)/)
  if (md && md[1]) return md[1].trim()
  const data = s.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/)
  if (data) return data[0]
  const url = s.match(/https?:\/\/[^\s)\"']+/)
  if (url) return url[0]
  return null
}

function extractImageFromResponse(obj) {
  if (!obj || typeof obj !== 'object') return null

  const directText =
    obj?.output?.choices?.[0]?.message?.content ??
    obj?.choices?.[0]?.message?.content ??
    obj?.content

  if (typeof directText === 'string') {
    const src = extractImageFromText(directText)
    if (src) return { src, via: 'message.content' }
    try {
      const parsed = JSON.parse(directText)
      const nested = extractImageFromResponse(parsed)
      if (nested) return nested
    } catch {}
  }

  const data = obj.data
  if (Array.isArray(data) && data.length > 0) {
    const b64Json = data[0]?.b64_json
    if (typeof b64Json === 'string' && b64Json.length > 50) {
      return { src: `data:image/png;base64,${b64Json}`, via: 'b64_json' }
    }
    const url = data[0]?.url
    if (typeof url === 'string' && url.startsWith('http')) {
      return { src: url, via: 'url' }
    }
  }

  if (typeof obj.b64_json === 'string' && obj.b64_json.length > 50) {
    return { src: `data:image/png;base64,${obj.b64_json}`, via: 'b64_json' }
  }
  if (typeof obj.url === 'string' && obj.url.startsWith('http')) {
    return { src: obj.url, via: 'url' }
  }

  const visited = new Set()
  const queue = [{ v: obj, depth: 0 }]
  while (queue.length > 0) {
    const { v, depth } = queue.shift()
    if (v == null || depth > 6) continue

    if (typeof v === 'string') {
      const src = extractImageFromText(v)
      if (src) return { src, via: 'scan:string' }
      continue
    }

    if (typeof v !== 'object') continue
    if (visited.has(v)) continue
    visited.add(v)

    if (Array.isArray(v)) {
      for (const vv of v) queue.push({ v: vv, depth: depth + 1 })
      continue
    }

    if (typeof v.b64_json === 'string' && v.b64_json.length > 50) {
      return { src: `data:image/png;base64,${v.b64_json}`, via: 'scan:b64_json' }
    }
    if (typeof v.url === 'string' && v.url.startsWith('http')) {
      return { src: v.url, via: 'scan:url' }
    }
    for (const vv of Object.values(v)) queue.push({ v: vv, depth: depth + 1 })
  }

  return null
}

/**
 * 直接调用 OpenAI 兼容 API
 * @param {object} config - 配置对象
 * @param {string} config.baseURL - API 基础地址
 * @param {string} config.apiKey - API 密钥（可选，默认从环境变量读取）
 * @param {string} config.model - 模型名称
 * @param {Array} config.messages - 消息列表
 * @param {Array} config.tools - 工具列表（可选）
 * @param {number} config.temperature - 温度参数（可选）
 * @param {number} config.top_p - Top P 参数（可选）
 * @param {boolean} config.enableThinking - 启用深度思考（可选）
 * @returns {Promise<object>} - API 响应
 */
export async function callOpenAIAPI(options) {
  const {
    baseURL: baseURLOrigin,
    model,
    messages,
    tools = [],
    temperature = 0.7,
    top_p = 0.9,
    apiKey: providedApiKey,
    enableThinking = false,  // 新增：深度思考参数
    maxRetries = 2,  // 添加重试参数
    onContentDelta,
    onReasoningDelta,
    onToolCallsDelta,
    extraBody,
    stream,
  } = options

  // 获取 API 密钥
  const apiKey = providedApiKey || getAPIKeyForBaseURL(baseURLOrigin)
  if (!apiKey) {
    throw new Error('Missing API key')
  }

  // 解析和验证 baseURL
  let url
  try {
    // 根据 baseURL 的不同格式构建正确的 URL
    if (baseURLOrigin.includes('/v1/chat/completions')) {
      // 已经是完整的端点
      url = new URL(baseURLOrigin)
    } else if (baseURLOrigin.includes('/v1')) {
      // 包含 /v1，直接拼接
      url = new URL(baseURLOrigin + '/chat/completions')
    } else if (baseURLOrigin.includes('/compatible-mode')) {
      // 包含 /compatible-mode，需要添加 /v1
      url = new URL(baseURLOrigin + '/chat/completions')
    } else {
      // 其他情况，探测是不是以 / 结尾，然后添加 /v1/chat/completions
      const base = baseURLOrigin.endsWith('/') ? baseURLOrigin.slice(0, -1) : baseURLOrigin
      url = new URL(base + '/v1/chat/completions')
    }
  } catch (e) {
    throw new Error(`Invalid baseURL: ${baseURLOrigin}, error: ${e.message}`)
  }
  
    const protocol = url.protocol === 'https:' ? https : http

  const streamEnabled = typeof stream === 'boolean'
    ? stream
    : (isImageModel(model) ? false : true)

  const payload = {
    model,
    messages,
    temperature,
    top_p,
    stream: streamEnabled
  }

  if (extraBody && typeof extraBody === 'object') {
    for (const [k, v] of Object.entries(extraBody)) {
      if (k && v !== undefined) payload[k] = v
    }
  }
  
  // 新增：如果启用深度思考，添加参数
  if (enableThinking) {
    payload.enable_thinking = true
  }
  
  // DeepSeek v3.1 限制：启用思维模式时不支持函数调用
  // 如果有工具定义且未启用思维模式，才添加到 payload
  if (Array.isArray(tools) && tools.length > 0 && !enableThinking) {
    payload.tools = tools
  }

  console.log('[DirectOpenAI] Calling API', { url: url.toString(), model, messagesCount: messages.length, toolsCount: tools?.length || 0 })

  // 内部函数：执行单次请求
  const executeRequest = () => {
    return new Promise((resolve, reject) => {
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 60000, // 增加到60秒超时
      }

      const req = protocol.request(url, requestOptions, (res) => {
        let data = ''
        let buffer = ''
        let content = ''
        let reasoningContent = ''
        const toolCallsMap = new Map()
        const contentType = res.headers['content-type'] || ''
        const isStream = contentType.includes('text/event-stream')

        const flushLine = (line) => {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) return
          const payloadStr = trimmed.slice(5).trim()
          if (!payloadStr || payloadStr === '[DONE]') return
          let parsed
          try {
            parsed = JSON.parse(payloadStr)
          } catch {
            return
          }
          const choice = parsed.output?.choices?.[0] || parsed.choices?.[0]
          const delta = choice?.delta || choice?.message || {}
          if (delta.content) {
            content += delta.content
            if (typeof onContentDelta === 'function') {
              try { onContentDelta(delta.content) } catch {}
            }
          }
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content
            if (typeof onReasoningDelta === 'function') {
              try { onReasoningDelta(delta.reasoning_content) } catch {}
            }
          }
          const toolCalls = delta.tool_calls || []
          for (const call of toolCalls) {
            const index = call.index ?? 0
            const existing = toolCallsMap.get(index) || { id: call.id, function: { name: '', arguments: '' } }
            if (call.id) existing.id = call.id
            if (call.function?.name) existing.function.name = call.function.name
            if (typeof call.function?.arguments === 'string') {
              existing.function.arguments += call.function.arguments
            }
            toolCallsMap.set(index, existing)
          }
          if (toolCalls.length > 0 && typeof onToolCallsDelta === 'function') {
            try { onToolCallsDelta(toolCalls) } catch {}
          }
        }

        res.on('data', (chunk) => {
          const chunkStr = chunk.toString()
          if (isStream) {
            buffer += chunkStr
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              flushLine(line)
            }
          } else {
            data += chunkStr
          }
        })

        res.on('end', () => {
          try {
            if (isStream) {
              if (buffer) {
                const lines = buffer.split('\n')
                for (const line of lines) {
                  flushLine(line)
                }
              }
              const tool_calls = Array.from(toolCallsMap.values()).map(call => ({
                id: call.id,
                type: 'function',
                function: call.function
              }))
              const image = isImageModel(model) ? extractImageFromText(content) : null
              resolve({
                content,
                choices: [],
                tool_calls,
                reasoning_content: reasoningContent || undefined,
                image: image ? { src: image, via: 'stream:content' } : undefined,
                raw: { stream: true }
              })
              return
            }
            if (res.statusCode === 200) {
              const response = JSON.parse(data)
              console.log('[DirectOpenAI] Response:', JSON.stringify(response, null, 2))
              const reasoningContent = response.output?.choices?.[0]?.message?.reasoning_content 
                || response.choices?.[0]?.message?.reasoning_content
              const originalContent = response.output?.choices?.[0]?.message?.content || response.choices?.[0]?.message?.content || ''
              let finalContent = originalContent
              let image = null
              if (isImageModel(model)) {
                const found = extractImageFromResponse(response)
                if (found?.src) {
                  image = found
                  const embedded = extractImageFromText(originalContent)
                  if (!embedded) {
                    finalContent = `![generated](${found.src})`
                  }
                }
              }
              resolve({
                content: finalContent,
                choices: response.output?.choices || response.choices,
                tool_calls: response.output?.choices?.[0]?.message?.tool_calls || response.choices?.[0]?.message?.tool_calls,
                reasoning_content: reasoningContent,
                image: image || undefined,
                raw: response,
              })
            } else {
              reject(new Error(`API error: ${res.statusCode} ${data}`))
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`))
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('API request timeout'))
      })

      req.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`))
      })

      req.write(JSON.stringify(payload))
      req.end()
    })
  }

  // 带重试机制的执行逻辑
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[DirectOpenAI] Attempt ${attempt + 1}/${maxRetries + 1}`)
      const result = await executeRequest();
      return result;
    } catch (error) {
      lastError = error;
      console.log(`[DirectOpenAI] Attempt ${attempt + 1} failed:`, error.message);
      
      // 如果是最后一次尝试，或者错误不可重试，则抛出错误
      if (attempt === maxRetries) {
        throw new Error(`API request failed after ${maxRetries + 1} attempts: ${error.message}`);
      }
      
      // 等待一段时间再重试
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  
  throw new Error(`API request failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}
