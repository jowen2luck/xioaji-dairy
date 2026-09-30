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
const SETTINGS_KEY = 'assistant'

const DEFAULT_MODEL = 'bailian-auto'
export const DEFAULT_CONFIG: AssistantConfig = {
  selectedBaseURL: 'https://llm-fxdsk6826w304s38.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  selectedModel: DEFAULT_MODEL,
  intentModel: DEFAULT_MODEL,  // 意图识别默认模型
  baseURLs: [
    {
      url: 'https://llm-fxdsk6826w304s38.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
      models: [
        'bailian-auto',
        'qwen3.7-flash-2026-07-15',
        'qwen3.7-flash',
        'deepseek-v4-flash-0731',
        'qwen3.8-max',
        'qwen3.8-2.4t-a95b',
        'deepseek-v4-pro-0813',
        'qwen3.8-27b',
        'kimi-k3',
        'glm-5.3',
        'qwen3.8-flash',
        'qwen3.8-max-0902',
        'deepseek-v4.1-flash',
        'qwen-mt-uni',
        'qwen3.8-omni-flash',
        'qwen3.8-omni-flash-realtime'
      ],
      apiKeyEnvVar: 'DASHSCOPE_API_KEY'
    },
    {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        'bailian-auto',
        'qwen3.7-flash-2026-07-15',
        'qwen3.7-flash',
        'deepseek-v4-flash-0731',
        'qwen3.8-max',
        'qwen3.8-2.4t-a95b',
        'deepseek-v4-pro-0813',
        'qwen3.8-27b',
        'kimi-k3',
        'glm-5.3',
        'qwen3.8-flash',
        'qwen3.8-max-0902',
        'deepseek-v4.1-flash',
        'qwen-mt-uni',
        'qwen3.8-omni-flash',
        'qwen3.8-omni-flash-realtime'
      ],
      apiKeyEnvVar: 'DASHSCOPE_API_KEY'
    },
    {
      url: 'http://127.0.0.1:8045/v1',
      models: [
        'gemini-3-flash',
        'gemini-3-pro-low',
        'gemini-3-pro-high',
        'gemini-3-pro-image',
      ],
      apiKeyEnvVar: 'OPENAI_API_KEY',
    },
    {
      url: 'https://dashscope.aliyuncs.com/api/v1',
      models: ['deepseek-v3.2-exp'],  // 新增：百炼 API 端点
      apiKeyEnvVar: 'DASHSCOPE_API_KEY'
    },
    {
      url: 'https://uni-api.cstcloud.cn/v1',
      models: ['deepseek-v3:671b']
    },
    {
      url: 'https://api.longcat.chat/openai/v1',
      models: ['LongCat-2.0'],
      apiKeyEnvVar: 'LONGCAT_API_KEY'
    },
    {
      url: 'https://api.longcat.chat/openai',
      models: ['LongCat-2.0'],
      apiKeyEnvVar: 'LONGCAT_API_KEY'
    }
  ],
  temperature: 0.7,
  top_p: 0.9,
  enabledTools: ['create_record', 'update_record', 'delete_record', 'manage_memo', 'search_records', 'query_records', 'sql_analysis', 'calendar_resolver', 'metadata_explorer', 'insight_analyst'],
  search: {
    maxResults: 20
  },
  etl: {
    enabled: true,
    baseURL: 'https://llm-fxdsk6826w304s38.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    model: 'bailian-auto',
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
    chatSystem: `# Role: 小鸡 (Xiao Ji) - 个人记录与成长伴侣

## Profile & Tone
你叫“小鸡”，是用户的专属记录小助手与成长伴侣。
- **角色口吻**：自称“小鸡”，称呼用户为“你”或真诚平等的伙伴口吻；
- **性格特质**：温和敏锐、真诚务实，具有极高共情力，善于倾听和启发，拒绝空洞说教与冰冷机械回复；
- **语言风格**：亲切自然，表达清晰有条理。面对低落或疲惫情绪时沉稳温厚，擅长设身处地地陪伴。

## Principles & Boundaries
1. **真实与证据导向**：回答和分析必须紧扣用户日记与客观数据，严禁凭空编造事实。
2. **严守边界**：提供生活记录与成长反思陪伴，严禁提供任何病理心理诊断或医疗建议。
3. **伴侣默契与技能协同**：自然倾听与共情接话优先，业务任务（便签收纳、日记整理、统计检索等）依照挂载的技能组精准执行。
4. **便签收录与自主拆分智慧**：倾听用户的单次倾诉默认收纳为单条完整便签；当用户话语中自然同时包含了【具象生活事件】与【独立抽离的高阶心智反思/逻辑闭环】，或跨越了不同时段/项目，可自主拆分为 2 张独立便签。拆分时正文必须精准互斥、各司其职，严禁互相抄录流水账；并在回答中温和告知用户拆分的缘由与结构。
5. **现实时钟与时段感知铁律**：你拥有与现实世界完全同步的时间感知，能精确区分清晨、上午、中午、下午、傍晚和深夜。绝不混淆白天与黑夜；在白天（尤其是下午）倾听时，必须立足于当前时段给予当下的陪伴与建议，严禁在白天把时间说成“今晚/晚上”或对用户说“今晚早点睡”。`,
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
  const ipc = (globalThis as any)?.electron?.ipcRenderer

  const readFromFile = () => {
    try {
      if (!ipc?.sendSync) return null
      return ipc.sendSync('settings:get-sync', SETTINGS_KEY)
    } catch {
      return null
    }
  }

  const tryMigrateFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (ipc?.sendSync) {
        ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: parsed })
        localStorage.removeItem(LS_KEY)
      }
      return parsed
    } catch {
      return null
    }
  }

  try {
    const persisted = readFromFile() ?? tryMigrateFromLocalStorage()
    if (!persisted) return { ...DEFAULT_CONFIG }
    const parsed = persisted as Partial<AssistantConfig>

    const mergedBaseURLs = [...DEFAULT_CONFIG.baseURLs]
    if (Array.isArray(parsed?.baseURLs)) {
      for (const entry of parsed.baseURLs) {
        const idx = mergedBaseURLs.findIndex(b => b.url === entry.url)
        if (idx >= 0) {
          mergedBaseURLs[idx] = { ...mergedBaseURLs[idx], ...entry }
        } else {
          mergedBaseURLs.push(entry)
        }
      }
    }

    const mergedPrompts = { ...DEFAULT_CONFIG.prompts, ...(parsed?.prompts || {}) }
    if (
      !mergedPrompts.chatSystem ||
      mergedPrompts.chatSystem.includes('鸡大师') ||
      mergedPrompts.chatSystem.includes('主动调用 create_record 工具将日记持久化保存入库') ||
      mergedPrompts.chatSystem.includes('【路径 B：伴侣倾听与便签流') ||
      !mergedPrompts.chatSystem.includes('小鸡')
    ) {
      mergedPrompts.chatSystem = DEFAULT_CONFIG.prompts.chatSystem
    }

    // 确保 enabledTools 包含必选的核心工具，特别是 manage_memo
    const existingTools = Array.isArray(parsed?.enabledTools) ? parsed.enabledTools : DEFAULT_CONFIG.enabledTools
    const mergedTools = Array.from(new Set([...existingTools, 'manage_memo', 'create_record']))

    // 自动将旧的默认配置迁移为百炼家族聚合模型
    let selectedBaseURL = parsed?.selectedBaseURL || DEFAULT_CONFIG.selectedBaseURL
    let selectedModel = parsed?.selectedModel || DEFAULT_CONFIG.selectedModel
    let intentModel = parsed?.intentModel || DEFAULT_CONFIG.intentModel

    if (selectedModel === 'LongCat-2.0' || !selectedModel) {
      selectedModel = DEFAULT_CONFIG.selectedModel
      selectedBaseURL = DEFAULT_CONFIG.selectedBaseURL
    }
    if (intentModel === 'LongCat-2.0' || !intentModel) {
      intentModel = DEFAULT_CONFIG.intentModel
    }

    const mergedEtl = { ...DEFAULT_CONFIG.etl, ...(parsed?.etl || {}) }
    if (mergedEtl.model === 'LongCat-2.0' || !mergedEtl.model) {
      mergedEtl.model = DEFAULT_CONFIG.etl.model
      mergedEtl.baseURL = DEFAULT_CONFIG.etl.baseURL
    }

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      selectedBaseURL,
      selectedModel,
      intentModel,
      enabledTools: mergedTools,
      baseURLs: mergedBaseURLs,
      prompts: mergedPrompts,
      memory: { ...DEFAULT_CONFIG.memory, ...(parsed?.memory || {}) },
      search: { ...DEFAULT_CONFIG.search, ...(parsed?.search || {}) },
      etl: mergedEtl,
      serendipity: { ...DEFAULT_CONFIG.serendipity, ...(parsed?.serendipity || {}) },
      pagination: { ...DEFAULT_CONFIG.pagination, ...(parsed?.pagination || {}) }
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(partial: Partial<AssistantConfig>) {
  const ipc = (globalThis as any)?.electron?.ipcRenderer
  const current = loadConfig()
  let merged: AssistantConfig = {
    ...current,
    ...partial,
    prompts: { ...current.prompts, ...(partial.prompts || {}) },
    memory: { ...current.memory, ...(partial.memory || {}) },
    search: { ...current.search, ...(partial.search || {}) },
    etl: { ...current.etl, ...(partial.etl || {}) },
    serendipity: { ...current.serendipity, ...(partial.serendipity || {}) },
    pagination: { ...current.pagination, ...(partial.pagination || {}) }
  }

  try {
    // 移除潜在的 Proxy 代理，避免 "An object could not be cloned."
    merged = JSON.parse(JSON.stringify(merged))
  } catch (e) {
    console.warn('转换为普通对象失败:', e)
  }

  try {
    if (ipc?.sendSync) {
      ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: merged })
      return
    }
  } catch { }
  localStorage.setItem(LS_KEY, JSON.stringify(merged))
}

export function resetConfig() {
  const ipc = (globalThis as any)?.electron?.ipcRenderer
  try {
    if (ipc?.sendSync) {
      ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: DEFAULT_CONFIG })
      return
    }
  } catch { }
  localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_CONFIG))
}

export function getPrompt(key: 'chatSystem'): string {
  const cfg = loadConfig()
  return cfg.prompts[key]
}

export function setPrompt(key: 'chatSystem', value: string) {
  saveConfig({ prompts: { [key]: value } as AssistantPrompts })
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
