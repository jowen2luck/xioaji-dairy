# Deprecated Code & Cleanup Guide

> 本文档记录已被目标架构新模块替代的旧代码路径，以及清理建议。

---

## Status: Phase 5 进行中

新架构核心已就绪，旧代码仍共存以保证向后兼容。建议分阶段清理。

---

## Deprecated Paths

### 1. Agent 工具链 (`src/main/tools/`)

| 文件 | 状态 | 替代方案 |
|------|------|----------|
| `tools/searchRecords.js` | ⚠️ 已弃用 | `infrastructure/retrieval/LocalVectorSearchAdapter.js` |
| `tools/sqlAnalysis.js` | ⚠️ 已弃用 | `application/AnalysisService.js` |
| `tools/insight.js` | ⚠️ 已弃用 | `application/AnalysisService.js` |
| `tools/registry.js` | ⚠️ 已弃用 | 直接在 `adapters/ipc/` 中调用应用服务 |

**清理策略**: 新代码不再引用 `tools/` 目录。确认所有 IPC handler 已切换后，可整体移除。

### 2. 旧 IPC 处理器 (`src/main/agent/ipcHandlers.js`)

| 功能 | 状态 | 替代方案 |
|------|------|----------|
| Agent ReAct 执行 | ⚠️ 共存 | `InquiryService.start/followUp` |
| "吸星大法"上下文优化 | ⚠️ 共存 | 已整合到 `InquiryService` |

**清理策略**: `ipcHandlers.js` 中的 Agent 逻辑保留作为兼容层，但新 UI 不再调用。未来迁移后移除。

### 3. AlaSQL 查询 (`src/main/data/SqlService.js`)

| 功能 | 状态 | 替代方案 |
|------|------|----------|
| 直接宽表查询 | ⚠️ 部分弃用 | `AnalysisService.aggregate` |

**清理策略**: 旧 Analysis 页面保留引用，新 Explore 页面统一走 EvidencePack。

### 4. 直接文件访问模式

| 旧模式 | 新模式 |
|--------|--------|
| 直接读写 `ai_meta_index.json` | 经 `LLMEnricher` + `DerivedDataRepository`（待建） |
| 直接读写 `vector_db_incremental.json` | 经 `LocalVectorSearchAdapter` |
| 缓存放在 `src/main/.cache/` | 缓存迁移到 `userData/.cache/` |

---

## Safe Removal Checklist

在删除任何旧代码前，确认：

- [ ] 新 `adapters/ipc/` handlers 已在 `app.whenReady()` 中注册
- [ ] 新 UI (`features/explore/`, `features/reviews/`) 不引旧 tools
- [ ] 旧 `AgentWorkbench.vue` / `ReActPanel.vue` 仍可使用（向后兼容）
- [ ] 所有 119 个测试通过
- [ ] MCP Server 仍正常工作（它使用应用服务层）

---

## Migration Decision Record

### 已决策

1. **共存策略**: 新旧代码共存至少一个发布周期，确保数据不丢失
2. **数据路径**: 缓存和 artifact 统一存储在 `userData/` 目录（Electron 标准）
3. **Schema 版本**: EvidencePack `schemaVersion: "1.0.0"` 为初始版本，未来升级需迁移

### 待决策

1. **旧 Agent 何时移除**: 待新 InquiryEngine 稳定运行 1-2 周后决定
2. **AlaSQL 去留**: 如果 `AnalysisService.aggregate` 覆盖所有功能，可移除 SqlService
3. **自动 Review 调度**: 使用 setInterval 方案，未来可迁移到 OS 级调度

---

> 文档版本：v1.0  
> 最后更新：2026-08-23
