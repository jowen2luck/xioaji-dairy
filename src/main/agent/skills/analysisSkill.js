/**
 * AnalysisSkill - 日记检索与数据洞察技能
 * 职责：
 * 1. 负责日记的条件查询、向量语义搜索与 SQL 统计分析
 * 2. 规范相对时间与日历推算
 * 3. 强调事实性证据与一次性综合归纳，防止重复下钻死循环
 */

export const analysisSkill = {
  name: 'diary_analysis',
  title: '日记检索与数据洞察技能',
  description: '处理日记历史查询、时段过滤、向量语义回忆、SQL多维统计与模式洞察',

  /**
   * 生成技能 Prompt 指引
   */
  renderInstruction() {
    return `### 技能：日记检索与数据洞察 (Diary Retrieval & Analysis Skill)

1. **【查询与统计的数据事实性】**
   - 严禁凭空编造用户的历史日记。所有历史回顾分析必须严格基于 \`query_records\`、\`search_records\` 或 \`sql_analysis\` 的返回结果。
   - 回答时必须结构化叙事：结论先行，引用具体日期和原文片段作为客观证据。

2. **【检索结果一次性归纳（防死循环）】**
   - 当通过 \`search_records\`（综合语义检索）或 \`query_records\`（条件筛选）获得候选记录及高亮摘录后，如果已经包含与提问相关的记录，**必须立即基于现有结果给出清晰综合的回答，严禁无意义地重复检索或连续循环下钻**。

3. **【相对时间规范】**
   - 若系统动态时间锚点中已预解析出日期范围，直接复用该日期，无需重复调用 \`calendar_resolver\`。
   - 若用户使用了未解析的复杂相对时间（如“大前天”、“三个月前”），先调用 \`calendar_resolver\` 获得标准时间范围再检索。

4. **【修改日记优先定位】**
   - 若用户要求修改日记且已知 ID，直接调用 \`update_record\`；若未知 ID，先用 \`query_records\` 检索定位 ID，再调用 \`update_record\`。`
  }
}
