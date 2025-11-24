# 双模态数据库使用指南

## 📚 概念介绍

你的日记系统现在拥有**两个大脑**:

### 🧠 左脑 - SQL 分析引擎
- **擅长:** 精确计算、多维统计、条件筛选
- **应用:** "我平均工时是多少?"、"哪个项目占用时间最多?"
- **底层:** AlaSQL 内存数据库

### 🎨 右脑 - 向量检索引擎  
- **擅长:** 语义理解、模糊搜索、相似度排序
- **应用:** "找出我焦虑的记录"、"关于项目失败的日记"
- **底层:** Xenova/all-MiniLM-L6-v2 向量模型

---

## 🚀 快速上手

### 1. Agent 自动选择工具

**你只需正常提问,Agent 会自动选择合适的工具:**

```javascript
// 示例 1: 统计类问题 → 自动调用 SQL 工具
"帮我分析一下我的项目时间分布"

// 示例 2: 语义检索 → 自动调用向量工具
"找出我最焦虑的那几天"

// 示例 3: 混合查询 → 两个工具联动
"找出我工作时间最长但心情最差的记录"
```

### 2. 手动指定工具(高级用法)

**如果你想精确控制,可以在问题中明确提到工具名:**

```javascript
// 强制使用 SQL 工具
"使用 sql_analysis 工具,分析我的情绪趋势"

// 强制使用向量检索
"使用 search_records 工具,找出关于'加班'的记录"
```

---

## 📊 SQL 分析工具详解

### 可用的分析类型

#### 1. `summary` - 总体摘要
**用途:** 获取整体统计数据

**示例问题:**
- "给我一个数据总览"
- "我一共记录了多少条日记?"
- "我的平均工作时长是多少?"

**返回数据示例:**
```json
{
  "total_records": 247,
  "total_projects": 12,
  "total_hours": 385.6,
  "avg_duration_min": 93.5,
  "avg_mood": 0.82,
  "total_achievements": 68
}
```

---

#### 2. `by_project` - 按项目统计
**用途:** 查看各项目的时间投入和情绪状态

**示例问题:**
- "哪个项目占用了我最多时间?"
- "我在各个项目上的投入分布是怎样的?"

**返回数据示例:**
```json
[
  {
    "label": "项目A",
    "count": 45,
    "avg_duration": 120,
    "total_duration": 5400,
    "avg_mood": 1.2,
    "achievement_count": 15
  },
  ...
]
```

---

#### 3. `by_time` - 时间段分析
**用途:** 发现你的高效时段

**示例问题:**
- "我在什么时间段最高效?"
- "我晚上的状态怎么样?"

**返回数据示例:**
```json
[
  {
    "time_period": "上午",
    "count": 56,
    "avg_duration": 90,
    "avg_mood": 1.1
  },
  {
    "time_period": "深夜",
    "count": 12,
    "avg_duration": 180,
    "avg_mood": -0.5
  },
  ...
]
```

---

#### 4. `weekday_weekend` - 工作日 vs 周末
**用途:** 对比工作日和周末的状态差异

**示例问题:**
- "我工作日和周末的状态有什么不同?"
- "我周末是不是更快乐?"

**返回数据示例:**
```json
[
  {
    "day_type": "工作日",
    "count": 175,
    "avg_duration": 95,
    "total_duration": 16625,
    "avg_mood": 0.6
  },
  {
    "day_type": "周末",
    "count": 72,
    "avg_duration": 85,
    "total_duration": 6120,
    "avg_mood": 1.2
  }
]
```

---

#### 5. `mood_trend` - 情绪趋势
**用途:** 查看情绪随时间的变化

**示例问题:**
- "我最近几个月的心情趋势?"
- "我的情绪是在变好还是变坏?"

**返回数据示例:**
```json
[
  {
    "year": 2023,
    "month": 11,
    "count": 28,
    "avg_mood": 0.82,
    "mood_level": "积极",
    "achievements": 8
  },
  {
    "year": 2023,
    "month": 10,
    "count": 31,
    "avg_mood": -0.3,
    "mood_level": "消极",
    "achievements": 4
  },
  ...
]
```

---

#### 6. `top_projects` - 高频项目排行
**用途:** 找出你最关注的项目

**示例问题:**
- "我花时间最多的 5 个项目是什么?"
- "哪些项目让我最有成就感?"

**返回数据示例:**
```json
[
  {
    "project": "项目A",
    "count": 45,
    "total_hours": 90.5,
    "avg_mood": 1.2,
    "achievement_rate": 33.3
  },
  ...
]
```

---

## 🔍 向量检索工具详解

### 基本用法

**直接提问,无需指定参数:**

```javascript
// 语义搜索
"找出我关于'焦虑'的记录"

// 模糊匹配
"我写过关于'雪糕'的日记吗?"

// 情绪检索
"找出我最糟糕的几天"
```

### 高级用法:结构化条件

**如果需要精确筛选,可以提供条件:**

```javascript
// 按项目筛选
{
  "query": "进展顺利",
  "conditions": {
    "project": "项目A",
    "dateRange": {
      "start": "2023-11-01",
      "end": "2023-11-30"
    }
  }
}

// 按时长筛选
{
  "query": "加班",
  "conditions": {
    "duration": {
      "min": 120  // 最少 2 小时
    }
  }
}
```

