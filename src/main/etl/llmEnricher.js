/**
 * LLM ETL 增强引擎
 * 功能：使用大模型深度提取日记中的非结构化信息
 * 
 * 架构设计：
 * - 增量处理：基于内容 Hash 的缓存机制
 * - 异步队列：防止 API 限流
 * - 事件驱动：实时通知前端进度
 * - 批量查询：支持高效的 AI 元数据读取
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { app } from 'electron'

// ==================== Schema 定义（四维度结构） ====================

/**
 * 标准情绪词库 - 用于约束 LLM 的情绪标签提取
 */
export const EMOTION_VOCABULARY = {
    // === 🟢 积极正向 (由高能量到低能量) ===
    positive_high: [
        '狂喜', '振奋', '激动', '热血', '自豪', '成就感', '惊艳', '痛快'
    ],
    positive_flow: [
        '沉浸', '心流', '专注', '充实', '通透', '启发', '好奇', '兴致勃勃'
    ],
    positive_low: [
        '放松', '安心', '惬意', '满足', '治愈', '确幸', '温暖', '舒适', '慵懒'
    ],

    // === 🔴 消极负向 (由外向攻击到内向攻击) ===
    negative_anger: [
        '愤怒', '烦躁', '暴躁', '不满', '厌恶', '鄙视', '抗拒', '不耐烦'
    ],
    negative_frustration: [
        '憋屈', '委屈', '无奈', '挫败', '无力感', '心累', '受挫', '气馁'
    ],
    negative_sadness: [
        '难过', '失望', '沮丧', '低落', '孤独', '空虚', '怅然', '心碎', '遗憾'
    ],
    negative_fear: [
        '焦虑', '不安', '担忧', '恐慌', '心慌', '紧张', '压力山大', '畏难'
    ],

    // === 🟡 社交与关系 (针对你日记中的导师/同门场景) ===
    social: [
        '社恐', '局促', '尴尬', '被理解', '被忽视', '感激', '羡慕', '防备', '坚定', '硬气'
    ],

    // === 🟣 复杂与微妙 (日记中最有价值的部分) ===
    complex: [
        '纠结', '矛盾', '拉扯', '释然', '和解', '怀旧', '五味杂陈', '如释重负', '意犹未尽'
    ],

    // === ⚪️ 中性与状态 ===
    neutral: [
        '平静', '平淡', '放空', '无聊', '麻木', '迷茫', '犹豫', '清醒', '观察'
    ],

    // === 🔵 生理映射心理 (身心一体) ===
    physical_psych: [
        '疲惫', '昏沉', '紧绷', '窒息感', '瑟缩', '饥渴', '舒展'
    ]
}

/**
 * AI 提取元数据 Schema（四维度结构）
 */
