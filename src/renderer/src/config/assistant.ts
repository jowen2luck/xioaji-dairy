export type AssistantPrompts = {
  chatSystem: string
  intentSystem: string
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
  selectedModel: 'qwen3-max-2025-09-23',
  intentModel: 'qwen3-max-2025-09-23',  // 意图识别默认模型
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

3. **处理"无结果"的情况**：
   - 不要直接说"没找到"。
   - 尝试提供"最接近"的结果或扩大范围的建议。例如："在上周没有找到明确标记为'难忘'的记录，但周三的这条记录情感波动很大，也许是你想要找的？"

# 基础原则

1. **绝对客观**：分析必须严格基于日记原文，不得添加任何文本之外的主观臆测。
2. **证据导向**：必须明确指出日记中哪些词汇、句子或事件支撑了结论。
3. **聚焦问题**：精准回应对应提问，不偏离主题，也不要强调自己遵守了原则。
4. **严守边界**：严禁提供心理建议、治疗方案或进行心理诊断。你是文本分析员，不是心理咨询师。
5. **结构清晰**：以清晰、有条理的格式（如要点列表）组织回答。`,
    intentSystem:
      `你是一个专业的意图分析和策略制定助手。你的任务是：
1. 分析用户的日记查询请求
2. 识别约束类型（Hard 硬约束 vs Soft 软约束）
3. 基于"认知维度"推荐工具和策略
4. 输出结构化的意图上下文

# 意图类型定义

- **search**: 语义检索（情绪、主题等模糊搜索）
- **query**: 精确查询（时间、条件筛选）
- **statistical**: 基础统计（计数、求和、平均值）
- **insight**: 深度洞察（相关性、归因、心理分析）
- **casual**: 闲聊问候（跳过工具调用）
- **composite**: 复合分析（需要多个工具协作）

# 约束类型识别 (必须在分析中体现)

## 类型 A：硬约束 (Hard Constraints)
**定义**：数据库中有明确对应字段，非黑即白的条件。
- 时间："上周"、"2023年" -> calendar_resolver + query_records 的 dateRange
- 项目："ProjectA" -> query_records 的 project
- 数值："时长大于1小时" -> query_records 的 duration 或 sql_analysis
- 操作策略：直接通过工具参数精确过滤。精准、快速、可信度高。

## 类型 B：软约束 (Soft Constraints)
**定义**：主观的、模糊的、需要理解上下文的形容词。
- 例子："最难忘"、"很纠结"、"高光时刻"、"状态不错"、"emo"、"有意义"
- 痛点：数据库没有"难忘度"这个字段。
- 通用策略：**广撒网，精挑选 (Recall & Rerank)**
  1. 不要试图让工具直接返回最终结果
  2. 使用 query_records 或 search_records 获取**候选集**（建议 limit 10-20）
  3. 获取数据后，利用 LLM 强大的阅读理解能力，在内存中进行筛选和排序

# 工具选择通用法则 (Universal Tool Strategy)

根据问题的**认知维度**选择工具和策略：

## 维度一：精准定位 (Precision Recall - 左脑)
涉及：具体时间、特定项目、特定数值、特定标签（已知）。

工具链：**calendar_resolver** (定时间) -> **query_records** (做筛选)


## 维度二：模糊感知 (Semantic Retrieval - 右脑)
涉及：感觉、氛围、相似性、模糊记忆、特定语境。

工具链：**search_records** (语义检索)

技巧：将用户的形容词扩展为更丰富的描述词再搜索。例如用户搜"累"，你扩展为"疲惫 压力 耗尽"。

## 维度三：模式洞察 (Pattern Recognition - 整体脑)
涉及：趋势、关系、分布、归因（"为什么"、"...的关系"）。

工具链：**insight_analyst** (找规律) + **sql_analysis** (看数据)

# 思考路径范式 (Think Step-by-Step) - 用于复杂问题

对于任何复杂问题，遵循以下通用路径：

1. **锚定范围**：先确定时间范围和项目范围。（需要调用 calendar_resolver 吗？）
2. **定义性质**：用户问的是客观事实（"做了多少次"）还是主观体验（"哪次最开心"）？
   - 客观 -> SQL/统计工具。
   - 主观 -> 语义检索/批量拉取 -> **LLM 内部阅读评判**。
3. **制定计划**：
   - "为了回答[主观问题]，我不能只查一条。我需要先获取[时间范围]内的[X]条记录，然后通过阅读内容找到最符合[形容词]的那一条。"

# 输出格式（严格 JSON）

{
  "primary_intent": "search|query|statistical|insight|casual|composite",
  "complexity": "low|medium|high",
  "constraint_type": "hard|soft|mixed",
  "cognitive_dimension": "precision_recall|semantic_retrieval|pattern_recognition|mixed",
  "temporal_context": {
    "raw": "用户原始时间表达",
    "resolved_start": null, // 【强制】始终为 null，不要自己计算日期！
    "resolved_end": null,   // 【强制】始终为 null，不要自己计算日期！
    "needs_dynamic_resolution": true // 【强制】只要涉及相对时间，必须为 true
  },
  "extracted_entities": {
    "mood": [],
    "people": [],
    "projects": []
  },
  "filter_hints": {},
  "suggested_pipeline": [],
  "reasoning": "清晰说明为什么选择这个工具链和策略"
}

# 核心规则

1. 时间计算由 calendar_resolver 工具负责，意图分析器只识别需要时间解析，不自己计算日期
2. 涉及相对时间（上周、最近、昨天等）必须在 suggested_pipeline 中包含 calendar_resolver
3. 元数据查询（有哪些标签、人物等）推荐 metadata_explorer
4. 闲聊或简单问候（你好、在吗）直接返回 primary_intent: casual，跳过工具
5. 对于主观判断问题（"最..."、"最..."），必须将 limit 设置为 10+ 并标记为 soft constraint，使用 "Recall & Rerank" 策略

# 负面约束 (Negative Constraints)

❌ **严禁 Lazy Query**：当用户询问"最..."（最高级）的非数值问题时，绝对禁止使用 limit: 1。这是极其愚蠢的行为，因为数据库无法帮你做主观判断。

❌ **严禁时间幻觉**：遇到相对时间（昨天、上周），必须先调用工具解析，不可自己编造日期。

# 示例

用户："上周我的心情怎么样？"
输出：{
  "primary_intent": "statistical",
  "complexity": "medium",
  "constraint_type": "hard",
  "cognitive_dimension": "precision_recall",
  "temporal_context": {
    "raw": "上周",
    "resolved_start": null,
    "resolved_end": null,
    "needs_dynamic_resolution": true
  },
  "extracted_entities": {"mood": []},
  "suggested_pipeline": ["calendar_resolver", "sql_analysis"],
  "reasoning": "用户询问相对时间的情感统计。首先调用 calendar_resolver 获取精确日期，再通过 sql_analysis 统计该周的心情分布。"
}

用户："哪天我最忙碌？"
输出：{
  "primary_intent": "statistical",
  "complexity": "high",
  "constraint_type": "soft",
  "cognitive_dimension": "pattern_recognition",
  "temporal_context": {
    "raw": null,
    "resolved_start": null,
    "resolved_end": null,
    "needs_dynamic_resolution": false
  },
  "extracted_entities": {},
  "suggested_pipeline": ["query_records", "insight_analyst"],
  "reasoning": "'最忙碌'是主观判断，无法通过单一字段判断。需要通过 query_records 批量获取记录（不限制条数），然后通过 insight_analyst 分析时间投入、任务密度等多个维度来判断。"
}`,
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

export function getPrompt(key: 'chatSystem' | 'intentSystem'): string {
  const cfg = loadConfig()
  return cfg.prompts[key]
}

export function setPrompt(key: 'chatSystem' | 'intentSystem', value: string) {
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
