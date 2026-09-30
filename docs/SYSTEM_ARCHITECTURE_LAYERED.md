# Daily Log Vue — 系统分层架构说明文档

> 本文档将 Daily Log Vue 的全栈实现归纳为三个层次：**工程设计层**（理念与目标）、**设计方案层**（模块与算法）、**代码实现层**（具体编码与技术细节），供架构评审、新人 onboarding 与迭代规划使用。

---

## 第一层：工程设计层 — 理念、模块与目标

### 1.1 项目定位与核心价值

Daily Log Vue 是一款基于 **Electron + Vue 3** 的桌面端个人智能日记应用。其核心命题是：**将非结构化的自由文本日记转化为结构化、可量化、可对话、可分析的个人知识资产**。

区别于传统日记工具仅能完成"记录"与"搜索"，本项目通过以下五层能力栈实现质的飞跃：

```
记录 → 存储 → 增强(ETL) → 分析(SQL/Agent) → 洞察(可视化/MCP)
```

**核心价值主张：**

- **数据不沉睡**：每篇日记经 AI 抽取后自动具备 20+ 维度的可计算字段
- **对话式分析**：用户可用自然语言与日记库对话，Agent 自动推理并调用工具
- **隐私优先**：本地存储 + 本地 Embedding，敏感数据不出本机
- **开放协议**：内置 MCP Server，可被外部 AI 助手（Claude/Cursor 等）直接连接

### 1.2 设计哲学与架构原则

| 原则 | 说明 |
|------|------|
| **分层解耦** | 数据层（ETL）、推理层（Agent）、表现层（Vue）各自独立演进 |
| **确定性优先** | 能用规则计算的（Layer 1 _meta_）绝不调用 LLM，降低成本与延迟 |
| **增量一切** | AI 抽取基于 MD5 Hash 缓存，向量检索基于内容指纹增量同步 |
| **切断历史防偷懒** | Executor 不接收对话历史，强制调用工具获取真实数据 |
| **原始数据不可变** | Layer 0 字段永远保留，增强字段在运行时动态生成 |

### 1.3 系统模块全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端渲染层 (Renderer)                         │
│  Vue 3 + Naive UI + ECharts                                          │
│  ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │Dashboard │ │AgentWorkbench│ │AnalysisPage│ │DataBoardTab      │ │
│  │主视图    │ │智能体工作台  │ │数据分析页  │ │数据整理与ETL     │ │
│  └──────────┘ └──────────────┘ └────────────┘ └──────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Electron IPC Bridge
┌──────────────────────────────▼──────────────────────────────────────┐
│                      主进程核心层 (Main Process)                      │
│                                                                       │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐    │
│  │   ReAct Agent 引擎   │    │        三层 ETL 处理管道           │    │
│  │  ┌───────────────┐  │    │  Layer 0: Raw JSON (appData.json) │    │
│  │  │Intent Analyzer│  │    │  Layer 1: _meta_ 确定性计算       │    │
│  │  │(意图分析器)   │  │    │  Layer 2: _ai_meta LLM 深度抽取  │    │
│  │  └───────────────┘  │    └──────────────────────────────────┘    │
│  │  ┌───────────────┐  │    ┌──────────────────────────────────┐    │
│  │  │Agent Executor │  │    │         数据引擎 (Data Services)   │    │
│  │  │(执行器)       │  │    │  AlaSQL 内存宽表查询               │    │
│  │  └───────────────┘  │    │  @xenova/transformers 向量检索     │    │
│  │  ┌───────────────┐  │    │  SummaryService 总结生成           │    │
│  │  │Tool Registry  │  │    └──────────────────────────────────┘    │
│  │  │(工具注册表)   │  │    ┌──────────────────────────────────┐    │
│  │  └───────────────┘  │    │       开放服务 (MCP Server)        │    │
│  └─────────────────────┘    │  JSON-RPC 2.0 stdio 协议            │    │
│                              │  7 大工具: health/list/search/...   │    │
│                              └──────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.4 核心模块职责定义

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **Intent Analyzer** | 解析用户自然语言，生成结构化意图 | 用户查询 + 最近 8 轮历史 | `standalone_query`、意图类型、推荐工具链 |
| **Agent Executor** | ReAct 循环：推理→行动→观察 | 独立查询 + 可用工具 | 最终答案 + 完整推理轨迹 |
| **Tool Registry** | 统一管理所有工具的注册与调用 | 工具名称 + 参数 | 工具执行结果 |
| **ETL Pipeline** | 三层数据增强 | 原始日记记录 | 带 `_meta_` 和 `_ai_meta` 的增强记录 |
| **AlaSQL Engine** | 内存宽表统计查询 | 增强数据集 | 聚合统计结果 |
| **Vector Search** | 语义级模糊检索 | 查询文本 | Top-K 相关记录 |
| **MCP Server** | 对外暴露标准接口 | JSON-RPC 请求 | 日记数据/统计/搜索结果 |

