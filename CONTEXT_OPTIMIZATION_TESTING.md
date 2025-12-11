# 上下文优化方案 - 测试指南

## 测试目标

验证"吸星大法"优化方案是否正确实现，确保：
1. ✅ `standalone_query` 被正确生成
2. ✅ 历史记录被切断，只有独立查询传给 Executor
3. ✅ 工具调用率提升（Agent 更主动地调用工具）
4. ✅ Token 消耗显著降低
5. ✅ 不影响前端和用户体验

---

## 测试场景

### 场景 1：指代消解（必测）

**目的**：验证 Intent Analyzer 能正确识别和消解指代词

**测试步骤**：
1. 在聊天窗口中输入：`"帮我查查 Project A"`
2. AI 返回关于 Project A 的信息
3. 继续输入：`"那它上周的数据呢？"`

**预期行为**：
- Intent Analyzer 应该识别"它"= Project A
- 生成的 `standalone_query` 应该是：`"查询 Project A 上周的数据统计"` 或类似表述
- Executor 不会看到完整的对话历史，但仍然能理解要查询 Project A 上周的数据

**验证方法**：
在浏览器开发者工具中查看应用日志（或查看Electron日志），应该看到：
```
[Intent] standalone_query for execution: 查询 Project A 上周的数据统计
[IPC:chat] Query rewritten: 那它上周的数据呢？ -> 查询 Project A 上周的数据统计
[IPC:chat] Executor will receive: {
  messageCount: 1,
  standaloneQuery: "查询 Project A 上周的数据统计",
  hasHistory: false,
  note: "历史已切断，只有独立查询"
}
```

**失败案例**（如果日志不包含上述内容）：
- [ ] Check: 是否有 `standalone_query` 字段
- [ ] Check: 是否已切断历史（messageCount 应该是 1）
- [ ] Check: Intent Analyzer 是否被正确调用

---

### 场景 2：长对话中的主动工具调用

**目的**：验证 Agent 在看不到历史的情况下仍会调用工具

**测试步骤**：
1. 与 Agent 进行 5-10 轮对话，建立长的对话历史
2. 最后问一个需要调用工具的问题，例如：`"我上周的心情怎么样？"`

**预期行为**：
- Agent **必须**调用 `calendar_resolver` 获取"上周"的日期范围
- Agent **必须**调用 `sql_analysis` 进行情绪统计
- 不应该编造数据或直接从历史中抄答案

**验证方法**：
观察 ReAct 思维链，应该看到至少 2 次工具调用：
```
[AgentExecutor] Iteration 1: Executing 1 tool(s)
  → Tool: calendar_resolver
  
[AgentExecutor] Iteration 2: Executing 1 tool(s)
  → Tool: sql_analysis
```

如果 Agent 在第 1 次迭代直接给出答案而不调用工具，说明存在问题。

---

### 场景 3：模糊回忆（困难模式）

**目的**：验证模糊查询时，Agent 使用语义搜索而不是关键字匹配

**测试步骤**：
输入一个模糊的回忆：
```
"大概是上周吧，我记得有一条日记好像写到了青旅有一个小桌子，
风景很好看，当时心情很不错的样子"
```

**预期行为**：
1. Intent Analyzer 应该识别为 `primary_intent=search` 和 `complexity=medium`
2. `standalone_query` 应该类似于：`"查找关于青旅、小桌子和风景的日记记录，可能是上周左右写的"`
3. Executor 应该调用 `search_records` 进行向量语义搜索，而不是 `query_records` 的关键词匹配

**验证方法**：
在日志中应该看到：
```
[Intent] primary_intent: search
[Intent] complexity: medium
[Intent] standalone_query: 查找关于青旅、小桌子和风景的日记记录...
[AgentExecutor] Iteration 1: Executing 1 tool(s)
  → Tool: search_records  // ✅ 应该是 search_records，而不是 query_records
```

**失败案例**：
- ❌ 如果调用的是 `query_records` 而不是 `search_records`
- ❌ 如果 Agent 编造数据而不是调用工具

---

### 场景 4：时间锚定（必测）

**目的**：验证 Agent 正确处理相对时间表达

**测试步骤**：
输入：`"上周我和 Alice 见面了吗？"`

**预期行为**：
1. Intent Analyzer 识别时间 = "上周"，人物 = "Alice"
2. `standalone_query` 应该是：`"查询我上周和 Alice 见面的记录"`
3. Executor 第一步必须调用 `calendar_resolver` 将"上周"转换为精确日期
4. 第二步调用 `query_records` 或 `search_records` 查询特定日期范围内的记录

