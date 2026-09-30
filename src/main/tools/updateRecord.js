/**
 * UpdateRecordTool - 修改日记记录工具
 * 职责：
 * 允许 Agent (小鸡) 根据用户意图修改指定日记的内容、项目归属、持续时间或时间戳
 */

import { Tool, ToolResult } from './base.js'
import { updateRecord } from '../data/index.js'

export class UpdateRecordTool extends Tool {
  constructor() {
    super()
    this.name = 'update_record'
    this.description = `修改指定的日记记录。
使用场景：
- 当用户要求修改某条日记的内容、更正分类/项目名称、修正持续时长或调整日期时间时使用。
- 通常与 query_records 配合：如果不知道精确 ID，可先用 query_records 定位记录获取 ID，然后调用本工具进行修改。

参数要求：
- id: 要修改的日记记录唯一 ID（必填）
- content: 修改后的日记正文/感受内容（可选，对应 ganshou）
- project: 修改后的所属项目或分类（可选，对应 shanggexiangmu）
- duration: 修改后的持续时长（可选，如 "1h"、"45分钟"，对应 chixushijian）
- time: 修改后的记录时间（可选，格式如 "YYYY-MM-DD HH:mm:ss"）`

    this.schema = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '要修改的日记记录的唯一 ID (必填)'
        },
        content: {
          type: 'string',
          description: '修改后的日记正文或心得感受'
        },
        project: {
          type: 'string',
          description: '修改后的项目分类名称（如科研、生活、工作、求职等）'
        },
        duration: {
          type: 'string',
          description: '修改后的持续时长（如 30m, 1h, 45分钟 等）'
        },
        time: {
          type: 'string',
          description: '修改后的发生时间 (YYYY-MM-DD HH:mm:ss)'
        }
      },
      required: ['id']
    }
  }

  async invoke(input) {
    try {
      const { id, content, project, duration, time } = input || {}

      if (!id || !id.trim()) {
        return new ToolResult(this.name, { error: '必须指定要修改的日记记录 ID (id)' }, true)
      }

      const updates = {}
      if (content !== undefined && content.trim() !== '') updates.ganshou = content.trim()
      if (project !== undefined && project.trim() !== '') updates.shanggexiangmu = project.trim()
      if (duration !== undefined && duration.trim() !== '') updates.chixushijian = duration.trim()
      if (time !== undefined && time.trim() !== '') updates.time = time.trim()

      if (Object.keys(updates).length === 0) {
        return new ToolResult(this.name, { error: '未提供任何需要修改的字段 (content, project, duration, time)' }, true)
      }

      console.log(`[UpdateRecordTool] Updating record ${id} with:`, updates)

      const updateRes = await updateRecord(id.trim(), updates)
      if (!updateRes || !updateRes.success) {
        return new ToolResult(this.name, {
          error: `更新日记失败: ${updateRes?.error || '记录不存在或写入错误'}`
        }, true)
      }

      return new ToolResult(this.name, {
        success: true,
        message: `日记记录 ${id} 已成功更新`,
        updatedRecord: updateRes.record
      })
    } catch (e) {
      console.error('[UpdateRecordTool] Error:', e)
      return new ToolResult(this.name, { error: e.message || '更新日记异常' }, true)
    }
  }
}
