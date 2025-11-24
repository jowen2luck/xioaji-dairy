# 双模态数据库架构设计

## 系统总体架构

```mermaid
graph TB
    A[用户提问] --> B[LangChain Agent]
    B --> C{意图分析}
    C -->|统计分析| D[SQL Analysis Tool]
    C -->|语义检索| E[Vector Search Tool]
    C -->|混合查询| F[双引擎联动]
    
    D --> G[AlaSQL Engine]
    E --> H[Vector Database]
    F --> G
    F --> H
    
    G --> I[ETL 增强数据]
    H --> I
    
    I --> J[原始 JSON 数据]
    
    style B fill:#4CAF50
    style D fill:#2196F3
    style E fill:#FF9800
    style G fill:#9C27B0
    style H fill:#FF5722
```

---

## 数据流转全景图

```mermaid
graph LR
    A[Excel/手动输入] -->|导入| B[原始 JSON]
    B -->|加载时| C[ETL 处理器]
    C -->|注入元数据| D[增强宽表]
    
    D -->|索引| E[向量数据库]
    D -->|查询| F[SQL 引擎]
    
    E -->|语义检索| G[Agent]
    F -->|统计分析| G
    
    G -->|叙事生成| H[用户]
    
    style C fill:#4CAF50
    style D fill:#FFC107
    style E fill:#FF5722
    style F fill:#2196F3
```

---

## ETL 数据增强流程

```mermaid
graph TB
    A[原始记录] --> B{ETL 处理器}
    
    B --> C[时间解析]
    C --> C1[_meta_timestamp]
    C --> C2[_meta_year/month/day]
    C --> C3[_meta_hour/weekday]
    C --> C4[_meta_is_weekend]
    
    B --> D[行为提取]
    D --> D1[_meta_duration_min]
    D --> D2[_meta_project]
    D --> D3[_meta_has_achievement]
    
    B --> E[内容处理]
    E --> E1[_meta_plain_text]
    E --> E2[_meta_text_length]
    
    B --> F[情绪量化]
    F --> F1[_meta_mood_score]
    F --> F2[_meta_emotion_raw]
    
    C1 --> G[增强记录]
    C2 --> G
    C3 --> G
    C4 --> G
    D1 --> G
    D2 --> G
    D3 --> G
    E1 --> G
    E2 --> G
    F1 --> G
    F2 --> G
    
    style B fill:#4CAF50
    style G fill:#FFC107
```

---

## SQL 分析引擎架构

```mermaid
graph TB
    A[增强数据] --> B[AlaSQL 引擎]
    
    B --> C[自定义函数]
    C --> C1[CORRELATION]
    C --> C2[TIME_LABEL]
    C --> C3[MOOD_LEVEL]
    
    B --> D[预定义模板]
    D --> D1[按维度统计]
    D --> D2[时间段分析]
    D --> D3[工作日 vs 周末]
    D --> D4[情绪趋势]
    D --> D5[高频项目]
    D --> D6[条件过滤]
    
    D1 --> E[统计结果]
    D2 --> E
    D3 --> E
    D4 --> E
    D5 --> E
    D6 --> E
    
    E --> F[Agent 叙事]
    
    style B fill:#2196F3
    style E fill:#4CAF50
```

---

## 向量检索引擎架构

```mermaid
graph TB
    A[用户查询] --> B[查询向量化]
    B --> C[Xenova/MiniLM-L6]
    
    D[增强数据] --> E[文本向量化]
    E --> C
    
    C --> F[向量索引]
    F --> F1[_meta_plain_text]
    F --> F2[embedding]
    F --> F3[original record]
    
    B --> G[相似度计算]
    F --> G
    
    G --> H[余弦相似度]
    H --> I[Top-K 排序]
    
    I --> J[重排序]
    J --> J1[向量分数 60%]
    J --> J2[关键词匹配 20%]
    J --> J3[条件筛选 20%]
    
    J --> K[最终结果]
    
    style C fill:#FF5722
    style G fill:#FF9800
    style K fill:#4CAF50
```

---

## 双引擎协同工作流

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as Agent
    participant S as SQL Engine
    participant V as Vector Engine
    participant D as 数据层
    
    U->>A: "分析我最近的工作状态"
    
    A->>S: sql_analysis(type='summary')
    S->>D: 加载增强数据
    D-->>S: 247 条记录
    S->>S: SELECT COUNT, AVG...
    S-->>A: {total_records: 247, avg_mood: 0.82}
    
    A->>S: sql_analysis(type='mood_trend')
    S->>S: SELECT month, AVG(mood)...
    S-->>A: [{month: 11, avg_mood: 0.82}, ...]
    
    A->>V: search_records(query='焦虑')
    V->>D: 加载增强数据
    D-->>V: 247 条记录
    V->>V: 向量化查询
    V->>V: 计算相似度
    V-->>A: [record1, record2, ...]
    
    A->>A: 综合叙事生成
    A-->>U: "从数据上看,你上周工作了 60 小时..."
