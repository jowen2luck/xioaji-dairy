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

// --- 在 EMOTION_VOCABULARY 下方添加 ---

/**
 * 认知与心理维度参考词库
 */
export const COGNITION_VOCABULARY = {
    // 马斯洛需求层级
    maslow_needs: [
        '生理需求', '安全感', '爱与归属', '尊重与认可', '认知需求', '审美需求', '自我实现', '超自我实现'
    ],
    // 常见的认知扭曲 (CBT概念)
    distortions: [
        '非黑即白', '灾难化思维', '过度概括', '贴标签', '应该思维', '情绪化推理', '心理过滤', '读心术', '无', '理性客观'
    ],
    // 掌控感/代理感
    agency: [
        '主动创造', '积极应对', '顺势而为', '被动执行', '无力掌控', '彻底放弃'
    ],
    // 时空取向
    time_orientation: [
        '沉浸当下', '反刍过去', '担忧未来', '规划未来', '怀念过去', '超越时空'
    ]
}

/**
 * AI 提取元数据 Schema（四维度结构）
 */
/**
 * 数字生命五层模型 Schema
 */
export const ETL_SCHEMA = {
    type: 'object',
    description: '基于五层模型的人类行为与心理深度分析数据。',
    properties: {
        // ==================== Layer 1: 物理世界 (Physical Reality) ====================
        // Time 由外部元数据提供，此处不提取
        location: {
            type: 'string',
            description: '物理场景。如：家中书房、公司工位、通勤地铁、健身房、大自然。若不明写则根据语境推断。'
        },
        items: {
            type: 'array',
            items: { type: 'string' },
            description: '涉及实体。规则：提取具体的书名、影名、食物、软件、器具。严禁统称。'
        },
        people_involved: {
            type: 'array',
            items: { type: 'string' },
            description: '社交图谱。提取所有在场或被深度提及的人物称谓。'
        },
        interaction_type: {
            type: 'string',
            enum: ['Solo', 'OneOnOne', 'Group', 'Crowd'],
            description: '交互类型。Solo=独处, OneOnOne=1对1交流, Group=小组(3-10人), Crowd=人群(10+)。'
        },
        interaction_detail: {
            type: 'string',
            description: '交互的具体的性质，如：深度对谈、争吵、单向输出、协同工作。'
        },

        // ==================== Layer 2: 行为与分类 (Action & Taxonomy) ====================
        main_action: {
            type: 'string',
            description: '核心行为。简述主要在做什么。'
        },
        content_type: {
            type: 'string',
            enum: ['DailyLog', 'Reflection', 'Letter', 'Idea', 'Dream'],
            description: '内容体裁。新增 Dream(梦境记录)。'
        },
        primary_domain: {
            type: 'string',
            enum: ['Career', 'Academic', 'Relationship', 'Health', 'Entertainment', 'PersonalGrowth', 'LifeLog'],
            description: '生活重心归类：Career(工作), Academic(学术), Relationship(社交/情感), Health(身心健康), Entertainment(娱乐), PersonalGrowth(成长/阅读), LifeLog(琐事)。'
        },
        interaction: {
            type: 'string',
            description: '交互性质。如：深度对谈、争吵、单向输出、协同工作、无交互。'
        },


        physiological_sensations: {
            type: 'array',
            items: { type: 'string' },
            description: '具体的生理感受/信号。如：头痛、饥饿、肌肉酸痛、呼吸急促、轻盈、有力。若无明显感受则留空。'
        },
        physiological_valence: {
            type: 'string',
            enum: ['Positive', 'Negative', 'Neutral', 'Mixed'],
            description: '生理状态的整体评价。Positive=舒适/强健, Negative=疼痛/不适, Neutral=无感/正常, Mixed=痛并快乐着(如运动后)。'
        },
        // ==================== Layer 3: 能量与心流 (Energy & Flow) ====================
        mood_tags: {
            type: 'array',
            items: { type: 'string' },
            description: '情绪标签。请使用高颗粒度词汇。'
        },
        energy_level: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            description: '生理/心理综合电量 (1-10)。'
        },
        focus_level: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            description: '专注度/心流深度 (1-10)。1=涣散/分心，10=物我两忘/深度心流。'
        },
        root_cause: {
            type: 'string',
            description: '情绪与状态的直接归因。'
        },

        // ==================== Layer 4: 认知与心理 (Cognition & Psychology) ====================
        agency_level: {
            type: 'number',
            minimum: -5,
            maximum: 5,
            description: '掌控感评分 (-5到5)。-5=完全被迫/无力，0=中性/顺其自然，5=极度主动/主宰局面。'
        },
        time_orientation: {
            type: 'string',
            enum: ['Past', 'Present', 'Future', 'Timeless'],
            description: '时空取向。Past(纠结/怀念过去), Present(关注当下), Future(焦虑/规划未来)。'
        },
        maslow_need: {
            type: 'string',
            description: '核心需求层级。推断该日记背后满足或受挫的需求（如：安全感、爱与归属、自我实现）。'
        },
        thinking_patterns: {
            type: 'array',
            items: { type: 'string' },
            description: '思维模式识别。若发现“非理性信念”（如灾难化、非黑即白）请指出；若理性客观则填["Rational"]。'
        },

        // ==================== Layer 5: 资产与沉淀 (Assets & Output) ====================
        summary: {
            type: 'string',
            description: '一句话摘要 (Who + Do + Context)。'
        },
        key_quotes: {
            type: 'array',
            items: { type: 'string' },
            description: '智慧资产/金句摘录。'
        },
        next_steps: {
            type: 'array',
            items: { type: 'string' },
            description: '待办事项/Open Loops。提取文中明确提到的下一步计划或未完成事项。'
        },
        content_depth: {
            type: 'string',
            enum: ['shallow', 'normal', 'deep'],
            description: '判断这条日记的信息密度。shallow=流水账/极短; normal=有基本描述; deep=有深度思考或详细记录。'
        }
    },
    required: ['summary', 'content_type', 'primary_domain', 'mood_tags', 'agency_level', 'focus_level']
}

