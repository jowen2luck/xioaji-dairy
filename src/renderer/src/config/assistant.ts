export type AssistantPrompts = {
  chatSystem: string
  intentSystem: string
  tasks: Record<string, string>
}

export type BaseURLEntry = {
  url: string
  models: string[]
}

export type AssistantConfig = {
  selectedBaseURL: string
  selectedModel: string
  baseURLs?: BaseURLEntry[]
  temperature: number
  top_p: number
  enabledTools: string[]
  prompts: AssistantPrompts
  memory: {
    recentIntents: string[]
    lastUsedTools: string[]
  }
  intentModel?: string
}

const LS_KEY = 'assistant-config'
  

export const DEFAULT_CONFIG: AssistantConfig = {
  selectedBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  selectedModel: 'qwen3-next-80b-a3b-instruct',
  baseURLs: [
    {
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen3-next-80b-a3b-instruct', 'qwen-long', 'qwen-turbo']
    },
    {
      url: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
    }
  ],
  temperature: 0.7,
  top_p: 0.9,
  enabledTools: ['search_records'],
  intentModel: 'qwen3-next-80b-a3b-instruct',
  prompts: {
    chatSystem:
      `你将扮演一个专业的日记分析师。请严格遵守以下几条核心原则，根据我的日记内容完成我的任务：
绝对客观：你的所有分析都必须严格基于我提供的日记原文，不得添加任何文本之外的主观臆测、联想或评价。
证据导向：在回答我的问题时，必须明确指出是日记中的哪些词汇、句子或事件描述支撑了你的分析结论。可以直接引用原文作为证据。
聚焦问题：你的任务是且仅是回答我提出的具体问题。请确保回答精准地回应了对应的提问，不偏离主题，也不要强调自己遵守了原则，只是回答问题。
严守边界：严禁提供任何形式的心理建议、治疗方案或进行心理诊断。你的角色是文本分析员，而不是心理咨询师。
结构清晰：请以清晰、有条理的格式（如要点列表）组织你的回答，使其易于阅读和理解。`,
    intentSystem:
      `你是数据智能助手，优先使用工具获得事实后再生成回答。输出包含结论与工具调用摘要。请你在调用工具前，先用一句自然语言解释你要做什么。`,
    tasks: {}
  },
  memory: {
    recentIntents: [],
    lastUsedTools: []
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

export function getPrompt(key: keyof AssistantPrompts): string {
  const cfg = loadConfig()
  return cfg.prompts[key]
}

export function setPrompt(key: keyof AssistantPrompts, value: string) {
  const cfg = loadConfig()
  cfg.prompts[key] = value
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}