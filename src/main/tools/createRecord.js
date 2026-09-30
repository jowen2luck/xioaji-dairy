/**
 * CreateRecordTool - 新建日记记录工具
 * 职责：
 * 允许 Agent (小鸡) 从用户的自然语言中提取关键要素（项目分类、持续时长、感受内容、时间）并写入日记数据库
 */

import { Tool, ToolResult } from './base.js'
import { saveData } from '../data/index.js'
import { clearVectorCache } from './searchRecords.js'
import dayjs from '../../utils/date.js'

export class CreateRecordTool extends Tool {
  constructor() {
    super()
    this.name = 'create_record'
    this.description = `为用户新建并保存一条日记记录。
使用场景：
- 当用户表达记录日常的意图时（例如：“帮我记一下今天做了什么”、“记录一下：刚才...”）。
- 从用户的倾诉中提炼所属项目分类、持续时长、核心感受内容与时间，然后调用此工具入库保存。

参数要求：
- content: 日记的具体内容与内心感受（必填，对应 ganshou）
- project: 所属分类或项目名（如“科研”、“工作”、“生活”、“学习”等，对应 shanggexiangmu，默认为“日常”）
- duration: 持续时间估计（如“30m”、“1h”、“45分钟”，对应 chixushijian，默认“未知时长”）
- time: 记录发生的具体日期时间（格式形如 "YYYY-MM-DD HH:mm:ss"，缺省时自动使用当前时间）`

    this.schema = {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '日记的具体内容、事情经过或心情感受'
        },
        project: {
          type: 'string',
          description: '日记归属的项目或类别（如科研、生活、工作、锻炼等）'
        },
        duration: {
          type: 'string',
          description: '持续时间，如 30m, 1h, 45分钟 等'
        },
        time: {
          type: 'string',
          description: '记录发生的具体日期时间 (YYYY-MM-DD HH:mm:ss)，如果不明确指定则留空使用当前时间'
        }
      },
      required: ['content']
    }
  }

  async invoke(input) {
    try {
      const { content, project, duration, time } = input || {}

      if (!content || !content.trim()) {
        return new ToolResult(this.name, { error: '日记内容 (content) 不能为空' }, true)
      }

      const recordTime = time && time.trim() 
        ? dayjs(time).format('YYYY-MM-DD HH:mm:ss')
        : dayjs().format('YYYY-MM-DD HH:mm:ss')

      const uniqueId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      const newRecord = {
        _id: uniqueId,
        time: recordTime,
        shanggexiangmu: (project && project.trim()) || '日常',
        chixushijian: (duration && duration.trim()) || '未知时长',
        ganshou: content.trim()
      }

      console.log('[CreateRecordTool] Saving new record:', newRecord)

      // 保存到本地 appData.json
      const saveResult = await saveData([newRecord])
      if (saveResult && saveResult.error) {
        return new ToolResult(this.name, { error: `保存日记失败: ${saveResult.error}` }, true)
      }

      // 清除向量索引缓存，保证后续查询即时感知新记录
      try {
        clearVectorCache()
      } catch (err) {
        console.warn('[CreateRecordTool] Failed to clear vector cache:', err)
      }

      // 广播给所有渲染进程窗口，确保视图实时刷新
      try {
        const electron = await import('electron')
        const BrowserWindow = electron?.BrowserWindow || electron?.default?.BrowserWindow
        if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('journal:data-changed', { record: newRecord })
            }
          })
        }
      } catch {}

      return new ToolResult(this.name, {
        success: true,
        message: '日记已成功记录入库',
        record: newRecord
      })
    } catch (e) {
      console.error('[CreateRecordTool] Error:', e)
      return new ToolResult(this.name, { error: e.message || '新建日记异常' }, true)
    }
  }
}
