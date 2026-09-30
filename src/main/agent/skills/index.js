/**
 * Agent Skills 统一管理中心
 * 职责：
 * 1. 集中管理生活伴侣日记、统计分析、核心记忆等模块化技能
 * 2. 避免在系统提示词中硬编码冗长的任务指令，实现按需/结构化输出
 */

import { memoSkill } from './memoSkill.js'
import { analysisSkill } from './analysisSkill.js'
import { coreMemorySkill } from './coreMemorySkill.js'

export class SkillRegistry {
  constructor() {
    this.skills = new Map()
    this.register(memoSkill)
    this.register(analysisSkill)
    this.register(coreMemorySkill)
  }

  register(skill) {
    if (!skill || !skill.name) return
    this.skills.set(skill.name, skill)
  }

  get(name) {
    return this.skills.get(name)
  }

  getAll() {
    return Array.from(this.skills.values())
  }

  /**
   * 根据当前意图与启用工具渲染技能指令集
   * @param {Object} options
   * @param {Array<string>} [options.enabledTools] - 当前启用的工具名称列表
   * @param {string} [options.primaryIntent] - 主意图
   * @returns {string} 格式化后的技能指引文本
   */
  renderSkillsPrompt({ enabledTools = [], primaryIntent = 'direct' } = {}) {
    if (primaryIntent === 'casual') {
      return '' // 纯闲聊无需挂载复杂的任务技能
    }

    const sections = []

    // 便签与日记技能（若启用相关工具或默认启用）
    const hasMemoTool = enabledTools.length === 0 || enabledTools.includes('manage_memo') || enabledTools.includes('create_record')
    if (hasMemoTool && this.skills.has('memo_diary')) {
      sections.push(this.skills.get('memo_diary').renderInstruction())
    }

    // 检索与分析技能
    const hasAnalysisTool = enabledTools.length === 0 || enabledTools.some(t => ['query_records', 'search_records', 'sql_analysis', 'insight_analyst'].includes(t))
    if (hasAnalysisTool && this.skills.has('diary_analysis')) {
      sections.push(this.skills.get('diary_analysis').renderInstruction())
    }

    // 长期心智技能
    const hasMemoryTool = enabledTools.length === 0 || enabledTools.includes('update_core_memory')
    if (hasMemoryTool && this.skills.has('core_memory')) {
      sections.push(this.skills.get('core_memory').renderInstruction())
    }

    if (sections.length === 0) return ''

    return `【小鸡专属技能组 (Agent Skills)】\n以下为你当前激活的专业技能规范，请严格依照执行：\n\n` + sections.join('\n\n')
  }
}

let globalSkillRegistryInstance = null

export function getSkillRegistry() {
  if (!globalSkillRegistryInstance) {
    globalSkillRegistryInstance = new SkillRegistry()
  }
  return globalSkillRegistryInstance
}