### 1.5 技术选型与理由

| 技术领域 | 选型 | 理由 |
|----------|------|------|
| 桌面外壳 | Electron 38 + electron-vite | 成熟跨平台，热更新快 |
| 前端框架 | Vue 3 Composition API | 响应式、TypeScript 友好 |
| UI 组件库 | Naive UI | 设计规范、暗色主题支持 |
| 可视化 | ECharts + vue-echarts | 图表类型丰富，社区活跃 |
| 内存 SQL | AlaSQL | 浏览器/Node 双端运行，无需额外服务 |
| 向量 Embedding | @xenova/transformers | 本地推理，隐私不外泄 |
| LLM 调用 | 直接 OpenAI 兼容 API | 绕过 LangChain 抽象层，更可控 |
| 工具协议 | MCP (Model Context Protocol) | Anthropic 主导的开放标准 |

---

## 第二层：设计方案层 — 模块设计与算法

### 2.1 三层 ETL 数据模型设计

#### 2.1.1 分层架构理念

数据从原始状态到可被 AI 分析的状态，经历三个递进层次。每一层都遵循"**原始数据零修改**"原则——增强字段以 `_meta_` 和 `_ai_meta` 为前缀动态叠加，绝不覆盖原始字段。

```
Layer 0 (Raw)     → 持久化存储，向后兼容
    ↓
Layer 1 (_meta_)  → 确定性算子，零延迟计算
    ↓
Layer 2 (_ai_meta) → LLM 深度抽取，MD5 增量缓存
```

#### 2.1.2 Layer 1 确定性算子设计

Layer 1 的核心设计目标是：**将原始字段转化为可直接用于 SQL 查询与统计分析的结构化维度**。全部计算为纯函数，无外部依赖。

**时间维度算法：**

- 输入：`time` 字段（ISO 8601 字符串）
- 输出：`_meta_timestamp`、`_meta_year`、`_meta_month`、`_meta_day`、`_meta_hour`、`_meta_weekday`、`_meta_is_weekend`、`_meta_time_range`
- 时间段划分规则：上午(6-12)、中午(12-14)、下午(14-18)、晚上(18-23)、深夜(23-6)

**行为维度算法：**

- 持续时间解析：正则匹配 `(\d+)[小时时]` 和 `(\d+)[分钟分]`，求和得到 `_meta_duration_min`
- 项目规范化：`shanggexiangmu || '未分类'`

**情绪评分算法（复合打分）：**

1. 从 `tiyan` 词汇打分：积极词 +0.5，消极词 -0.5
2. 从 `xinqing` 颜色映射：红色=-2，橙色=-1，黄色=+1，紫色=+2
3. 最终分值 = clamp(词汇分 + 颜色分, -2.0, +2.0)

#### 2.1.3 Layer 2 AI 深度抽取设计

**五层认知模型（数字生命模型）：**

| 层级 | 名称 | 提取字段 | 设计意图 |
|------|------|----------|----------|
| Layer 1 | 物理世界 | location, items, people_involved, interaction_type | 回答"在哪、和谁、做什么" |
| Layer 2 | 行为分类 | main_action, content_type, primary_domain | 归类记录的性质 |
| Layer 3 | 能量心流 | mood_tags, energy_level, focus_level, root_cause | 量化心理状态 |
| Layer 4 | 认知心理 | agency_level, time_orientation, maslow_need, thinking_patterns | 深层心理分析 |
| Layer 5 | 资产沉淀 | summary, key_quotes, next_steps, content_depth | 可复用的知识资产 |

**增量缓存算法：**

1. Hash 计算：`MD5(ganshou + tiyan + time_key)`
2. 缓存检查：查询 `ai_meta_index.json`
3. 差异检测：仅处理未命中缓存的记录
4. 结果保存：每处理 `batchSize` 条后原子写入缓存文件

**防御性提取策略：**

- 对于 `agency_level`、`thinking_patterns` 等深层字段，**必须有明确文本证据**才能提取
- 若 `content_depth` 为 `shallow`，Layer 4 字段返回 `null`，避免过度解读

### 2.2 ReAct Agent 引擎设计

#### 2.2.1 "吸星大法"上下文优化

**问题定义：** 在长对话场景中，LLM 容易"偷懒"——从历史记录中找相似答案直接抄，而非调用工具查最新数据。

**解决方案：** 分离意图层与执行层，执行层"看不到"历史。

