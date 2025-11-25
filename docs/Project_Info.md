# 项目结构说明

本文档详细描述了项目的模块结构、各模块的功能以及实现方式。

## 项目概述

本项目是一个基于 Vue 3 + Electron + LangChain 1.0 技术栈的桌面应用程序，主要用于日记记录、分析和智能检索。项目采用了模块化的设计架构，将不同的功能划分为多个模块，便于维护和扩展。

## 核心模块

### 1. 主进程模块 (src/main/)

主进程模块包含了应用程序的核心逻辑，负责与操作系统交互、管理窗口、处理后台任务等。

#### 1.1 智能代理模块 (src/main/agent/)

- **功能**: 实现了基于 LangChain 1.0 的智能助手执行引擎，协调 LLM、工具调用和消息流处理。
- **实现细节**:
  - 采用 ReAct（Reasoning and Acting）模式，通过多轮迭代实现复杂任务处理
  - 支持工具调用，能够根据用户查询自动选择和执行合适的工具
  - 实现了完整的对话状态管理，包括消息历史、工具调用结果等

- **处理流程**:
  1. 接收用户查询和配置参数
  2. 初始化语言模型和工具注册表
  3. 进行意图分析，确定需要使用的工具
  4. 执行 ReAct 循环：
     - 调用语言模型生成响应
     - 检测是否需要工具调用
     - 如果需要，执行相应工具并获取结果
     - 将工具结果添加到对话历史中
     - 重复此过程直到达到最大迭代次数或获得最终答案
  5. 返回最终结果和执行状态

- **主要文件**:
  - `executor.js`: 智能助手执行器，管理完整的对话流程，包括意图理解、工具调用和结果综合。
    - **输入**: 
      ```javascript
      {
        messages: Array,      // 消息历史
        systemPrompt: String, // 系统提示词
        userQuery: String,    // 用户查询
        enabledTools: Array,  // 启用的工具列表
        maxIterations: Number // 最大迭代次数
      }
      ```
    - **输出**:
      ```javascript
      {
        success: Boolean,     // 执行是否成功
        content: String,      // 最终答案
        raw: Object,          // 原始LLM响应
        state: Object,        // 执行状态
        duration: Number      // 执行耗时
      }
      ```
  - `ipcHandlers.js`: IPC 处理器，将 IPC 事件映射到代理执行。
    - **输入**: 
      ```javascript
      {
        messages: Array,      // 消息历史
        model: String,        // 模型名称
        baseURL: String,      // API基础地址
        tools: Array,         // 工具列表
        userQuery: String,    // 用户查询
        mock: Boolean         // 是否为模拟模式
      }
      ```
    - **输出**:
      ```javascript
      {
        success: Boolean,     // 执行是否成功
        data: Object,         // 执行结果
        error: Object         // 错误信息（如果失败）
      }
      ```

#### 1.2 数据处理模块 (src/main/data/)

- **功能**: 负责数据的加载、处理和存储。
- **实现细节**:
  - 使用 AlaSQL 作为内存数据库，支持复杂查询
  - 实现了数据的ETL（提取、转换、加载）流程
  - 支持与AI元数据的自动合并

- **处理流程**:
  1. 从本地JSON文件加载原始数据
  2. 对原始数据进行ETL处理，生成计算字段（以_meta_为前缀）
  3. 加载AI缓存数据并合并到记录中（_ai_meta字段）
  4. 对数据进行排序和过滤
  5. 提供各种分析方法，基于AlaSQL进行统计查询

