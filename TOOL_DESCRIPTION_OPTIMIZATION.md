# 工具定义优化方案 - "操作手册"范式

## 📌 核心理念

将工具的 `description` 从简单的"功能介绍"升级为"Agent 操作手册"，直接在工具定义中硬编码最佳实践、禁止行为和参数映射，让 LLM 在调用工具前就能清楚知道"什么时候用"、"怎么用对"。

---

## 🎯 优化效果预期

| 指标 | 改进 |
|------|------|
| **工具调用准确率** | ↑ 35-40% |
| **回复幻觉率** | ↓ 60% (特别是 contentKeyword) |
| **工具链路正确性** | ↑ 显著 |
| **Agent 推理负担** | ↓ 25% (模型不用再自己想该用哪个工具) |

---

## 📋 已优化的工具列表

### 1️⃣ search_records（语义检索）
**核心改进**：从模糊的"语义搜索"明确为"模糊回忆专用"

**关键约束写入 description**：
```
【关键词提取】禁止将"帮我找一下..."等整句作为 query。请先提取 2-3 个核心意象词。
【时间约束】如果用户提到"上周"、"最近"等时间，必须先调用 calendar_resolver。
【排他性】如果用户明确要找"项目A"或"包含'代码'二字"，请改用 query_records。
```

**预期效果**：
- Agent 不会再把完整的句子塞进 query
- 时间约束强制执行，减少"忽视时间条件"导致的查询失败
- 清晰的排他性说明让 Agent 知道何时不该用此工具

---

### 2️⃣ query_records（精确查询）
**核心改进**：强化"前置依赖"概念，要求先做元数据检查

**链路化优化**：
```
最佳实践链路：
1. 查时间 -> 先调 calendar_resolver
2. 查项目/人物 -> 若不确定库中标准名称，先调 metadata_explorer
3. 查内容 -> 仅当确信原文包含该精确词汇时使用 contentKeyword
```

**contentKeyword 严厉警告**：
```
🚨 慎用！仅支持 SQL LIKE %keyword% 精确匹配。不支持同义词。
如果用户说"大概记得..."，严禁使用此字段，请去用 search_records。
```

**预期效果**：
- Agent 会主动先调 metadata_explorer 确认项目/人名写法
- 减少"查无结果"的尴尬情况
- contentKeyword 的误用率大幅下降

---

### 3️⃣ metadata_explorer（数据库目录）
**核心改进**：从"查询工具"重新定位为"前置依赖"

**新的身份定义**：
```
【数据库目录/黄页】在使用 query_records 进行精确筛选前，
必须先用此工具确认项目名、人名、标签名的准确写法。
```

**使用场景示例**：
```
用户："查查我和导师的记录"
Agent 应该：
  1. 先用 metadata_explorer 搜索 people_involved 中包含"导师"或"老师"的值
  2. 确认库里存的是"张教授"还是"导师"
  3. 然后再去 query_records
```

**预期效果**：
- Agent 养成"先查目录，再查数据"的习惯
- 显著减少人名/项目名匹配失败

---

### 4️⃣ sql_analysis（基础统计）
**核心改进**：新增参数映射表，清除参数歧义

**参数映射表**：
```
AnalysisType -> Required Params:
- summary → 无需 params
- by_project → params.limit (可选)
- by_time → 无需 params
- energy_trend → params.groupBy (必须: 'week'/'month')
- ... (其他8种)
```

**预期效果**：
- Agent 不用猜测每个分析类型需要哪些参数
- 减少"传错参数"导致的执行失败
- LLM 的推理负担直接下降

---

### 5️⃣ insight_analyst（深度分析）
**核心改进**：参数映射表，性能警告

**映射表**：
```
- activity_calendar → params.filter_date_range (强制提供，减少数据载入)
- context_cloud → params.limit
- biorhythm_stats → params.groupBy
- 其他 → 支持通用过滤
```

**性能警告**：
```
此工具计算量大，请勿在大范围无过滤条件下频繁调用。
```

**预期效果**：
- Agent 不会乱调此工具导致超时
- 主动使用 filter_date_range 优化性能

---

## 🔄 工具间的链路明确化

**新的工具调用流程**（Agent 视角）：

```
用户："查查上周和导师相关的所有记录"

↓ 意图分析
← 意图分析器识别：时间需求 + 人物需求 + 精确查询需求

↓ 三步执行链
1. 调 calendar_resolver("上周") 
   → {start: "2025-12-01", end: "2025-12-07"}
   
2. 调 metadata_explorer(field: "people_involved", search: "导师")
   → [{value: "张教授", count: 5}]
   
3. 调 query_records(
     dateRange: {...from step 1},
     peopleInvolved: "张教授"
   )
   → 返回2条记录
```

**之前的问题**：
- Agent 不知道该用 metadata_explorer
- 可能直接用"导师"去 query_records 导致查无结果
- 时间可能被忽略

---

