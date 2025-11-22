## 模块目标
- 新增“智能体工作台”，采用 OpenAI 风格 API（兼容 DashScope）
- 支持：模型与推理点管理、系统提示词配置、可控工具白名单与调用、工具调用过程的可视化轨迹
- 安全：不写入密钥；默认从 `process.env.DASHSCOPE_API_KEY` 读取，前端可临时传入但不持久化

## 架构设计
- 主进程
  - `assistant:chat`：调用 DashScope 兼容的 `chat/completions`，封装 HTTP（`fetch`），支持 `messages`、`model`、`baseURL`、`tools`
  - `assistant:invoke-tool`：受控工具执行入口，工具注册表（白名单）映射到现有数据函数（`load-data`、`analyze-data` 等）
  - `assistant:list-models`：返回模型清单与说明（结合你提供的列表），默认 `baseURL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- 预加载
  - 暴露 `window.api.assistant.*`：`chat`, `invokeTool`, `listModels`
- 渲染层（新增页面组件 `AgentWorkbench.vue`）
  - 左侧：聊天区 + 工作流轨迹（展示 `think/tool/result` 步骤、工具名、参数摘要、返回摘要）
  - 右侧：配置侧栏（模型选择、推理点、系统提示词、工具开关与顺序、温度等）
  - 支持将“筛选条”和“卡片展示”组件复用，方便展示检索结果与工具输出

## 模型与推理点管理
- 预置模型（下拉选择）：
  - `qvq-max-2025-05-15`
  - `qwen-plus-2025-09-11`（大上下文与思考模式，均衡能力）
  - `qwen3-max-2025-09-23`（复杂多步骤任务，支持思维链与函数调用，分档计费）
  - `qwen3-next-80b-a3b-instruct`
  - `deepseek-v3.2-exp`
  - `deepseek-r1-0528`
  - `qwen-flash-2025-07-28`
  - `qwen-flash`（低延迟低成本）
- 默认 Base URL：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 说明（选择指南）：
  - 复杂推理 → `qwen3-max` / `qwen-plus`
  - 速度优先 → `qwen-flash`
  - 试验性推理 → `deepseek-*`

## 工具管理与调用
- 工具注册表（主进程）：
  - `load_data`：读取本地 JSON 数据
  - `analyze_data`：复用已实现的综合分析
  - `search_records`：关键字检索（感想/项目/时长）
  - `project_stats`：项目级统计（数量、均时长）
- OpenAI 风格函数调用：
  - 请求体包含 `tools: [{ type:'function', function:{ name, description, parameters(JSONSchema) } }]`
  - 收到 `tool_calls` 后在主进程执行对应工具，返回结构化结果；响应体包含 `toolResults` 供前端展示

## 提示词设计
- 系统提示词区：
  - 基础角色（中文）：说明数据域、可用工具、输出格式（含步骤轨迹）
  - 要求：优先调用工具获取事实，再生成回答；输出包含简要结论与调用的步骤摘要
- 用户消息前置：可选添加上下文（当前筛选条件/页面状态）

## 页面布局
- 左：
  - `ChatPanel`：消息流、富文本渲染、分页加载历史
  - `TracePanel`：每次回复的轨迹（`think/tool/result`），可折叠
- 右：
  - `ConfigPanel`：模型选择、Base URL、系统提示词编辑、启用工具列表与顺序、温度/TopP 等
  - `ActionsPanel`：一键注入“项目统计”、“最近趋势”、“检索示例”等快速操作
- 复用组件：
  - `FilterBar` 用于构造检索工具参数
  - 规划 `DataCard`（下一步）用于标准化展示记录

## 实施计划
1. 主进程：实现 `assistant:*` IPC 与工具注册表；HTTP 封装使用 `fetch`（避免新依赖）
2. 预加载：暴露 `api.assistant` 方法
3. 渲染层：新增 `AgentWorkbench.vue`（左聊天+右配置+轨迹），集成到 Tab 中
4. 验证：不含密钥时用模拟响应；注入密钥后用真实请求，演示工具调用与轨迹展示
5. 后续：抽象 `DataCard` 与 `CardsGrid`，增强助手侧结果展示

## 验证与安全
- 不持久化 API Key；仅从环境变量读取或临时传参
- 工具白名单 + 参数校验；禁止文件系统任意访问
- 成功路径：模型切换后能发起请求、工具调用结果可视化、轨迹与消息一致

确认后我将创建新的智能体页面、主进程 IPC 与工具注册，并完成端到端调用与轨迹展示（在未配置密钥时提供模拟结果）。