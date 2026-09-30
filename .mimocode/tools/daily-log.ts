import { tool } from "@mimo-ai/plugin"
import { readFileSync, existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { createHash } from "crypto"

// ==================== Data Paths ====================

function getDataDir(): string {
  // Windows: %APPDATA%\daily_log_vue
  const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming")
  return join(appData, "daily_log_vue")
}

function getAppDataPath(): string {
  return join(getDataDir(), "appData.json")
}

function getAiMetaPath(): string {
  return join(getDataDir(), "ai_meta_index.json")
}

function getSummariesPath(): string {
  return join(getDataDir(), "summaries.json")
}

// ==================== Cache System ====================

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>()
  private defaultTTL = 5 * 60 * 1000 // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    
    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.store.delete(key)
      return null
    }
    
    return entry.data as T
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    })
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.store.clear()
      return
    }
    
    const regex = new RegExp(pattern)
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key)
      }
    }
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    
    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.store.delete(key)
      return false
    }
    
    return true
  }
}

const cache = new MemoryCache()

// ==================== Index System ====================

interface RecordIndex {
  byTimestamp: Map<number, string[]>
  byProject: Map<string, string[]>
  byWeekday: Map<string, string[]>
  byTimeRange: Map<string, string[]>
  byMonth: Map<string, string[]>
  byId: Map<string, Record<string, any>>
}

let recordIndex: RecordIndex | null = null
let indexBuildTime = 0
const INDEX_TTL = 10 * 60 * 1000 // 10 minutes

function buildIndex(records: Record<string, any>[]): RecordIndex {
  const index: RecordIndex = {
    byTimestamp: new Map(),
    byProject: new Map(),
    byWeekday: new Map(),
    byTimeRange: new Map(),
    byMonth: new Map(),
    byId: new Map()
  }

  for (const record of records) {
    const id = record._id || record._meta_id
    
    // Index by ID
    index.byId.set(id, record)
    
    // Index by timestamp (rounded to hour for range queries)
    const hourKey = Math.floor(record._meta_timestamp / (1000 * 60 * 60))
    if (!index.byTimestamp.has(hourKey)) {
      index.byTimestamp.set(hourKey, [])
    }
    index.byTimestamp.get(hourKey)!.push(id)
    
    // Index by project
    const project = record._meta_project || "未分类"
    if (!index.byProject.has(project)) {
      index.byProject.set(project, [])
    }
    index.byProject.get(project)!.push(id)
    
    // Index by weekday
    const weekday = record._meta_weekday
    if (!index.byWeekday.has(weekday)) {
      index.byWeekday.set(weekday, [])
    }
    index.byWeekday.get(weekday)!.push(id)
    
    // Index by time range
    const timeRange = record._meta_time_range
    if (!index.byTimeRange.has(timeRange)) {
      index.byTimeRange.set(timeRange, [])
    }
    index.byTimeRange.get(timeRange)!.push(id)
    
    // Index by month (YYYY-MM)
    const monthKey = `${record._meta_year}-${String(record._meta_month).padStart(2, '0')}`
    if (!index.byMonth.has(monthKey)) {
      index.byMonth.set(monthKey, [])
    }
    index.byMonth.get(monthKey)!.push(id)
  }

  return index
}

function getRecordIndex(records: Record<string, any>[]): RecordIndex {
  const now = Date.now()
  if (!recordIndex || now - indexBuildTime > INDEX_TTL) {
    recordIndex = buildIndex(records)
    indexBuildTime = now
  }
  return recordIndex
}

// ==================== Enrichment (pure functions, mirrors formatter.js) ====================

function parseDuration(str: string): number {
  if (!str) return 0
  let minutes = 0
  const hourMatch = str.match(/(\d+)[小时时]/)
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60
  const minuteMatch = str.match(/(\d+)[分钟分]/)
  if (minuteMatch) minutes += parseInt(minuteMatch[1])
  return minutes
}