---

## 💡 实战案例

### 案例 1: 发现时间黑洞

**问题:** "我的时间都去哪儿了?"

**Agent 执行流程:**
```
1. 调用 sql_analysis(type='by_project')
   → 发现:"项目 B 占用了 40% 的时间"

2. 调用 search_records(query='项目B')
   → 找到具体的日记内容

3. 生成叙事:
   "数据显示,你在'项目 B'上投入了 154 小时,占总时长的 40%。
    从你的日记来看,这个项目主要集中在 10 月份,
    当时你写道:'这个需求改了 3 次,快疯了...'(引用原文)"
```

---

### 案例 2: 优化作息时间

**问题:** "我在什么时间段最高效?"

**Agent 执行流程:**
```
1. 调用 sql_analysis(type='by_time')
   → 发现:"上午时段平均心情分数 1.2,深夜时段 -0.5"

2. 调用 sql_analysis(type='summary')
   → 补充:"深夜工作的记录有 12 条,平均时长 3 小时"

3. 生成建议:
   "建议调整作息:你的上午状态最好(心情 1.2),
    但深夜工作时心情明显下降(-0.5),
    且深夜工作时长往往超过 3 小时,容易疲劳。"
```

---

### 案例 3: 情绪波动分析

**问题:** "为什么我最近心情不好?"

**Agent 执行流程:**
```
1. 调用 sql_analysis(type='mood_trend')
   → 发现:"11 月平均心情 0.8,10 月是 -0.3,显著提升"

2. 调用 search_records(query='焦虑 沮丧', conditions={dateRange: '10月'})
   → 找到 10 月的负面记录

3. 调用 sql_analysis(type='by_project')
   → 发现:"10 月主要在做'项目 C',11 月换成了'项目 D'"

4. 综合叙事:
   "你 10 月的心情确实不好(-0.3),主要因为'项目 C'进展不顺,
    你在日记中多次提到'需求反复改动'、'加班到深夜'。
    好消息是,11 月换了项目后,你的心情明显回升到 0.8!"
```

---

## 🛠️ 开发者参考

### 元数据字段清单

所有记录加载后会自动注入以下字段:

```javascript
{
  // === 原始字段(不变) ===
  _id: "...",
  time: "2023-11-23T09:30:00",
  shanggexiangmu: "项目A",
  chixushijian: "1小时30分",
  ganshou: "<p>今天进展顺利</p>",
  tiyan: "心流",
  xinqing: "#FFFF00",
  chengjiu: true,
  
  // === 新增元数据(自动生成) ===
  _meta_timestamp: 1700715000000,
  _meta_year: 2023,
  _meta_month: 11,
  _meta_day: 23,
  _meta_hour: 9,
  _meta_weekday: 4,
  _meta_is_weekend: false,
  _meta_duration_min: 90,
  _meta_project: "项目A",
  _meta_has_achievement: true,
  _meta_plain_text: "今天进展顺利",
  _meta_text_length: 7,
  _meta_mood_score: 1.5,
  _meta_emotion_raw: "心流"
}
```

### 自定义 SQL 查询

**在 SqlService 中添加新方法:**

```javascript
// src/main/data/SqlService.js

analyzeDeepNightWork(data) {
  const sql = `
    SELECT 
      _meta_project as project,
      COUNT(*) as deep_night_count,
      AVG(_meta_mood_score) as avg_mood
    FROM ?
    WHERE _meta_hour >= 23 OR _meta_hour <= 4
    GROUP BY _meta_project
    ORDER BY deep_night_count DESC
  `
  return this.query(sql, data)
}
```

---

## ⚠️ 注意事项

### 1. 性能考虑
- **向量检索:** 每次查询需要计算相似度,数据量超过 1000 条时可能变慢
- **SQL 查询:** 内存操作,性能优秀,万级数据无压力

### 2. 数据隐私
- ✅ 所有计算在本地完成
- ✅ _meta_ 字段不写入磁盘
- ✅ 向量模型本地运行,无需联网

### 3. 兼容性
- ✅ 完全向后兼容,无需迁移历史数据
- ✅ 原始 JSON 格式不变
- ✅ 前端代码无需修改

---

## 🎯 下一步学习

1. **查看实施报告:** `DUAL_MODE_DB_REPORT.md`
2. **运行测试脚本:** `test-dual-mode-db.js`
3. **探索源码:**
   - ETL 加工器: `src/main/data/dataLoader.js`
   - SQL 引擎: `src/main/data/SqlService.js`
   - SQL 工具: `src/main/tools/sqlAnalysis.js`

---

## 💬 常见问题

### Q: Agent 会自动选择工具吗?
**A:** 是的!你只需正常提问,Agent 会根据问题类型自动选择 `sql_analysis` 或 `search_records`。

### Q: 如何添加自定义分析?
**A:** 在 `SqlService.js` 中添加新方法,然后在 `SqlAnalysisTool` 中注册新的 `analysisType`。

### Q: 数据会变大吗?
**A:** 不会。_meta_ 字段只在内存中存在,不写入文件,磁盘占用不变。

### Q: 可以导出统计结果吗?
**A:** 可以!Agent 返回的结果都是标准 JSON,可以直接复制或二次处理。

---

**🎉 享受你的智能日记系统吧!**
