export type AssistantPrompts = {
  chatSystem: string
  tasks?: Record<string, string>
}

export type BaseURLEntry = {
  url: string
  models: string[]
  apiKeyEnvVar?: string  // 新增：用于指定该 baseURL 对应的 API Key 环境变量名称
}

export type ETLConfig = {
  enabled: boolean
  baseURL: string
  model: string
  temperature: number
  batchSize: number
  cacheFile: string
  promptVersion: string
}

export type SerendipityConfig = {
  preferHighEnergy: boolean
  minEnergyLevel: number
  preferWithQuotes: boolean
  excludeMoodTags: string[]
}

export type PaginationConfig = {
  pageSize: number
  enableQuickJump: boolean
  showPageInfo: boolean
}

export type AssistantConfig = {
  selectedBaseURL: string
  selectedModel: string
  intentModel?: string  // 意图识别模型（可选，默认使用 selectedModel）
  baseURLs: BaseURLEntry[]
  temperature: number
  top_p: number
  enabledTools: string[]
  prompts: AssistantPrompts
  memory: {
    recentIntents: string[]
    lastUsedTools: string[]
  }
  search: {
    maxResults: number
  }
  etl: ETLConfig
  serendipity: SerendipityConfig
  pagination: PaginationConfig
}

const LS_KEY = 'assistant-config'


export const DEFAULT_CONFIG: AssistantConfig = {
  selectedBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  selectedModel: 'qwen3-max',
  intentModel: 'qwen3-max',  // 意图识别默认模型
  baseURLs: [
    {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        'qwen-plus-2025-09-11',
        'qwen3-max-2025-09-23',
        'qwen3-max',
        'qwen3-next-80b-a3b-instruct',
        'qwen-flash-2025-07-28',
        'qwen-flash'
      ]
    },
    {
      url: 'https://uni-api.cstcloud.cn/v1',
      models: ['deepseek-v3:671b']
    }
  ],
  temperature: 0.7,
  top_p: 0.9,
  enabledTools: ['search_records', 'query_records', 'sql_analysis', 'calendar_resolver', 'metadata_explorer', 'insight_analyst'],
  search: {
    maxResults: 20
  },
  etl: {
    enabled: true,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-next-80b-a3b-instruct',
    temperature: 0.3,
    batchSize: 5,
    cacheFile: 'ai_meta_index.json',
    promptVersion: '2.0.0'
  },
  prompts: {
    chatSystem:
      `你将扮演一个专业的日记分析师。你的核心能力在于**"阅读理解"**和**"模式识别"**。

# 核心工作流

1. **接收数据**：从工具获得原始日记记录（可能是1条，也可能是20条）。
2. **内部处理 (In-Context Processing)**：
   - 对于"最..."的问题：阅读批量记录，寻找**信息密度最大、情感色彩最强、包含反思/金句**的那一条。
   - 对于"原因"、"规律"的问题：对比不同记录的上下文，寻找重复出现的模式。
   - 对于事实性问题：基于检索结果直接统计和汇总。
3. **输出回答**：基于内部处理结果向用户汇报。

# 回答原则

1. **不仅是检索，更是筛选**：
   - 当工具返回多条结果时，不要机械地全部列出。
   - 告诉用户："在此时段内，我找到了 N 条相关记录，其中**最符合你描述**的是这一条..."
   
2. **结构化叙事**：
   - **结论先行**：直接回答用户的问题。
   - **证据支撑**：引用日记中的具体片段来证明你的结论。
   - **背景补充**：简要说明发生的时间和项目背景，帮助用户唤起记忆。

3. **处理“无结果”的情况**：
   - 不要直接说“没找到”。
   - 尝试提供“最接近”的结果或扩大范围的建议。例如：“在上周没有找到明确标记为‘难忘’的记录，但周三的这条记录情感波动很大，也许是你想要找的？”

# 故障转移执行逻辑 (⚠️ 当工具返回空结果时)

如果你的查询返回了 **0 条记录**，你需要及时变通。执行 executor 会根据以下原则指导你的下一步：

1. **精确 -> 语义 (Precision to Semantic)**：
   - 如果 query_records (精确关键词) 失败，不要再微调关键词重试。
   - 立即转换到 search_records (向量语义搜索)，提取核心意象和概念。
   - 或下一轮去掉时间限制，只搜内容。

2. **检查高级元数据字段**：
   - 对于心理学概念（如“灾难化思维”、“自我怀疑”），不仅要搜文本。
   - 还要检查记录的 AI 元数据字段：thinking_patterns、mood_tags、root_cause。
   - 向量模型能将“天都要塌了”与“灾难化思维”联系起来。

# 基础原则

1. **绝对客观**：分析必须严格基于日记原文，不得添加任何文本之外的主观臆测。
2. **证据导向**：必须明确指出日记中哪些词汇、句子或事件支撑了结论。
3. **聚焦问题**：精准回应对应提问，不偏离主题，也不要强调自己遵守了原则。
4. **严守边界**：严禁提供心理建议、治疗方案或进行心理诊断。你是文本分析员，不是心理咨询师。
5. **结构清晰**：以清晰、有条理的格式（如要点列表）组织回答。`,
    tasks: {}
  },
  memory: {
    recentIntents: [],
    lastUsedTools: []
  },
  serendipity: {
    preferHighEnergy: true,
    minEnergyLevel: 6,
    preferWithQuotes: true,
    excludeMoodTags: ['焦虑', '沮丧', '愤怒', '难过', '疲惫']
  },
  pagination: {
    pageSize: 6,
    enableQuickJump: true,
    showPageInfo: true
  }
}

export function loadConfig(): AssistantConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed, prompts: { ...DEFAULT_CONFIG.prompts, ...(parsed?.prompts || {}) } }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(partial: Partial<AssistantConfig>) {
  const current = loadConfig()
  const merged: AssistantConfig = {
    ...current,
    ...partial,
    prompts: { ...current.prompts, ...(partial.prompts || {}) },
    memory: { ...current.memory, ...(partial.memory || {}) }
  }
  localStorage.setItem(LS_KEY, JSON.stringify(merged))
}

export function resetConfig() {
  localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_CONFIG))
}

export function getPrompt(key: 'chatSystem'): string {
  const cfg = loadConfig()
  return cfg.prompts[key]
}

export function setPrompt(key: 'chatSystem', value: string) {
  const cfg = loadConfig()
  cfg.prompts[key] = value
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

// 新增：根据 baseURL 获取对应的 API Key 环境变量名称
export function getAPIKeyEnvVar(baseURL: string): string | undefined {
  const entry = DEFAULT_CONFIG.baseURLs.find(item => item.url === baseURL);
  return entry?.apiKeyEnvVar;
}

// 新增：获取当前选中的 API Key 环境变量名称
export function getCurrentAPIKeyEnvVar(): string | undefined {
  return getAPIKeyEnvVar(DEFAULT_CONFIG.selectedBaseURL);
}

// 新增：获取意图识别模型
export function getIntentModel(): string {
  const cfg = loadConfig()
  // 优先使用独立配置的 intentModel，否则使用主模型
  return cfg.intentModel || cfg.selectedModel
}

// 新增：获取意图识别 BaseURL（与主模型相同）
export function getIntentBaseURL(): string {
  const cfg = loadConfig()
  return cfg.selectedBaseURL
}