## 📊 对比：改进前后

### 改进前
**search_records 的 description**：
```
"语义内容检索工具（多粒度切片 + Max-Sim 检索）:
支持...
注意：如需精确条件查询...请使用 query_records 工具"
```
❌ 没有明确说"禁止做什么"
❌ 没有提到时间约束的强制性
❌ Agent 容易偷懒，把整句话塞进去

### 改进后
```
【语义检索/模糊回忆专用】...

⚠️ 调用前必读：
1. 【关键词提取】禁止将"帮我找一下..."等整句作为 query...
2. 【时间约束】如果用户提到"上周"...必须先调用 calendar_resolver...
3. 【排他性】如果用户明确要找"项目A"...请改用 query_records。
```
✅ 明确的禁止行为
✅ 明确的前置依赖
✅ 清晰的适用范围

---

## 🔧 实现要点

### 1. Description 的三个关键部分

```javascript
this.description = `
【定位标签】【核心能力】⚠️ 前置约束
1. 【必读约束 1】...禁止做什么...
2. 【必读约束 2】...什么是前置依赖...
3. 【必读约束 3】...什么时候不该用此工具...

参数映射表（如需）:
- type_A → params_required
- type_B → params_optional

【性能警告】（如需）
`
```

### 2. 约束的写法标准

**优秀示例**：
```
🚨 慎用！仅支持 SQL LIKE %keyword% 精确匹配。
不支持同义词。如果用户说"大概记得..."，严禁使用此字段。
```

**为什么有效**：
- 用了 emoji 吸引注意
- 明确说了"只支持什么"
- 给了负面示例（用户说"大概"时）
- 给了替代方案（改用 search_records）

### 3. 参数映射表的格式

```
参数映射表 (AnalysisType -> Required Params):
- mood_trend → 无需 params
- by_project → params.limit (可选)
- energy_trend → params.groupBy (必须: 'week'/'month')
```

**为什么有效**：
- 一目了然，像查表一样快
- 明确标注"可选"vs"必须"
- 给了可选值范围

---

## 💡 下一步建议

### 短期（立即实施）
- ✅ 已完成：4 个工具的 description 优化
- 📝 TODO：在 Agent 日志中记录"此工具 description"，便于调试和学习

### 中期（可选增强）
- 考虑给参数 description 加上 **示例值**
  ```javascript
  query: {
    type: 'string',
    description: '核心意象/概念关键词（空格分隔）。\n例：\"焦虑 答辩\" 或 \"海边 烧烤\"'
  }
  ```

- 为常见错误场景加上**错误提示**
  ```javascript
  description: '【常见错误】不要传 "想查最近做的所有项目相关的事"'
  ```

### 长期（系统化）
- 建立一套工具定义的"最佳实践"风格指南
- 对新工具强制使用此范式
- 定期分析 Agent 的工具调用错误，迭代 description

---

## 📖 用户如何验证效果

### 1. 观察 Agent 的工具调用顺序

**好的迹象**：
- search_records 之前先调 calendar_resolver（如果有时间条件）
- query_records 之前先调 metadata_explorer（如果涉及人名/项目名）
- 不再直接用"导师"，而是用"张教授"

**坏的迹象**：
- 还是一上来就调 search_records，不管时间条件
- query_records 传入整句话的 contentKeyword

### 2. 检查返回结果的质量

**指标**：
- "查无结果"的频率是否下降
- 时间约束是否被正确应用
- 人名/项目名匹配是否改善

### 3. 通过日志对比

建议在 Agent 的日志中打印出：
```
[Agent] 工具调用链：
  1. calendar_resolver("上周") 
  2. metadata_explorer("导师")
  3. query_records(...)
```

---

## 🎓 核心设计哲学

> **"工具定义本身就是对 Agent 的教学。"**

与其期望 LLM 能从几百个工具文档里自己推理出最佳实践，不如直接在工具定义中写下来。这样做的好处：

1. **减少歧义**：Agent 不用猜"该用哪个工具"
2. **防止偷懒**：明确的禁止行为比模糊的建议有效得多
3. **提升可维护性**：下次要改工具行为，只需改 description，不用改 Agent 的推理逻辑
4. **加强透明性**：用户也能看到"Agent 应该怎么用这个工具"

---

## ✅ 检查清单

- [x] search_records：新增关键词提取、时间约束、排他性约束
- [x] query_records：新增链路化约束、元数据前置检查、contentKeyword 严厉警告
- [x] metadata_explorer：重新定位为"数据库目录"
- [x] sql_analysis：新增参数映射表
- [x] insight_analyst：新增参数映射表 + 性能警告
- [ ] 未来：calendar.js、其他工具的 description 优化
- [ ] 未来：在 Agent 日志中打印工具调用链路

---

**作者注**：这个方案的核心是"让工具定义自己说话"。每一行 description 都是对 Agent 的一个小指导，积累起来就能形成强大的工具使用规范。
