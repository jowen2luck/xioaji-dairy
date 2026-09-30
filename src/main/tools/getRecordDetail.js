/**
 * GetRecordDetailTool - 深入点选单篇日记全文工具 (配合 ToolOffloader)
 * 职责：
 * 当日记列表检索因结果过大被外置暂存后，若 Agent 认为某篇记录特别关键，
 * 可通过此工具按 ID 精确获取该篇记录的完整日记正文、AI 元数据及详细反思。
 */

import { Tool, ToolResult, formatRecordForLLM } from './base.js'
import { loadAndEnrichData } from '../data/index.js'
import { globalToolOffloader } from '../agent/middleware/toolOffloader.js'

export class GetRecordDetailTool extends Tool {
  constructor() {
    super()
    this.name = 'get_record_detail'
    this.description = `获取指定日记记录的完整全文与详细元数据。
使用场景：
- 当上一轮检索返回了多个精选样本，但你需要深入阅读其中某一篇的完整思考与事件经过时使用。
- 参数 id 必须是日记记录的唯一 ID (如 "rec_1" 或 "2026-09-01_1")。`

    this.schema = {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '日记记录的唯一 ID'
        }
      },
      required: ['id']
    }
  }

  async invoke(input) {
    try {
      const { id } = input || {}
      if (!id) {
        return new ToolResult(this.name, { error: '必须提供日记记录 ID' }, true)
      }

      // 1. 优先从 ToolOffloader 会话缓存中查询
      let record = globalToolOffloader.getRecordDetail(id)

      // 2. 如果缓存未命中，从全量数据库中加载查询
      if (!record) {
        const allData = await loadAndEnrichData()
        record = allData.find(r => String(r.id) === String(id))
      }

      if (!record) {
        return new ToolResult(this.name, {
          error: `未找到 ID 为 "${id}" 的日记记录`,
          hint: '请核对 ID 是否来自检索结果预览中的标注'
        }, true)
      }

      return new ToolResult(this.name, {
        record: formatRecordForLLM(record),
        message: `成功获取日记 ${id} 的完整内容`
      })
    } catch (e) {
      return new ToolResult(this.name, { error: e.message }, true)
    }
  }
}
