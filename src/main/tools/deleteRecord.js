/**
 * DeleteRecordTool - 删除/撤回日记记录工具
 * 职责：
 * 允许 Agent (小鸡) 根据用户意图删除或撤销某条指定日记（例如：“刚才记错了，帮我撤回/删除刚才那篇”）
 */

import { Tool, ToolResult } from './base.js'
import { deleteRecord } from '../data/index.js'

export class DeleteRecordTool extends Tool {
  constructor() {
    super()
    this.name = 'delete_record'
    this.description = `删除或撤销指定的日记记录。
使用场景：
- 当用户要求“撤销刚才的日记”、“撤回上一笔”、“删除某篇日记”时使用。
- 参数 id 为日记的唯一 ID（如 "rec_xxx"）。
- 若用户说“撤销上一条”，且上一轮对话或工具调用结果中包含该记录 ID，直接提取并传入该 ID 执行删除；若无法确定 ID，可先使用 query_records 检索定位后再删除。`

    this.schema = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '要删除或撤回的日记记录唯一 ID (必填)'
        },
        reason: {
          type: 'string',
          description: '删除或撤销的原因（可选，便于记录反馈）'
        }
      },
      required: ['id']
    }
  }

  async invoke(input) {
    try {
      const { id, reason } = input || {}

      if (!id || !id.trim()) {
        return new ToolResult(this.name, { error: '必须指定要删除或撤销的日记记录 ID (id)' }, true)
      }

      console.log(`[DeleteRecordTool] Deleting record: ${id}, reason: ${reason || '用户请求删除'}`)

      const delRes = await deleteRecord(id.trim())
      if (!delRes || !delRes.success) {
        return new ToolResult(this.name, {
          error: `删除日记失败: ${delRes?.error || '未找到该日记记录'}`
        }, true)
      }

      return new ToolResult(this.name, {
        success: true,
        message: `日记记录 ${id} 已成功删除/撤回`,
        deletedRecord: delRes.deletedRecord
      })
    } catch (e) {
      console.error('[DeleteRecordTool] Error:', e)
      return new ToolResult(this.name, { error: e.message || '删除日记异常' }, true)
    }
  }
}