```
意图层：历史(8条) + 新问题 → LLM 重写 → 独立查询语句 (Standalone Query)
          ↓
执行层：System Prompt + 独立查询语句 → 强制调用工具
```

**设计要点：**

- 意图分析器接收最近 8 轮历史，完成指代消解（"它"→"项目A"）
- 生成 `standalone_query`：完全不依赖历史的完整查询语句
- Executor 仅接收 1 条消息（重写后的独立查询），无法偷懒
- 若 LLM 未生成 `standalone_query`，降级使用原始 `userQuery`

#### 2.2.2 ReAct 循环设计

```
while iteration < maxIterations:
    1. 调用 LLM（带工具定义）
    2. 提取 tool_calls
    3. 若无工具调用 → 任务完成，返回最终答案
    4. 若有工具调用 → 批量执行工具
    5. 将工具结果追加到消息历史
    6. 进入下一轮迭代

若达到最大迭代次数：
    - 强制注入"请基于以上信息给出最终答案"
    - 调用 LLM（不带工具）获取最终回复
```

**迭代次数动态调整：**

| 复杂度 | 最大迭代次数 | 判定条件 |
|--------|-------------|----------|
| low | 3 | 简单查询、闲聊 |
| medium | 6 | 统计分析、总结回顾 |
| high | 9 | 深度洞察、多步关联分析 |

#### 2.2.3 工具链路设计

| 工具名称 | 职责 | 使用场景 |
|----------|------|----------|
| `search_records` | 向量语义检索 | 模糊回忆、意象搜索、大范围回顾 |
| `query_records` | 精确条件筛选 | 按时间/项目/标签精确查找 |
| `sql_analysis` | SQL 统计分析 | 聚合统计、趋势分析、分布计算 |
| `insight_analyst` | 深度关联分析 | 模式识别、因果分析、相关性探索 |
| `metadata_explorer` | 元数据查找 | 核对人物/项目/标签的准确值 |
| `calendar_resolver` | 时间解析 | 将"上周""上个月"转为 ISO 日期范围 |

**工具推荐原则：** 宁可多选，不可漏选。`calendar_resolver` 和 `metadata_explorer` 作为基础辅助工具会被强制注入。

### 2.3 向量语义检索设计

#### 2.3.1 多粒度切片策略

为同时捕捉宏观语义和微观细节，采用双层切片：

- **宏观切片（Macro Chunk）**：融合 AI 元数据的高层语义
  - 组成：summary + mood_tags + items + people_involved + location
  - 每条记录生成 1 个宏观切片

- **微观切片（Micro Chunks）**：滑窗算法切分正文
  - 窗口大小：150 字符
  - 重叠步长：50 字符（步长 = 150 - 50 = 100）
  - 最小切片长度：30 字符

#### 2.3.2 Max-Sim 检索算法

```
1. 计算 Query 与所有切片的余弦相似度
2. 按 parentId 聚合，每条记录只保留最高分切片（Max-Sim）
3. 应用过滤条件（日期范围、情绪倾向）
4. 排序并返回 Top-K
```

#### 2.3.3 混合重排序算法

最终得分 = 0.5 × 向量相似度 + 0.3 × 词汇命中率 + 情绪一致性加成

其中情绪一致性逻辑：
- 查询情绪与记录情绪同向 → +0.2 加成
- 查询情绪与记录情绪反向 → -0.8 惩罚

#### 2.3.4 增量缓存机制

- 每条记录计算内容指纹（MD5）
- 向量缓存文件 `vector_db_incremental.json` 持久化存储
- 仅对新增/修改的记录重新计算向量
- 删除的记录在下次同步时自动从缓存中移除

### 2.4 MCP 开放协议设计

#### 2.4.1 协议规范

- 标准：MCP Specification 2025-03-26
- 传输：JSON-RPC 2.0 over stdio
- 当前定位：Read-only（仅暴露查询类工具）

#### 2.4.2 工具集

| 工具 | 描述 | 关键参数 |
|------|------|----------|
| `health` | 健康检查与数据可用性确认 | 无 |
| `list` | 多维度筛选列出记录 | dateRange, project, weekday, moodTags, page, pageSize |
| `search` | 模糊与语义关键词搜索 | query, limit |
| `get` | 按 ID 获取单条记录详情 | id |
| `stats` | 获取全量统计摘要 | dateRange |
| `summaries` | 获取 AI 生成的叙事总结 | type(weekly/monthly/yearly), limit |
| `export` | 导出兼容 AIAE DiaryConnector 的数据 | dateRange |

### 2.5 内存 SQL 宽表设计

#### 2.5.1 核心理念

将 Layer 0 + Layer 1 + Layer 2 三层数据在内存中扁平化融合，挂载至 AlaSQL 表 `daily_log`，支持标准 SQL 进行多维聚合分析。