export const ETL_SCHEMA = {
  type: 'object',
  description: '从日记中提取的深度元数据，包含元分析、场景行为、情绪归因、智慧资产四个维度。',
  properties: {
    // ==================== 维度一：元数据分析 (Meta Analysis) ====================
    content_type: {
      type: 'string',
      enum: ['DailyLog', 'Reflection', 'Letter', 'Idea'],
      description: '内容体裁：DailyLog(日常记录), Reflection(深度感悟), Letter(书信/对话), Idea(灵感/备忘)'
    },
    summary: {
      type: 'string',
      description: '精炼摘要（15-50字）。格式建议：Who(谁) + Do(核心事件) + Feeling(体验/结果)。'
    },

    // ==================== 维度二：场景与行为 (Activity Context) ====================
    main_action: {
      type: 'string',
      description: '核心动作。如：写代码、散步、拒绝任务、刷剧。'
    },
    people_involved: {
      type: 'array',
      items: { type: 'string' },
      description: '涉及人物列表。规则：1. 除非明确写了"独自"，否则必须提取所有出现的人物称谓（如导师、同门、朋友）；2. 即使没有对话，只要人在场也算。'
    },
    interaction: {
      type: 'string',
      description: '交互性质。描述人与人之间的动态，如：拒绝导师派活、分享瑞士卷、争吵、闲聊。若无交互填 null。'
    },
    items: {
      type: 'array',
      items: { type: 'string' },
      description: '具体实体名称。规则：**严禁使用统称**。错误示例：["书", "饭", "剧"]；正确示例：["《跨越边界的社区》", "必胜客披萨", "《唐诡》", "Electron框架"]。'
    },

    // ==================== 维度三：情绪与归因 (Emotional Profile) ====================
    mood_tags: {
      type: 'array',
      items: { type: 'string' },
      description: '精准情绪标签。规则：1. 必须优先使用高颗粒度词汇（如：确幸、憋屈、心流、坚定）；2. 避免仅使用"开心/难过"等笼统词；3. 结合动作推断情绪（如拒绝不合理要求->坚定/硬气）。'
    },
    energy_level: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: '能量值(1-10)。1=瘫倒/极度疲惫，5=平淡/日常，8=心流/兴奋，10=狂喜/极度亢奋。'
    },
    root_cause: {
      type: 'string',
      description: '情绪产生的核心归因。简述是什么触发了上述情绪（如：维护了个人边界、吃到了美食、天气寒冷）。'
    },

    // ==================== 维度四：智慧资产 (Intellectual Assets) ====================
    key_quotes: {
      type: 'array',
      items: { type: 'string' },
      description: '智慧资产提取。规则：原文摘录日记中的感悟、哲理、反思或金句。**必须保持原文，不得改写**。'
    }
  },
  // 强制要求以下字段，防止 LLM 偷懒返回 null
  required: ['content_type', 'summary', 'mood_tags', 'people_involved', 'items']
}

// ==================== Prompt 模板（四维度结构） ====================

/**
 * 构建 ETL Prompt（完整文本传输，无截断）
 */