function extractPlainText(html: string): string {
  if (!html || typeof html !== "string") return ""
  return html.replace(/<[^>]+>/g, "").trim()
}

function getWeekdayName(dayIndex: number): string {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
  return names[dayIndex] || "未知"
}

function getTimeRange(hour: number): string {
  if (hour >= 6 && hour < 12) return "上午"
  if (hour >= 12 && hour < 14) return "中午"
  if (hour >= 14 && hour < 18) return "下午"
  if (hour >= 18 && hour < 23) return "晚上"
  return "深夜"
}

function enrichRecord(item: Record<string, any>): Record<string, any> {
  const dateObj = new Date(item.time)
  const weekdayIndex = dateObj.getDay()
  const hour = dateObj.getHours()

  return {
    ...item,
    _meta_timestamp: dateObj.getTime(),
    _meta_year: dateObj.getFullYear(),
    _meta_month: dateObj.getMonth() + 1,
    _meta_day: dateObj.getDate(),
    _meta_hour: hour,
    _meta_weekday: getWeekdayName(weekdayIndex),
    _meta_is_weekend: weekdayIndex === 0 || weekdayIndex === 6,
    _meta_time_range: getTimeRange(hour),
    _meta_duration_min: parseDuration(item.chixushijian),
    _meta_project: item.shanggexiangmu || "未分类",
    _meta_has_achievement: item.chengjiu === true,
    _meta_plain_text: extractPlainText(item.ganshou),
    _meta_text_length: extractPlainText(item.ganshou).length,
    _meta_emotion_raw: item.tiyan || "常规",
    _meta_id:
      item._id ||
      `${item.time}_${item.shanggexiangmu}_${item.ganshou}`.substring(0, 50),
    // Pre-computed search text for faster queries
    _meta_search_text: [
      item.ganshou,
      item.shanggexiangmu,
      item.tiyan,
    ].filter(Boolean).join(" ").toLowerCase()
  }
}

// ==================== Data Loading ====================

function loadJson(filePath: string): any {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"))
  } catch {
    return null
  }
}

function loadRecords(): Record<string, any>[] {
  const cacheKey = "records_all"
  const cached = cache.get<Record<string, any>[]>(cacheKey)
  if (cached) return cached

  const data = loadJson(getAppDataPath())
  if (!Array.isArray(data)) return []
  
  const records = data.map(enrichRecord).sort((a, b) => b._meta_timestamp - a._meta_timestamp)
  cache.set(cacheKey, records)
  return records
}

function loadAiMeta(): Map<string, any> {
  const cacheKey = "ai_meta"
  const cached = cache.get<Map<string, any>>(cacheKey)
  if (cached) return cached

  const raw = loadJson(getAiMetaPath())
  const map = new Map<string, any>()
  if (raw && raw.items) {
    for (const [key, val] of Object.entries(raw.items)) {
      map.set(key, val)
    }
  }
  
  cache.set(cacheKey, map)
  return map
}

function loadSummaries(): Record<string, any>[] {
  const cacheKey = "summaries"
  const cached = cache.get<Record<string, any>[]>(cacheKey)
  if (cached) return cached

  const data = loadJson(getSummariesPath())
  const summaries = Array.isArray(data) ? data : []
  cache.set(cacheKey, summaries)
  return summaries
}

function computeRecordHash(item: Record<string, any>): string {
  const content = (item.ganshou || "") + (item.tiyan || "")
  const category = item.shanggexiangmu || ""
  const timeMatch = (item.time || "").match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)
  const timeKey = timeMatch ? timeMatch[1] : item.time || ""
  const key = `${content}||${category}||${timeKey}`
  return createHash("md5").update(key).digest("hex")
}