#### 2.5.2 分析方法体系

| 方法 | 功能 | 数据源 |
|------|------|--------|
| `getStatsSummary` | 总体统计摘要 | Layer 1 |
| `analyzeByDimension` | 按维度分组统计 | Layer 1 |
| `analyzeTimeDistribution` | 时间段分布 | Layer 1 |
| `analyzeWeekdayVsWeekend` | 工作日 vs 周末对比 | Layer 1 |
| `analyzeMoodTrend` | 情绪趋势（按月） | Layer 1 |
| `analyzeMoodDistribution` | 情绪标签分布 | Layer 2 |
| `analyzeEnergyTrend` | 能量值时间趋势 | Layer 2 |
| `analyzePeopleNetwork` | 人际关系网络 | Layer 2 |
| `analyzeContentTypeRatio` | 内容体裁占比 | Layer 2 |
| `analyzeLifeComposition` | 生活重心统计 | Layer 2 |
| `analyzeBiorhythmStats` | 生物节律统计 | Layer 2 |
| `analyzePsychDistribution` | 心理需求分布（马斯洛） | Layer 2 |
| `analyzeTemporalStats` | 时空取向统计 | Layer 2 |
| `analyzeResonanceAnalysis` | 共振分析（能量 boosters/drainers） | Layer 2 |
| `analyzeStateMatrix` | 状态矩阵（能量 × 掌控感） | Layer 2 |
| `analyzeCausalityChain` | 因果链分析 | Layer 2 |

---

## 第三层：代码实现层 — 具体编码与技术细节

### 3.1 项目结构

```
daily_log_vue/
├── src/
│   ├── main/                         # Electron 主进程
│   │   ├── index.js                  # 主进程入口
│   │   ├── agent/                    # ReAct Agent 引擎
│   │   │   ├── executor.js           # AgentExecutor 类（ReAct 循环核心）
│   │   │   └── ipcHandlers.js        # IPC 处理器（"吸星大法"关键修改点）
│   │   ├── config/
│   │   │   └── intentPrompts.js      # 意图分析系统提示词与输出格式定义
│   │   ├── data/                     # 数据引擎
│   │   │   ├── dataLoader.js         # 数据加载器（三层合并 + 增量缓存）
│   │   │   ├── index.js              # 数据服务统一导出
│   │   │   └── SqlService.js         # AlaSQL 宽表查询服务
│   │   ├── etl/                      # ETL 处理管道
│   │   │   ├── index.js              # ETL 统一入口
│   │   │   ├── ipcHandlers.js        # ETL IPC 处理器
│   │   │   ├── llmEnricher.js        # LLM 深度抽取引擎（Layer 2）
│   │   │   ├── summaryService.js     # 总结生成服务
│   │   │   └── summery.js            # 总结辅助函数
│   │   ├── intent/                   # 意图分析
│   │   │   └── analyzer.js           # analyzeIntentWithLLM 函数
│   │   ├── llm/                      # LLM 调用
│   │   │   ├── directOpenAI.js       # 直接 OpenAI 兼容 API 调用
│   │   │   └── models.js             # 模型初始化
│   │   ├── tools/                    # Agent 工具集
│   │   │   ├── base.js               # Tool 基类 + ToolResult 包装
│   │   │   ├── registry.js           # ToolRegistry 单例
│   │   │   ├── searchRecords.js      # 向量语义检索工具
│   │   │   ├── queryRecords.js       # 精确条件查询工具
│   │   │   ├── sqlAnalysis.js        # SQL 统计分析工具
│   │   │   ├── calendar.js           # 时间解析工具
│   │   │   ├── metadata.js           # 元数据查找工具
│   │   │   └── insight.js            # 深度关联分析工具
│   │   └── mocks/
│   │       └── toolOutputs.js        # Mock 工具输出
│   ├── preload/
│   │   └── index.js                  # Electron Context Bridge
│   ├── renderer/                     # Vue 3 前端渲染进程
│   │   └── src/
│   │       ├── App.vue               # 根组件
│   │       ├── main.js               # 渲染进程入口
│   │       ├── components/           # UI 组件
│   │       │   ├── AgentWorkbench.vue    # 智能体配置工作台
│   │       │   ├── ReActPanel.vue        # ReAct 推理轨迹面板
│   │       │   ├── AnalysisPage.vue      # 数据分析页（ECharts）
│   │       │   ├── Dashboard.vue         # 主仪表盘
│   │       │   ├── DataBoardTab.vue      # 数据整理看板
│   │       │   ├── RecordCard.vue        # 记录卡片
│   │       │   ├── EnhancedRecordCard.vue # 增强记录卡片
│   │       │   ├── ToolChainPanel.vue    # 工具链面板
│   │       │   ├── ToolTester.vue        # 工具调试终端
│   │       │   └── charts/              # 图表组件目录
│   │       ├── config/               # 前端配置
│   │       └── utils/                # 前端工具函数
│   └── utils/
│       ├── date.js                   # 日期工具
│       └── diary-plugin/             # 日记处理插件
│           ├── index.js              # 统一导出
│           ├── formatter.js          # enrichRecord / cleanDataForSave
│           ├── importer.js           # Excel/JSON 导入
│           ├── exporter.js           # 导出功能
│           └── validator.js          # 字段校验
├── mcp-server/
│   └── index.js                      # MCP Server（JSON-RPC 2.0 stdio）
├── docs/                             # 项目文档
├── electron.vite.config.mjs          # 构建配置
└── package.json                      # 依赖描述
```