**验证方法**：
```
[AgentExecutor] Iteration 1: Executing 1 tool(s)
  → Tool: calendar_resolver
  → Args: { timeExpression: "上周" }
  
[AgentExecutor] Iteration 2: Executing 1 tool(s)
  → Tool: query_records
  → Args: { dateRange: [start_date, end_date], people: ["Alice"] }
```

**失败案例**：
- ❌ 如果 Agent 自己估算日期而不调用 `calendar_resolver`
- ❌ 如果 Agent 跳过时间解析直接查询

---

### 场景 5：闲聊短路（烟雾测试）

**目的**：验证闲聊不会浪费 Token 调用工具

**测试步骤**：
1. 输入：`"你好！"`
2. 输入：`"谢谢！"`
3. 输入：`"再见！"`

**预期行为**：
- Intent Analyzer 应该识别为 `primary_intent=casual`
- Executor 应该直接返回预设回复，不调用任何工具
- 日志中应该看到"Detected casual intent, skipping tools"

**验证方法**：
```
[AgentExecutor] Detected casual intent, skipping tools
[AgentExecutor] Return message: 你好！我是你的日记助手...
```

**失败案例**：
- ❌ 如果闲聊也调用了工具
- ❌ 如果没有提前返回

---

### 场景 6：Token 消耗对比（性能测试）

**目的**：定量验证 Token 节省效果

**测试步骤**：
1. 进行一个 5-10 轮的完整对话
2. 在旧版本（未优化）和新版本（已优化）上分别运行同一对话
3. 记录每一轮的 Token 消耗

**数据收集**：
在 `executor.js` 的 `executeWithTools` 方法中添加 Token 计数逻辑（可选）：

```javascript
console.log('[AgentExecutor] Token estimate:', {
  messageCount: messages.length,
  estimatedTokens: messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0)
})
```

**预期结果**：
- 新版本的总 Token 消耗应该是旧版本的 **30-40%**（节省 60-70%）
- 每轮 ReAct 迭代的消息长度应该从 41 条降至 1-2 条

**验证方法**：
```
旧版本（优化前）：
  Iteration 1: messages=41, estimated_tokens=2000
  Iteration 2: messages=41, estimated_tokens=2100
  Iteration 3-5: 同上
  总计: ~5 × 2000 = 10000 tokens

新版本（优化后）：
  Iteration 1: messages=2, estimated_tokens=200
  Iteration 2: messages=2, estimated_tokens=300
  Iteration 3-5: 同上
  总计: ~5 × 250 = 1250 tokens

节省: (10000 - 1250) / 10000 = 87.5% ✅
```

---

## 日志检查清单

### 成功的关键日志

运行任何对话时，都应该看到以下日志：

```
✅ 意图分析层
[Intent] Analyzing with LLM & Context: {user_query}
[Intent] standalone_query for execution: {rewritten_query}

✅ IPC 处理层
[IPC:chat] Query rewritten: {original} -> {standalone_query}
[IPC:chat] Executor will receive: {
  messageCount: 1,
  standaloneQuery: {standalone_query},
  hasHistory: false,
  note: "历史已切断，只有独立查询"
}

✅ 执行层
[AgentExecutor] Starting ReAct execution
[AgentExecutor] formatMessages result: {
  totalMessages: 2,  // 1 system + 1 user
  hasSystem: true,
  userMessages: 1,
  structure: ["system(...)", "user(...)"]
}
[AgentExecutor] Iteration 1: Executing 1 tool(s)
  → Tool: {tool_name}
[AgentExecutor] Iteration 2: ... (if needed)
```

### 常见的错误日志

```
❌ 如果看到这些，说明优化没有生效：

[IPC:chat] Executor will receive: {
  messageCount: 41,  // ❌ 应该是 1，不是 41
  standaloneQuery: undefined,  // ❌ 应该有值
  hasHistory: true,  // ❌ 应该是 false
}

[Intent] No standalone_query generated  // ❌ LLM 没有生成
```

---

## 如何运行测试

### 方法 1：本地调试（推荐）

1. **启动开发服务器**：
   ```bash
   npm run dev
   ```

2. **打开应用并打开开发者工具**：
   - 按 F12 打开开发者工具
   - 切换到 "Console" 标签页

3. **运行测试对话**：
   - 在聊天窗口输入测试问题
   - 观察控制台中的日志输出

4. **记录关键日志**：
   - 复制包含 `[Intent]`、`[IPC:chat]`、`[AgentExecutor]` 的日志

### 方法 2：自动化日志收集

创建一个简单的日志收集脚本（可选）：

