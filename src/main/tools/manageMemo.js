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
2. 【小鸡自主收录与拆分规范（何时拆分、何时合并）】：
   - 【默认合并原则】：单次输入通常默认收纳为【一张】完整便签。若用户只是针对同一件事情铺开很多情绪和细节（即使字数很长），绝对保持单条完整，严禁机械切碎！
   - 【小鸡自主拆分的黄金触发条件（无需用户显式要求，符合以下任一即自主拆为 2 张便签，单轮上限 2~3 张）】：
     ① 【跨时段切片】：长文明显跨越了全天不同时段的独立事件（如上午的实验/工作 vs 晚间的聚餐/随想）；
     ② 【跨生活面向/项目】：内容明确横跨两个迥异的 project 面向（如 [科研开发] 进展 vs [家庭/生活] 纠葛）；
     ③ 【具象事实经历 vs 高阶元认知/心理闭环反思】：用户前半段讲述了具体的遭遇或身体行动困境（如下午瘫在床上无法动弹），后半段提炼出了超越具体事件的普适心智模型、心理闭环机制或重大哲学感悟（如“逻辑闭环：焦虑-无力-退缩-转移”）。
   - 【拆分时的绝对切刀纪律（严禁双胞胎）】：
     ① 正文必须【彻底互斥切割】：便签 A 仅写具象经历事实与身体困境；便签 B 仅写深度反思与心理机制分析，只用一句话交代缘起（如“源于午后瘫软状态的自我觉察：我发现自己形成了一个诡异闭环……”），严禁再把整篇生活琐事流水账从头复述一遍！
     ② 若两部分交织深密、无法干净剔除重复，则【绝对禁止拆分】，必须整体作为一张便签收纳！
3. 当用户表示聊完、准备睡了、或者要求“把今天聊的整理成日记”时，调用 action: 'merge_to_diary' 将便签合并归档为正式日记。`

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
          description: '便签的主题或简要标题，例如: "随性往北骑行", "牛肉面新店打卡"。若拆分多张便签，标题必须具体且互不相近。'
        },
        project: {
          type: 'string',
          description: '所属项目/面向，例如: "运动", "科研", "生活", "美食", "心情"'
        },
        content: {
          type: 'string',
          description: '便签或日记正文。【绝对必须以第一人称“我”或直陈动作记叙，严禁出现“用户说了”、“用户表示”等第三人称转述词】。专注复述还原用户原话细节与真实感受，稍加逻辑理顺，使其读起来像一篇真正的私人生活日记。【防重复红线】：严禁在多张便签中重复粘贴相同或高度重叠的叙事！若进行拆分，各便签内容必须严格独立切割，互不包含对方的完整情节。'
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

        console.log(`[ManageMemoTool] Memo ${result.isNew ? 'created' : 'appended/merged'}:`, result.memo.id, result.memo.topic)

        return new ToolResult(this.name, {
          action: 'upsert',
          isNew: result.isNew,
          memo: result.memo,
          message: result.isNew 
            ? `🌱 已为你将这段生活切片暂存进小鸡便签盒：《${result.memo.topic}》`
            : `📝 检测到已有同主题或高重合度切片，已自然增补/合并至便签：《${result.memo.topic}》（未重复创建新便签）。若意在拆分为多张独立便签，正文必须互斥独立，严禁全文重复。`
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
