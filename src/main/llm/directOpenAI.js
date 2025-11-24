/**
 * 直接调用 OpenAI 兼容 API，绕过 LangChain 的可能问题
 */

import https from 'https'
import http from 'http'

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
 * @returns {Promise<object>} - API 响应
 */
export async function callOpenAIAPI(config) {
  const {
    baseURL,
    apiKey = getAPIKeyForBaseURL(baseURL),
    model,
    messages,
    tools,
    temperature = 0.7,
    top_p = 0.9,
  } = config
  
  if (!apiKey) {
    throw new Error(`Missing API key for baseURL: ${baseURL}`)
  }

  // 确保 baseURL 是字符串
  const baseURLOrigin = typeof baseURL === 'string' ? baseURL : (baseURL?.href || baseURL?.origin || '')
  
  if (!baseURLOrigin) {
    throw new Error('Invalid baseURL: must be a string or URL object')
  }

  // 构建完整的 URL
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

  const payload = {
    model,
    messages,
    temperature,
    top_p,
  }
  
  // 如果有工具定义，添加到 payload
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools
  }

  console.log('[DirectOpenAI] Calling API', { url: url.toString(), model, messagesCount: messages.length, toolsCount: tools?.length || 0 })

  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 30000, // 30秒超时
    }

    const req = protocol.request(url, requestOptions, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const response = JSON.parse(data)
            console.log('[DirectOpenAI] Response:', JSON.stringify(response, null, 2))
            resolve({
              content: response.choices?.[0]?.message?.content || '',
              choices: response.choices,
              tool_calls: response.choices?.[0]?.message?.tool_calls,
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
