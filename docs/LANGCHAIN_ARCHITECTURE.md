# LangChain 1.0 架构重构文档

## 项目现状

本项目已成功按 LangChain 1.0 规范重构了智能体底层驱动，将原有的混合式架构改造为模块化、可组合、易扩展的设计。

---

## 🏗️ 核心架构

### 1. **LLM 层** (`src/main/llm/`)
负责与语言模型的交互，支持 OpenAI 兼容的 API（DashScope/OpenAI）。

**关键模块：**
- `models.js` - 模型工厂和初始化
  - `createChatModel(baseURL, model, options)` - 创建聊天模型
  - `initializeModel(config)` - 根据配置初始化模型
  - `parseToolCalls(response)` - 解析工具调用
  - `getTextContent(response)` - 提取文本内容

**设计特点：**
- 统一的模型接口
- 支持多个 API 端点
- 工具调用格式标准化

---

### 2. **工具层** (`src/main/tools/`)
实现 LangChain Tool 规范，所有工具都是可插拔的。

**关键模块：**

#### `base.js` - Tool 基类
```javascript
class Tool {
  name = 'tool_name'
  description = '工具描述'
  schema = { /* JSON Schema */ }
  
  async invoke(input) { /* 执行工具 */ }
  toOpenAIFunction() { /* 返回 OpenAI 格式 */ }
  validateInput(input) { /* 验证输入 */ }
}
```

#### `searchRecords.js` - 检索工具实现
- 完全兼容原有 search_records 逻辑
- 集成向量化、条件检索、数据聚合
- 继承 Tool 基类，实现 invoke() 方法

#### `registry.js` - 工具注册表
```javascript
class ToolRegistry {
  register(tool) { /* 注册工具 */ }
  get(name) { /* 获取工具 */ }
  getToolsAsOpenAIFunctions() { /* 获取函数定义 */ }
  async invokeTool(name, input) { /* 执行工具 */ }
}

// 全局实例
export const globalToolRegistry = new ToolRegistry()
```

**设计特点：**
- 统一的工具接口
- 自动 schema 验证
- 支持批量调用
- 易于添加新工具

---

### 3. **代理层** (`src/main/agent/`)
实现 ReAct（Reasoning + Acting）推理循环。

**关键模块：**

#### `executor.js` - 代理执行引擎
```javascript
class AgentState {
  messages = []        // 消息历史
  toolCalls = []       // 工具调用记录
  steps = []           // 执行步骤
  iteration = 0        // 迭代次数
}

class AgentExecutor {
  async execute(config) {
    // 执行推理-行动循环
    // 1. 调用 LLM
    // 2. 解析工具调用
    // 3. 执行工具
    // 4. 反馈结果
    // 5. 重复直到完成
  }
}
```

**执行流程：**
```
初始消息
  ↓
调用 LLM（带工具 schema）
  ↓
是否有工具调用？
  ├─ 否 → 返回最终回复
  └─ 是 → 执行工具
           ↓
        添加工具结果
           ↓
        下一迭代（最多 5 次）
```

#### `ipcHandlers.js` - IPC 事件处理
```javascript
// 注册处理器
registerIPCHandlers()

// 提供的 IPC 事件：
// - assistant:chat          主聊天接口
// - assistant:invoke-tool   直接调用工具
// - assistant:list-models   列出模型
// - assistant:list-tools    列出工具
// - assistant:analyze-intent 分析用户意图
```

---

### 4. **意图层** (`src/main/intent/`)
独立的意图识别模块，与代理解耦。

**关键模块：**

#### `analyzer.js` - 意图分析器
```javascript
class IntentAnalyzer {
  analyzeQuery(query) {
    // 返回推荐的工具列表（优先级排序）
    // 基于关键词匹配和权重计算
  }
  
  filterByAvailableTools(query, availableTools) {
    // 只返回可用工具中的推荐
  }
  
  registerIntent(toolName, keywords, weight) {
    // 动态注册意图
  }
}

export const globalIntentAnalyzer = new IntentAnalyzer()
```

**设计特点：**
- 轻量级关键词匹配
- 可扩展的意图定义
- 与代理完全解耦
- 可独立使用

---

## 🔄 数据流

### 用户查询到回复的完整流程

```
┌─────────────────────────┐
│   用户在 UI 输入查询     │
└────────────┬────────────┘
             ↓
┌─────────────────────────────────────┐
│  IPC Handler: assistant:chat        │
│  (ipcHandlers.js)                   │
└────────┬────────────────────────────┘
         ↓
┌──────────────────────────────────────────────┐
│  意图分析 (IntentAnalyzer)                   │
│  推荐可用工具                                │
└────────┬─────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────┐
│  初始化模型 (LLM Layer)                      │
│  创建 ChatOpenAI 实例                        │
└────────┬─────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────┐
│  AgentExecutor 推理循环                             │
│                                                      │
│  第 1 次迭代：                                       │
│  ├─ 调用 LLM（带工具 schema）                       │
│  ├─ 解析工具调用                                    │
│  ├─ 执行工具（通过 ToolRegistry）                   │
│  ├─ 添加工具结果                                    │
│  │                                                   │
│  第 N 次迭代：                                       │
│  ├─ LLM 生成最终回复                                │
│  └─ 返回结果                                        │
└────────┬─────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────┐
│  格式化结果并返回给 UI                       │
│  包含：                                      │
│  - 文本回复                                  │
│  - 工具调用轨迹                              │
│  - 执行步骤细节                              │
└──────────────────────────────────────────────┘
```