```javascript
// 在 AgentWorkbench.vue 或 main.js 中添加
window.logs = []
const originalConsoleLog = console.log
console.log = function(...args) {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  window.logs.push({
    timestamp: new Date().toISOString(),
    message
  })
  originalConsoleLog.apply(console, args)
}

// 需要时导出
function exportLogs() {
  const content = window.logs.map(l => `${l.timestamp}: ${l.message}`).join('\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'agent-logs.txt'
  a.click()
}
```

---

## 测试用例库

### 基础测试用例

| 编号 | 测试用例 | 预期结果 | 状态 |
|------|---------|---------|------|
| T001 | "帮我查查 Project A" | Intent: query | ⬜ |
| T002 | "那它上周的数据呢？" | standalone_query 包含 Project A | ⬜ |
| T003 | "上周我心情怎么样？" | 调用 calendar_resolver 和 sql_analysis | ⬜ |
| T004 | "你好" | casual intent，直接返回，无工具调用 | ⬜ |
| T005 | "我和导师在一起的记录" | 调用 metadata_explorer 和 query_records | ⬜ |

### 困难测试用例

| 编号 | 测试用例 | 预期结果 | 状态 |
|------|---------|---------|------|
| T101 | "大概上周吧，我记得有一条日记好像写到了..." | 调用 search_records（向量搜索） | ⬜ |
| T102 | 长对话（20+轮）后问一个新问题 | Agent 调用工具，不依赖历史 | ⬜ |
| T103 | "为什么我最近心累？" | insight 意图，多工具调用 | ⬜ |
| T104 | "这个月我的效率如何？" | 时间锚定，动态解析月份边界 | ⬜ |

### 边界测试用例

| 编号 | 测试用例 | 预期结果 | 状态 |
|------|---------|---------|------|
| T201 | 空输入 | 优雅处理，无崩溃 | ⬜ |
| T202 | 超长输入（>1000字） | 仍能正确分析意图 | ⬜ |
| T203 | 特殊字符 "@#$%^&*()" | 正确处理，无格式错误 | ⬜ |
| T204 | 多语言混用 "Project A 上周怎么样？" | 正确混合处理 | ⬜ |

---

## 故障排查

### 问题 1：`standalone_query` 未生成

**症状**：日志中显示 "No standalone_query generated"

**原因**：
1. Intent Analyzer LLM 调用失败
2. LLM 返回的 JSON 格式错误
3. 网络超时

**解决方案**：
1. 检查 API Key 是否配置正确
2. 检查 LLM 模型是否可用
3. 查看 Intent Analyzer 的完整错误消息

### 问题 2：消息历史未被切断

**症状**：日志显示 `messageCount: 41` 而不是 1

**原因**：
1. IPC 处理器代码未正确修改
2. `standaloneQuery` 为 undefined
3. 历史消息直接传给了 Executor

**解决方案**：
1. 检查 ipcHandlers.js 中 `executorMessages` 的构造逻辑
2. 确保 `standaloneQuery` 不为空
3. 查看日志中是否有"Query rewritten"的消息

### 问题 3：工具调用率未提升

**症状**：Agent 仍然编造数据而不调用工具

**原因**：
1. System Prompt 未被正确添加
2. Agent 仍然看到了历史（历史未被切断）
3. LLM 温度参数过高，导致过度创意

**解决方案**：
1. 检查 executor.js 的 `formatMessages` 是否包含完整的 coreInstruction
2. 确认日志中 `messageCount` 是否为 1
3. 降低 temperature 参数（0.5-0.7）

---

## 测试报告模板

```markdown
## 上下文优化方案测试报告

**测试日期**：YYYY-MM-DD
**测试环境**：[Windows/Mac/Linux]
**应用版本**：vX.X.X

### 测试结果汇总

| 测试场景 | 通过 | 失败 | 备注 |
|---------|------|------|------|
| 指代消解 | ✅ | ❌ | |
| 长对话工具调用 | ✅ | ❌ | |
| 模糊回忆 | ✅ | ❌ | |
| 时间锚定 | ✅ | ❌ | |
| 闲聊短路 | ✅ | ❌ | |

### Token 消耗对比

**旧版本（未优化）**：
- 对话轮数：5 轮
- 总 Token 消耗：~10000 tokens
- 平均每轮：~2000 tokens

**新版本（已优化）**：
- 对话轮数：5 轮
- 总 Token 消耗：~1250 tokens
- 平均每轮：~250 tokens

**节省百分比**：87.5% ✅

### 关键日志

[粘贴关键日志]

### 发现的问题

1. [问题描述]
2. [问题描述]

### 建议

1. [建议]
2. [建议]
```

---

## 联系与反馈

如果在测试过程中遇到问题，请：
1. 检查本指南的"故障排查"章节
2. 查看 CONTEXT_OPTIMIZATION.md 中的 FAQ
3. 收集详细的日志信息
4. 报告问题时附带日志和复现步骤