### 3.2 ETL 管道实现

#### 3.2.1 Layer 1 实现（formatter.js）

**核心函数 `enrichRecord(item)`：**

```javascript
export function enrichRecord(item) {
  const dateObj = new Date(item.time)
  const weekdayIndex = dateObj.getDay()
  const hour = dateObj.getHours()
  
  return {
    ...item, // 保留原始字段（不可变原则）
    
    // === 时间维度 ===
    _meta_timestamp: dateObj.getTime(),
    _meta_year: dateObj.getFullYear(),
    _meta_month: dateObj.getMonth() + 1,
    _meta_day: dateObj.getDate(),
    _meta_hour: hour,
    _meta_weekday: getWeekdayName(weekdayIndex),
    _meta_is_weekend: (weekdayIndex === 0 || weekdayIndex === 6),
    _meta_time_range: getTimeRange(hour),  // 上午/中午/下午/晚上/深夜
    
    // === 行为维度 ===
    _meta_duration_min: parseDuration(item.chixushijian),  // "1小时30分" → 90
    _meta_project: item.shanggexiangmu || '未分类',
    _meta_has_achievement: item.chengjiu === true,
    
    // === 内容维度 ===
    _meta_plain_text: extractPlainText(item.ganshou),  // 去 HTML 标签
    _meta_text_length: extractPlainText(item.ganshou).length,
    
    // === 情绪维度 ===
    _meta_emotion_raw: item.tiyan || '常规',
  }
}
```

**持续时间解析算法：**

```javascript
export function parseDuration(str) {
  if (!str) return 0
  let minutes = 0
  const hourMatch = str.match(/(\d+)[小时时]/)
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60
  const minuteMatch = str.match(/(\d+)[分钟分]/)
  if (minuteMatch) minutes += parseInt(minuteMatch[1])
  return minutes
}
```

**数据脱水（保存前清理）：**

```javascript
export function cleanDataForSave(mergedData) {
  return mergedData.map(item => {
    const cleaned = { ...item }
    Object.keys(cleaned).forEach(key => {
      if (key.startsWith('_meta_') || key === '_ai_meta') {
        delete cleaned[key]  // 只保留原始字段
      }
    })
    return cleaned
  })
}
```

#### 3.2.2 Layer 2 实现（llmEnricher.js）

**核心类 `LLMEnricher`：**

| 方法 | 功能 |
|------|------|
| `loadCache()` / `saveCache()` | 原子读写 `ai_meta_index.json` |
| `computeRecordHash(record)` | MD5(ganshou + tiyan + time_key) |
| `detectDirty(records)` | 差异检测，返回未缓存的记录 |
| `callLLM(prompt)` | 带指数退避重试的 LLM 调用 |
| `processQueue()` | 异步队列处理，带进度回调 |
| `enrich(records)` | 公开 API，启动增量 ETL |

**增量处理流程：**

```javascript
async detectDirty(records, forceRefresh = false) {
  const dirty = []
  for (const record of records) {
    if (!record.ganshou || record.ganshou.trim() === '') continue  // 跳过空内容
    const hash = this.computeRecordHash(record)
    if (forceRefresh || !this.cache.items[hash]) {
      dirty.push({ record, hash })
    } else {
      this.stats.cached++
    }
  }
  return dirty
}
```

**LLM 调用与重试：**

```javascript
async callLLM(prompt, attempt = 1) {
  const maxRetries = 4
  const baseDelay = 1000
  // ... fetch API 调用 ...
  if (this.isRetriableError(error, response.status) && attempt < maxRetries) {
    const delay = baseDelay * Math.pow(2, attempt - 1)  // 指数退避
    return this.callLLM(prompt, attempt + 1)
  }
}
```

**Prompt 设计（buildETLPrompt）：**

