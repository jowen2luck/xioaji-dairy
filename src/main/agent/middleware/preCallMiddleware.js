/**
 * PreCallMiddleware - 前置中间件 (直接复用现有 CalendarResolverTool)
 * 职责：
 * 1. 动态生成精确的本日、本周、上周、本月基准时间锚点 (dayjs)
 * 2. 直接复用现有的 CalendarResolverTool 解析用户问题中的相对时间，免去额外 LLM 往返
 * 3. 快速旁路判定 (Fast-path)：识别纯问候与闲聊，跳过复杂工具循环
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import isoWeek from 'dayjs/plugin/isoWeek.js'
import fs from 'fs'
import path from 'path'
import { CalendarResolverTool } from '../../tools/calendar.js'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)

const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const SURPRISE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 天冷却锁 (72 小时)
const RECALL_PATTERNS = /又|老是|再次|经常|总是|还是老样子|反复|总是这样|心慌|失眠|崩溃|好累|好烦|压力好大|喘不过气/

export function getTimePeriodInfo(baseDate = null) {
  const d = baseDate ? dayjs(baseDate).tz(DEFAULT_TIMEZONE) : dayjs().tz(DEFAULT_TIMEZONE)
  const hour = d.hour()
  let period = ''
  let periodNotice = ''

  if (hour >= 5 && hour < 9) {
    period = '早晨/清晨'
    periodNotice = '新的一天刚刚开启，朝气蓬勃。'
  } else if (hour >= 9 && hour < 12) {
    period = '上午'
    periodNotice = '白天的黄金工作与专注学习时段。'
  } else if (hour >= 12 && hour < 14) {
    period = '中午'
    periodNotice = '午餐与午间小憩时段。'
  } else if (hour >= 14 && hour < 18) {
    period = '下午'
    periodNotice = '白天的延续活跃时段，距离傍晚/夜间还有数小时，属于白天行动与调整的充裕期（绝不是晚上，切勿当成一天结束！）。'
  } else if (hour >= 18 && hour < 22) {
    period = '傍晚/晚间'
    periodNotice = '晚餐后放松、复盘或夜间个人时光。'
  } else {
    period = '深夜/凌晨'
    periodNotice = '夜深人静，属于休息就寝或静夜思考时段。'
  }

  const timeStr = d.format('YYYY-MM-DD HH:mm:ss')
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.day()]

  return {
    date: d.format('YYYY-MM-DD'),
    time: d.format('HH:mm:ss'),
    datetime: timeStr,
    weekday,
    hour,
    period,
    periodNotice,
    display: `${timeStr} (${weekday} · ${period})`
  }
}

export class PreCallMiddleware {
  constructor({ searchTool, storagePath } = {}) {
    this.calendarTool = new CalendarResolverTool()
    this.searchTool = searchTool || null
    this.storagePath = storagePath !== undefined ? storagePath : this._resolveDefaultStoragePath()
    this._surpriseState = this._loadSurpriseState()
  }

  _resolveDefaultStoragePath() {
    try {
      // 兼容 Electron 环境
      let appModule = null
      try {
        appModule = require('electron')?.app
      } catch {}
      if (appModule && typeof appModule.getPath === 'function') {
        return path.join(appModule.getPath('userData'), 'echo-state.json')
      }
    } catch {}
    return path.join(process.cwd(), '.cache', 'echo-state.json')
  }

  _loadSurpriseState() {
    try {
      if (this.storagePath && fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8')
        if (raw) return JSON.parse(raw)
      }
    } catch {}
    return { lastSurpriseTime: 0 }
  }

  _saveSurpriseState() {
    try {
      if (this.storagePath) {
        const dir = path.dirname(this.storagePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(this.storagePath, JSON.stringify(this._surpriseState), 'utf-8')
      }
    } catch (e) {
      console.warn('[PreCallMiddleware] Failed to save surprise state:', e.message)
    }
  }

  async getSearchTool() {
    if (!this.searchTool) {
      const { SearchRecordsTool } = await import('../../tools/searchRecords.js')
      this.searchTool = new SearchRecordsTool()
    }
    return this.searchTool
  }

  /**
   * 生成当前动态时间锚点
   */
  getTemporalAnchors(baseDate = null) {
    const timeInfo = getTimePeriodInfo(baseDate)
    const now = baseDate ? dayjs(baseDate).tz(DEFAULT_TIMEZONE) : dayjs().tz(DEFAULT_TIMEZONE)

    const thisWeekStart = now.startOf('isoWeek').format('YYYY-MM-DD')
    const thisWeekEnd = now.endOf('isoWeek').format('YYYY-MM-DD')

    const lastWeek = now.subtract(1, 'week')
    const lastWeekStart = lastWeek.startOf('isoWeek').format('YYYY-MM-DD')
    const lastWeekEnd = lastWeek.endOf('isoWeek').format('YYYY-MM-DD')

    const thisMonthStart = now.startOf('month').format('YYYY-MM-DD')
    const thisMonthEnd = now.endOf('month').format('YYYY-MM-DD')

    const lastMonth = now.subtract(1, 'month')
    const lastMonthStart = lastMonth.startOf('month').format('YYYY-MM-DD')
    const lastMonthEnd = lastMonth.endOf('month').format('YYYY-MM-DD')

    const isDaytime = timeInfo.hour >= 5 && timeInfo.hour < 18

    return `
【当前时间锚点】(系统现实时间感知铁律 - 时区: Asia/Shanghai)
- 当前准确系统时间: ${timeInfo.display}
- 当前钟表时段: 【${timeInfo.period}】（${timeInfo.periodNotice}）
- 【时段感知硬性红线】：
  1. 必须精准感知当前时段。当前处于【${timeInfo.period}】，严禁时空错乱！严禁在白天（上午/中午/下午）把时间说成“今晚”、“夜里”或以为“一天结束了”！
  2. ${isDaytime ? `当前正值白天！严禁对用户说“今晚早点睡吧”、“今天就先睡吧”等逃避白天的劝睡话术；当用户在白天表达无力、抗拒或询问“白天我要做点什么”时，必须立足于当前【${timeInfo.period}】时段，给出当下的微小行动支持（如先喝杯温水、洗把脸、出门散步10分钟、做最微小的第一步），绝不可直接快进到晚上入睡！` : `当前正值夜间，适合回顾整理与放松，可温和陪伴并适时引导就寝。`}
- 统计参考基准范围:
  - 今天: ${timeInfo.date} (${timeInfo.weekday})
  - 本周范围: ${thisWeekStart} 至 ${thisWeekEnd}
  - 上周范围: ${lastWeekStart} 至 ${lastWeekEnd}
  - 本月范围: ${thisMonthStart} 至 ${thisMonthEnd}
  - 上月范围: ${lastMonthStart} 至 ${lastMonthEnd}
`.trim()
  }

  /**
   * 直接复用现有 CalendarResolverTool 进行前置时间推导
   * @param {string} query - 用户查询文本
   * @returns {{ hasTemporal: boolean, range?: { start: string, end: string }, description?: string, promptHint?: string }}
   */
  preResolveTemporal(query) {
    if (!query || typeof query !== 'string') {
      return { hasTemporal: false }
    }

    try {
      const base = dayjs().tz(DEFAULT_TIMEZONE)
      const normalized = this.calendarTool.normalizeQuery(query)

      // 提取可能有时间特征的片段进行解析
      const result = this.calendarTool.parseLogic(normalized, base)

      if (result && result.start && result.end) {
        return {
          hasTemporal: true,
          range: {
            start: result.start,
            end: result.end
          },
          description: result.description || '自定义时间段',
          promptHint: `【系统前置时间解析】：根据现有日历规则，已前置解析时间范围为 [${result.start} 至 ${result.end}] (${result.description || ''})。在调用检索工具时可直接复用此日期范围，无需重复调用 calendar_resolver。`
        }
      }
    } catch (e) {
      console.warn('[PreCallMiddleware] Pre-resolve temporal failed:', e.message)
    }

    return { hasTemporal: false }
  }

  /**
   * 闲聊与极简问候旁路判定 (Fast-path)
   */
  isCasualGreeting(query) {
    if (!query || typeof query !== 'string') return false
    const q = query.trim()
    const casualRegex = /^(你好|您好|hi|hello|hey|嗨|在吗|哈+|嘻+|早上好|中午好|晚上好|早安|晚安|在不|在么|测试)(呀|啊|哦|吧|嘛)?[!！~。?？\s]*$/i
    return casualRegex.test(q)
  }

  /**
   * 克制的主动回忆嗅探 (Proactive Recall)
   * 必须同时满足：
   * 1. 3 天冷却锁已过 (零认知疲劳)
   * 2. 输入包含重复/循环/情绪复发关键词且非显式指令查询
   * 3. 命中日记的时间跨度 >= 14 天 (非近期琐事，属于岁月呼应)
   */
  async checkProactiveRecall(userQuery, customNow = null) {
    if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length < 6) {
      return null
    }

    const q = userQuery.trim()

    // 显式查询指令（如"查一下"、"搜索"）跳过，交由正常搜索工具处理
    if (/^(查|搜索|帮我查|查找|统计|分析|看下|列出|回顾)/.test(q)) {
      return null
    }

    // 1. 触发词过滤
    if (!RECALL_PATTERNS.test(q)) {
      return null
    }

    // 2. 3 天冷却锁检查
    const nowTime = customNow ? dayjs(customNow).valueOf() : Date.now()
    const lastTime = this._surpriseState.lastSurpriseTime || 0
    if (nowTime - lastTime < SURPRISE_COOLDOWN_MS) {
      return null
    }

    // 3. 静默搜索历史旧日记
    try {
      const searchTool = await this.getSearchTool()
      const cleanKeywords = q.replace(/[，。！？、\s]+/g, ' ').slice(0, 30)
      const res = await searchTool.invoke({ query: cleanKeywords, limit: 3 })

      const records = res?.data?.records || []
      if (!records || records.length === 0) {
        return null
      }

      // 4. 寻找时间跨度 >= 14 天的最佳呼应日记
      const nowDate = customNow ? dayjs(customNow) : dayjs().tz(DEFAULT_TIMEZONE)
      let qualifiedRecord = null
      let daysAgo = 0

      for (const rec of records) {
        const recTimeStr = rec.time || rec.date || rec.occurredAt
        if (!recTimeStr) continue
        const recDate = dayjs(recTimeStr)
        if (!recDate.isValid()) continue

        const diff = nowDate.diff(recDate, 'day')
        if (diff >= 14) {
          qualifiedRecord = rec
          daysAgo = diff
          break
        }
      }

      if (!qualifiedRecord) {
        return null
      }

      // 5. 命中回响！更新冷却时间戳并返回提示
      this._surpriseState.lastSurpriseTime = nowTime
      this._saveSurpriseState()

      const recDate = dayjs(qualifiedRecord.time || qualifiedRecord.date)
      const dateDesc = recDate.format('YYYY年M月')
      const snippet = qualifiedRecord.matchedSnippet ||
        (qualifiedRecord.ganshou || qualifiedRecord.content || qualifiedRecord.summary || '').slice(0, 80)

      console.log(`[PreCallMiddleware] Proactive recall triggered! Echo from ${daysAgo} days ago (${dateDesc})`)

      return `【小鸡的心头记忆 (偶尔的默契回响)】\n你忽然回想起在过去的记录中（约 ${daysAgo} 天前，${dateDesc}左右），用户也曾经历过类似的心情或情境：“${snippet}”。\n【表达原则】：\n1. 像陪伴已久的老朋友一样，以极度温和、轻描淡写的口吻在回复里顺带提上一句关心或鼓励；\n2. 绝对不要像机器人一样生硬念出日期、得分或数据库字眼（例如不要说“根据我检索到的数据”或“在某某日记中”）；\n3. 像自己脑海中偶尔想起来一样自然表达，给用户被深深懂得与记住的安全感。`

    } catch (e) {
      console.warn('[PreCallMiddleware] Proactive recall error (graceful fallback):', e.message)
      return null
    }
  }

  /**
   * 组合增强 System Prompt
   */
  augmentSystemPrompt(baseSystemPrompt, userQuery) {
    const anchors = this.getTemporalAnchors()
    const temporalInfo = this.preResolveTemporal(userQuery)

    let extra = `\n\n${anchors}`
    if (temporalInfo.hasTemporal && temporalInfo.promptHint) {
      extra += `\n\n${temporalInfo.promptHint}`
    }

    return `${baseSystemPrompt}${extra}`
  }

  /**
   * 前置中间件处理管道：解析动态时间锚点、自然语言时间预提取、闲聊判定与偶尔的主动回忆
   * @param {{ userQuery: string, messages?: any[] }} params
   * @returns {Promise<{ isCasual: boolean, timeAnchor: string, resolvedTime: any, temporalInfo: any, proactiveRecallHint: string|null }>}
   */
  async process({ userQuery, messages } = {}) {
    const isCasual = this.isCasualGreeting(userQuery)
    const temporalInfo = this.preResolveTemporal(userQuery)
    const timeInfo = getTimePeriodInfo()
    const timeAnchor = timeInfo.display

    let proactiveRecallHint = null
    if (!isCasual) {
      proactiveRecallHint = await this.checkProactiveRecall(userQuery)
    }

    return {
      isCasual,
      timeAnchor,
      timeInfo,
      resolvedTime: temporalInfo.hasTemporal ? temporalInfo.range : null,
      temporalInfo,
      proactiveRecallHint
    }
  }
}

export const globalPreCallMiddleware = new PreCallMiddleware()