- **主要文件**:
  - `SqlService.js`: SQL 分析服务，基于 AlaSQL 的内存数据库，支持复杂统计查询。
    - **输入**: 
      ```javascript
      [
        {
          _meta_timestamp: Number,     // 时间戳
          _meta_year: Number,          // 年份
          _meta_month: Number,         // 月份
          _meta_weekday: String,       // 星期几
          _meta_is_weekend: Boolean,   // 是否周末
          _meta_time_range: String,    // 时间段
          _meta_duration_min: Number,  // 持续时间（分钟）
          _meta_project: String,       // 项目名称
          _meta_mood_score: Number,    // 情绪分数
          _ai_meta: Object             // AI元数据（可选）
        }
      ]
      ```
    - **输出** (根据不同分析类型):
      - summary（总体统计）:
        ```javascript
        {
          totalRecords: Number,        // 总记录数
          projectCount: Number,        // 项目数
          totalDurationHours: Number,  // 总时长（小时）
          avgDurationMin: Number,      // 平均时长（分钟）
          dateRange: {
            start: String,             // 开始日期
            end: String                // 结束日期
          }
        }
        ```
      - by_project（按项目统计）:
        ```javascript
        [
          {
            name: String,              // 项目名称
            count: Number,             // 记录数
            totalDurationHours: Number,// 总时长（小时）
            avgDurationMin: Number,    // 平均时长（分钟）
            avgMoodScore: Number       // 平均情绪分数
          }
        ]
        ```
  - `dataLoader.js`: 数据预处理与加载模块 (ETL)，将原始 JSON 数据转换为"可计算"的宽表格式，并自动合并 AI 元数据。
    - **输入**: 原始JSON数据
      ```javascript
      [
        {
          _id: String,                 // 记录ID
          time: String,                // 时间
          ganshou: String,             // 感受（HTML格式）
          shanggexiangmu: String,      // 上个项目
          chixushijian: String,        // 持续时间
          tiyan: String,               // 体验
          xinqing: String              // 心情
        }
      ]
      ```
    - **输出**: 增强后的数据
      ```javascript
      [
        {
          // 原始字段
          _id: String,
          time: String,
          ganshou: String,
          shanggexiangmu: String,
          chixushijian: String,
          tiyan: String,
          xinqing: String,
          
          // _meta_ 字段（数据维度 ETL）
          _meta_timestamp: Number,
          _meta_year: Number,
          _meta_month: Number,
          _meta_weekday: String,
          _meta_is_weekend: Boolean,
          _meta_time_range: String,
          _meta_duration_min: Number,
          _meta_project: String,
          _meta_plain_text: String,
          _meta_mood_score: Number,
          
          // _ai_meta 字段（AI 维度 ETL）
          _ai_meta: {
            content_type: String,      // 内容体裁
            summary: String,           // 摘要
            main_action: String,       // 核心动作
            people_involved: Array,    // 涉及人物
            interaction: String,       // 交互性质
            items: Array,              // 具体实体
            mood_tags: Array,          // 情绪标签
            energy_level: Number,      // 能量值
            root_cause: String,        // 情绪根源
            key_quotes: Array          // 金句
          }
        }
      ]
      ```
  - `index.js`: 数据模块导出。

#### 1.3 ETL 模块 (src/main/etl/)

- **功能**: 使用大模型深度提取日记中的非结构化信息，实现增量处理、异步队列和事件驱动。
- **实现细节**:
  - 基于内容Hash的缓存机制，避免重复处理
  - 异步队列处理，防止API限流
  - 事件驱动，实时通知前端进度

- **处理流程**:
  1. 接收待处理的记录列表和配置参数
  2. 计算每条记录的内容Hash值
  3. 检查缓存中是否已存在该记录的AI元数据
  4. 对于未缓存的记录，加入处理队列
  5. 按批次调用LLM API进行处理
  6. 将处理结果保存到缓存文件中
  7. 通过事件通知前端处理进度和结果

- **主要文件**:
  - `llmEnricher.js`: LLM ETL 增强引擎，使用大模型深度提取日记中的非结构化信息。
    - **输入**: 
      ```javascript
      {
        records: Array,              // 待处理记录
        forceRefresh: Boolean        // 是否强制刷新
      }
      ```
    - **输出**:
      ```javascript
      {
        total: Number,               // 总记录数
        processed: Number,           // 已处理数
        cached: Number,              // 缓存数
        failed: Number               // 失败数
      }
      ```
  - `ipcHandlers.js`: ETL IPC 处理器。
    - **输入**: 
      ```javascript
      {
        etlConfig: Object,           // ETL配置
        forceRefresh: Boolean        // 是否强制刷新
      }
      ```
    - **输出**:
      ```javascript
      {
        success: Boolean,            // 是否成功
        message: String,             // 消息
        error: String                // 错误信息（如果失败）
      }
      ```
  - `index.js`: ETL 模块导出。

#### 1.4 意图分析模块 (src/main/intent/)

- **功能**: 基于用户查询的关键词匹配，推荐合适的工具。
- **实现细节**:
  - 基于关键词匹配的意图识别
  - 支持多种工具类型的推荐

- **处理流程**:
  1. 接收用户查询文本和可用工具列表
  2. 对查询文本进行关键词匹配分析
  3. 根据匹配的关键词为每个工具打分
  4. 应用特殊规则调整分数（如复杂分析问题优先使用sql_analysis）
  5. 按分数排序返回推荐的工具列表

- **主要文件**:
  - `analyzer.js`: 意图分析器，分析用户查询意图，返回推荐的工具列表。
    - **输入**: 
      ```javascript
      {
        query: String,               // 用户查询
        availableTools: Array        // 可用工具列表
      }
      ```
    - **输出**:
      ```javascript
      [
        "search_records",            // 推荐工具列表
        "query_records",
        "sql_analysis"
      ]
      ```

#### 1.5 LLM 模块 (src/main/llm/)

