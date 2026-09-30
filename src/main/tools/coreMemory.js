/**
 * CoreMemoryTool - 更新常驻画像记忆工具 (Letta 范式)
 * 职责：
 * 允许 Agent 在与用户的长效交互中，自主更新持久化的用户长期画像 (Core Memory)
 */

import { Tool, ToolResult } from './base.js'
import { VALID_SECTIONS } from '../agent/memory/coreMemory.js'

let defaultCoreMemoryManager = null

export function setGlobalCoreMemoryManager(manager) {
  defaultCoreMemoryManager = manager
}

export class CoreMemoryTool extends Tool {
  constructor(manager = null) {
    super()
    this.name = 'update_core_memory'
    this.manager = manager || defaultCoreMemoryManager
    this.description = `更新用户的长期记忆与常驻画像 (Core Memory)。
使用场景：
- 当在对话中得知用户的新变化时（如用户换了新研究方向、提到新结识的人、改变了习惯、表达了特定的交流偏好）。
- 仅用于记录长期稳定的事实，切勿记录临时琐事。

分区说明 (section):
- user_profile: 用户性格、职业、学业背景或核心特质
- key_entities: 重要关系人（导师、好友、伴侣）或核心长期项目
- current_focus: 当前阶段攻坚的重心焦点、主要痛点或长期目标
- preferences: 对助手的交流风格与回答偏好要求`

    this.schema = {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: VALID_SECTIONS,
          description: '要更新的画像分区'
        },
        content: {
          type: 'string',
          description: '该分区更新后的完整内容描述'
        }
      },
      required: ['section', 'content']
    }
  }

  async invoke(input) {
    try {
      const { section, content } = input || {}
      const mgr = this.manager || defaultCoreMemoryManager
      if (!mgr) {
        return new ToolResult(this.name, { error: 'CoreMemoryManager 未初始化' }, true)
      }

      if (!VALID_SECTIONS.includes(section)) {
        return new ToolResult(this.name, {
          error: `无效的分区名 "${section}"，必须是: ${VALID_SECTIONS.join(', ')}`
        }, true)
      }

      const success = mgr.updateSection(section, content)
      if (success) {
        return new ToolResult(this.name, {
          success: true,
          section,
          updated_content: content,
          message: `已成功更新长期画像 [${section}]`
        })
      } else {
        return new ToolResult(this.name, { error: '更新长期画像失败' }, true)
      }
    } catch (e) {
      return new ToolResult(this.name, { error: e.message }, true)
    }
  }
}