- Role：认知心理学数据科学家
- 输入：时间、项目、时长、正文
- 参考词库：情绪词库（11 类 80+ 词）+ 认知词库（马斯洛需求、认知扭曲等）
- 防御性提取规则：shallow 记录跳过 Layer 4
- Few-Shot：包含 shallow 和 deep 两个示例
- 输出：严格 JSON 格式

### 3.3 ReAct Agent 引擎实现

#### 3.3.1 意图分析器（analyzer.js）

**核心函数 `analyzeIntentWithLLM`：**

```javascript
export async function analyzeIntentWithLLM(userQuery, llm, history = []) {
  // 1. 获取系统提示词（含当前时间注入）
  const systemPrompt = getIntentPrompt()
  
  // 2. 构建上下文消息链（保留最近 8 轮）
  const contextMessages = history
    .filter(m => m.role !== 'system')
    .slice(-INTENT_HISTORY_CONTEXT_LENGTH)  // 8
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...contextMessages,
    { role: 'user', content: userQuery }
  ]
  
  // 3. 调用 LLM 并解析 JSON
  const response = await llm.invoke(messages)
  // ... JSON 提取与验证 ...
  
  // 4. 确保 standalone_query 存在
  if (!intentContext.standalone_query) {
    intentContext.standalone_query = userQuery  // 降级
  }
  
  // 5. 添加推荐迭代次数
  intentContext.maxIterations = COMPLEXITY_MAX_ITERATIONS[intentContext.complexity] || 3
  
  return intentContext
}
```

**输出格式：**

```json
{
  "primary_intent": "statistical",
  "complexity": "medium",
  "standalone_query": "查询项目A上周的数据统计",
  "temporal_context": { "raw": "上周", "needs_dynamic_resolution": true },
  "extracted_entities": { "keywords": ["项目A"] },
  "suggested_pipeline": ["calendar_resolver", "sql_analysis"],
  "reasoning": "用户指代'它'为'项目A'，需先解析时间再统计"
}
```

#### 3.3.2 IPC 处理器中的"吸星大法"（ipcHandlers.js）

**关键代码段：**

```javascript
// 1. 结构化意图分析
intentContext = await analyzeIntentWithLLM(userQuery, intentLLM, messages)

// 2. 强制注入基础辅助工具
const essentialTools = ['calendar_resolver', 'metadata_explorer']
essentialTools.forEach(toolName => {
  if (enabledToolNames.includes(toolName) && !intentTools.includes(toolName)) {
    intentTools.push(toolName)
  }
})

// 3. 构造"干净"的消息列表（切断历史）
let standaloneQuery = userQuery
if (intentContext?.standalone_query) {
  standaloneQuery = intentContext.standalone_query
}

const executorMessages = [
  { role: 'user', content: standaloneQuery }  // 仅 1 条消息！
]

// 4. 执行代理
const result = await executor.execute({
  messages: executorMessages,  // 已切断历史
  systemPrompt: customSystemPrompt,
  userQuery: standaloneQuery,
  enabledTools: intentTools.length > 0 ? intentTools : enabledToolNames,
  maxIterations: intentContext?.maxIterations || 3,
  intentContext
})
```

#### 3.3.3 Agent 执行器（executor.js）

**ReAct 循环核心：**

```javascript
async execute(params) {
  this.resetState()
  const effectiveMaxIterations = intentContext?.maxIterations || maxIterations
  this.state.maxIterations = effectiveMaxIterations
  
  // 闲聊短路
  let effectiveEnabledTools = enabledTools
  if (intentContext?.primary_intent === 'casual') {
    effectiveEnabledTools = []  // 不使用任何工具
  }
  
  // 格式化消息（注入核心指令 + 意图上下文）
  const formattedMessages = this.formatMessages(messages, systemPrompt)
  const tools = this.buildToolsForLLM(effectiveEnabledTools)
  
  // ReAct 循环
  let currentMessages = [...formattedMessages]
  let iteration = 0
  
  while (iteration < maxIterations) {
    iteration++
    const response = await this.executeWithTools(currentMessages, tools)
    const toolCalls = this.extractToolCalls(response)
    
    if (!toolCalls || toolCalls.length === 0) {
      // 无工具调用 = 任务完成
      return { success: true, content: this.extractContent(response), ... }
    }
    
    // 执行工具并追加结果
    const toolResults = await this.handleToolCalls(toolCalls)
    currentMessages.push({ role: 'assistant', tool_calls: [...] })
    currentMessages.push(...this.buildToolResultMessage(toolResults))
  }
  
  // 达到最大迭代次数，强制最终答案
  currentMessages.push({ role: 'user', content: '请基于以上信息给出最终答案' })
  const finalResponse = await this.executeWithTools(currentMessages, [])
  return { success: true, content: this.extractContent(finalResponse), ... }
}
```