- **功能**: 提供 LLM 模型工厂，支持 DashScope/OpenAI 兼容 API。
- **实现细节**:
  - 支持多种API提供商
  - 遵循 LangChain 1.0 BaseLanguageModel 规范
  - 支持模型配置和初始化

- **处理流程**:
  1. 接收API基础地址、模型名称和配置选项
  2. 根据基础地址获取对应的API密钥
  3. 初始化ChatOpenAI模型实例
  4. 提供模型调用接口

- **主要文件**:
  - `models.js`: LLM 模型工厂，支持 DashScope/OpenAI 兼容 API，遵循 LangChain 1.0 BaseLanguageModel 规范。
    - **输入**: 
      ```javascript
      {
        baseURL: String,             // API基础地址
        model: String,               // 模型名称
        options: Object              // 配置选项
      }
      ```
    - **输出**: 初始化的ChatOpenAI模型实例
  - `directOpenAI.js`: 直接调用 OpenAI API 的实现。

#### 1.6 工具模块 (src/main/tools/)

- **功能**: 实现了各种工具，供智能助手调用。
- **实现细节**:
  - 遵循 LangChain 1.0 Tool 规范
  - 支持工具注册和调用
  - 提供多种数据分析工具

- **处理流程**:
  1. 工具注册表管理所有可用工具
  2. 根据工具名称获取对应工具实例
  3. 调用工具的invoke方法执行具体功能
  4. 返回执行结果

- **主要文件**:
  - `base.js`: Tool 基类，遵循 LangChain 1.0 Tool 规范。
    - **输入**: 工具特定的参数对象
    - **输出**: 
      ```javascript
      {
        toolName: String,            // 工具名称
        data: Object,                // 工具执行结果
        isError: Boolean,            // 是否出错
        timestamp: String            // 时间戳
      }
      ```
  - `searchRecords.js`: 搜索记录工具，支持语义内容检索。
    - **输入**: 
      ```javascript
      {
        query: String,               // 搜索关键词
        conditions: Object           // 过滤条件
      }
      ```
    - **输出**:
      ```javascript
      {
        records: Array,              // 搜索结果
        debug: Object                // 调试信息
      }
      ```
  - `queryRecords.js`: 精确查询工具，支持结构化条件查询。
    - **输入**: 
      ```javascript
      {
        dateRange: Object,           // 日期范围
        project: String,             // 项目名称
        weekday: String,             // 星期几
        isWeekend: Boolean,          // 是否周末
        timeRange: String,           // 时间段
        durationMin: Number,         // 最小时长
        durationMax: Number,         // 最大时长
        contentKeyword: String,      // 内容关键词
        moodTags: Array,             // 情绪标签
        minEnergyLevel: Number,      // 最小能量值
        maxEnergyLevel: Number,      // 最大能量值
        peopleInvolved: String,      // 涉及人物
        contentType: String,         // 内容体裁
        hasQuotes: Boolean,          // 是否包含金句
        limit: Number                // 限制结果数
      }
      ```
    - **输出**:
      ```javascript
      {
        records: Array,              // 查询结果
        totalCount: Number,          // 总记录数
        matchedCount: Number,        // 匹配记录数
        returnedCount: Number,       // 返回记录数
        aiEnhancedCount: Number      // AI增强记录数
      }
      ```
  - `sqlAnalysis.js`: SQL 分析工具，执行多维度统计分析。
    - **输入**: 
      ```javascript
      {
        analysisType: String,        // 分析类型
        params: Object               // 分析参数
      }
      ```
    - **输出**:
      ```javascript
      {
        analysisType: String,        // 分析类型
        data: Array/Object,          // 分析结果
        recordCount: Number,         // 记录数
        aiEnhancedCount: Number,     // AI增强记录数
        isAIAnalysis: Boolean        // 是否为AI分析
      }
      ```
  - `registry.js`: 工具注册表，管理所有可用的工具实例。
    - **输入**: 工具实例
    - **输出**: 工具实例或工具元数据
  - `index.js`: 工具模块导出。

### 2. 渲染进程模块 (src/renderer/)

渲染进程模块包含了前端界面的代码，负责用户界面的展示和交互。

#### 2.1 组件模块 (src/renderer/src/components/)

- **功能**: 实现了各种 UI 组件。
- **实现细节**:
  - 基于 Vue 3 和 Naive-UI 组件库
  - 响应式设计，支持多种屏幕尺寸
  - 组件间通过 props 和 events 进行通信

- **处理流程**:
  1. 组件初始化时加载所需数据
  2. 通过props接收父组件传递的数据
  3. 处理用户交互事件
  4. 通过events向父组件传递数据或事件
  5. 响应数据变化并更新界面

