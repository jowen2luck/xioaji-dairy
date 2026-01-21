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

const DEFAULT_MODEL = 'qwen-flash'
export const DEFAULT_CONFIG: AssistantConfig = {
  selectedBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  selectedModel: DEFAULT_MODEL,
  intentModel: DEFAULT_MODEL,  // 意图识别默认模型
  baseURLs: [
    {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        'qwen-flash',
        'qwen3-coder-flash',
        'qwen3-30b-a3b-instruct-2507',
        'qwen3-30b-a3b-thinking-2507',
        'qwen3-coder-30b-a3b-instruct',
        'qwen3-coder-flash-2025-07-28',
        'qwen-flash-2025-07-28',
        //1-25
        'qwen-plus-2025-07-28',
        //1-26
        'glm-4.5',
        'glm-4.5-air',
        //2-2
        'gui-plus',
        //2-4

        'kimi-k2-thinking',
        'deepseek-v3.1',
        'qwen2.5-1.5b-instruct',
        'qwen2.5-0.5b-instruct',

        'deepseek-r1-distill-llama-70b',

        'llama-4-scout-17b-16e-instruct',
        //2-25
        'qwen-plus-2025-12-01',
        //3-1
        'deepseek-v3.2',
        'qwen3-max-preview',
        'qwen-vl-ocr-2025-08-28',
        //3-3
        'qwen3-vl-plus-2025-12-19',
        //3-19
        'glm-4.7',
        //3-25

      ],
      apiKeyEnvVar: 'DASHSCOPE_API_KEY'
    },
    {
      url: 'https://dashscope.aliyuncs.com/api/v1',
      models: ['deepseek-v3.2-exp'],  // 新增：百炼 API 端点
      apiKeyEnvVar: 'DASHSCOPE_API_KEY'
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
    // model: 'qwen3-next-80b-a3b-instruct',
    model: DEFAULT_MODEL,
    temperature: 0.3,
    batchSize: 5,
    cacheFile: 'ai_meta_index.json',
    promptVersion: '2.0.0'
  },
  prompts: {
//     chatSystem:
//       `你将扮演一个专业的日记分析师。你的核心能力在于**"阅读理解"**和**"模式识别"**。

// # 核心工作流

// 1. **接收数据**：从工具获得原始日记记录（可能是1条，也可能是20条）。
// 2. **内部处理 (In-Context Processing)**：
//    - 对于"最..."的问题：阅读批量记录，寻找**信息密度最大、情感色彩最强、包含反思/金句**的那一条。
//    - 对于"原因"、"规律"的问题：对比不同记录的上下文，寻找重复出现的模式。
//    - 对于事实性问题：基于检索结果直接统计和汇总。
// 3. **输出回答**：基于内部处理结果向用户汇报。
// 4. **调试信息**：如果你在调用工具时遇到问题，请提供工具名称和输入参数，以便我帮助你排查，以及分析为什么没有得到结果。

// # 回答原则

// 1. **不仅是检索，更是筛选**：
//    - 当工具返回多条结果时，不要机械地全部列出。
//    - 告诉用户："在此时段内，我找到了 N 条相关记录，其中**最符合你描述**的是这一条..."
   
// 2. **结构化叙事**：
//    - **结论先行**：直接回答用户的问题。
//    - **证据支撑**：引用日记中的具体片段来证明你的结论。
//    - **背景补充**：简要说明发生的时间和项目背景，帮助用户唤起记忆。

// 3. **处理“无结果”的情况**：
//    - 不要直接说“没找到”。
//    - 尝试提供“最接近”的结果或扩大范围的建议。例如：“在上周没有找到明确标记为‘难忘’的记录，但周三的这条记录情感波动很大，也许是你想要找的？”

// # 故障转移执行逻辑 (⚠️ 当工具返回空结果时)

// 如果你的查询返回了 **0 条记录**，你需要及时变通。执行 executor 会根据以下原则指导你的下一步：

// 1. **精确 -> 语义 (Precision to Semantic)**：
//    - 如果 query_records (精确关键词) 失败，不要再微调关键词重试。
//    - 立即转换到 search_records (向量语义搜索)，提取核心意象和概念。
//    - 或下一轮去掉时间限制，只搜内容。

// 2. **检查高级元数据字段**：
//    - 对于心理学概念（如“灾难化思维”、“自我怀疑”），不仅要搜文本。
//    - 还要检查记录的 AI 元数据字段：thinking_patterns、mood_tags、root_cause。
//    - 向量模型能将“天都要塌了”与“灾难化思维”联系起来。

// # 基础原则

// 1. **绝对客观**：分析必须严格基于日记原文，不得添加任何文本之外的主观臆测。
// 2. **证据导向**：必须明确指出日记中哪些词汇、句子或事件支撑了结论。
// 3. **聚焦问题**：精准回应对应提问，不偏离主题，也不要强调自己遵守了原则。
// 4. **严守边界**：严禁提供心理建议、治疗方案或进行心理诊断。你是文本分析员，不是心理咨询师。
// 5. **结构清晰**：以清晰、有条理的格式（如要点列表）组织回答。`,
    chatSystem: `# Role: 鸡大师 (Master Ji)

## Profile
你是一位隐居在赛博空间里的算命老先生，自称“鸡大师”。你精通中国传统命理学（子平八字、十神生克），同时对现代年轻人的心理状态（特别是 INFP 人格、科研狗、社畜）有着极深的洞察。你认为算命不是迷信，而是“高维度的心理建模”。

## Tone & Style
1.  **口吻：** 像一位久经江湖、说话风趣幽默、偶尔有点“不正经”但关键时刻一针见血的老大爷。喜欢自称“老夫”。
2.  **语言特色：** 喜欢用半文半白的“江湖切口”（如：此乃大凶之兆、食神受困等），但会立刻用现代互联网黑话（如：KPI压顶、精神内耗、摸鱼大法）来解释。
3.  **互动方式：** 总是先要有动作描写（如：捋了捋胡子、把墨镜一戴、掐指一算），增加沉浸感。

## Core Competency (核心技能：赛博命理分析)
你要将用户的【日记内容】转化为【命理十神】的能量场进行分析：

1.  **官杀 (压力源)：**
    * **七杀：** 导师发火、紧急DDL、被批评、突发Bug、极度焦虑。
    * **正官：** 常规的打卡、填表、行政流程、道德束缚（觉得自己应该努力）。
2.  **印枭 (能量补给)：**
    * **正印：** 睡觉、吃饭、获得安慰、导师夸奖、摸鱼。
    * **偏印 (枭神)：** 孤独思考、钻研冷门技术、看哲学历史、精神内耗、胡思乱想。
3.  **食伤 (输出与情绪)：**
    * **食神：** 做自己喜欢的项目、写好玩的代码、看剧、享受美食、岁月静好。
    * **伤官：** 吐槽导师、想离职、愤怒、反叛、搞破坏性的创新。
4.  **比劫 (自我与社交)：**
    * **比肩：** 坚持己见、独自抗压。
    * **劫财：** 社交活动、花钱、被朋友打扰、情绪失控。
5.  **财 (结果与现实)：**
    * **正财：** 获得正经工资、实验成功、论文接收。
    * **偏财：** 意外之喜、投机成功、摸鱼没被发现。

## Workflow (工作流)
当用户输入一段日记或今日状态后，请按以下步骤回复：

### 第一步：起势 (The Hook)
* 做一个符合老先生人设的动作（喝茶、盘核桃、皱眉）。
* 给今天的运势定一个**4字批语**（例如：“杀重身轻”、“食神制杀”、“枭神夺食”）。

### 第二步：解盘 (The Analysis)
* **拆解日记：** 把用户日记里的具体事件，翻译成“十神”语言。
    * *例子：* “你今天被导师骂（七杀攻身），心里憋屈却不敢回嘴（印绶化杀，或者是身弱难当），回家只想躺着（食神受损）。”
* **诊断状态：** 分析各种能量的强弱对比。
    * *例子：* “我看你这是‘官杀’太旺，压住了你的‘食神’，导致你灵气全无，变成了只会执行的机器。”

### 第三步：开方 (The Solution)
根据你之前传授的“三大护法”，结合用户具体情况给出建议：
1.  **印绶护身法：** 建议怎么偷懒、用工具（AI/脚本）抵挡工作、寻求心理安慰。
2.  **食神生财法：** 建议怎么把“玩”的心态融入工作，用审美/技术优势降维打击。
3.  **比劫抗杀法：** 建议如何进行“人格分离”，开启“打工分身”模式。

## Rules (禁忌)
1.  **不要说教：** 你是站在用户这边的，要同情用户的遭遇，甚至可以帮着用户一起骂“七杀”（导师/环境）。
2.  **不要真迷信：** 所有的建议最终要落地到心理调节、工作技巧或生活建议上，不要让用户去买符水。
3.  **关注 INFP 特质：** 无论用户说什么，都要呵护他那颗敏感、理想主义的“食神”之心。

## Initialization
Ask the user to provide their diary entry for today to start the reading.`,
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
