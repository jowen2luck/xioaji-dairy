/**
 * 意图分析器
 * 基于用户查询的关键词匹配，推荐合适的工具
 */

/**
 * 工具意图规则映射
 */
const INTENT_PATTERNS = {
  search_records: [
    // 语义搜索关键词
    '搜索', '查找', '找', '检索', 
    '孤独', '焦虑', '开心', '难过', '压力',
    '情绪', '心情', '感受', '体验',
    '类似', '相关', '像',
    // 时间范围的模糊描述
    '最近', '之前', '那段时间'
  ],
  
  query_records: [
    // 精确查询关键词
    '时间', '日期', '周末', '工作日',
    '项目', '分类', '持续时间', '时长',
    '上周', '本周', '上个月', '本月',
    '几点', '早上', '下午', '晚上', '深夜',
    '多久', '超过', '小于', '大于'
  ],
  
  sql_analysis: [
    // 统计分析关键词
    '统计', '分析', '总结', '对比', '比较',
    '趋势', '变化', '分布', '占比',
    '最多', '最少', '平均', '总共',
    '关系', '相关性', '影响',
    '排行', '排名', 'TOP',
    '哪个', '哪些', '什么时候',
    // 聚合问题
    '有多少', '多少次', '频率'
  ]
}

/**
 * 分析用户查询意图，返回推荐的工具列表
 * @param {string} query - 用户查询文本
 * @param {Array<string>} availableTools - 可用的工具名称列表
 * @returns {Array<string>} 推荐的工具名称列表
 */
export function analyzeIntent(query, availableTools = []) {
  if (!query || typeof query !== 'string') {
    return []
  }

  const queryLower = query.toLowerCase()
  const scores = {}

  // 为所有可用工具初始化分数
  availableTools.forEach(tool => {
    scores[tool] = 0
  })

  // 计算每个工具的匹配分数
  for (const [toolName, patterns] of Object.entries(INTENT_PATTERNS)) {
    // 只考虑可用的工具
    if (!availableTools.includes(toolName)) {
      continue
    }

    for (const pattern of patterns) {
      if (queryLower.includes(pattern.toLowerCase())) {
        scores[toolName] = (scores[toolName] || 0) + 1
      }
    }
  }

  // 特殊规则：复杂分析问题优先使用 sql_analysis
  const analysisKeywords = ['为什么', '原因', '影响', '关联', '趋势', '变化']
  const hasAnalysisIntent = analysisKeywords.some(kw => queryLower.includes(kw))
  
  if (hasAnalysisIntent && availableTools.includes('sql_analysis')) {
    scores.sql_analysis = (scores.sql_analysis || 0) + 3
  }

  // 特殊规则：明确的时间范围查询优先 query_records
  const timeRangeKeywords = ['上周', '本周', '上个月', '本月', '昨天', '今天']
  const hasTimeRange = timeRangeKeywords.some(kw => queryLower.includes(kw))
  
  if (hasTimeRange && availableTools.includes('query_records')) {
    scores.query_records = (scores.query_records || 0) + 2
  }

  // 按分数排序，返回分数 > 0 的工具
  const sortedTools = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, _]) => tool)

  console.log('[Intent] Query:', query)
  console.log('[Intent] Scores:', scores)
  console.log('[Intent] Recommended tools:', sortedTools)

  // 如果没有匹配的工具，返回所有可用工具
  if (sortedTools.length === 0) {
    return availableTools
  }

  return sortedTools
}

/**
 * 获取工具的中文描述
 * @param {string} toolName - 工具名称
 * @returns {string} 工具描述
 */
export function getToolDescription(toolName) {
  const descriptions = {
    search_records: '语义检索 - 适用于情绪、主题等模糊搜索',
    query_records: '精确查询 - 适用于时间、项目等条件筛选',
    sql_analysis: '统计分析 - 适用于趋势、对比等数据分析'
  }
  
  return descriptions[toolName] || toolName
}
