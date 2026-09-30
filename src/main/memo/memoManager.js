/**
 * MemoManager - 小鸡会话便签盒管理器
 * 职责：
 * 1. 负责管理自然倾诉阶段产生的待收纳便签 (Memos)
 * 2. 深度集成 SqliteMemoRepository，实现结构化事务管理与防崩溃保护
 * 3. 支持同话题多轮增补追加、多主题分箱
 * 4. 支持单篇或多篇便签合并归档转换为正式日记（具备原子回滚能力）
 * 5. 兼容本地 memos.json 快照同步与平滑迁移
 */

import fs from 'fs'
import path from 'path'
import dayjs from '../../utils/date.js'
import { saveData } from '../data/index.js'
import { clearVectorCache } from '../tools/searchRecords.js'
import { SqliteMemoRepository } from '../infrastructure/persistence/SqliteMemoRepository.js'

/**
 * 清洗便签与日记内容，剔除第三人称公文转述（如“用户说了：”、“用户表示：”等），确保第一人称日记纯度
 */
export function sanitizeMemoContent(text) {
  if (!text || typeof text !== 'string') return ''
  let cleaned = text.trim()

  // 1. 剥离段落开头或整段开头的第三人称汇报前缀，如："用户说了："、"用户表示："、"TA说："、"用户："
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:用户(?:今天|刚才|在对话中)?(?:说了?|表示|觉得|提到|吐槽|反馈|写道|记录道)?|TA(?:说|表示|觉得))\s*[：:]\s*/gi, (match) => {
    return match.startsWith('\n') ? '\n' : ''
  })

  // 2. 剥离没有冒号但在句首的公文化第三人称，如 "用户今天十点才起..." -> "今天十点才起..."
  cleaned = cleaned.replace(/^用户(?:今天|刚才)?(?=[一-龟\d])/g, '')

  // 3. 剥离外层多余的包裹性引号
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('“') && cleaned.endsWith('”'))) {
    cleaned = cleaned.slice(1, -1).trim()
  }

  return cleaned.trim()
}

/**
 * 计算两个字符串的字符多重集重合率（Overlap Ratio）
 * 取交集字符数 / 较短文本的字符数，返回 0.0 ~ 1.0
 */
export function computeContentOverlap(strA, strB) {
  if (!strA || !strB) return 0
  const cleanA = strA.replace(/[^\p{L}\p{N}]/gu, '')
  const cleanB = strB.replace(/[^\p{L}\p{N}]/gu, '')
  if (!cleanA || !cleanB) return 0

  if (cleanA === cleanB) return 1.0

  const minLen = Math.min(cleanA.length, cleanB.length)
  // 短文本（少于15字）不采用模糊正文重叠率判定，避免如“内容1”与“内容2”因字数过少误判
  if (minLen < 15) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
      return 1.0
    }
    return 0
  }

  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return 1.0

  const freqA = {}
  for (const ch of cleanA) freqA[ch] = (freqA[ch] || 0) + 1
  const freqB = {}
  for (const ch of cleanB) freqB[ch] = (freqB[ch] || 0) + 1

  let commonChars = 0
  for (const ch in freqA) {
    if (freqB[ch]) commonChars += Math.min(freqA[ch], freqB[ch])
  }
  return minLen > 0 ? commonChars / minLen : 0
}

/**
 * 判断两个便签主题是否高度相似（支持前后语序倒置，如“中秋节的无力感与逻辑闭环” vs “逻辑闭环与中秋节的无力感”）
 */
export function isTopicSimilar(topicA, topicB) {
  if (!topicA || !topicB) return false
  const a = topicA.trim().toLowerCase()
  const b = topicB.trim().toLowerCase()
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true

  const cleanA = a.replace(/[^\p{L}\p{N}]/gu, '')
  const cleanB = b.replace(/[^\p{L}\p{N}]/gu, '')
  if (!cleanA || !cleanB) return false

  // 字符集 Jaccard 相似度
  const setA = new Set(cleanA)
  const setB = new Set(cleanB)
  let intersection = 0
  for (const c of setA) {
    if (setB.has(c)) intersection++
  }
  const union = setA.size + setB.size - intersection
  const charJaccard = union > 0 ? intersection / union : 0

  // 2-gram Jaccard 相似度
  const ngrams = (str, n = 2) => {
    const set = new Set()
    for (let i = 0; i <= str.length - n; i++) {
      set.add(str.slice(i, i + n))
    }
    return set
  }
  const ngramsA = ngrams(cleanA, 2)
  const ngramsB = ngrams(cleanB, 2)
  let ngramInter = 0
  for (const g of ngramsA) {
    if (ngramsB.has(g)) ngramInter++
  }
  const ngramUnion = ngramsA.size + ngramsB.size - ngramInter
  const ngramJaccard = ngramUnion > 0 ? ngramInter / ngramUnion : 0

  return charJaccard >= 0.75 || ngramJaccard >= 0.6
}

