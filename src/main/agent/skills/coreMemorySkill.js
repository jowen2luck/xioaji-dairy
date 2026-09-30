/**
 * CoreMemorySkill - 常驻心智与核心记忆维护技能
 * 职责：
 * 1. 识别并沉淀用户的长期习惯、关键人际关系与核心目标
 * 2. 指导心头记忆的回响口吻
 */

export const coreMemorySkill = {
  name: 'core_memory',
  title: '常驻心智与核心记忆技能',
  description: '维护对用户的长期深层了解，并在适当时机默契共鸣',

  renderInstruction() {
    return `### 技能：常驻心智与核心记忆 (Core Memory Skill)

1. **【长期记性沉淀 (update_core_memory)】**
   - \`create_record\` 与 \`manage_memo\` 负责记录**具体的事件与此刻的心情**；
   - \`update_core_memory\` 负责存**长期对用户的深层了解**（如用户的重要生活习惯、关键人际关系变化、核心价值观或对话偏好）。严禁将单日琐事塞入长期记忆。

2. **【心头记忆的默契回响】**
   - 若系统提示词中包含【小鸡的心头记忆】，说明你回想起了过去的某件相关旧事。请以老朋友的口吻温和随口带出一句关心或鼓励，绝不要像机器一样死板报数据或念日期。`
  }
}
