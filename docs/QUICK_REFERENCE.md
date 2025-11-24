# LangChain 1.0 架构快速参考

## 📌 核心概念

### Tool（工具）
任何智能体可以使用的能力单元。

```javascript
class MyTool extends Tool {
  name = 'tool_name'
  description = '工具描述'
  schema = { /* JSON Schema */ }
  
  async invoke(input) {
    // 执行逻辑
    return new ToolResult(this.name, result)
  }
}
```

### ToolRegistry（工具注册表）
管理所有工具的中央存储库。

```javascript
import { getToolRegistry } from './tools/registry.js'

const registry = getToolRegistry()
registry.register(new MyTool())
await registry.invokeTool('tool_name', { param: 'value' })
```

### AgentExecutor（代理执行引擎）
实现推理循环，决定使用哪些工具。

```javascript
const executor = new AgentExecutor(llm, toolRegistry)
const result = await executor.execute({
  messages: [],
  systemPrompt: '你是一个助手',
  userQuery: '用户问题',
  enabledTools: ['search_records'],
})
```

### IntentAnalyzer（意图分析）
分析用户查询意图，推荐合适的工具。

```javascript
import { analyzeIntent } from './intent/analyzer.js'

const tools = analyzeIntent('查询最近的记录')
// => ['search_records']
```

## 🗂️ 文件结构

```
src/main/
├── llm/               # 语言模型层
│   ├── models.js
│   └── index.js
├── tools/             # 工具层
│   ├── base.js
│   ├── searchRecords.js
│   ├── registry.js
│   └── index.js
├── agent/             # 代理层
│   ├── executor.js
│   ├── ipcHandlers.js
│   └── index.js
├── intent/            # 意图层
│   ├── analyzer.js
│   └── index.js
└── index.js           # 主文件（已修改）
```

## 🔄 执行流程

```
用户输入
  ↓
IPC: assistant:chat
  ↓
LLM 初始化（models.js）
  ↓
意图分析（IntentAnalyzer）
  ↓
AgentExecutor 循环
  ├─ 调用 LLM
  ├─ 解析工具调用
  ├─ 执行工具（ToolRegistry）
  └─ 反馈结果
  ↓
返回响应
```

## 💡 常见操作

### 添加新工具

1. **创建工具类**
```javascript
// src/main/tools/myTool.js
export class MyTool extends Tool {
  constructor() {
    super()
    this.name = 'my_tool'
    // ...
  }
}
```

2. **注册工具**
```javascript
// src/main/tools/registry.js
import { MyTool } from './myTool.js'
// 在 _initializeBuiltInTools() 中添加
new MyTool()
```

3. **注册意图（可选）**
```javascript
// src/main/intent/analyzer.js
this.intentMap['my_tool'] = {
  keywords: ['相关', '关键词'],
  weight: 1
}
```

### 调用工具

```javascript
// 通过代理（自动）
const result = await window.assistant?.chat?.(config)

// 直接调用
const result = await window.electron?.ipcRenderer?.invoke(
  'assistant:invoke-tool',
  { name: 'search_records', args: { query: '...' } }
)
```

### 分析意图

```javascript
const result = await window.electron?.ipcRenderer?.invoke(
  'assistant:analyze-intent',
  { query: '用户查询', availableTools: ['search_records'] }
)
```

## 📊 性能指标

- **工具执行时间**: 向量搜索 < 500ms
- **代理循环**: 单次迭代 < 1s（含 LLM 调用）
- **最大迭代**: 5 次（防止无限循环）
- **内存占用**: 向量数据库 ~ 50MB

## ⚙️ 配置示例

```javascript
// 初始化模型
const llm = initializeModel({
  selectedBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  selectedModel: 'qwen-plus',
  temperature: 0.7,
  top_p: 0.9
})

// 执行代理
const result = await executor.execute({
  messages: [{ role: 'user', content: '...' }],
  systemPrompt: '你是...',
  userQuery: '用户问题',
  enabledTools: ['search_records'],
  maxIterations: 5
})
```

## 🐛 调试

### 启用开发者工具
```javascript
await window.electron?.ipcRenderer?.invoke('open-dev-tools')
```

### 查看执行日志
在控制台中查找以下前缀的日志：
- `[IPC]` - IPC 事件
- `[AgentExecutor]` - 代理执行
- `[ToolRegistry]` - 工具操作
- `[SearchRecordsTool]` - 搜索工具
- `[IntentAnalyzer]` - 意图分析

### 检查执行步骤
```javascript
// 在 result.data.debug.steps 中
const steps = result.data.debug.steps
steps.forEach(step => {
  console.log(`${step.type}: ${step.name}`)
})
```

## 📚 主要文件说明

| 文件 | 用途 | 关键接口 |
|------|------|---------|
| `llm/models.js` | 模型初始化 | `initializeModel()` |
| `tools/base.js` | Tool 基类 | `Tool`, `ToolResult` |
| `tools/registry.js` | 工具管理 | `ToolRegistry`, `getToolRegistry()` |
| `agent/executor.js` | 推理引擎 | `AgentExecutor`, `AgentState` |
| `intent/analyzer.js` | 意图识别 | `IntentAnalyzer`, `analyzeIntent()` |

## 🚀 最佳实践

1. **工具设计**
   - 名称要唯一且有意义
   - 描述要清晰，让 LLM 理解
   - Schema 要完整，包含所有参数

2. **意图注册**
   - 关键词要涵盖常见问法
   - 权重应该反映工具的重要程度
   - 动态注册用于用户自定义工具

3. **错误处理**
   - 工具执行失败用 `ToolResult(name, error, true)` 表示
   - IPC 处理器总是返回 `{ success, data/error }`
   - 代理会自动处理工具错误并重试

4. **性能优化**
   - 重用 ToolRegistry 实例
   - 向量数据库自动缓存
   - 考虑实现工具结果缓存

## 🔗 相关文档

- `LANGCHAIN_ARCHITECTURE.md` - 详细架构说明
- `INTEGRATION_GUIDE.js` - 集成和使用示例
- `QUICK_REFERENCE.md` - 本文件