---

## 📁 新增文件树

```
src/main/
├── llm/                          # LLM 层
│   ├── models.js                # 模型工厂
│   └── index.js                 # 模块导出
├── tools/                        # 工具层
│   ├── base.js                  # Tool 基类
│   ├── searchRecords.js         # search_records 实现
│   ├── registry.js              # 工具注册表
│   └── index.js                 # 模块导出
├── agent/                        # 代理层
│   ├── executor.js              # 代理执行引擎
│   ├── ipcHandlers.js           # IPC 处理器
│   └── index.js                 # 模块导出
├── intent/                       # 意图层
│   ├── analyzer.js              # 意图分析器
│   └── index.js                 # 模块导出
└── index.js                     # 主文件（已修改）
```

---

## 🎯 添加新工具的步骤

### 1. 创建工具类

```javascript
// src/main/tools/myTool.js
import { Tool, ToolResult } from './base.js'

export class MyTool extends Tool {
  constructor() {
    super()
    this.name = 'my_tool'
    this.description = '我的工具描述'
    this.schema = {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '参数1' },
      },
      required: ['param1']
    }
  }

  async invoke(input) {
    try {
      const result = await this.doSomething(input.param1)
      return new ToolResult(this.name, result)
    } catch (error) {
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }

  async doSomething(param) {
    // 实现工具逻辑
  }
}
```

### 2. 在注册表中注册

```javascript
// src/main/tools/registry.js
import { MyTool } from './myTool.js'

_initializeBuiltInTools() {
  const builtInTools = [
    new SearchRecordsTool(),
    new MyTool()  // 添加新工具
  ]
  // ...
}
```

### 3. 注册意图（可选）

```javascript
// 在 analyzer.js 中添加
this.intentMap['my_tool'] = {
  keywords: ['相关关键词'],
  weight: 1
}
```

---

## 🔌 使用示例

### 从前端调用

```javascript
// 在 Vue 组件中（AgentWorkbench.vue）
const result = await window.assistant?.chat?.({
  messages: [
    { role: 'system', content: '你是一个助手' },
    { role: 'user', content: '用户查询' }
  ],
  model: 'qwen-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  tools: [{ type: 'function', function: { name: 'search_records' } }],
  userQuery: '用户查询',
  config: { temperature: 0.7, top_p: 0.9 }
})
```

### 直接调用工具

```javascript
// IPC 事件：assistant:invoke-tool
const result = await window.assistant?.invokeTool?.('search_records', {
  query: '最近的记录',
  conditions: { project: '项目A' }
})
```

### 分析意图

```javascript
// IPC 事件：assistant:analyze-intent
const result = await window.assistant?.analyzeIntent?.({
  query: '查找项目相关的记录',
  availableTools: ['search_records']
})
```

---

## ✨ 主要改进

| 方面 | 原架构 | 新架构 |
|------|--------|--------|
| **模块耦合** | 高（混合在 main/index.js） | 低（严格分层） |
| **工具添加** | 修改 assistantTools 对象 | 继承 Tool，注册即可 |
| **代码可维护性** | 差（大文件，逻辑混乱） | 优（清晰的职责划分） |
| **测试便利性** | 困难 | 容易（每个模块独立） |
| **LangChain 生态** | 难以利用 | 原生支持 |
| **意图分析** | 混在代理中 | 独立解耦 |
| **模型切换** | 硬编码 | 工厂模式，灵活配置 |

---

## 🚀 后续扩展方向

1. **支持更多工具**
   - 数据分析工具
   - 项目统计工具
   - 自定义查询工具

2. **增强推理能力**
   - 实现 ReAct 格式日志
   - 支持代理思维链
   - 错误恢复机制

3. **性能优化**
   - 工具调用缓存
   - 向量数据库持久化
   - 并行工具执行

4. **集成更多 LangChain 特性**
   - Memory（长期记忆）
   - Chains（链式处理）
   - Retrievers（检索器）
   - Document Loaders（文档加载）

---

## 📝 注意事项

- 原有的 `assistantTools` 对象现已移至 `ToolRegistry`
- `analyze Intent` 现已完全独立，不依赖代理
- 所有工具调用都经过 schema 验证
- 支持最多 5 次迭代循环，防止无限递归
- IPC 处理器在 `app.whenReady()` 时自动注册