function mergeAiMeta(records: Record<string, any>[]): Record<string, any>[] {
  const cacheKey = "records_with_ai_meta"
  const cached = cache.get<Record<string, any>[]>(cacheKey)
  if (cached) return cached

  const aiMeta = loadAiMeta()
  if (aiMeta.size === 0) {
    cache.set(cacheKey, records)
    return records
  }
  
  const merged = records.map((r) => {
    const hash = computeRecordHash(r)
    const meta = aiMeta.get(hash)
    if (meta && meta.data) {
      return { ...r, _ai_meta: meta.data }
    }
    return r
  })
  
  cache.set(cacheKey, merged)
  return merged
}

// ==================== Search Helpers ====================

function htmlToText(html: string): string {
  return (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

function computeEmotionScore(text: string): number {
  if (!text) return 0
  const t = text.toLowerCase()
  const pos = ["开心", "高兴", "愉快", "满意", "顺利", "成功", "美好", "幸福", "兴奋", "激动", "棒", "爽", "喜欢", "热爱", "期待", "温暖", "感动", "自豪", "骄傲", "享受", "轻松", "惬意", "满足", "幸运", "乐观"]
  const neg = ["难过", "沮丧", "糟糕", "生气", "焦虑", "失败", "孤独", "寂寞", "孤单", "无助", "害怕", "恐惧", "担心", "煎熬", "痛苦", "烦", "累", "讨厌", "失望", "遗憾", "压抑", "迷茫", "疲惫", "厌恶", "绝望", "惊恐"]
  let score = 0
  for (const w of pos) if (t.includes(w)) score += 1
  for (const w of neg) if (t.includes(w)) score -= 1
  return score
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Simple TF-based similarity (no embedding model needed for tool adapter)
function simpleSimilarity(query: string, text: string): number {
  const qTokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const tLower = text.toLowerCase()
  if (qTokens.length === 0) return 0
  let hits = 0
  for (const tok of qTokens) {
    if (tLower.includes(tok)) hits++
  }
  return hits / qTokens.length
}

// Optimized search using pre-computed search text
function optimizedSearch(query: string, records: Record<string, any>[]): { record: Record<string, any>; score: number }[] {
  const qTokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (qTokens.length === 0) return []

  const results: { record: Record<string, any>; score: number }[] = []
  
  for (const r of records) {
    // Use pre-computed search text for faster matching
    const searchText = r._meta_search_text || ""
    let hits = 0
    for (const tok of qTokens) {
      if (searchText.includes(tok)) hits++
    }
    const score = hits / qTokens.length
    if (score > 0) {
      results.push({ record: r, score })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

// ==================== Actions ====================

interface ToolArgs {
  action: string
  id?: string
  payload?: string
}

const actions = [
  "list",       // List records with filters
  "search",     // Search by content keywords
  "get",        // Get single record by ID
  "stats",      // Get statistics
  "summaries",  // Get generated summaries
  "export",     // Export data for summary's DiaryConnector
  "health",     // Check data availability
  "invalidate", // Invalidate cache
] as const

export default tool({
  description:
    "Access daily diary data from the daily_log_vue app. Query records, search by content, get statistics, access AI-enriched metadata, and export data for the summary (AIAE) pipeline. Data is read-only from the agent's perspective.",
  args: {
    action: tool.schema.enum(actions).describe("Data access action"),
    id: tool.schema.string().optional().describe("Record ID for get action"),
    payload: tool.schema
      .string()
      .optional()
      .describe("JSON object with action-specific filters/params"),
  },
  async execute(args) {
    let payload: Record<string, any> = {}
    if (args.payload) {
      try {
        payload = JSON.parse(args.payload)
      } catch (error) {
        throw new Error(
          `Payload must be valid JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    switch (args.action) {
      case "health":
        return handleHealth()
      case "list":
        return handleList(payload)
      case "search":
        return handleSearch(payload)
      case "get":
        return handleGet(args.id, payload)
      case "stats":
        return handleStats(payload)
      case "summaries":
        return handleSummaries(payload)
      case "export":
        return handleExport(payload)
      case "invalidate":
        return handleInvalidate(payload)
      default:
        throw new Error(`Unknown action: ${args.action}`)
    }
  },
})

// ==================== Action Handlers ====================

// ==================== Action Handlers ====================

/**
 * 【检索核心设计原则】：
 * 用户手填标签（如 shanggexiangmu, xinqing 等）存在随意填写或大量缺失的情况。
 * 检索绝不强依赖单一的手填字段。有效检索必须优先建立在：
 * 1. 用户原文全文（ganshou 提纯后的 plain_text + tiyan 原文）
 * 2. AI 增强数据（_ai_meta：summary, mood_tags, primary_domain, people_involved）
 * 
 * 手填标签仅作为候选辅助包含项或字段展示，防止由于用户未填或错填标签导致的漏检。
 */

function handleHealth() {
  const dataPath = getAppDataPath()
  const aiMetaPath = getAiMetaPath()
  const summariesPath = getSummariesPath()

  const dataExists = existsSync(dataPath)
  const aiMetaExists = existsSync(aiMetaPath)
  const summariesExists = existsSync(summariesPath)

  let recordCount = 0
  if (dataExists) {
    const data = loadJson(dataPath)
    recordCount = Array.isArray(data) ? data.length : 0
  }

  let aiMetaCount = 0
  if (aiMetaExists) {
    const aiMeta = loadJson(aiMetaPath)
    aiMetaCount = aiMeta?.items ? Object.keys(aiMeta.items).length : 0
  }

  return {
    output: JSON.stringify(
      {
        status: dataExists ? "available" : "no_data",
        dataDir: getDataDir(),
        recordCount,
        aiMetaCount,
        summariesExist: summariesExists,
        paths: { data: dataPath, aiMeta: aiMetaPath, summaries: summariesPath },
        cacheStatus: {
          hasRecords: cache.has("records_all"),
          hasAiMeta: cache.has("ai_meta"),
          hasSummaries: cache.has("summaries"),
          hasMergedRecords: cache.has("records_with_ai_meta"),
          indexBuilt: recordIndex !== null
        }
      },
      null,
      2
    ),
    metadata: { action: "health", available: dataExists },
  }
}

function handleList(payload: Record<string, any>) {
  let records = loadRecords()
  records = mergeAiMeta(records)

  // Apply date range filter first (if present)
  if (payload.dateRange) {
    const { start, end } = payload.dateRange
    if (start) {
      const startDate = new Date(start).getTime()
      records = records.filter((r) => r._meta_timestamp >= startDate)
    }
    if (end) {
      const endDate = new Date(end).setHours(23, 59, 59, 999)
      records = records.filter((r) => r._meta_timestamp <= endDate)
    }
  }

  // 【核心检索原则】：Project 检索不仅比对手填 shanggexiangmu，同时比对用户原文与 AI 主领域 primary_domain
  if (payload.project) {
    const target = payload.project.toLowerCase()
    records = records.filter((r) => {
      const rawTagMatch = (r.shanggexiangmu || "").toLowerCase().includes(target)
      const rawTextMatch = (r._meta_plain_text || "").toLowerCase().includes(target)
      const aiDomainMatch = (r._ai_meta?.primary_domain || "").toLowerCase().includes(target)
      return rawTagMatch || rawTextMatch || aiDomainMatch
    })
  }

  if (payload.weekday) {
    records = records.filter((r) => r._meta_weekday === payload.weekday)
  }

  if (typeof payload.isWeekend === "boolean") {
    records = records.filter((r) => r._meta_is_weekend === payload.isWeekend)
  }

  if (payload.timeRange) {
    records = records.filter((r) => r._meta_time_range === payload.timeRange)
  }

  if (typeof payload.durationMin === "number") {
    records = records.filter((r) => (r._meta_duration_min || 0) >= payload.durationMin)
  }

  if (typeof payload.durationMax === "number") {
    records = records.filter((r) => (r._meta_duration_min || 0) <= payload.durationMax)
  }

  // 【核心检索原则】：MoodTags 优先校验 AI 增强 mood_tags，无 AI 增强时降级匹配原文文本
  if (Array.isArray(payload.moodTags) && payload.moodTags.length > 0) {
    records = records.filter((r) => {
      if (r._ai_meta && Array.isArray(r._ai_meta.mood_tags) && r._ai_meta.mood_tags.length > 0) {
        return payload.moodTags.some((tag: string) =>
          r._ai_meta.mood_tags.some((t: string) => t.toLowerCase().includes(tag.toLowerCase()))
        )
      }
      // 降级回退：用户原文文本检索
      const rawContent = ((r._meta_plain_text || "") + " " + (r.tiyan || "")).toLowerCase()
      return payload.moodTags.some((tag: string) => rawContent.includes(tag.toLowerCase()))
    })
  }

  if (typeof payload.minEnergy === "number") {
    records = records.filter(
      (r) => (r._ai_meta?.energy_level || 0) >= payload.minEnergy
    )
  }

  if (typeof payload.maxEnergy === "number") {
    records = records.filter(
      (r) => (r._ai_meta?.energy_level || 0) <= payload.maxEnergy
    )
  }

  // 【核心检索原则】：People 检索联合校验 AI 增强 people_involved 与 用户原文全文
  if (payload.people) {
    const peopleList = Array.isArray(payload.people) ? payload.people : [payload.people]
    records = records.filter((r) => {
      const rawText = (r._meta_plain_text || "").toLowerCase()
      const aiPeople = r._ai_meta?.people_involved || []
      return peopleList.some((person: string) => {
        const pLower = person.toLowerCase()
        const matchText = rawText.includes(pLower)
        const matchAi = aiPeople.some((ap: string) => ap.toLowerCase().includes(pLower))
        return matchText || matchAi
      })
    })
  }

  if (Array.isArray(payload.keywordsAll) && payload.keywordsAll.length > 0) {
    records = records.filter((r) => {
      const fullText = [
        r._meta_plain_text,
        r.shanggexiangmu,
        r.tiyan,
        r._ai_meta?.summary,
        Array.isArray(r._ai_meta?.mood_tags) ? r._ai_meta.mood_tags.join(" ") : "",
        Array.isArray(r._ai_meta?.people_involved) ? r._ai_meta.people_involved.join(" ") : ""
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return payload.keywordsAll.every((kw: string) => fullText.includes(kw.toLowerCase()))
    })
  }

  if (Array.isArray(payload.keywordsAny) && payload.keywordsAny.length > 0) {
    records = records.filter((r) => {
      const fullText = [
        r._meta_plain_text,
        r.shanggexiangmu,
        r.tiyan,
        r._ai_meta?.summary,
        Array.isArray(r._ai_meta?.mood_tags) ? r._ai_meta.mood_tags.join(" ") : "",
        Array.isArray(r._ai_meta?.people_involved) ? r._ai_meta.people_involved.join(" ") : ""
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return payload.keywordsAny.some((kw: string) => fullText.includes(kw.toLowerCase()))
    })
  }

  // Pagination
  const page = Math.max(1, payload.page || 1)
  const pageSize = Math.min(Math.max(1, payload.pageSize || 20), 100)
  const total = records.length
  const paged = records.slice((page - 1) * pageSize, page * pageSize)

  // Format for output
  const formatted = paged.map((r) => ({
    id: r._id || r._meta_id,
    time: r.time,
    content: htmlToText(r.ganshou),
    project: r.shanggexiangmu,
    duration: r.chixushijian,
    durationMin: r._meta_duration_min,
    emotion: r.tiyan,
    moodColor: r.xinqing,
    achievement: r.chengjiu,
    weekday: r._meta_weekday,
    timeRange: r._meta_time_range,
    aiSummary: r._ai_meta?.summary || null,
    aiMoodTags: r._ai_meta?.mood_tags || [],
    aiEnergy: r._ai_meta?.energy_level || null,
    aiDomain: r._ai_meta?.primary_domain || null,
    aiPeople: r._ai_meta?.people_involved || [],
  }))

  return {
    output: JSON.stringify(
      {
        records: formatted,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
      null,
      2
    ),
    metadata: { action: "list", count: formatted.length, total },
  }
}

function handleSearch(payload: Record<string, any>) {
  const query = payload.query || ""
  if (!query) throw new Error("search requires a 'query' parameter")

  let records = loadRecords()
  records = mergeAiMeta(records)

  // Use optimized search with pre-computed text
  const scored = optimizedSearch(query, records)

  const limit = Math.min(payload.limit || 10, 50)
  const results = scored.slice(0, limit)

  const formatted = results.map(({ record: r, score }) => ({
    id: r._id || r._meta_id,
    time: r.time,
    content: htmlToText(r.ganshou),
    project: r.shanggexiangmu,
    duration: r.chixushijian,
    emotion: r.tiyan,
    aiSummary: r._ai_meta?.summary || null,
    aiMoodTags: r._ai_meta?.mood_tags || [],
    aiEnergy: r._ai_meta?.energy_level || null,
    score: Math.round(score * 100) / 100,
  }))

  return {
    output: JSON.stringify(
      {
        query,
        records: formatted,
        total: results.length,
      },
      null,
      2
    ),
    metadata: { action: "search", query, count: formatted.length },
  }
}

function handleGet(id: string | undefined, payload: Record<string, any>) {
  const recordId = id || payload.id
  if (!recordId) throw new Error("get requires an 'id' parameter")

  let records = loadRecords()
  records = mergeAiMeta(records)

  // Use index for O(1) lookup
  const index = getRecordIndex(records)
  const record = index.byId.get(recordId)

  if (!record) {
    return {
      output: JSON.stringify({ error: `Record not found: ${recordId}` }, null, 2),
      metadata: { action: "get", found: false },
    }
  }

  return {
    output: JSON.stringify(
      {
        id: record._id || record._meta_id,
        time: record.time,
        content: record.ganshou,
        plainText: record._meta_plain_text,
        project: record.shanggexiangmu,
        duration: record.chixushijian,
        durationMin: record._meta_duration_min,
        emotion: record.tiyan,
        moodColor: record.xinqing,
        achievement: record.chengjiu,
        weekday: record._meta_weekday,
        timeRange: record._meta_time_range,
        aiMeta: record._ai_meta || null,
      },
      null,
      2
    ),
    metadata: { action: "get", found: true },
  }
}

function handleStats(payload: Record<string, any>) {
  let records = loadRecords()
  records = mergeAiMeta(records)

  const total = records.length
  const aiEnhanced = records.filter((r) => r._ai_meta).length

  // Time range
  const times = records.map((r) => r._meta_timestamp).filter(Boolean)
  const earliest = times.length > 0 ? new Date(Math.min(...times)).toISOString() : null
  const latest = times.length > 0 ? new Date(Math.max(...times)).toISOString() : null

  // Project distribution
  const projectMap = new Map<string, number>()
  records.forEach((r) => {
    const p = r._meta_project || "未分类"
    projectMap.set(p, (projectMap.get(p) || 0) + 1)
  })
  const projects = Array.from(projectMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // Emotion distribution
  const emotionMap = new Map<string, number>()
  records.forEach((r) => {
    const e = r._meta_emotion_raw || "常规"
    emotionMap.set(e, (emotionMap.get(e) || 0) + 1)
  })
  const emotions = Array.from(emotionMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  // AI mood tags distribution
  const moodTagMap = new Map<string, number>()
  records.forEach((r) => {
    if (r._ai_meta && Array.isArray(r._ai_meta.mood_tags)) {
      r._ai_meta.mood_tags.forEach((tag: string) => {
        moodTagMap.set(tag, (moodTagMap.get(tag) || 0) + 1)
      })
    }
  })
  const moodTags = Array.from(moodTagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  // Weekday distribution
  const weekdayMap = new Map<string, number>()
  records.forEach((r) => {
    const w = r._meta_weekday || "未知"
    weekdayMap.set(w, (weekdayMap.get(w) || 0) + 1)
  })
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    .filter((w) => weekdayMap.has(w))
    .map((w) => ({ name: w, count: weekdayMap.get(w) || 0 }))

  // Average duration
  const durations = records.map((r) => r._meta_duration_min || 0).filter((d) => d > 0)
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0

  // Achievement count
  const achievements = records.filter((r) => r._meta_has_achievement).length

  return {
    output: JSON.stringify(
      {
        total,
        aiEnhanced,
        timeRange: { earliest, latest },
        avgDurationMinutes: avgDuration,
        achievements,
        projects,
        emotions,
        moodTags,
        weekdays,
      },
      null,
      2
    ),
    metadata: { action: "stats" },
  }
}

function handleSummaries(payload: Record<string, any>) {
  const summaries = loadSummaries()

  let filtered = summaries
  if (payload.type) {
    filtered = summaries.filter((s) => s._summary_type === payload.type)
  }
  if (payload.dateRange) {
    const { start, end } = payload.dateRange
    filtered = filtered.filter((s) => {
      const period = s._summary_period
      if (!period) return true
      if (start && period.end < start) return false
      if (end && period.start > end) return false
      return true
    })
  }

  // Sort by period start descending
  filtered.sort((a, b) => {
    const aStart = a._summary_period?.start || ""
    const bStart = b._summary_period?.start || ""
    return bStart.localeCompare(aStart)
  })

  const limit = Math.min(payload.limit || 10, 50)
  const paged = filtered.slice(0, limit)

  const formatted = paged.map((s) => ({
    id: s._id,
    type: s._summary_type,
    period: s._summary_period,
    content: s.content,
    stats: s.stats,
    model: s.model,
    createdAt: s.created_at,
  }))

  return {
    output: JSON.stringify(
      {
        summaries: formatted,
        total: filtered.length,
      },
      null,
      2
    ),
    metadata: { action: "summaries", count: formatted.length },
  }
}

function handleExport(payload: Record<string, any>) {
  // Export data in a format compatible with summary's DiaryConnector
  let records = loadRecords()
  records = mergeAiMeta(records)

  // Apply date range filter if specified
  if (payload.dateRange) {
    const { start, end } = payload.dateRange
    if (start) {
      const startDate = new Date(start).getTime()
      records = records.filter((r) => r._meta_timestamp >= startDate)
    }
    if (end) {
      const endDate = new Date(end).setHours(23, 59, 59, 999)
      records = records.filter((r) => r._meta_timestamp <= endDate)
    }
  }

  // Export as raw records (compatible with DiaryConnector input format)
  const exported = records.map((r) => ({
    _id: r._id || r._meta_id,
    time: r.time,
    ganshou: r.ganshou,
    tiyan: r.tiyan,
    xinqing: r.xinqing,
    shanggexiangmu: r.shanggexiangmu,
    chixushijian: r.chixushijian,
    chengjiu: r.chengjiu,
    _ai_meta: r._ai_meta || null,
  }))

  return {
    output: JSON.stringify(
      {
        format: "daily_log_vue_v1",
        compatibleWith: "summary.DiaryConnector",
        recordCount: exported.length,
        records: exported,
      },
      null,
      2
    ),
    metadata: { action: "export", count: exported.length, format: "daily_log_vue_v1" },
  }
}

function handleInvalidate(payload: Record<string, any>) {
  const pattern = payload.pattern
  cache.invalidate(pattern)
  recordIndex = null
  
  return {
    output: JSON.stringify(
      {
        success: true,
        message: pattern ? `Cache invalidated for pattern: ${pattern}` : "All cache invalidated",
        cacheCleared: true,
        indexRebuilt: false
      },
      null,
      2
    ),
    metadata: { action: "invalidate", pattern },
  }
}