```

---

## 工具注册与调用流程

```mermaid
graph TB
    A[系统启动] --> B[ToolRegistry 初始化]
    
    B --> C[注册 SearchRecordsTool]
    B --> D[注册 SqlAnalysisTool]
    
    E[用户问题] --> F[Agent Executor]
    
    F --> G{意图分析}
    
    G -->|统计| H[调用 sql_analysis]
    G -->|检索| I[调用 search_records]
    
    H --> J[ToolRegistry.invokeTool]
    I --> J
    
    J --> K[验证输入]
    K --> L[执行工具]
    L --> M[返回 ToolResult]
    
    M --> N[Agent 处理结果]
    N --> O[生成回复]
    
    style B fill:#4CAF50
    style F fill:#2196F3
    style J fill:#FF9800
```

---

## 数据存储与加载机制

```mermaid
graph TB
    A[保存数据请求] --> B{saveData ETL}
    
    B --> C[读取现有数据]
    C --> D[合并去重]
    D --> E[清理 _meta_ 字段]
    E --> F[写入 JSON 文件]
    
    G[加载数据请求] --> H{loadAndEnrichData}
    
    H --> I[读取 JSON 文件]
    I --> J[enrichRecord 处理]
    
    J --> K[解析时间]
    J --> L[提取文本]
    J --> M[计算情绪]
    J --> N[生成元数据]
    
    K --> O[增强记录]
    L --> O
    M --> O
    N --> O
    
    O --> P[返回宽表数据]
    
    style B fill:#4CAF50
    style H fill:#2196F3
    style O fill:#FFC107
```

---

## 关键设计原则

### 1. 单向依赖
```
展示层(Vue) → Agent 层(LangChain) → 工具层(Tools) → 数据层(ETL + SQL + Vector)
```

### 2. 关注点分离
- **数据层:** 只管加工和存储,不涉及业务逻辑
- **工具层:** 封装单一功能,符合 LangChain 规范
- **Agent 层:** 协调工具,生成叙事
- **展示层:** 纯 UI 交互

### 3. 零配置增强
- 用户无需手动触发 ETL
- 加载数据时自动增强
- 保存数据时自动清理

### 4. 向后兼容
- 原始 JSON 格式不变
- _meta_ 字段只在内存中存在
- 前端代码无需修改

---

## 性能优化策略

### 1. 懒加载向量模型
```javascript
// 首次使用时才加载
if (!embeddingModel) {
  embeddingModel = await loadEmbeddingModel()
}
```

### 2. 内存缓存
```javascript
// 向量库构建后缓存在内存
if (vectorDB.length === 0) {
  await buildVectorDatabase(data)
}
```

### 3. SQL 优化
```sql
-- 使用索引(虽然 AlaSQL 是内存库,但仍遵循最佳实践)
GROUP BY _meta_project
ORDER BY count DESC
LIMIT 10
```

### 4. 批量处理
```javascript
// ETL 批量处理,而非逐条
const enrichedData = rawData.map(enrichRecord)
```

---

## 扩展性设计

### 添加新的统计维度
1. 在 `enrichRecord` 中添加新的 `_meta_` 字段
2. 在 `SqlService` 中添加新的查询模板
3. (可选) 在 `SqlAnalysisTool` 中添加新的 `analysisType`

### 添加新的工具
1. 继承 `Tool` 基类
2. 实现 `invoke` 方法
3. 在 `ToolRegistry` 中注册

### 自定义 SQL 函数
```javascript
alasql.fn.YOUR_FUNCTION = (param) => {
  // 你的逻辑
  return result
}
```

---

## 技术栈总览

| 层级 | 技术 | 作用 |
|------|------|------|
| 前端 | Vue 3 + Naive UI | 用户界面 |
| Agent | LangChain 1.0 | 智能推理 |
| 工具 | Custom Tools | 功能封装 |
| SQL | AlaSQL | 统计分析 |
| 向量 | Xenova Transformers | 语义检索 |
| ETL | Custom JS | 数据加工 |
| 存储 | JSON File | 持久化 |

---

## 未来扩展方向

### 第二阶段:关联挖掘
```mermaid
graph LR
    A[行为数据] --> B[Pattern Miner]
    B --> C[关联规则]
    C --> D[因果推断]
    D --> E[洞察报告]
```

### 第三阶段:主动提醒
```mermaid
graph LR
    A[实时监测] --> B[异常检测]
    B --> C[触发条件]
    C --> D[推送提醒]
```

### 第四阶段:预测模型
```mermaid
graph LR
    A[历史数据] --> B[时间序列分析]
    B --> C[趋势预测]
    C --> D[建议生成]
```

---

## 总结

**双模态数据库 = SQL 的精确 + 向量的灵活**

- ✅ 让数据"懂规矩"(ETL 标准化)
- ✅ 让数据"会计算"(SQL 引擎)
- ✅ 让数据"能理解"(向量检索)
- ✅ 让数据"会说话"(Agent 叙事)

**核心价值:从"电子流水账"进化为"个人数字生命体"**
