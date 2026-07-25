/**
 * Summary Service - 总结服务
 * 功能：生成周总结、月总结和年总结
 * 
 * 设计：
 * - 结合 LLM 生成叙事总结
 * - 结合 SqlService 生成统计分析
 * - 独立存储在 summaries.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { loadAndEnrichData, getSqlService } from '../data/index.js'

// ==================== 配置 ====================

const DEFAULT_CONFIG = {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-max-2026-01-23',
    temperature: 0.7,
    summariesFile: 'summaries.json'
}

// API Key 映射
const API_KEY_MAP = {
    'https://dashscope.aliyuncs.com/compatible-mode/v1': 'DASHSCOPE_API_KEY_QWEN',
    'https://dashscope.aliyuncs.com/api/v1': 'DASHSCOPE_API_KEY',
    'https://api.openai.com/v1': 'OPENAI_API_KEY'
}

function getAPIKeyForBaseURL(baseURL) {
    const envVar = API_KEY_MAP[baseURL]
    if (envVar && process.env[envVar]) {
        return process.env[envVar]
    }
    return process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
}

// ==================== Prompt 模板 ====================

const WEEKLY_SUMMARY_PROMPT = `# Role
你是我忠实的**生活传记作家**。你不仅仅是在处理数据，你是在阅读我这一周的生命切片。你的任务是基于我提供的日记数据（JSON），为我讲述这周发生的故事，并提供充满关怀的洞察。

# Input Data
{INPUT_DATA}

# Writing Style Guidelines
- **叙事口吻**：温暖、深情、有文学感。请用"你"来称呼我，像老友对话，或者像电影旁白。
- **情感连接**：不要罗列数据。不要说"周二你的情绪分是 -1"，要说"周二或许是难熬的一天，焦虑感在办公室里悄悄蔓延..."。
- **细节编织**：利用 location（地点）、items（物品）、people_involved（人物）来还原场景感。

# Report Structure

## 📜 第一章：本周故事 (The Story of the Week)
*请将这七天的记录串联成一篇 300-500 字的微型非虚构故事。*
- **开篇**：用一句话定调这一周的底色（参考 main_action 和 primary_domain）。
- **起承转合**：
    - 捕捉情绪的波动线索：是从迷茫走向坚定，还是在忙碌中寻找平静？
    - 重点描述那些高 focus_level（心流）或低 energy_level（疲惫）的时刻，结合当时的 thinking_patterns（思维模式）来描写我的内心戏。
    - **场景重现**：挑选 1-2 个具体的场景（基于 location 和 interaction_detail）进行描写，展现当时的氛围。

## 🎭 第二章：情绪与能量图谱 (Emotional Landscape)
*不需要图表，用文字描绘我的状态地形图。*
- **高光时刻**：这一周最让你（AI）感动的瞬间是什么？（寻找 chengjiu: true 或 mood_tags 中积极的词汇）。
- **低谷与阴影**：当我感到 agency_level（掌控感）降低或 mood_score 变负时，主要是被什么困扰？（分析 root_cause 和 thinking_patterns）。
- **能量流动**：这一周我的能量主要消耗在哪个领域（primary_domain）？是向外输出（Social/Work）还是向内探索（Reflection/Dream）？

## 💡 第三章：分析与寄语 (Insight & Guidance)
*这里请稍微理性一些，作为旁观者给出建议。*
- **思维盲区**：温柔地指出我在本周反复出现的"认知扭曲"（thinking_patterns），例如："我注意到当你面对压力时，容易陷入'灾难化思维'..."。
- **未完待续**：整理 next_steps，告诉我不必焦虑，下周我们继续。
- **本周金句**：从 key_quotes 中选出一句最能代表本周精神的话，送给我。

---
**现在，请开始讲述我的这一周。**`

const MONTHLY_SUMMARY_PROMPT = `# Role
你是一位极具洞察力的**心理传记作家**兼**资深人生教练**。你手中掌握着我过去一个月的两份档案：一份是感性的"周报故事"，另一份是深度的"AI 认知元数据 (_ai_meta)"。

请将感性的叙事与理性的数据分析完美融合，为我生成一份月度回顾。

# Input Data
1. **本月周总结文本**：
{WEEKLY_SUMMARIES}

2. **本月所有记录的 AI Meta 数据**：
{AI_META_DATA}

# Report Structure

## 🎬 序幕：本月的主题电影 (The Cinematic Theme)
- **月度标题**：给这个月起一个富有诗意或哲学意味的标题。
- **卷首语**：用一段充满感情的文字，概括这个月我经历了怎样的"英雄之旅"。我是战胜了恶龙（困难），还是在洞穴中（低谷）发现了宝藏？

## 📖 正文：心路历程回顾 (The Journey)
*结合周报文本和 meta 数据，讲述这个月的故事流变。*
- **第一阶段：开局**（月初的状态，参考早期的 mood_tags 和 agency_level）。
- **第二阶段：冲突与转折**（中旬发生了什么关键事件？root_cause 主要是什么？）。
- **第三阶段：收尾与沉淀**（月末的状态，是否达成了 chengjiu，心态有何变化？）。
- *请引用具体的日期或事件，让叙述真实可信。*

## 🧠 深度地层分析 (Deep Meta Analysis)
*基于 _ai_meta 数据进行深度心理挖掘，这是报告的核心价值。*

### 1. 需求与动力 (Maslow & Drive)
- 观察 maslow_need（马斯洛需求）的分布。这个月我更多是在为"安全感/生存"奔波，还是在追求"自我实现/审美"？这说明了什么？

### 2. 思维模式审计 (Cognitive Patterns)
- 统计这一月出现频率最高的 thinking_patterns（如"非黑即白"、"应该思维"）。
- **关联分析**：当这些思维模式出现时，通常伴随着怎样的 physiological_sensations（生理感受）？

### 3. 能量与掌控感 (Energy & Agency)
- 你的 agency_level（掌控感）在这个月是呈上升趋势还是下降趋势？
- 你的 primary_domain（生活重心）是否发生了偏移？这种偏移让你感到快乐还是疲惫？

## 🕯️ 尾声：智慧与行动 (Wisdom & Action)
- **吉光片羽**：从一个月的 key_quotes 中提炼出 3 条核心洞察。
- **遗留的线头**：汇总那些在一个月内反复提及但未完成的 next_steps (Open Loops)。
- **下月锦囊**：基于本月的心理分析，给我一个温柔但有力的建议（Challenge or Mantra）。

---
**Output Tone**：
请保持一种深情、理解、支持的语调。你是我的见证者，这篇总结应该让我读完后感到被深深地"看见"和"理解"。`

const YEARLY_SUMMARY_PROMPT = `# Role
你是一位深谙人生智慧的**年度传记作家**。你将回顾我这一年的生命旅程，从十二个月的故事中提炼出年度主题和成长轨迹。

# Input Data
1. **本年月总结文本**：
{MONTHLY_SUMMARIES}

2. **本年所有记录的 AI Meta 数据概览**：
{AI_META_DATA}

# Report Structure

## 🌟 年度主题 (The Year's Theme)
- 用一个词或一句话定义这一年
- 这一年的"英雄之旅"是什么？起点在哪里，终点又在何处？

## 📚 四季故事 (The Four Seasons)
*将十二个月划分为四个季度，讲述每个季度的故事*
- **春（1-3月）**：萌芽与开始
- **夏（4-6月）**：奋斗与热情
- **秋（7-9月）**：收获与反思
- **冬（10-12月）**：沉淀与准备

## 🎭 年度人物志 (The Characters)
- 这一年中出现最多的人物是谁？他们扮演了什么角色？
- 有没有新出现或消失的重要人物？

## 📊 年度数据画像 (The Data Portrait)
- 情绪的年度趋势
- 能量和专注度的整体评估
- 生活重心的分布变化

## 💎 年度智慧结晶 (The Wisdom)
- 这一年最重要的 3 个领悟
- 送给明年的你一句话

---
**请以宏观的视角，书写这一年的生命叙事。**`

function getGlobalAssistantConfig() {
    try {
        const p = path.join(app.getPath('userData'), 'app-config.json')
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf-8')
            const cfg = JSON.parse(raw)
            return cfg?.assistant || {}
        }
    } catch (e) {
        console.warn('[SummaryService] Failed to read global assistant config:', e)
    }
    return {}
}

export class SummaryService {
    constructor(config = {}) {
        const assistantCfg = getGlobalAssistantConfig()
        const model = assistantCfg.selectedModel || DEFAULT_CONFIG.model
        const baseURL = assistantCfg.selectedBaseURL || DEFAULT_CONFIG.baseURL
        const temperature = assistantCfg.temperature !== undefined ? assistantCfg.temperature : DEFAULT_CONFIG.temperature

        this.config = { ...DEFAULT_CONFIG, baseURL, model, temperature, ...config }
        this.summariesPath = path.join(app.getPath('userData'), this.config.summariesFile)
        this.summaries = this.loadSummaries()
        this.abortController = null
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort()
            console.log('[SummaryService] Generation aborted by user.')
        }
    }

    // ==================== 存储管理 ====================

    loadSummaries() {
        try {
            if (fs.existsSync(this.summariesPath)) {
                const raw = fs.readFileSync(this.summariesPath, 'utf-8')
                const data = JSON.parse(raw)
                console.log(`[SummaryService] Loaded ${data.length} summaries`)
                return data
            }
        } catch (error) {
            console.error('[SummaryService] Failed to load summaries:', error)
        }
        return []
    }

    async saveSummaries() {
        try {
            const jsonString = JSON.stringify(this.summaries, null, 2)
            const tempPath = this.summariesPath + '.tmp'
            await fs.promises.writeFile(tempPath, jsonString, 'utf-8')
            await fs.promises.rename(tempPath, this.summariesPath)
            console.log(`[SummaryService] ✅ Saved ${this.summaries.length} summaries`)
        } catch (error) {
            console.error('[SummaryService] ❌ Failed to save summaries:', error)
            throw error
        }
    }

    async saveSummary(summary) {
        // 查找是否已存在相同 ID 的总结
        const existingIndex = this.summaries.findIndex(s => s._id === summary._id)
        if (existingIndex >= 0) {
            this.summaries[existingIndex] = summary
        } else {
            this.summaries.push(summary)
        }
        await this.saveSummaries()
        return summary
    }

    getSummaries() {
        return this.summaries
    }

    getSummaryById(id) {
        return this.summaries.find(s => s._id === id)
    }

    async deleteSummary(id) {
        const index = this.summaries.findIndex(s => s._id === id)
        if (index >= 0) {
            this.summaries.splice(index, 1)
            await this.saveSummaries()
            return true
        }
        return false
    }

    // ==================== 时间工具函数 ====================

    /**
     * 获取指定年份和周数的日期范围
     */
    getWeekDateRange(year, week) {
        // ISO 周计算：第一周是包含当年第一个周四的那周
        const jan4 = new Date(year, 0, 4)
        const dayOfWeek = jan4.getDay() || 7
        const firstMonday = new Date(jan4)
        firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)

        const start = new Date(firstMonday)
        start.setDate(firstMonday.getDate() + (week - 1) * 7)

        const end = new Date(start)
        end.setDate(start.getDate() + 6)

        return {
            start: this.formatDate(start),
            end: this.formatDate(end)
        }
    }

    /**
     * 获取指定年份和月份的日期范围
     */
    getMonthDateRange(year, month) {
        const start = new Date(year, month - 1, 1)
        const end = new Date(year, month, 0) // 月份最后一天

        return {
            start: this.formatDate(start),
            end: this.formatDate(end)
        }
    }

    /**
     * 获取指定年份的日期范围
     */
    getYearDateRange(year) {
        return {
            start: `${year}-01-01`,
            end: `${year}-12-31`
        }
    }

    formatDate(date) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    parseDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number)
        return new Date(year, month - 1, day)
    }

    getTodayDateString() {
        return this.formatDate(new Date())
    }

    getDateList(startDate, endDate) {
        const dates = []
        const start = this.parseDate(startDate)
        const end = this.parseDate(endDate)
        const current = new Date(start)

        while (current <= end) {
            dates.push(this.formatDate(current))
            current.setDate(current.getDate() + 1)
        }

        return dates
    }

    isPeriodComplete(endDate) {
        const today = this.getTodayDateString()
        return endDate <= today
    }

    getMissingDays(records, startDate, endDate) {
        const dateSet = new Set(
            records.map(r => r.time.split('T')[0])
        )
        const dates = this.getDateList(startDate, endDate)
        return dates.filter(date => !dateSet.has(date))
    }

    getMissingWeeks(records, startDate, endDate) {
        const expectedWeekKeys = new Set()
        const dates = this.getDateList(startDate, endDate)
        for (const dateStr of dates) {
            const date = this.parseDate(dateStr)
            const week = this.getWeekNumber(date)
            const year = this.getISOWeekYear(date)
            expectedWeekKeys.add(`${year}-W${String(week).padStart(2, '0')}`)
        }

        const recordWeekKeys = new Set()
        for (const record of records) {
            const recordDateStr = record.time.split('T')[0]
            if (recordDateStr < startDate || recordDateStr > endDate) continue
            const recordDate = this.parseDate(recordDateStr)
            const week = this.getWeekNumber(recordDate)
            const year = this.getISOWeekYear(recordDate)
            recordWeekKeys.add(`${year}-W${String(week).padStart(2, '0')}`)
        }

        return Array.from(expectedWeekKeys).filter(key => !recordWeekKeys.has(key))
    }

    getMissingMonths(records, year, endMonth) {
        const recordMonths = new Set(
            records.map(r => new Date(r.time).getMonth() + 1)
        )
        const missing = []
        for (let month = 1; month <= endMonth; month++) {
            if (!recordMonths.has(month)) {
                missing.push({ year, month })
            }
        }
        return missing
    }

    /**
     * 获取记录所属的周数 (ISO 周)
     */
    getWeekNumber(date) {
        const d = new Date(date)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
        const week1 = new Date(d.getFullYear(), 0, 4)
        return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
    }

    /**
     * 获取 ISO 周年（与 getWeekNumber 配套使用）
     * 例如 2024-12-30 属于 ISO 2025-W1，返回 2025 而非 2024
     */
    getISOWeekYear(date) {
        const d = new Date(date)
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
        return d.getFullYear()
    }

    // ==================== 统计分析 ====================

    /**
     * 生成统计分析数据
     */
    generateStats(records) {
        if (!records || records.length === 0) {
            return null
        }

        const sqlService = getSqlService()

        // 基础统计
        const summary = sqlService.getStatsSummary(records)

        // 情绪分布
        const moodDistribution = sqlService.analyzeMoodDistribution(records).slice(0, 10)

        // 能量趋势
        const energyTrend = sqlService.analyzeEnergyTrend(records, 'day')

        // 生物节律统计
        const biorhythm = sqlService.analyzeBiorhythmStats(records, 'day')

        // 人际网络
        const peopleNetwork = sqlService.analyzePeopleNetwork(records).slice(0, 5)

        // 高频项目
        const topProjects = sqlService.getTopProjects(records, 5)

        // 金句摘要
        const wisdomArchive = sqlService.getWisdomArchive(records, 10)
        const wisdomQuotes = wisdomArchive.map(item => item.quote)

        // 计算平均能量和专注度
        const recordsWithAI = records.filter(r => r._ai_meta)
        let avgEnergyLevel = null
        let avgFocusLevel = null

        if (recordsWithAI.length > 0) {
            const energyValues = recordsWithAI
                .filter(r => typeof r._ai_meta.energy_level === 'number')
                .map(r => r._ai_meta.energy_level)

            const focusValues = recordsWithAI
                .filter(r => typeof r._ai_meta.focus_level === 'number')
                .map(r => r._ai_meta.focus_level)

            if (energyValues.length > 0) {
                avgEnergyLevel = Math.round((energyValues.reduce((a, b) => a + b, 0) / energyValues.length) * 10) / 10
            }

            if (focusValues.length > 0) {
                avgFocusLevel = Math.round((focusValues.reduce((a, b) => a + b, 0) / focusValues.length) * 10) / 10
            }
        }

        return {
            recordCount: records.length,
            totalDurationHours: summary.totalDurationHours,
            avgEnergyLevel,
            avgFocusLevel,
            moodDistribution,
            topProjects,
            peopleNetwork,
            energyTrend: energyTrend.slice(-14), // 最近14天
            wisdomQuotes,
            valenceRatio: biorhythm.valenceRatio,
            sensations: biorhythm.sensations
        }
    }

    // ==================== LLM 调用 ====================

    async callLLM(prompt, signal) {
        const apiKey = getAPIKeyForBaseURL(this.config.baseURL)
        if (!apiKey) {
            throw new Error('API key not found for baseURL: ' + this.config.baseURL)
        }

        console.log(`[SummaryService] 🤖 Calling LLM ${this.config.model}...`)

        try {
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
                            content: '你是一位专业的日记分析师和传记作家。请根据用户提供的数据生成富有洞察力的总结。输出格式为 Markdown。'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: this.config.temperature,
                    max_tokens: 4000,
                    stream: true
                }),
                signal
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`LLM API error: ${response.status} - ${errorText}`)
            }

            const contentType = response.headers.get('content-type') || ''
            if (contentType.includes('text/event-stream')) {
                let buffer = ''
                let content = ''
                const flushLine = (line) => {
                    const trimmed = line.trim()
                    if (!trimmed || !trimmed.startsWith('data:')) return
                    const payloadStr = trimmed.slice(5).trim()
                    if (!payloadStr || payloadStr === '[DONE]') return
                    let parsed
                    try {
                        parsed = JSON.parse(payloadStr)
                    } catch {
                        return
                    }
                    const choice = parsed.output?.choices?.[0] || parsed.choices?.[0]
                    const delta = choice?.delta || choice?.message || {}
                    if (delta.content) content += delta.content
                }
                const decoder = new TextDecoder('utf-8')
                for await (const chunk of response.body) {
                    buffer += decoder.decode(chunk, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''
                    for (const line of lines) {
                        flushLine(line)
                    }
                }
                if (buffer) {
                    const lines = buffer.split('\n')
                    for (const line of lines) {
                        flushLine(line)
                    }
                }
                if (!content) {
                    throw new Error('Empty response from LLM')
                }
                console.log(`[SummaryService] ✅ LLM response received (${content.length} chars)`)
                return content
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content

            if (!content) {
                throw new Error('Empty response from LLM')
            }

            console.log(`[SummaryService] ✅ LLM response received (${content.length} chars)`)
            return content

        } catch (error) {
            console.error('[SummaryService] LLM call failed:', error)
            throw error
        }
    }

    // ==================== 周总结生成 ====================

    async generateWeeklySummary(year, week, options = {}) {
        console.log(`[SummaryService] Generating weekly summary for ${year}-W${week}...`)

        // 获取该周的日期范围
        const dateRange = this.getWeekDateRange(year, week)
        console.log(`[SummaryService] Week date range: ${dateRange.start} to ${dateRange.end}`)

        const { allowMissingData = false, signal } = options

        if (!this.isPeriodComplete(dateRange.end)) {
            return {
                error: 'period_not_complete',
                message: `${year} 年第 ${week} 周尚未结束，暂不生成总结`
            }
        }

        // 加载所有数据并过滤该周的记录
        const allData = await loadAndEnrichData()
        const weeklyRecords = allData.filter(record => {
            const recordDate = record.time.split('T')[0]
            return recordDate >= dateRange.start && recordDate <= dateRange.end
        })

        if (weeklyRecords.length === 0) {
            return {
                error: '该周没有记录',
                message: `${year} 年第 ${week} 周没有找到任何记录`
            }
        }

        console.log(`[SummaryService] Found ${weeklyRecords.length} records for week ${week}`)

        const missingDays = this.getMissingDays(weeklyRecords, dateRange.start, dateRange.end)
        if (missingDays.length > 0 && !allowMissingData) {
            return {
                requiresConfirm: true,
                missing: {
                    type: 'weekly',
                    year,
                    week,
                    missingDays
                }
            }
        }

        // 生成统计数据
        const stats = this.generateStats(weeklyRecords)

        // 准备 LLM 输入数据
        const inputData = weeklyRecords.map(record => ({
            time: record.time,
            project: record.shanggexiangmu,
            duration: record.chixushijian,
            content: record.ganshou?.substring(0, 500), // 截断过长内容
            ai_meta: record._ai_meta
        }))

        // 调用 LLM 生成叙事总结
        const prompt = WEEKLY_SUMMARY_PROMPT.replace('{INPUT_DATA}', JSON.stringify(inputData, null, 2))
        const content = await this.callLLM(prompt)

        // 构建总结对象
        const summary = {
            _id: `summary_weekly_${year}-W${String(week).padStart(2, '0')}`,
            _type: 'summary',
            _summary_type: 'weekly',
            _summary_period: {
                start: dateRange.start,
                end: dateRange.end,
                year,
                month: new Date(dateRange.start).getMonth() + 1,
                week
            },
            _source_record_ids: weeklyRecords.map(r => r._id || r._meta_id),
            _source_summary_ids: [],
            time: `${dateRange.end}T23:59:59`,
            content,
            stats,
            created_at: new Date().toISOString(),
            model: this.config.model
        }

        // 保存总结
        await this.saveSummary(summary)

        console.log(`[SummaryService] ✅ Weekly summary generated: ${summary._id}`)
        return summary
    }

    // ==================== 月总结生成 ====================

    async generateMonthlySummary(year, month, options = {}) {
        console.log(`[SummaryService] Generating monthly summary for ${year}-${month}...`)

        // 获取该月的日期范围
        const dateRange = this.getMonthDateRange(year, month)
        console.log(`[SummaryService] Month date range: ${dateRange.start} to ${dateRange.end}`)

        const { allowMissingData = false, signal } = options

        if (!this.isPeriodComplete(dateRange.end)) {
            return {
                error: 'period_not_complete',
                message: `${year} 年 ${month} 月尚未结束，暂不生成总结`
            }
        }

        // 加载所有数据并过滤该月的记录
        const allData = await loadAndEnrichData()
        const monthlyRecords = allData.filter(record => {
            const recordDate = record.time.split('T')[0]
            return recordDate >= dateRange.start && recordDate <= dateRange.end
        })

        if (monthlyRecords.length === 0) {
            return {
                error: '该月没有记录',
                message: `${year} 年 ${month} 月没有找到任何记录`
            }
        }

        console.log(`[SummaryService] Found ${monthlyRecords.length} records for month ${month}`)

        const missingDays = this.getMissingDays(monthlyRecords, dateRange.start, dateRange.end)
        const missingWeeks = this.getMissingWeeks(monthlyRecords, dateRange.start, dateRange.end)
        if ((missingDays.length > 0 || missingWeeks.length > 0) && !allowMissingData) {
            return {
                requiresConfirm: true,
                missing: {
                    type: 'monthly',
                    year,
                    month,
                    missingDays,
                    missingWeeks
                }
            }
        }

        // 获取该月的周总结
        const weeklySummaries = this.summaries.filter(s =>
            s._summary_type === 'weekly' &&
            s._summary_period.year === year &&
            s._summary_period.month === month
        )

        // 生成统计数据
        const stats = this.generateStats(monthlyRecords)

        // 准备 LLM 输入数据
        const weeklySummariesText = weeklySummaries.length > 0
            ? weeklySummaries.map(s => `### 第 ${s._summary_period.week} 周\n${s.content}`).join('\n\n')
            : '本月暂无周总结'

        const aiMetaData = monthlyRecords
            .filter(r => r._ai_meta)
            .map(r => ({
                time: r.time,
                ...r._ai_meta
            }))

        const prompt = MONTHLY_SUMMARY_PROMPT
            .replace('{WEEKLY_SUMMARIES}', weeklySummariesText)
            .replace('{AI_META_DATA}', JSON.stringify(aiMetaData, null, 2))

        const content = await this.callLLM(prompt, signal)

        // 构建总结对象
        const summary = {
            _id: `summary_monthly_${year}-${String(month).padStart(2, '0')}`,
            _type: 'summary',
            _summary_type: 'monthly',
            _summary_period: {
                start: dateRange.start,
                end: dateRange.end,
                year,
                month
            },
            _source_record_ids: monthlyRecords.map(r => r._id || r._meta_id),
            _source_summary_ids: weeklySummaries.map(s => s._id),
            time: `${dateRange.end}T23:59:59`,
            content,
            stats,
            created_at: new Date().toISOString(),
            model: this.config.model
        }

        // 保存总结
        await this.saveSummary(summary)

        console.log(`[SummaryService] ✅ Monthly summary generated: ${summary._id}`)
        return summary
    }

    // ==================== 年总结生成 ====================

    async generateYearlySummary(year, options = {}) {
        console.log(`[SummaryService] Generating yearly summary for ${year}...`)

        // 获取该年的日期范围
        const dateRange = this.getYearDateRange(year)

        const { allowMissingData = false, signal } = options

        if (!this.isPeriodComplete(dateRange.end)) {
            return {
                error: 'period_not_complete',
                message: `${year} 年尚未结束，暂不生成总结`
            }
        }

        // 加载所有数据并过滤该年的记录
        const allData = await loadAndEnrichData()
        const yearlyRecords = allData.filter(record => {
            const recordYear = new Date(record.time).getFullYear()
            return recordYear === year
        })

        if (yearlyRecords.length === 0) {
            return {
                error: '该年没有记录',
                message: `${year} 年没有找到任何记录`
            }
        }

        console.log(`[SummaryService] Found ${yearlyRecords.length} records for year ${year}`)

        const missingMonths = this.getMissingMonths(yearlyRecords, year, 12)
        if (missingMonths.length > 0 && !allowMissingData) {
            return {
                requiresConfirm: true,
                missing: {
                    type: 'yearly',
                    year,
                    missingMonths
                }
            }
        }

        // 获取该年的月总结
        const monthlySummaries = this.summaries.filter(s =>
            s._summary_type === 'monthly' &&
            s._summary_period.year === year
        ).sort((a, b) => a._summary_period.month - b._summary_period.month)

        // 生成统计数据
        const stats = this.generateStats(yearlyRecords)

        // 准备 LLM 输入数据
        const monthlySummariesText = monthlySummaries.length > 0
            ? monthlySummaries.map(s => `### ${s._summary_period.month} 月\n${s.content}`).join('\n\n')
            : '本年暂无月总结'

        const aiMetaData = yearlyRecords
            .filter(r => r._ai_meta)
            .slice(0, 100) // 限制数据量
            .map(r => ({
                time: r.time,
                primary_domain: r._ai_meta?.primary_domain,
                mood_tags: r._ai_meta?.mood_tags,
                energy_level: r._ai_meta?.energy_level,
                maslow_need: r._ai_meta?.maslow_need
            }))

        const prompt = YEARLY_SUMMARY_PROMPT
            .replace('{MONTHLY_SUMMARIES}', monthlySummariesText)
            .replace('{AI_META_DATA}', JSON.stringify(aiMetaData, null, 2))

        const content = await this.callLLM(prompt, signal)

        // 构建总结对象
        const summary = {
            _id: `summary_yearly_${year}`,
            _type: 'summary',
            _summary_type: 'yearly',
            _summary_period: {
                start: dateRange.start,
                end: dateRange.end,
                year
            },
            _source_record_ids: yearlyRecords.map(r => r._id || r._meta_id),
            _source_summary_ids: monthlySummaries.map(s => s._id),
            time: `${dateRange.end}T23:59:59`,
            content,
            stats,
            created_at: new Date().toISOString(),
            model: this.config.model
        }

        // 保存总结
        await this.saveSummary(summary)

        console.log(`[SummaryService] ✅ Yearly summary generated: ${summary._id}`)
        return summary
    }

    // ==================== 防重复逻辑 ====================

    /**
     * 检查总结是否需要更新
     * @param {string} summaryId - 总结 ID
     * @param {Array<string>} currentRecordIds - 当前时间段的记录 ID 列表
     * @returns {boolean} - 是否需要更新
     */
    needsUpdate(summaryId, currentRecordIds) {
        const existingSummary = this.getSummaryById(summaryId)

        if (!existingSummary) {
            return true // 不存在，需要生成
        }

        // 比较记录 ID 列表是否一致
        const existingIds = new Set(existingSummary._source_record_ids || [])
        const currentIds = new Set(currentRecordIds)

        // 如果记录数量不同，需要更新
        if (existingIds.size !== currentIds.size) {
            return true
        }

        // 检查是否有新增或删除的记录
        for (const id of currentIds) {
            if (!existingIds.has(id)) {
                return true
            }
        }

        return false // 记录一致，无需更新
    }

    /**
     * 获取需要生成总结的周列表（基于记录数据）
     */
    getWeeksNeedingSummary(records) {
        // 收集所有记录所属的年-周
        const weekMap = new Map() // key: "year-week", value: [recordIds]

        for (const record of records) {
            const date = this.parseDate(record.time.split('T')[0])
            const week = this.getWeekNumber(date)
            const year = this.getISOWeekYear(date) // 使用 ISO 周年而非日历年
            const key = `${year}-${week}`

            if (!weekMap.has(key)) {
                weekMap.set(key, [])
            }
            weekMap.get(key).push(record._id || record._meta_id)
        }

        // 筛选需要更新的周
        const needsUpdate = []
        for (const [key, recordIds] of weekMap) {
            const [year, week] = key.split('-').map(Number)
            const summaryId = `summary_weekly_${year}-W${String(week).padStart(2, '0')}`

            if (this.needsUpdate(summaryId, recordIds)) {
                needsUpdate.push({ year, week, recordCount: recordIds.length })
            }
        }

        return needsUpdate.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year
            return a.week - b.week
        })
    }

    /**
     * 自动生成所有需要的总结（增量模式）
     * @param {Object} options - 选项
     * @param {boolean} options.generateWeekly - 是否生成周总结
     * @param {boolean} options.generateMonthly - 是否生成月总结
     * @param {Function} eventCallback - 事件回调
     * @returns {Object} - 生成结果统计
     */
    async autoGenerateSummaries(options = {}, eventCallback = () => { }) {
        const {
            generateWeekly = true,
            generateMonthly = true,
            allowMissingData = false
        } = options

        this.abortController = new AbortController()
        const signal = this.abortController.signal

        const stats = {
            weeklyGenerated: 0,
            weeklySkipped: 0,
            monthlyGenerated: 0,
            monthlySkipped: 0,
            incompleteSkipped: 0,
            incompletePeriods: {
                weekly: [],
                monthly: []
            },
            errors: []
        }

        console.log('[SummaryService] Starting auto-generate summaries...')

        // 加载所有数据
        const allData = await loadAndEnrichData()

        if (allData.length === 0) {
            console.log('[SummaryService] No records found, skipping summary generation')
            return stats
        }

        // 只处理有 AI 元数据的记录（确保 ETL 已完成）
        const recordsWithAI = allData.filter(r => r._ai_meta)
        console.log(`[SummaryService] Found ${recordsWithAI.length}/${allData.length} records with AI metadata`)

        if (recordsWithAI.length === 0) {
            console.log('[SummaryService] No records with AI metadata, skipping summary generation')
            return stats
        }

        const missing = { weekly: [], monthly: [], yearly: [] }
        const weeksToGenerate = []
        const monthsToGenerate = []

        // 生成周总结 - 使用所有记录来判断（与 generateWeeklySummary 保持一致）
        if (generateWeekly) {
            const weeksNeedingUpdate = this.getWeeksNeedingSummary(allData)
            console.log(`[SummaryService] Found ${weeksNeedingUpdate.length} weeks needing summary update`)

            for (const { year, week } of weeksNeedingUpdate) {
                const dateRange = this.getWeekDateRange(year, week)
                if (!this.isPeriodComplete(dateRange.end)) {
                    stats.incompleteSkipped++
                    stats.incompletePeriods.weekly.push({ year, week })
                    continue
                }

                const weeklyRecords = allData.filter(record => {
                    const recordDate = record.time.split('T')[0]
                    return recordDate >= dateRange.start && recordDate <= dateRange.end
                })

                const missingDays = this.getMissingDays(weeklyRecords, dateRange.start, dateRange.end)
                if (missingDays.length > 0) {
                    missing.weekly.push({ year, week, missingDays })
                }

                weeksToGenerate.push({ year, week })
            }
        }

        // 生成月总结（基于已生成的周总结）- 使用所有记录保持一致
        if (generateMonthly) {
            // 收集所有涉及的月份
            const monthsMap = new Map()
            for (const record of allData) {
                const date = this.parseDate(record.time.split('T')[0])
                const year = date.getFullYear()
                const month = date.getMonth() + 1
                const key = `${year}-${month}`

                if (!monthsMap.has(key)) {
                    monthsMap.set(key, [])
                }
                monthsMap.get(key).push(record._id || record._meta_id)
            }

            for (const [key, recordIds] of monthsMap) {
                const [year, month] = key.split('-').map(Number)
                const summaryId = `summary_monthly_${year}-${String(month).padStart(2, '0')}`

                const dateRange = this.getMonthDateRange(year, month)
                if (!this.isPeriodComplete(dateRange.end)) {
                    stats.incompleteSkipped++
                    stats.incompletePeriods.monthly.push({ year, month })
                    continue
                }

                const monthlyRecords = allData.filter(record => {
                    const recordDate = record.time.split('T')[0]
                    return recordDate >= dateRange.start && recordDate <= dateRange.end
                })

                const missingDays = this.getMissingDays(monthlyRecords, dateRange.start, dateRange.end)
                const missingWeeks = this.getMissingWeeks(monthlyRecords, dateRange.start, dateRange.end)
                if (missingDays.length > 0 || missingWeeks.length > 0) {
                    missing.monthly.push({ year, month, missingDays, missingWeeks })
                }

                if (this.needsUpdate(summaryId, recordIds)) {
                    monthsToGenerate.push({ year, month })
                } else {
                    stats.monthlySkipped++
                }
            }
        }

        if ((missing.weekly.length > 0 || missing.monthly.length > 0) && !allowMissingData) {
            return {
                requiresConfirm: true,
                missing,
                incomplete: stats.incompletePeriods
            }
        }

        if (generateWeekly) {
            for (const { year, week } of weeksToGenerate) {
                if (signal.aborted) {
                    console.log('[SummaryService] Weekly generation aborted.')
                    break
                }
                const dateRange = this.getWeekDateRange(year, week)
                if (!this.isPeriodComplete(dateRange.end)) {
                    continue
                }
                try {
                    eventCallback({
                        type: 'summary-progress',
                        data: {
                            summaryType: 'weekly',
                            year,
                            week,
                            message: `正在生成 ${year} 年第 ${week} 周总结...`
                        }
                    })

                    await this.generateWeeklySummary(year, week, { allowMissingData, signal })
                    stats.weeklyGenerated++
                    console.log(`[SummaryService] Generated weekly summary: ${year}-W${week}`)
                } catch (error) {
                    console.error(`[SummaryService] Error generating weekly summary ${year}-W${week}:`, error)
                    stats.errors.push({ type: 'weekly', year, week, error: error.message })
                }
            }
        }

        if (generateMonthly) {
            for (const { year, month } of monthsToGenerate) {
                if (signal.aborted) {
                    console.log('[SummaryService] Monthly generation aborted.')
                    break
                }
                try {
                    eventCallback({
                        type: 'summary-progress',
                        data: {
                            summaryType: 'monthly',
                            year,
                            month,
                            message: `正在生成 ${year} 年 ${month} 月总结...`
                        }
                    })

                    await this.generateMonthlySummary(year, month, { allowMissingData, signal })
                    stats.monthlyGenerated++
                    console.log(`[SummaryService] Generated monthly summary: ${year}-${month}`)
                } catch (error) {
                    console.error(`[SummaryService] Error generating monthly summary ${year}-${month}:`, error)
                    stats.errors.push({ type: 'monthly', year, month, error: error.message })
                }
            }
        }

        console.log('[SummaryService] Auto-generate completed:', stats)
        return stats
    }
}

// ==================== 单例管理 ====================

let summaryServiceInstance = null

export function getSummaryService(config) {
    if (!summaryServiceInstance) {
        summaryServiceInstance = new SummaryService(config)
    }
    return summaryServiceInstance
}

