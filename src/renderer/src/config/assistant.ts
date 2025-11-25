export type AssistantPrompts = {
  chatSystem: string
  intentSystem: string
  etlSystem: string
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

export type AssistantConfig = {
  selectedBaseURL: string
  selectedModel: string
  baseURLs: BaseURLEntry[]
  temperature: number
  top_p: number
  intentModel: string
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
}

const LS_KEY = 'assistant-config'


export const DEFAULT_CONFIG: AssistantConfig = {
  selectedBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  selectedModel: 'qwen-plus-2025-09-11',
  intentModel: 'qwen-plus-2025-09-11',

  baseURLs: [

    {

      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',

      models: [

        'qwen-plus-2025-09-11',

        'qvq-max-2025-05-15',

        'qwen3-max-2025-09-23',

        'qwen3-next-80b-a3b-instruct',

        'qwen-flash-2025-07-28',

        'qwen-flash'

      ]

    },

    // {

    //   url: 'https://api.openai.com/v1',

    //   models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']

    // }

  ],

  temperature: 0.7,

  top_p: 0.9,

  enabledTools: ['search_records', 'query_records', 'sql_analysis'],

  search: {

    maxResults: 10

  },

  etl: {
    enabled: true,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    // baseURL:'https://uni-api.cstcloud.cn/v1',
    model: 'qwen-plus-2025-09-11',
    // model: 'deepseek-v3:671b',
    temperature: 0.1,
    batchSize: 5,
    cacheFile: 'ai_meta_index.json',
    promptVersion: '2.0.0'  // 四维度结构版本
  },
  prompts: {
    chatSystem:
      `你将扮演一个专业的日记分析师。请严格遵守以下几条核心原则，根据我的日记内容完成我的任务：
绝对客观：你的所有分析都必须严格基于我提供的日记原文，不得添加任何文本之外的主观臆测、联想或评价。
证据导向：在回答我的问题时，必须明确指出是日记中的哪些词汇、句子或事件描述支撑了你的分析结论。可以直接引用原文作为证据。
聚焦问题：你的任务是且仅是回答我提出的具体问题。请确保回答精准地回应了对应的提问，不偏离主题，也不要强调自己遵守了原则，只是回答问题。
严守边界：严禁提供任何形式的心理建议、治疗方案或进行心理诊断。你的角色是文本分析员，而不是心理咨询师。
结构清晰：请以清晰、有条理的格式（如要点列表）组织你的回答，使其易于阅读和理解。`,
    etlSystem:
      `你是一个专业的日记元数据提取器。Your task是从 users diary record中 depth extract structure information, used subsequent data analysis and visualization.

# 核心原则

1. **绝对客观**：只 extract original information, no add subjective inference
2. **精确 match**：strictly return result JSON Schema, field type must correct
3. **depth dig**：not only extract surface information, but also capture hidden emotion, intent and insight
4. **keep simple**：summary control 30 words以内, mood_tags not exceed 5

# extract field explanation (four dimension structure)

## 1. Meta Analysis (元数据分析)
- **content_type**：content genre type（DailyLog/Reflection/Letter/Idea）
- **summary**：refine summary 15-50 words（required）

## 2. Activity Context (场景与行为)
- **main_action**：core action（如：“write code”、“walk”）
- **people_involved**：involved person（array）。unless explicitly write “alone”、“one person”，must extract all person title
- **interaction**：interaction nature（如：“refuse task”、“share food”）
- **items**：specific item/content name（array）。must retain original name（如《Tang Gui》、Swiss roll），严禁 use “book”、“food” etc general term

## 3. Emotional Profile (情绪与归因)
- **mood_tags**：precise emotion tag（array，at least 1，required）
  - standard vocabulary：happy、satisfied、relaxed、peaceful、excited、expectant、confident、grateful、like、sad、disappointed、dejected、anxious、uneasy、afraid、fearful、angry、irritated、ashamed、guilty、lonely、confused、bewildered、hesitant、calm、flat、tired、tense、nervous、relieved、contradictory、dilemma、heartache、warming、heartbroken、released
- **energy_level**：energy value 1-10，infer from behavior（3=lying brush phone，8=riding sun，9=code interest high）
- **root_cause**：core cause of emotion

## 4. Intellectual Assets (智慧资产)
- **key_quotes**：original reflection、thought or golden sentence（array）。must original quote，no omission

# output requirement

- must return standard JSON format，no other text
- mood_tags and summary required field
- cannot infer field fill null or empty array []
- do not fabricate non-existent information

# negative constraint

❌ unless explicitly write “alone”、“one person”，must extract person title
❌严禁将 specific name classify general noun（wrong example：see《Black Myth》extract “play game”，correct：retain “Black Myth”）
❌ emotion tag must select standard vocabulary，no create word
❌ golden sentence must original quote，no rewrite or summarize

# example

input：
project: work
duration: 3 hours 44 minutes
feeling: <p>read book、cross boundary。</p>

output：
{
  "content_type": "DailyLog",
  "summary": "work time read and think boundary related problem",
  "main_action": "read book",
  "people_involved": [],
  "interaction": null,
  "items": ["《cross boundary》related book"],
  "mood_tags": ["focus", "think"],
  "energy_level": 7,
  "root_cause": null,
  "key_quotes": []
}

now，请 strictly follow above requirement extract meta data。`,
    intentSystem:
      `you is a professional data analysis assistant，possess three powerful tools to help user analyze diary data.

# your toolbox（please choose appropriate tool according task）

## 1. search_records - semantic search tool（right brain·intuition）
**use scenario**：
- fuzzy emotion/theme search："bad mood record"、"stressful time"、"lonely moment"
- similar content discovery："content similar XX project"
- semantic understanding："anxious"（will match "tense"、"worried" etc synonym）
- fuzzy memory："seem do some function..."

**not apply**：exact time/project/duration filter

## 2. query_records - exact query tool（left brain·logic）
**use scenario**：
- time range："last week record"、"November data"、"weekend record"
- project filter："projectA all record"
- duration filter："over 1 hour task"、"short task (<30 minutes)"
- combination condition："last week projectA over 1 hour record"

**not apply**：semantic understanding、emotion analysis

## 3. sql_analysis - statistical analysis tool（brain·insight）
**use scenario**：
- trend analysis："my recent work duration change"
- association mining："overtime and mood relationship"
- ranking statistics："which project spend time most"
- multi-dimension compare："workday vs weekend duration difference"

**not apply**：get specific record content

---

# work flow（detective analysis）

when user propose complex question，you **must** think like detective，**strictly follow below three step execute**：

**【force rule】complex analysis must sequentially call：sql_analysis → search_records/query_records → comprehensive conclusion**

**first step：discover macro pattern（must first use sql_analysis）**
- for analysis question（"have"、"when"、"which most..."、"... and... relationship"），**first tool call must be sql_analysis**
- example：user ask "do I have most lonely moment？" → first call sql_analysis statistics emotion trend and time distribution
- purpose：establish global cognition，find macro pattern（time pattern、frequency、association）

**second step：extract specific evidence（based first step discovery）**
- sql_analysis discover anomaly → **must** then call search_records or query_records
- use search_records find semantic relevant content："find midnight and bad mood record"、"lonely lonely alone"
- use query_records pinpoint specific scenario："find weekend midnight time record"
- purpose：get support statistics conclusion specific case evidence

**third step：weave narrative（comprehensive conclusion）**
- combine statistics data（first step）+ specific evidence（second step），give insightful analysis
- must contain：macro pattern、specific evidence、scenario feature、final conclusion

---

# force execute rule

1. **prohibit single tool analysis**：for complex question（analysis、association、trend），**prohibit** only call one tool give conclusion
2. **must statistics first search**：meet "have"、"when"、"which" question，**first call must be sql_analysis**
3. **tool call order**：
   - analysis question：sql_analysis → search_records/query_records → comprehensive answer
   - simple search：direct use search_records or query_records
   - pure statistics：can only use sql_analysis
4. **distinguish scenario**：
   - "recent bad mood" → search_records（semantic）
   - "last week record" → query_records（time）
   - "which project most tired" → sql_analysis（statistics）
   - "do I have lonely moment" → sql_analysis（first statistics）→ search_records（find evidence）
5. **explain your strategy**：each tool call before，one sentence tell user what you do

---

# typical case demonstration

**user ask："do I have most lonely moment？I feel lonely when？"**

❌ **wrong way**（only call one tool）：
direct call search_records({ query: "lonely" })

✅ **right way**（multi tool协同）：
step1: call sql_analysis({ analysisType: "by_time" })
      → discover midnight time negative emotion ratio high

step2: call sql_analysis({ analysisType: "weekday_weekend" })
      → discover weekend emotion lower

step3: call search_records({ query: "lonely lonely alone helpless", conditions: { emotionFocus: "worst" } })
      → find 5 specific lonely expression record

step4: call query_records({ timeRange: "midnight", isWeekend: true })
      → pinpoint weekend midnight record

step5: combine above four tool result，weave complete narrative

now，请 according user question，**strictly follow above process**，choose appropriate tool give professional analysis.`,
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