export function buildETLPrompt(record) {
    const emotionVocab = Object.values(EMOTION_VOCABULARY).flat().join('、')
    const cleanContent = (record.ganshou || '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
    const fullText = `
【时间】：${record.time || '未知'}
【项目】：${record.shanggexiangmu || '未分类'}
【时长】：${record.chixushijian || '未知'}
【日记正文】：
${cleanContent}
`.trim();

    return `
# Role
你是一位拥有敏锐洞察力的**个人叙事分析师**。你的任务是从用户的日记中挖掘深层信息，构建高保真的元数据。
请不要只做字面提取，要像侦探一样分析**潜台词、社交动态和情绪暗流**。

# Input Data
${fullText}

# Extraction Guidelines (思维链)
在提取之前，请先进行以下逻辑推理（无需输出推理过程，但必须执行）：
1.  **寻找隐性人物**：文中是否提到了"导师"、"同门"、"室友"、"对象"？即使没有对话，只要人在场，就算"people_involved"。
2.  **寻找具体名词**：
    *   不要输出"吃的"，要提取"必胜客"、"瑞士卷"。
    *   不要输出"看书"，要提取"《百年孤独》"。
    *   不要输出"看剧"，要提取"《唐朝诡事录》"。
3.  **分析交互动态**：如果有"导师过来派活"且"我拒绝了"，这是高价值的"Interaction"，必须记录。
4.  **挖掘金句**：凡是关于人生、职场、哲理的完整句子，必须原文摘录到 "key_quotes"。

# Schema Definitions
请严格填充以下 JSON 字段：

1.  **summary**: (String) 包含"Who(谁)+Do(做了什么)+Feeling(什么感觉)"的摘要。不要写流水账，要概括核心事件。
2.  **content_type**: (String) DailyLog(日常) | Reflection(感悟) | Letter(信件) | Idea(灵感)
3.  **main_action**: (String) 核心动作。
4.  **people_involved**: (Array<String>) **关键**。提取所有出现的人物称谓。若确实只有自己，填空数组。
5.  **interaction**: (String|null) 描述人与人的互动（如：拒绝导师任务、分享零食）。
6.  **items**: (Array<String>) **关键**。提取所有专有名词（书名/影名/食物/软件/地名）。
7.  **mood_tags**: (Array<String>) 精准情绪标签（数组，从标准词库选取）,从动作和语境推断情绪（如：拒绝任务->坚定/释然；吃甜点->满足/确幸）。
【标准情绪词库】
${emotionVocab}
8.  **energy_level**: (Number 1-10) 1=瘫倒，5=日常，10=极度兴奋。
9.  **root_cause**: (String) 导致情绪的直接原因。
10. **key_quotes**: (Array<String>) 原文摘录的有价值的思考。

# Output Format
仅返回纯 JSON 字符串。无 Markdown。

# Example (Reference)
Input: "导师要把杂活给我，我直接拒绝了。回来吃了块蛋糕，真爽。"
Output:
{
  "content_type": "DailyLog",
  "summary": "拒绝了导师的不合理任务，并通过美食自我奖励",
  "main_action": "沟通/饮食",
  "people_involved": ["导师"],
  "interaction": "拒绝导师派发的杂活",
  "items": ["蛋糕"],
  "mood_tags": ["满足", "坚定"],
  "energy_level": 8,
  "root_cause": "成功维护边界且吃到美食",
  "key_quotes": []
}
`;
}

// ==================== ETL 引擎核心类 ====================

export class LLMEnricher {
    constructor(config, eventCallback) {
        this.config = config
        this.eventCallback = eventCallback || (() => { })
        this.cacheFilePath = path.join(app.getPath('userData'), config.cacheFile)
        this.cache = this.loadCache()
        this.queue = []
        this.processing = false
        this.needSaveCache = false
        this.stats = {
            total: 0,
            processed: 0,
            cached: 0,
            failed: 0
        }
    }

    // ==================== 缓存管理 ====================

    loadCache() {
        try {
            if (fs.existsSync(this.cacheFilePath)) {
                const raw = fs.readFileSync(this.cacheFilePath, 'utf-8')
                const data = JSON.parse(raw)
                console.log(`[LLMEnricher] Loaded cache: ${Object.keys(data.items || {}).length} items, version: ${data.version}`)
                return data
            }
        } catch (error) {
            console.error('[LLMEnricher] Failed to load cache:', error)
        }

        return {
            version: this.config.promptVersion,
            items: {}
        }
    }

    async saveCache() {
        try {
            const jsonString = JSON.stringify(this.cache, null, 2)
            const tempPath = this.cacheFilePath + '.tmp'
            await fs.promises.writeFile(tempPath, jsonString, 'utf-8')
            await fs.promises.rename(tempPath, this.cacheFilePath)
            console.log(`[LLMEnricher] ✅ Cache saved atomically: ${Object.keys(this.cache.items).length} items`)
        } catch (error) {
            console.error('[LLMEnricher] ❌ Failed to save cache:', error)
            throw error
        }
    }

    // ==================== Hash 计算 ====================

    computeRecordHash(record) {
        const content = (record.ganshou || '') + (record.tiyan || '')
        const category = record.shanggexiangmu || ''

        let timeKey = ''
        if (record.time) {
            try {
                const timeStr = String(record.time)
                const match = timeStr.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)
                timeKey = match ? match[1] : timeStr
            } catch {
                timeKey = String(record.time)
            }
        }

        const key = [content, category, timeKey].join('||')
        const normalizedKey = key.trim()
        return crypto.createHash('md5').update(normalizedKey, 'utf-8').digest('hex')
    }

    // ==================== 新增：批量查询接口 ====================

    /**
     * 根据 Hash 查询单条记录的 AI 元数据
     * @param {string} hash - 记录的 Hash 值
     * @returns {Object|null} - AI 元数据对象，如果不存在返回 null
     */
    getCachedMetadata(hash) {
        return this.cache.items[hash]?.data || null
    }

    /**
     * 批量查询多条记录的 AI 元数据
     * @param {Array<string>} hashes - Hash 值数组
     * @returns {Map<string, Object>} - Hash 到 AI 元数据的映射
     */
    batchGetMetadata(hashes) {
        const result = new Map()
        for (const hash of hashes) {
            const metadata = this.getCachedMetadata(hash)
            if (metadata) {
                result.set(hash, metadata)
            }
        }
        console.log(`[LLMEnricher] Batch query: ${hashes.length} hashes, ${result.size} hits`)
        return result
    }

    /**
     * 检查缓存是否已加载
     * @returns {boolean}
     */
    isCacheLoaded() {
        return this.cache && Object.keys(this.cache.items).length > 0
    }

    // ==================== 差异检测 ====================

    async detectDirty(records, forceRefresh = false) {
        const dirty = []
        const versionMismatch = this.cache.version !== this.config.promptVersion
        
        if (versionMismatch) {
            console.log(`[LLMEnricher] Cache version mismatch (${this.cache.version} -> ${this.config.promptVersion}), updating version...`)
            this.cache.version = this.config.promptVersion
            this.needSaveCache = true
        }

        for (const record of records) {
            const hash = this.computeRecordHash(record)

            if (forceRefresh) {
                dirty.push({ record, hash })
                continue
            }

            if (!this.cache.items[hash]) {
                dirty.push({ record, hash })
            } else {
                this.stats.cached++
            }
        }

        console.log(`[LLMEnricher] Detected ${dirty.length} dirty records, ${this.stats.cached} cached${forceRefresh ? ' (FORCE REFRESH MODE)' : ''}${versionMismatch ? ' (version updated)' : ''}`)

        return dirty
    }

    // ==================== LLM 调用 ====================

    isRetriableError(error, statusCode) {
        if (statusCode === 401) return false
        if (statusCode === 400) return false
        if (statusCode === 429) return true
        if (statusCode === 502) return true
        if (statusCode === 503) return true
        if (error.message?.includes('timeout')) return true
        if (error.message?.includes('ECONNREFUSED')) return true
        return true
    }

    async callLLM(prompt, attempt = 1) {
        const maxRetries = 4
        const baseDelay = 1000

        const apiKey = getAPIKeyForBaseURL(this.config.baseURL)
        if (!apiKey) {
            throw new Error('API key not found for baseURL: ' + this.config.baseURL)
        }

        try {
            console.log(`[LLMEnricher] 🤖 Calling LLM ${this.config.model} (attempt ${attempt}/${maxRetries})`)

            const response = await fetch(`${this.config.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: [
                        {
                            role: 'system',
                            content: this.config.systemPrompt || 'You are a professional diary metadata extractor. Return only valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: this.config.temperature,
                    response_format: { type: 'json_object' }
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                const error = new Error(`LLM API error: ${response.status} - ${errorText}`)

                if (this.isRetriableError(error, response.status) && attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt - 1)
                    console.warn(`[LLMEnricher] ⚠️ Retry ${attempt}/${maxRetries} after ${delay}ms (status: ${response.status})`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                    return this.callLLM(prompt, attempt + 1)
                }

                throw error
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content

            if (!content) {
                throw new Error('Empty response from LLM')
            }

            let cleanedContent = content.trim()
            cleanedContent = cleanedContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
            cleanedContent = cleanedContent.trim()

            console.log(`[LLMEnricher] ✅ LLM response received (${cleanedContent.length} chars)`)

            return JSON.parse(cleanedContent)

        } catch (error) {
            if (this.isRetriableError(error, null) && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1)
                console.warn(`[LLMEnricher] ⚠️ Network error, retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`)
                await new Promise(resolve => setTimeout(resolve, delay))
                return this.callLLM(prompt, attempt + 1)
            }

            throw error
        }
    }

    // ==================== 队列处理 ====================

    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return
        }

        this.processing = true
        let saveCounter = 0

        while (this.queue.length > 0) {
            const { record, hash } = this.queue.shift()

            try {
                this.eventCallback({
                    type: 'progress',
                    data: {
                        total: this.stats.total,
                        processed: this.stats.processed,
                        cached: this.stats.cached,
                        failed: this.stats.failed,
                        current: record
                    }
                })

                const prompt = buildETLPrompt(record)
                const result = await this.callLLM(prompt)

                this.cache.items[hash] = {
                    timestamp: Date.now(),
                    data: result
                }

                this.stats.processed++
                saveCounter++

                console.log('\n' + '='.repeat(80))
                console.log(`[LLMEnricher] 📊 Record ${this.stats.processed}/${this.stats.total} - AI提取结果`)
                console.log('='.repeat(80))
                console.log('原始记录ID:', record._id)
                console.log('项目类别:', record.shanggexiangmu)
                console.log('持续时间:', record.chixushijian)
                console.log('\n🤖 AI提取的结构化数据:')
                console.log(JSON.stringify(result, null, 2))
                console.log('='.repeat(80) + '\n')

                if (saveCounter >= this.config.batchSize) {
                    await this.saveCache()
                    saveCounter = 0
                }

                this.eventCallback({
                    type: 'record-updated',
                    data: {
                        hash,
                        aiMeta: result
                    }
                })

                console.log(`[LLMEnricher] Processed ${this.stats.processed}/${this.stats.total}: ${result.summary}`)

            } catch (error) {
                console.error(`[LLMEnricher] Failed to process record:`, error)
                this.stats.failed++

                this.eventCallback({
                    type: 'error',
                    data: {
                        error: error.message,
                        record
                    }
                })
            }

            await new Promise(resolve => setTimeout(resolve, 200))
        }

        await this.saveCache()

        this.eventCallback({
            type: 'complete',
            data: {
                stats: this.stats
            }
        })

        this.processing = false
        console.log(`[LLMEnricher] Queue processing complete:`, this.stats)
    }

    // ==================== 公开 API ====================

    async enrich(records, options = {}) {
        const { forceRefresh = false } = options

        this.stats = {
            total: records.length,
            processed: 0,
            cached: 0,
            failed: 0
        }

        const dirtyItems = await this.detectDirty(records, forceRefresh)
        this.queue = dirtyItems

        if (dirtyItems.length === 0) {
            if (this.needSaveCache) {
                await this.saveCache()
                this.needSaveCache = false
            }
            
            this.eventCallback({
                type: 'complete',
                data: {
                    stats: this.stats,
                    message: 'All records already cached'
                }
            })
            return
        }

        this.eventCallback({
            type: 'start',
            data: {
                total: this.stats.total,
                toProcess: dirtyItems.length
            }
        })

        this.processQueue()
    }

    getMetadata(record) {
        const hash = this.computeRecordHash(record)
        return this.cache.items[hash]?.data || null
    }

    enrichRecords(records) {
        return records.map(record => ({
            ...record,
            _ai_meta: this.getMetadata(record)
        }))
    }

    getProgress() {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            processing: this.processing
        }
    }
}

// ==================== API Key 映射 ====================

const API_KEY_MAP = {
    'https://dashscope.aliyuncs.com/compatible-mode/v1': 'DASHSCOPE_API_KEY_QWEN',
    'https://uni-api.cstcloud.cn/v1': 'DASHSCOPE_API_KEY_SCTCLOUD',
    'https://api.openai.com/v1': 'OPENAI_API_KEY'
}

function getAPIKeyForBaseURL(baseURL) {
    const envVar = API_KEY_MAP[baseURL]
    if (envVar && process.env[envVar]) {
        return process.env[envVar]
    }
    return process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
}