- **主要文件**:
  - `Dashboard.vue`: 仪表盘页面。
  - `AgentPage.vue`: 智能代理页面。
    - **输入**: 
      ```javascript
      {
        messages: Array,             // 消息历史
        loading: Boolean,            // 加载状态
        selectedModel: String,       // 选中的模型
        selectedBaseURL: String,     // 选中的API地址
        tools: Array                 // 可用工具
      }
      ```
    - **输出事件**:
      - `send-message`: 发送消息
      - `model-change`: 模型变更
      - `base-url-change`: API地址变更
      - `tools-change`: 工具变更
  - `AnalysisPage.vue`: 数据分析页面。
  - `FilterBar.vue`: 过滤栏组件。
    - **输入**: 
      ```javascript
      {
        projectOptions: Array,       // 项目选项
        value: Object                // 当前值
      }
      ```
    - **输出事件**:
      - `update:value`: 值更新
      - `import`: 导入数据
      - `reset`: 重置过滤器
      - `etl-enhance`: ETL增强
  - `RecordCard.vue`: 记录卡片组件。
    - **输入**: 
      ```javascript
      {
        record: Object,              // 记录数据
        showAiMeta: Boolean,         // 是否显示AI元数据
        hoverable: Boolean,          // 是否可悬停
        clickable: Boolean           // 是否可点击
      }
      ```
    - **输出事件**:
      - `click`: 点击事件
      - `tag-click`: 标签点击事件
  - `EnhancedRecordCard.vue`: AI 增强记录卡片组件。
    - **输入**: 
      ```javascript
      {
        record: Object,              // 记录数据
        compact: Boolean,            // 是否紧凑显示
        showQuotes: Boolean,         // 是否显示金句
        showAllInCompact: Boolean    // 紧凑模式下是否显示所有内容
      }
      ```
    - **输出事件**:
      - `tag-click`: 标签点击事件
      - `request-analysis`: 请求分析事件
  - `DataBoardTab.vue`: 数据看板组件。
    - **输入**: 
      ```javascript
      {
        initialData: Array           // 初始数据
      }
      ```
    - **输出事件**:
      - `data-updated`: 数据更新
      - `message`: 消息
  - `ThemeSwitcher.vue`: 主题切换器组件。
    - **输入**: 
      ```javascript
      {
        value: String                // 当前主题
      }
      ```
    - **输出事件**:
      - `update:value`: 值更新

#### 2.2 配置模块 (src/renderer/src/config/)

- **功能**: 管理应用程序的配置。
- **实现细节**:
  - 使用 localStorage 进行配置持久化
  - 支持配置的加载、保存和重置

- **处理流程**:
  1. 应用启动时加载配置
  2. 提供配置读取接口
  3. 提供配置更新接口
  4. 将配置保存到localStorage

- **主要文件**:
  - `assistant.ts`: 智能助手配置，包含模型、提示词等设置。
    - **配置结构**:
      ```typescript
      {
        selectedBaseURL: String,     // 选中的API地址
        selectedModel: String,       // 选中的模型
        baseURLs: Array,             // API地址列表
        temperature: Number,         // 温度参数
        top_p: Number,               // top_p参数
        intentModel: String,         // 意图模型
        enabledTools: Array,         // 启用的工具
        prompts: Object,             // 提示词
        memory: Object,              // 内存配置
        search: Object,              // 搜索配置
        etl: Object                  // ETL配置
      }
      ```

#### 2.3 工具模块 (src/renderer/src/utils/)

- **功能**: 提供一些通用的工具函数。
- **实现细节**:
  - 提供主题相关的工具函数
  - 提供其他辅助函数

- **处理流程**:
  1. 提供静态工具函数
  2. 通过模块导入使用

- **主要文件**:
  - `theme.js`: 主题相关的工具函数。
  - `jsonView.ts`: JSON视图工具。

## 技术架构特点

1. **LangChain 1.0 集成**: 项目已成功按 LangChain 1.0 规范重构智能体底层驱动，包括 LLM 层、工具层、代理层和意图层。
2. **双引擎数据存储**: 采用 AlaSQL 作为内存 SQL 引擎负责精确统计与筛选，向量库负责模糊搜索与语义感知。
3. **AI 增强 ETL**: 使用大模型深度提取日记中的非结构化信息，实现四维度结构的元数据提取。
4. **模块化解耦**: 各模块之间职责清晰，通过 IPC 进行通信，便于维护和扩展。

## 总结

该项目通过模块化的设计，实现了功能清晰、易于维护和扩展的架构。主进程负责核心逻辑处理，渲染进程负责用户界面展示，两者通过 IPC 进行通信。同时，项目集成了先进的 AI 技术，提供了智能分析和检索功能。