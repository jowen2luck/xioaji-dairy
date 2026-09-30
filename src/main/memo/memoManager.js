/**
 * MemoManager - 小鸡会话便签盒管理器
 * 职责：
 * 1. 负责管理自然倾诉阶段产生的待收纳便签 (Memos)
 * 2. 支持本地持久化至 memos.json
 * 3. 支持同话题多轮增补追加、多主题分箱
 * 4. 支持单篇或多篇便签合并归档转换为正式日记 (写入 appData.json)
 */

import fs from 'fs'
import path from 'path'
import dayjs from '../../utils/date.js'
import { saveData } from '../data/index.js'
import { clearVectorCache } from '../tools/searchRecords.js'

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

export class MemoManager {
  constructor({ storagePath = null } = {}) {
    this.storagePath = storagePath || this._resolveDefaultStoragePath()
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

  /**
   * 查询便签列表
   * @param {{ status?: 'all'|'active'|'merged'|'discarded', date?: string }} options
   */
  listMemos({ status = 'all', date = null } = {}) {
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
    const memos = this._loadMemos()
    return memos.find(m => m.id === id) || null
  }

  /**
   * 创建或增补便签
   */
  upsertMemo({ id = null, topic, project, content, quotes = [], date = null } = {}) {
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
        // 增补内容：如果新内容不在原有内容中，则追加
        if (!existing.content.includes(cleanContent)) {
          existing.content = `${existing.content}\n\n${cleanContent}`
        }
        existing.quotes = Array.from(new Set([...(existing.quotes || []), ...cleanQuotes]))
        existing.updatedAt = nowIso
        this._saveMemos(memos)
        return { memo: existing, isNew: false }
      }
    }

    // 2. 未指定 ID 时，在当天活跃便签中匹配同主题或同项目进行自然增补
    const activeSameTopic = memos.find(m => 
      m.status === 'active' && 
      m.date === targetDate && 
      (m.topic === cleanTopic || (m.project === cleanProject && m.topic.includes(cleanTopic)))
    )

    if (activeSameTopic) {
      if (!activeSameTopic.content.includes(cleanContent)) {
        activeSameTopic.content = `${activeSameTopic.content}\n\n${cleanContent}`
      }
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
    const memos = this._loadMemos()
    const filtered = memos.filter(m => m.id !== id)
    if (filtered.length !== memos.length) {
      this._saveMemos(filtered)
      return true
    }
    return false
  }

  /**
   * 将单张便签转换为正式日记
   */
  async convertToRecord(memoId, recordOverrides = {}) {
    const memos = this._loadMemos()
    const memo = memos.find(m => m.id === memoId)
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

    // 存入正式 appData.json
    const saveRes = await saveData([newRecord])
    if (saveRes && saveRes.error) {
      throw new Error(`转换日记失败: ${saveRes.error}`)
    }

    // 更新便签状态为已归档
    memo.status = 'merged'
    memo.targetRecordId = uniqueId
    memo.updatedAt = new Date().toISOString()
    this._saveMemos(memos)

    try {
      clearVectorCache()
    } catch {}

    return {
      success: true,
      record: newRecord,
      memo
    }
  }

  /**
   * 将多张便签合并转换为一篇完整的正式日记
   */
  async mergeToRecord(memoIds, recordOverrides = {}) {
    if (!Array.isArray(memoIds) || memoIds.length === 0) {
      throw new Error('必须指定至少一张便签 ID')
    }

    const memos = this._loadMemos()
    const targetMemos = memos.filter(m => memoIds.includes(m.id))
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

    const nowIso = new Date().toISOString()
    targetMemos.forEach(m => {
      m.status = 'merged'
      m.targetRecordId = uniqueId
      m.updatedAt = nowIso
    })
    this._saveMemos(memos)

    try {
      clearVectorCache()
    } catch {}

    return {
      success: true,
      record: newRecord,
      mergedCount: targetMemos.length,
      memos: targetMemos
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