**formatMessages 中的核心指令注入：**

```javascript
formatMessages(messages, systemPrompt, intentContext) {
  const coreInstruction = `
你是一个智能日记助手。
【核心原则】
1. 数据事实性：严禁编造日记内容，所有分析必须基于工具返回结果
2. 时间严谨性：相对时间必须第一步调用 calendar_resolver
3. 循序渐进：先获取时间/元数据，再调用查询工具
4. 工具链路：metadata_explorer → query_records/sql_analysis → insight_analyst
`
  
  // 注入意图上下文
  let intentPrompt = ''
  if (intentContext) {
    intentPrompt = `
【意图分析报告】
- 独立查询: "${intentContext.standalone_query}"
- 识别意图: ${intentContext.primary_intent}
- 推荐工具: ${intentContext.suggested_pipeline?.join(', ')}
`
  }
  
  // 注意：messages 通常只有 1-2 条（已切断历史）
  formatted.push(...messages)
  return formatted
}
```

### 3.4 向量检索实现（searchRecords.js）

**多粒度切片生成：**

```javascript
function generateChunksForRecord(item) {
  const chunks = []
  
  // 1. 宏观切片（融合 AI 元数据）
  const macroText = buildMacroChunk(item)
  if (macroText) {
    chunks.push({ id: `${parentId}_macro`, type: 'macro', text: macroText, original: item })
  }
  
  // 2. 微观切片（滑窗算法）
  const microTexts = buildMicroChunks(item)
  microTexts.forEach((text, index) => {
    chunks.push({ id: `${parentId}_micro_${index}`, type: 'micro', text, original: item })
  })
  
  return chunks
}
```

**Max-Sim 检索：**

```javascript
async function vectorSearch(query, topK = 5, withScores = false, conditions = null) {
  const queryEmbedding = await embedText(query)
  
  // 1. 计算所有切片的相似度
  const chunkScores = vectorDB.map(chunk => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.vector)
  }))
  
  // 2. Max-Sim 聚合（按 parentId 取最高分）
  const recordMaxScores = new Map()
  for (const { chunk, similarity } of chunkScores) {
    const existing = recordMaxScores.get(chunk.parentId)
    if (!existing || similarity > existing.similarity) {
      recordMaxScores.set(chunk.parentId, { parentId: chunk.parentId, similarity, ... })
    }
  }
  
  // 3. 过滤 + 排序 + Top-K
  let candidates = Array.from(recordMaxScores.values())
  if (conditions) { /* 日期范围、情绪倾向过滤 */ }
  return candidates.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}
```

**增量缓存同步：**

```javascript
async function syncVectorDatabase(currentData) {
  // 1. 加载旧缓存
  let cacheStore = {}
  if (fs.existsSync(CACHE_FILE_PATH)) {
    cacheStore = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8'))
  }
  
  const newCacheStore = {}
  for (const item of currentData) {
    const itemId = item._meta_id || `${item.time}_${item.shanggexiangmu}`
    const currentHash = computeItemHash(item)
    
    if (cacheStore[itemId]?.hash === currentHash) {
      // 命中缓存：直接复用
      newCacheStore[itemId] = cacheStore[itemId]
      reuseCount++
    } else {
      // 未命中：重新生成切片与向量
      const chunks = generateChunksForRecord(item)
      for (const chunk of chunks) {
        chunk.vector = await embedText(chunk.text)
      }
      newCacheStore[itemId] = { hash: currentHash, chunks }
      newCount++
    }
  }
  
  // 2. 持久化新缓存
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(newCacheStore), 'utf-8')
  return runtimeVectorDB
}
```

### 3.5 MCP Server 实现（mcp-server/index.js）

**协议处理：**

```javascript
rl.on("line", (line) => {
  const req = JSON.parse(line)
  const { id, method, params } = req

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO
    })
  } else if (method === "tools/list") {
    respond(id, { tools: TOOLS })
  } else if (method === "tools/call") {
    const { name, arguments: args } = params
    const res = callDailyLogAdapter(name, args || {})
    respond(id, { content: [{ type: "text", text: res.output || JSON.stringify(res) }] })
  } else {
    respondError(id, -32601, `Method not found: ${method}`)
  }
})
```

### 3.6 LLM 直接调用实现（directOpenAI.js）

**核心函数 `callOpenAIAPI`：**

