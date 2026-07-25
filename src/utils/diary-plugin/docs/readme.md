# Diary Plugin (日记处理插件)

独立、无上下文依赖的日记数据处理核心模块，负责日记数据的**导入、导出、字段校验和格式预处理（Code-ETL）**。

可作为独立 Library 整个文件夹拷贝到任意 Node.js 项目中使用。

---

## 目录结构

```
diary-plugin/
├── index.js        # 统一 API 入口
├── importer.js     # 导入：Excel解析 → 校验 → ETL 一体化流水线
├── exporter.js     # 导出：自动脱水 + 安全落盘
├── formatter.js    # ETL 增强：纯函数计算 _meta_ 字段
├── validator.js    # 字段校验：类型检查、必填校验、自动修复
└── docs/           # 数据结构规范文档
```

---

## 核心流水线

```
Excel/JSON 数据
    ↓  importer.js
字段校验 (validator.js)
  · 必填检查 (time)
  · 类型修正 (_id 自动生成、time ISO 规范化)
  · 颜色代码合法性检查 (xinqing)
  · 无效记录自动跳过 + 统计报告
    ↓
Code-ETL 增强 (formatter.js)
  · 时间维度：年/月/日/时/星期/时间段/是否周末
  · 行为维度：时长(分钟)、项目、成就
  · 内容维度：纯文本提取、字数统计
  · 情绪维度：关键词+颜色 复合打分 [-2, +2]
    ↓
返回 { records, enrichedRecords, validation }
```

---

## API 速查

```javascript
import {
  importExcelToJson,   // Excel → 校验 → ETL
  importFromJson,      // JSON数组 → 校验 → ETL
  exportJsonToFile,    // 自动脱水 + 写文件
  enrichRecord,        // 单条 ETL
  cleanDataForSave,    // 批量脱水
  validateRecord,      // 单条校验
  validateBatch,       // 批量校验
} from './diary-plugin'
```

### 导入 Excel（全自动）

```javascript
const result = importExcelToJson('/path/to/diary.xlsx')
// result.records          → 校验后的原始记录（可存储）
// result.enrichedRecords  → ETL 增强后的记录（可查询/统计）
// result.validation.stats → { total: 100, valid: 98, invalid: 2 }
// result.validation.errors → ['[#5] 缺少必填字段 time', ...]
```

### 导入 JSON（全自动）

```javascript
const result = importFromJson(jsonArray, { autoEnrich: true })
```

### 导出（自动脱水）

```javascript
exportJsonToFile('/path/to/output.json', enrichedRecords)
// 自动移除 _meta_ 和 _ai_meta，只保存原始字段
```

### 单独校验

```javascript
const { valid, record, errors, warnings } = validateRecord(rawRecord)
```

---

## 环境要求

- Node.js 环境
- `npm install xlsx`
