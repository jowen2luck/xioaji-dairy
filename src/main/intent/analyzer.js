/**
 * 意图分析器
 * 使用 LLM 进行结构化的意图判断，输出完整的上下文对象
 * 包含时间锚定、实体提取、过滤提示等信息
 */

import { getIntentPrompt, COMPLEXITY_MAX_ITERATIONS } from '../config/intentPrompts.js'

/**
 * 使用 LLM 分析用户意图，返回结构化的意图上下文
 * @param {string} userQuery - 用户查询文本
 * @param {Object} llm - LLM 实例
 * @returns {Promise<Object>} 结构化的意图上下文对象
 */
export async function analyzeIntentWithLLM(userQuery, llm) {
  if (!userQuery || typeof userQuery !== 'string') {
    return null
  }

  try {
    console.log('[Intent] Analyzing with LLM:', userQuery)
    
    // 获取意图分析的系统提示词
    const systemPrompt = getIntentPrompt()
    
    // 调用 LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery }
    ]
    
    const response = await llm.invoke(messages)
    const content = typeof response === 'string' ? response : response.content
    
    console.log('[Intent] LLM response:', content)
    
    // 解析 JSON 响应
    let intentContext
    try {
      // 尝试提取 JSON（可能被包裹在代码块中）
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/```\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : content
      intentContext = JSON.parse(jsonStr.trim())
    } catch (parseError) {
      console.error('[Intent] Failed to parse JSON response:', parseError)
      // 降级到关键词匹配
      return analyzeIntentByKeywords(userQuery)
    }
    
    // 验证必需字段
    if (!intentContext.primary_intent || !intentContext.complexity) {
      console.warn('[Intent] Invalid intent context, using fallback')
      return analyzeIntentByKeywords(userQuery)
    }
    
    // 添加推荐的最大迭代次数
    intentContext.maxIterations = COMPLEXITY_MAX_ITERATIONS[intentContext.complexity] || 3
    
    console.log('[Intent] Structured intent context:', intentContext)
    return intentContext
    
  } catch (error) {
    console.error('[Intent] LLM analysis error:', error)
    // 降级到关键词匹配
    return analyzeIntentByKeywords(userQuery)
  }
}

/**
 * 【已废弃】旧版关键词匹配方法，保留用于向后兼容
 * 请使用 analyzeIntentWithLLM 进行结构化意图分析
 */
export function analyzeIntent(query, availableTools = []) {
  console.warn('[Intent] analyzeIntent() is deprecated, use analyzeIntentWithLLM() instead')
  
  const intentContext = analyzeIntentByKeywords(query)
  
  // 将意图类型映射到工具
  const intentToolMapping = {
    search: ['search_records'],
    query: ['query_records'],
    statistical: ['sql_analysis'],
    insight: ['insight_analyst'],
    casual: [],
    composite: ['query_records', 'sql_analysis']
  }
  
  const recommendedTools = intentToolMapping[intentContext.primary_intent] || availableTools
  
  // 只返回可用的工具
  return recommendedTools.filter(tool => availableTools.includes(tool))
}

/**
 * 关键词匹配降级方案（当 LLM 不可用时使用）
 * @param {string} query - 用户查询文本
 * @returns {Object} 简化的意图上下文
 */
function analyzeIntentByKeywords(query) {
  const queryLower = query.toLowerCase()
  
  // 检测意图类型
  let primary_intent = 'query' // 默认
  let complexity = 'medium'
  let suggested_pipeline = ['query_records']
  
  // 闲聊检测
  const casualKeywords = ['你好', '在吗', '谢谢', '再见', '早上好', '晚安']
  if (casualKeywords.some(kw => queryLower.includes(kw))) {
    primary_intent = 'casual'
    complexity = 'low'
    suggested_pipeline = []
  }
  // 语义搜索
  else if (['搜索', '找', '检索', '类似', '相关'].some(kw => queryLower.includes(kw))) {
    primary_intent = 'search'
    complexity = 'low'
    suggested_pipeline = ['search_records']
  }
  // 深度洞察
  else if (['为什么', '原因', '关系', '相关性', '影响'].some(kw => queryLower.includes(kw))) {
    primary_intent = 'insight'
    complexity = 'high'
    suggested_pipeline = ['query_records', 'insight_analyst']
  }
  // 统计分析
  else if (['统计', '分析', '总结', '对比', '趋势', '分布'].some(kw => queryLower.includes(kw))) {
    primary_intent = 'statistical'
    complexity = 'medium'
    suggested_pipeline = ['sql_analysis']
  }
  
  return {
    primary_intent,
    complexity,
    temporal_context: {
      raw: null,
      resolved_start: null,
      resolved_end: null,
      needs_dynamic_resolution: false
    },
    extracted_entities: {},
    filter_hints: {},
    suggested_pipeline,
    reasoning: '降级到关键词匹配（LLM 不可用）',
    maxIterations: COMPLEXITY_MAX_ITERATIONS[complexity] || 3
  }
}