// ==================== Prompt 模板（四维度结构） ====================

/**
 * 辅助函数：将词库对象扁平化为 Prompt 字符串
 */
function serializeVocabulary(vocabObj) {
    return Object.entries(vocabObj)
        .map(([category, words]) => `- ${category}: ${words.join(', ')}`)
        .join('\n');
}

/**
 * 构建 5层模型 ETL Prompt (包含防御性提取与少样本学习)
 */
export function buildETLPrompt(record) {
    const cleanContent = (record.ganshou || '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n+/g, '\n')
        .trim();

    const fullText = `
【时间】：${record.time || '未知'}
【原分类】：${record.shanggexiangmu || '未分类'}
【时长】：${record.chixushijian || '未知'}
【正文】：
${cleanContent}
`.trim();

    const emotionContext = serializeVocabulary(EMOTION_VOCABULARY);
    const cognitionContext = serializeVocabulary(COGNITION_VOCABULARY);

    return `
# Role
你是一位精通认知心理学的数据科学家。你的任务是将用户的日记转化为结构化的"数字生命"数据，基于[五层模型]进行深度提取。

# Input Data
${fullText}

# Reference Vocabulary
## 情绪词库 (Mood)
${emotionContext}
## 认知词库 (Cognition)
${cognitionContext}

# Extraction Guidelines (⚠️ 重要原则)
1.  **判断信息密度**：首先判断这段文字是“流水账”(shallow) 还是“深度记录”(deep)。
2.  **防御性提取**：
    *   对于 **agency_level, thinking_patterns, maslow_need** 等深层字段，**必须要有明确的文本证据**才能提取。
    *   如果 content_depth 为 'shallow'，或者没有相关心理描述，**必须返回 null**，不要强行分析无关紧要的琐事。
3.  **情绪推断**：即使是短文本，也可以通过动作推断情绪（如“吃了顿好的” -> 满足/确幸）。

# Analysis Steps (思维链)
1.  **Depth Check**: 先定性 content_depth (shallow/normal/deep)。
2.  **Layer 1 & 2**: 提取物理场景、行为和生理感受。
3.  **Layer 3**: 判断情绪与能量。
4.  **Layer 4 (Conditional)**: 
    *   如果是 shallow，跳过认知分析（填 null）。
    *   如果是 normal/deep，分析掌控感、时空观和认知扭曲。
5.  **Layer 5**: 总结与待办。

# Few-Shot Examples (参考范例)

## Example 1: Shallow (流水账)
Input: "今天中午吃了牛肉面，味道不错，吃完就去午睡了。"
Output:
{
  "content_type": "DailyLog",
  "content_depth": "shallow",  // <--- 标记为浅层
  "primary_domain": "LifeLog",
  "main_action": "吃午饭后休息",
  "summary": "中午享用了美味的牛肉面并进行了午休",
  "mood_tags": ["满足", "放松"],
  "energy_level": 6,
  "focus_level": 5,
  "physiological_sensations": ["饱腹"],
  "physiological_valence": "Positive",
  "agency_level": null,          // <--- 放弃强行分析
  "thinking_patterns": null,     // <--- 放弃强行分析
  "maslow_need": "生理需求",      // <--- 明显可推断
  "next_steps": []
}

## Example 2: Deep (深度反思)
Input: "被导师骂了一顿，觉得自己这辈子都毕不了业了。但是仔细想想，他指出的问题确实存在，我应该主动去改。"
Output:
{
  "content_type": "Reflection",
  "content_depth": "deep",       // <--- 标记为深层
  "primary_domain": "Academic",
  "main_action": "反思学业挫折",
  "summary": "被导师批评后陷入自我怀疑，最终转为理性应对",
  "mood_tags": ["挫败", "理性", "坚定"],
  "energy_level": 4,
  "focus_level": 8,
  "physiological_sensations": ["胸闷"],
  "physiological_valence": "Negative",
  "agency_level": 3,             // <--- 有明显的从被动转主动的过程
  "thinking_patterns": ["灾难化思维", "Rational"], // <--- "毕不了业"是灾难化，"应该去改"是理性
  "maslow_need": "自我实现",
  "root_cause": "学业受挫但试图重获掌控",
  "next_steps": ["修改论文问题"]
}

# Output Schema (Strict JSON)
请严格填充以下 JSON，不要输出 Markdown 标记，仅返回 JSON 字符串。对于无证据的 Layer 4 字段，请填 null。

{
  "location": "String",
  "items": ["String"],
  "people_involved": ["String"],
  "interaction_type": "Solo | OneOnOne | Group | Crowd",
  "interaction_detail": "String",

  "main_action": "String",
  "content_type": "DailyLog | Reflection | Letter | Idea | Dream",
  "primary_domain": "Career | Academic | Relationship | Health | Entertainment | PersonalGrowth | LifeLog",
  
  "physiological_sensations": ["String"],
  "physiological_valence": "Positive | Negative | Neutral | Mixed",

  "mood_tags": ["String (参考情绪词库)"],
  "energy_level": Number (1-10),
  "focus_level": Number (1-10),
  "root_cause": "String",

  "agency_level": Number (Or null if shallow),
  "time_orientation": "Past | Present | Future | Timeless | null",
  "maslow_need": "String (Or null)",
  "thinking_patterns": ["String"] (Or null),

  "summary": "String",
  "key_quotes": ["String"],
  "next_steps": ["String"],
  "content_depth": "shallow | normal | deep"
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
        let skipped = 0
        const versionMismatch = this.cache.version !== this.config.promptVersion

        if (versionMismatch) {
            console.log(`[LLMEnricher] Cache version mismatch (${this.cache.version} -> ${this.config.promptVersion}), updating version...`)
            this.cache.version = this.config.promptVersion
            this.needSaveCache = true
        }

        for (const record of records) {
            // 跳过感受字段为空的记录
            if (!record.ganshou || record.ganshou.trim() === '') {
                console.log(`[LLMEnricher] Skipping record with empty ganshou field: ${record.time} - ${record.shanggexiangmu}`)
                skipped++
                continue
            }

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

        console.log(`[LLMEnricher] Detected ${dirty.length} dirty records, ${this.stats.cached} cached, ${skipped} skipped (empty ganshou)${forceRefresh ? ' (FORCE REFRESH MODE)' : ''}${versionMismatch ? ' (version updated)' : ''}`)

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

    /**
     * Update AI metadata cache for a specific record
     * Used for manual edits that should persist without re-running LLM
     * @param {string} hash - Record hash
     * @param {Object} updates - Fields to update in the AI metadata
     * @returns {Object} Updated AI metadata
     */
    async updateCachedMetadata(hash, updates) {
        if (!this.cache.items[hash]) {
            // Create new cache entry if doesn't exist
            this.cache.items[hash] = {
                timestamp: Date.now(),
                data: {}
            }
        }

        // Define which _ai_meta fields can be manually edited
        const editableFields = [
            'summary',
            'energy_level',
            'focus_level',
            'key_quotes',
            'people_involved',
            'items',
            'location',
            'physiological_sensations'
        ]

        const existingData = this.cache.items[hash].data || {}
        
        // Apply updates only for editable fields
        Object.keys(updates).forEach(key => {
            if (editableFields.includes(key)) {
                existingData[key] = updates[key]
            }
        })

        this.cache.items[hash] = {
            timestamp: Date.now(),
            data: existingData,
            manuallyEdited: true
        }

        await this.saveCache()
        console.log(`[LLMEnricher] Updated cache for hash ${hash}:`, updates)
        
        return existingData
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
