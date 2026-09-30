/**
 * ManageMemoTool - 小鸡便签盒管理工具
 * 职责：
 * 1. 在自然倾诉模式下，将用户的生活切片、抱怨吐槽暂存入便签盒 (upsert)
 * 2. 在话题延续时进行自动增补
 * 3. 在用户收尾或复盘时，将便签合并沉淀为正式日记 (merge_to_diary)
 */

import { Tool, ToolResult } from './base.js'
import { getMemoManager } from '../memo/memoManager.js'

export class ManageMemoTool extends Tool {
  constructor({ memoManager = null } = {}) {
    super()
    this.name = 'manage_memo'
    this.memoManager = memoManager
    this.description = `小鸡便签盒管理工具（生活伴侣核心收录工具）。
【必须调用的核心场景】：
1. 当用户分享今天的生活、倾诉经历、抱怨吐槽、发表随感但未明确发出“记日记”指令时，必须调用 action: 'upsert' 将其收录为便签。
   - 绝不要用 create_record，必须用 manage_memo(action: 'upsert')；
   - 【极端重要·第一人称原则】：正文 content 必须 100% 采用第一人称“我”的视角展开日记叙述，专注复述整理用户原文，稍作逻辑理顺；绝对严禁出现“用户说了”、“用户表示”、“用户觉得”、“TA提到”等任何旁观者转述词！
2. 当用户表示聊完、准备睡了、或者要求“把今天聊的整理成日记”时，调用 action: 'merge_to_diary' 将便签合并归档为正式日记。`

    this.schema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['upsert', 'merge_to_diary'],
          description: '操作类型: upsert (暂存或增补便签), merge_to_diary (将便签合并转换为正式日记)'
        },
        topic: {
          type: 'string',
          description: '便签的主题或简要标题，例如: "随性往北骑行", "牛肉面新店打卡"'
        },
        project: {
          type: 'string',
          description: '所属项目/面向，例如: "运动", "科研", "生活", "美食", "心情"'
        },
        content: {
          type: 'string',
          description: '便签或日记正文。【绝对必须以第一人称“我”或直陈动作记叙，严禁出现“用户说了”、“用户表示”等第三人称转述词】。专注复述还原用户原话细节与真实感受，稍加逻辑理顺，使其读起来像一篇真正的私人生活日记。'
        },
        quotes: {
          type: 'array',
          items: { type: 'string' },
          description: '用户的生动原话或情绪金句摘录（纯文本，不要加“用户说”）'
        },
        memoId: {
          type: 'string',
          description: '若已知便签 ID 可指定更新该便签 (可选)'
        },
        memoIds: {
          type: 'array',
          items: { type: 'string' },
          description: '当 action 为 merge_to_diary 时，指定合并的便签 ID 列表 (可选，不填则默认合并当天所有活跃便签)'
        }
      },
      required: ['action']
    }
  }

  async invoke(input) {
    try {
      const { action = 'upsert', topic, project, content, quotes = [], memoId, memoIds } = input || {}
      const memoManager = this.memoManager || getMemoManager()

      if (action === 'upsert') {
        if (!content || !content.trim()) {
          return new ToolResult(this.name, { error: '创建或增补便签必须提供 content 内容' }, true)
        }

        const result = memoManager.upsertMemo({
          id: memoId,
          topic,
          project,
          content,
          quotes
        })

        console.log(`[ManageMemoTool] Memo ${result.isNew ? 'created' : 'appended'}:`, result.memo.id, result.memo.topic)

        return new ToolResult(this.name, {
          action: 'upsert',
          isNew: result.isNew,
          memo: result.memo,
          message: result.isNew 
            ? `🌱 已为你将这段生活切片暂存进小鸡便签盒：《${result.memo.topic}》`
            : `📝 已为你将新细节增补进便签：《${result.memo.topic}》`
        })
      }

      if (action === 'merge_to_diary') {
        let targetIds = memoIds
        if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
          // 默认取当天所有活跃便签
          const activeMemos = memoManager.listMemos({ status: 'active' })
          if (activeMemos.length === 0) {
            return new ToolResult(this.name, {
              action: 'merge_to_diary',
              mergedCount: 0,
              message: '当前便签盒中暂无待归档的便签。'
            })
          }
          targetIds = activeMemos.map(m => m.id)
        }

        const mergeRes = await memoManager.mergeToRecord(targetIds, {
          project: project,
          content: content // 若 LLM 提供了润色后的总日记内容则优先采用
        })

        console.log(`[ManageMemoTool] Merged ${mergeRes.mergedCount} memos into record:`, mergeRes.record._id)

        // 广播给所有渲染进程窗口
        try {
          const electron = await import('electron')
          const BrowserWindow = electron.BrowserWindow || electron.default?.BrowserWindow
          if (BrowserWindow) {
            BrowserWindow.getAllWindows().forEach(win => {
              try {
                win.webContents.send('journal-data-updated', { record: mergeRes.record })
              } catch {}
            })
          }
        } catch {}

        return new ToolResult(this.name, {
          action: 'merge_to_diary',
          record: mergeRes.record,
          mergedCount: mergeRes.mergedCount,
          message: `✨ 已将 ${mergeRes.mergedCount} 条便签正式归档合并为今日日记！`
        })
      }

      return new ToolResult(this.name, { error: `不支持的便签操作 action: ${action}` }, true)

    } catch (error) {
      console.error('[ManageMemoTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }
}
