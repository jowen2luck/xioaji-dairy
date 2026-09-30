/**
 * CoreMemoryManager - 常驻画像与长期虚拟内存管理器 (Letta 范式)
 * 职责：
 * 1. 维护跨会话常驻的用户身份、人际网络、当前重心与沟通偏好
 * 2. 生成紧凑格式常驻于 System Prompt
 * 3. 支持 Agent 通过工具主动迭代沉淀或用户手动维护
 */

import fs from 'fs'
import path from 'path'

const DEFAULT_CORE_MEMORY = {
  user_profile: '性格偏向 INFP，注重反思与自我探索，富有同理心，表达偏真诚温和。',
  key_entities: '重要人际：导师（张教授/张老师）、师兄（李雷）；重要活动与项目：高校科研课题/毕业论文。',
  current_focus: '近期正专注于毕业科研攻坚、论文撰写，关注工作节奏与身心能量平衡。',
  preferences: '偏好结论先行、富有人文温度与模式识别洞察的分析，拒绝空洞说教。',
  user: '性格偏向 INFP，注重反思与自我探索，富有同理心，表达偏真诚温和。',
  agent: '偏好结论先行、富有人文温度与模式识别洞察的分析，拒绝空洞说教。'
}

export const VALID_SECTIONS = [
  'user_profile',
  'key_entities',
  'current_focus',
  'preferences',
  'user',
  'agent'
]

export class CoreMemoryManager {
  constructor({ storagePath } = {}) {
    this.storagePath = storagePath || ''
    this.memory = { ...DEFAULT_CORE_MEMORY }
    if (this.storagePath) {
      this._load()
    }
  }

  _load() {
    try {
      if (this.storagePath && fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8')
        if (raw && raw.trim()) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            this.memory = { ...DEFAULT_CORE_MEMORY, ...parsed }
            if (!this.memory.user) {
              this.memory.user = this.memory.user_profile || ''
            }
            if (!this.memory.agent) {
              this.memory.agent = this.memory.preferences || ''
            }
            return
          }
        }
      }
    } catch (e) {
      console.error('[CoreMemoryManager] Failed to load core memory:', e)
    }

    this._save()
  }

  _save() {
    if (!this.storagePath) return
    try {
      const dir = path.dirname(this.storagePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.memory, null, 2), 'utf-8')
    } catch (e) {
      console.error('[CoreMemoryManager] Failed to save core memory:', e)
    }
  }

  getMemory() {
    const user = this.memory.user || this.memory.user_profile || ''
    const agent = this.memory.agent || this.memory.preferences || ''
    return {
      ...this.memory,
      user,
      agent
    }
  }

  updateSection(section, content) {
    if (!VALID_SECTIONS.includes(section)) {
      return false
    }
    if (typeof content !== 'string') {
      content = String(content || '')
    }
    const trimmed = content.trim()
    this.memory[section] = trimmed

    // 双向同步别名映射（兼容前端 user/agent 视角与后端画像分区）
    if (section === 'user') {
      this.memory.user_profile = trimmed
    } else if (section === 'user_profile') {
      this.memory.user = trimmed
    } else if (section === 'agent') {
      this.memory.preferences = trimmed
    } else if (section === 'preferences') {
      this.memory.agent = trimmed
    }

    this._save()
    return true
  }

  getPromptBlock() {
    const userText = this.memory.user_profile || this.memory.user || ''
    const keyEntitiesText = this.memory.key_entities || ''
    const focusText = this.memory.current_focus || ''
    const prefText = this.memory.preferences || this.memory.agent || ''

    const lines = []
    if (userText) lines.push(`- 用户画像 (user_profile)：${userText}`)
    if (keyEntitiesText) lines.push(`- 人际网络与重点项目 (key_entities)：${keyEntitiesText}`)
    if (focusText) lines.push(`- 当前重心与焦点 (current_focus)：${focusText}`)
    if (prefText) lines.push(`- 偏好设定与助手准则 (preferences)：${prefText}`)

    return `
<core_memory>
【用户长期记忆与常驻画像 (Core Memory)】
${lines.join('\n')}
(说明：此为用户的长期记忆外挂。若在对话中感知到用户生活、项目或偏好发生新变化，可适时调用 update_core_memory 工具更新此画像)
</core_memory>
`.trim()
  }

  /**
   * 提示词渲染别名，兼容 ipcHandlers 与中间件调用
   */
  renderPrompt() {
    return this.getPromptBlock()
  }
}