```javascript
export async function callOpenAIAPI(options) {
  const { baseURL, model, messages, tools, temperature, top_p, enableThinking, onContentDelta } = options
  
  // 1. API Key 映射（支持多 Provider）
  const apiKey = providedApiKey || getAPIKeyForBaseURL(baseURLOrigin)
  
  // 2. 构建请求 payload
  const payload = { model, messages, temperature, top_p, stream: true }
  if (Array.isArray(tools) && tools.length > 0 && !enableThinking) {
    payload.tools = tools  // 深度思考模式下不支持函数调用
  }
  
  // 3. 流式响应处理
  const flushLine = (line) => {
    const payloadStr = line.trim().slice(5).trim()  // 去掉 "data:"
    const parsed = JSON.parse(payloadStr)
    const choice = parsed.output?.choices?.[0] || parsed.choices?.[0]
    const delta = choice?.delta || choice?.message || {}
    if (delta.content) {
      content += delta.content
      if (typeof onContentDelta === 'function') onContentDelta(delta.content)
    }
    // 处理 tool_calls 增量...
  }
  
  // 4. 带重试的执行
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await executeRequest() }
    catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
    }
  }
}
```

### 3.7 数据加载器实现（dataLoader.js）

**三层数据合并流程：**

```javascript
export async function loadAndEnrichData() {
  // 步骤 1: 加载原始 JSON
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  
  // 步骤 2: ETL Layer 1 — 生成 _meta_ 字段
  const enrichedData = rawData.map(enrichRecord)
  
  // 步骤 3: 加载 AI 缓存并合并 _ai_meta
  const enricher = new LLMEnricher(defaultConfig, () => {})
  if (enricher.isCacheLoaded()) {
    const hashes = enrichedData.map(record => enricher.computeRecordHash(record))
    const aiMetaMap = enricher.batchGetMetadata(hashes)
    for (let i = 0; i < enrichedData.length; i++) {
      enrichedData[i]._ai_meta = aiMetaMap.get(hashes[i]) || null
    }
  }
  
  // 步骤 4: 按时间倒序排列
  enrichedData.sort((a, b) => new Date(b.time) - new Date(a.time))
  return enrichedData
}
```

### 3.8 前端关键组件

| 组件 | 路径 | 功能 |
|------|------|------|
| `AgentWorkbench.vue` | `src/renderer/src/components/` | 智能体配置面板（模型选择、工具开关） |
| `ReActPanel.vue` | `src/renderer/src/components/` | ReAct 推理轨迹可视化 |
| `AnalysisPage.vue` | `src/renderer/src/components/` | 数据分析页（ECharts 图表集） |
| `Dashboard.vue` | `src/renderer/src/components/` | 主仪表盘（快速统计卡片） |
| `DataBoardTab.vue` | `src/renderer/src/components/` | 数据整理看板（一键 ETL） |
| `ToolChainPanel.vue` | `src/renderer/src/components/` | 工具链可视化面板 |
| `ToolTester.vue` | `src/renderer/src/components/` | 工具独立调试终端 |

### 3.9 持久化存储

| 文件 | 路径 | 内容 |
|------|------|------|
| `appData.json` | `userData/` | 全量日记原始数据（Layer 0） |
| `ai_meta_index.json` | `userData/` | AI 深度抽取缓存（Layer 2） |
| `summaries.json` | `userData/` | 阶段总结（周/月/年） |
| `vector_db_incremental.json` | `src/main/.cache/` | 向量检索增量缓存 |

---

## 附录：关键设计决策记录

### A. 为什么切断 Executor 的历史？

**问题：** 在长对话中，LLM 倾向于从历史中"抄答案"而非调用工具。
**方案：** 意图层保留历史（用于指代消解），执行层仅接收独立查询。
**效果：** Token 消耗降低 60-90%，工具调用率从 60% 提升至 95%。

### B. 为什么用 MD5 Hash 做增量缓存？

**问题：** 每篇日记调用 LLM 成本高，内容未变不应重复调用。
**方案：** 对 `ganshou + tiyan + time_key` 计算 MD5，命中缓存则跳过。
**效果：** 首次全量处理后，后续启动秒级完成。

### C. 为什么用多粒度切片而非整篇向量化？

**问题：** 整篇向量化会丢失局部细节（如"青旅小桌子"的碎片记忆）。
**方案：** 宏观切片捕捉整体语义，微观切片捕捉局部细节，Max-Sim 聚合。
**效果：** 对长文本中的碎片记忆检索效果显著提升。

### D. 为什么用 AlaSQL 而非 SQLite？

**问题：** 需要内存级查询速度，且不想引入原生模块依赖。
**方案：** AlaSQL 是纯 JS 内存 SQL 引擎，支持标准 SQL 语法。
**效果：** 毫秒级复杂聚合查询，零配置、零原生依赖。

---

> 文档版本：v1.0  
> 最后更新：2026-08-17  
> 维护者：Daily Log Core Team