/**
 * 智能合并便签内容：
 * - 若完全包含或高度重合（>= 0.65，判定为模型重述/润色/二次提炼），保留更全面（更长）的一方，避免全文重复拼接
 * - 若属于增量补充（< 0.65），进行换行自然拼接
 */
export function mergeMemoContent(existingContent, incomingContent) {
  if (!existingContent) return incomingContent || ''
  if (!incomingContent) return existingContent

  const cleanExisting = existingContent.trim()
  const cleanIncoming = incomingContent.trim()

  if (cleanExisting.includes(cleanIncoming)) return cleanExisting
  if (cleanIncoming.includes(cleanExisting)) return cleanIncoming

  const overlap = computeContentOverlap(cleanExisting, cleanIncoming)
  if (overlap >= 0.65) {
    return cleanIncoming.length >= cleanExisting.length ? cleanIncoming : cleanExisting
  }

  return `${cleanExisting}\n\n${cleanIncoming}`
}

export class MemoManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.storagePath]
   * @param {SqliteMemoRepository} [options.sqliteRepo]
   */
  constructor({ storagePath = null, sqliteRepo = null } = {}) {
    this.storagePath = storagePath || this._resolveDefaultStoragePath()
    this.sqliteRepo = sqliteRepo || null

    // 若未显式传入 sqliteRepo 且 storagePath 属于正式数据目录或为空，则自动挂载 SQLite 仓储
    if (!this.sqliteRepo && (!this.storagePath || this.storagePath.includes('userData'))) {
      try {
        this.sqliteRepo = new SqliteMemoRepository({ legacyJsonPath: this.storagePath })
      } catch (e) {
        console.warn('[MemoManager] SQLite binding unavailable, falling back to JSON:', e.message)
      }
    }
  }

  _resolveDefaultStoragePath() {
    try {
      let appModule = null
      try {
        appModule = require('electron')?.app
      } catch {}
      if (appModule && typeof appModule.getPath === 'function') {
        return path.join(appModule.getPath('userData'), 'memos.json')
      }
    } catch {}
    return path.join(process.cwd(), '.cache', 'memos.json')
  }

  getRepo() {
    if (!this.sqliteRepo) {
      this.sqliteRepo = new SqliteMemoRepository({ legacyJsonPath: this.storagePath })
    }
    return this.sqliteRepo
  }

  _loadMemos() {
    try {
      if (this.storagePath && fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8')
        if (raw && raw.trim()) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) return parsed
        }
      }
    } catch (e) {
      console.warn('[MemoManager] Failed to read memos from disk:', e.message)
    }
    return []
  }

  _saveMemos(memos) {
    try {
      if (!this.storagePath) return false
      const dir = path.dirname(this.storagePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.storagePath, JSON.stringify(memos, null, 2), 'utf-8')
      return true
    } catch (e) {
      console.error('[MemoManager] Failed to save memos to disk:', e)
      return false
    }
  }

  _syncFromJsonFallback() {
    if (!this.storagePath || !this.sqliteRepo) return
    try {
      const list = this.sqliteRepo.listMemos({ status: 'all' })
      this._saveMemos(list)
    } catch {}
  }

  /**
   * 查询便签列表
   * @param {{ status?: 'all'|'active'|'merged'|'discarded', date?: string }} options
   */
  listMemos({ status = 'all', date = null } = {}) {
    if (this.sqliteRepo) {
      return this.sqliteRepo.listMemos({ status, date })
    }

    const memos = this._loadMemos()
    return memos.filter(m => {
      if (status !== 'all' && m.status !== status) return false
      if (date && m.date !== date) return false
      return true
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
  }

  /**
   * 获取单条便签
   */
  getMemo(id) {
    if (!id) return null
    if (this.sqliteRepo) {
      return this.sqliteRepo.getMemo(id)
    }

    const memos = this._loadMemos()
    return memos.find(m => m.id === id) || null
  }

  /**
   * 创建或增补便签
   */
  upsertMemo({ id = null, topic, project, content, quotes = [], date = null } = {}) {
    if (this.sqliteRepo) {
      const res = this.sqliteRepo.upsertMemo({ id, topic, project, content, quotes, date })
      this._syncFromJsonFallback()
      return res
    }

    if (!content || !content.trim()) {
      throw new Error('便签正文不能为空')
    }

    const memos = this._loadMemos()
    const nowIso = new Date().toISOString()
    const targetDate = date || dayjs().format('YYYY-MM-DD')
    const cleanContent = sanitizeMemoContent(content)
    const cleanTopic = (topic && topic.trim()) || '生活随想'
    const cleanProject = (project && project.trim()) || '生活'
    const cleanQuotes = Array.isArray(quotes) ? quotes.map(q => sanitizeMemoContent(q)).filter(Boolean) : []

    // 1. 如果指定了具体 ID，直接更新
    if (id) {
      const idx = memos.findIndex(m => m.id === id)
      if (idx !== -1) {
        const existing = memos[idx]
        existing.topic = cleanTopic || existing.topic
        existing.project = cleanProject || existing.project
        existing.content = mergeMemoContent(existing.content, cleanContent)
        existing.quotes = Array.from(new Set([...(existing.quotes || []), ...cleanQuotes]))
        existing.updatedAt = nowIso
        this._saveMemos(memos)
        return { memo: existing, isNew: false }
      }
    }

    // 2. 未指定 ID 或指定 ID 不存在时，在当天活跃便签中匹配同主题、相似主题或高重合正文
    let activeSameTopic = memos.find(m => 
      m.status === 'active' && 
      m.date === targetDate && 
      m.topic === cleanTopic
    )
    if (!activeSameTopic) {
      activeSameTopic = memos.find(m => 
        m.status === 'active' && 
        m.date === targetDate && 
        ((m.project === cleanProject && (m.topic.includes(cleanTopic) || cleanTopic.includes(m.topic))) ||
         isTopicSimilar(m.topic, cleanTopic))
      )
    }
    if (!activeSameTopic) {
      activeSameTopic = memos.find(m => 
        m.status === 'active' && 
        m.date === targetDate && 
        computeContentOverlap(m.content, cleanContent) >= 0.65
      )
    }

    if (activeSameTopic) {
      activeSameTopic.topic = (activeSameTopic.topic && activeSameTopic.topic !== '生活随想') ? activeSameTopic.topic : cleanTopic
      activeSameTopic.project = cleanProject || activeSameTopic.project
      activeSameTopic.content = mergeMemoContent(activeSameTopic.content, cleanContent)
      activeSameTopic.quotes = Array.from(new Set([...(activeSameTopic.quotes || []), ...cleanQuotes]))
      activeSameTopic.updatedAt = nowIso
      this._saveMemos(memos)
      return { memo: activeSameTopic, isNew: false }
    }

    // 3. 否则创建新便签
    const newMemo = {
      id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: targetDate,
      topic: cleanTopic,
      project: cleanProject,
      content: cleanContent,
      quotes: cleanQuotes,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
      targetRecordId: null
    }

    memos.unshift(newMemo)
    this._saveMemos(memos)
    return { memo: newMemo, isNew: true }
  }

  /**
   * 删除便签
   */
  deleteMemo(id) {
    if (this.sqliteRepo) {
      const res = this.sqliteRepo.deleteMemo(id)
      this._syncFromJsonFallback()
      return res
    }

    const memos = this._loadMemos()
    const filtered = memos.filter(m => m.id !== id)
    if (filtered.length !== memos.length) {
      this._saveMemos(filtered)
      return true
    }
    return false
  }

  /**
   * 将单张便签转换为正式日记（具备原子保障）
   */
  async convertToRecord(memoId, recordOverrides = {}) {
    const memo = this.getMemo(memoId)
    if (!memo) {
      throw new Error(`找不到 ID 为 ${memoId} 的便签`)
    }

    const uniqueId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const recordTime = memo.date 
      ? `${memo.date} ${dayjs().format('HH:mm:ss')}`
      : dayjs().format('YYYY-MM-DD HH:mm:ss')

    const rawContent = (recordOverrides.content && recordOverrides.content.trim()) || memo.content
    const newRecord = {
      _id: uniqueId,
      time: recordTime,
      shanggexiangmu: (recordOverrides.project && recordOverrides.project.trim()) || memo.project || '生活',
      chixushijian: (recordOverrides.duration && recordOverrides.duration.trim()) || '30m',
      ganshou: sanitizeMemoContent(rawContent)
    }

    // 存入正式存储底座（当前为 appData.json，阶段三无感迁入 SQLite journals 表）
    const saveRes = await saveData([newRecord])
    if (saveRes && saveRes.error) {
      throw new Error(`转换日记失败: ${saveRes.error}`)
    }

    // 更新便签状态为已归档
    if (this.sqliteRepo) {
      this.sqliteRepo.updateMemoStatus(memoId, 'merged', uniqueId)
      this._syncFromJsonFallback()
    } else {
      const memos = this._loadMemos()
      const target = memos.find(m => m.id === memoId)
      if (target) {
        target.status = 'merged'
        target.targetRecordId = uniqueId
        target.updatedAt = new Date().toISOString()
        this._saveMemos(memos)
      }
    }

    try {
      clearVectorCache()
    } catch {}

    const updatedMemo = this.getMemo(memoId)

    return {
      success: true,
      record: newRecord,
      memo: updatedMemo || memo
    }
  }

  /**
   * 将多张便签合并转换为一篇完整的正式日记（具备原子保障）
   */
  async mergeToRecord(memoIds, recordOverrides = {}) {
    if (!Array.isArray(memoIds) || memoIds.length === 0) {
      throw new Error('必须指定至少一张便签 ID')
    }

    const allMemos = this.listMemos({ status: 'all' })
    const targetMemos = allMemos.filter(m => memoIds.includes(m.id))
    if (targetMemos.length === 0) {
      throw new Error('未找到指定的任何便签')
    }

    // 按创建时间升序排列合成连贯日记
    targetMemos.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    const mergedContent = targetMemos.map(m => {
      const heading = m.topic ? `【${m.topic}】` : ''
      return heading ? `${heading}\n${m.content}` : m.content
    }).join('\n\n')

    const uniqueId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const primaryDate = targetMemos[0].date || dayjs().format('YYYY-MM-DD')
    const recordTime = `${primaryDate} ${dayjs().format('HH:mm:ss')}`
    const finalContent = (recordOverrides.content && recordOverrides.content.trim()) || mergedContent

    const newRecord = {
      _id: uniqueId,
      time: recordTime,
      shanggexiangmu: (recordOverrides.project && recordOverrides.project.trim()) || targetMemos[0].project || '生活',
      chixushijian: (recordOverrides.duration && recordOverrides.duration.trim()) || `${targetMemos.length * 20}m`,
      ganshou: sanitizeMemoContent(finalContent)
    }

    const saveRes = await saveData([newRecord])
    if (saveRes && saveRes.error) {
      throw new Error(`合并生成日记失败: ${saveRes.error}`)
    }

    // 事务批量更新便签状态
    if (this.sqliteRepo) {
      this.sqliteRepo.batchUpdateMemosStatus(memoIds, 'merged', uniqueId)
      this._syncFromJsonFallback()
    } else {
      const nowIso = new Date().toISOString()
      const memos = this._loadMemos()
      memos.forEach(m => {
        if (memoIds.includes(m.id)) {
          m.status = 'merged'
          m.targetRecordId = uniqueId
          m.updatedAt = nowIso
        }
      })
      this._saveMemos(memos)
    }

    try {
      clearVectorCache()
    } catch {}

    const updatedMemos = this.listMemos({ status: 'all' }).filter(m => memoIds.includes(m.id))

    return {
      success: true,
      record: newRecord,
      mergedCount: targetMemos.length,
      memos: updatedMemos
    }
  }
}

let memoManagerInstance = null

export function getMemoManager(options = {}) {
  if (!memoManagerInstance) {
    memoManagerInstance = new MemoManager(options)
  }
  return memoManagerInstance
}
