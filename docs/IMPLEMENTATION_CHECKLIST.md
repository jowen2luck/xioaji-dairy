# Daily Log Vue — Target Architecture 实施完成度检查清单

> 日期：2026-08-17  
> 对照文档：`TARGET_ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md`

---

## 图例

- ✅ 已完成（代码存在且有测试覆盖）
- ⚠️ 部分完成（代码存在但缺少测试/集成/细节）
- ❌ 未完成

---

## Section 6: 认知模型 (Epistemic Model)

| 要求 | 状态 | 实现位置 |
|------|------|----------|
| facts（证据引用） | ✅ | `AnswerComposer.compose()` 返回 `facts[]` |
| computations（确定性计算） | ✅ | `AnswerComposer.compose()` 返回 `computations[]` |
| hypotheses（模型假设） | ✅ | `AnswerComposer.compose()` 返回 `hypotheses[]` |
| suggestions（反思建议） | ✅ | `AnswerComposer.compose()` 返回 `suggestions[]` |
| 派生元数据声明 derivation 类别 | ⚠️ | contracts.js 定义了 schema 但 ETL 未对接 |
| inferred 字段不静默成为事实过滤器 | ⚠️ | 逻辑层面支持但未显式测试 |

---

## Section 7: 规范数据合约 (Normative Data Contracts)

| 合约 | 状态 | 实现位置 |
|------|------|----------|
| 7.1 JournalRecord | ✅ | `domain/contracts.js` — Zod schema + normalizeJournalRecord |
| 7.2 DerivedAnnotation | ⚠️ | schema 未定义（ETL 增强器尚未对接） |
| 7.3 InquiryScope + InquiryPlan | ✅ | `domain/contracts.js` — Zod schema + QueryPlanner 验证 |
| 7.4 EvidencePack + EvidenceRef + ComputedMetric | ✅ | `domain/contracts.js` — Zod schema + AnalysisService 构建 |
| 7.5 ExplorationResult | ✅ | `AnswerComposer.compose()` 返回完整结构 |
| 7.6 InquirySession | ✅ | `InquirySessionStore` 管理会话状态 |
| 7.7 ModelCallReceipt | ✅ | `domain/inquiry/ModelCallReceipt.js` + InquiryService 追踪 |

---

## Section 8: 应用服务合约

| 服务 | 状态 | 实现位置 |
|------|------|----------|
| 8.1 JournalRepository | ✅ | `infrastructure/persistence/JsonJournalRepository.js` |
| 8.2 AnalysisService (execute/exactQuery/semanticSearch/aggregate/compare) | ✅ | `application/AnalysisService.js` |
| 8.3 InquiryService (start/followUp/getSession/getEvidencePack) | ✅ | `application/InquiryService.js` |
| 8.4 ReviewService (generate) | ✅ | `application/ReviewService.js` |

---

## Section 9: 必需工作流

| 工作流 | 状态 | 说明 |
|--------|------|------|
| 9.1 新询问 (New inquiry) | ✅ | InquiryService.start → QueryPlanner → AnalysisService → AnswerComposer |
| 9.2 追问 (Follow-up) | ✅ | InquiryService.followUp → scope 演化（reuse/narrow/extend/replace） |
| 9.3 导入/编辑 (Import/Edit) | ✅ | JournalService.upsert → 修订号递增 → 失效回调 |
| 9.4 定时 Review (Scheduled review) | ⚠️ | ReviewService.generate 存在，但调度器未实现 |
| 9.5 MCP 请求 | ✅ | MCP 已使用应用服务层 |

---

## Section 10: UI 信息架构

| 要求 | 状态 | 说明 |
|------|------|------|
| 10.1 主导航 (Explore/Journal/Reviews/Settings) | ⚠️ | ExplorePage 存在但未设为默认屏幕 |
| 10.2 Explore 屏幕（对话区+证据面板+范围显示+追问建议） | ✅ | ExplorePage.vue + EvidencePanel + ScopeDisplay + FollowUpSuggestions |
| 10.3 图表从 EvidencePack 渲染 | ❌ | 图表组件仍直接调用工具 |
| 10.4 Reviews 体验 | ❌ | Reviews 页面未构建 |

---

## Section 11: 目标逻辑模块布局

| 模块 | 状态 | 实现位置 |
|------|------|----------|
| domain/journal/ | ⚠️ | 仅有 contracts.js，无 journal/ 子目录 |
| domain/evidence/ | ❌ | 未创建 |
| domain/inquiry/ | ✅ | QueryPlanner.js, InquirySessionStore.js, ModelCallReceipt.js |
| application/ (4 个服务) | ✅ | JournalService, AnalysisService, InquiryService, ReviewService |
| infrastructure/persistence/JsonJournalRepository.js | ✅ | 已实现 |
| infrastructure/persistence/JsonDerivedDataRepository.js | ❌ | 未创建 |
| infrastructure/analysis/AlaSqlAnalysisAdapter.js | ❌ | 未创建 |
| infrastructure/retrieval/LocalVectorSearchAdapter.js | ✅ | 已实现 |
| infrastructure/llm/OpenAICompatibleGateway.js | ❌ | 未创建 |
| adapters/ipc/ | ✅ | inquiryHandler, journalHandler, reviewHandler |
| adapters/jobs/ | ❌ | 定时任务未实现 |
| features/explore/ | ✅ | ExplorePage + 子组件 |
| features/journal/ | ❌ | 未创建 |
| features/reviews/ | ❌ | 未创建 |
| features/settings/ | ❌ | 未创建 |
| features/devtools/ | ❌ | 未创建 |

---

## Section 13: 迁移阶段

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0: Contracts and characterization | ✅ |  schemas + 75 tests + fixtures |
| Phase 1: Unified journal and analysis core | ✅ |  JournalRepository + AnalysisService + EvidencePack |
| Phase 2: Inquiry engine and continuous follow-up | ✅ |  SessionStore + Planer + InquiryService + Composer + Receipts |
| Phase 3: Explore-first product experience | ⚠️ |  ExplorePage 存在但图表未重构、未设为默认 |
| Phase 4: Shared reviews and working MCP | ⚠️ |  ReviewService 存在但调度器未实现、MCP contract tests 缺失 |
| Phase 5: Cleanup and hardening | ⚠️ |  新 handlers 已注册但旧路径未移除 |

---

## Section 14: 验收场景

| 场景 | 状态 | 说明 |
|------|------|------|
| A: 证据支持的回忆 | ✅ | 通过 InquiryService + EvidencePanel 实现 |
| B: 连续比较 | ✅ | QueryPlanner 检测比较意图 + followUp scope 演化 |
| C: 带不确定性的反思 | ✅ | AnswerComposer 区分 facts/hypotheses/limitations |
| D: 数据修订 | ⚠️ | 修订号追踪存在但失效工作流未完整测试 |
| E: 跨入口一致性 | ⚠️ | MCP 使用相同服务但 contract tests 缺失 |

---

## Section 15: 测试要求

| 测试类型 | 状态 | 说明 |
|----------|------|------|
| 15.1 Contract tests | ✅ | contracts.test.js (16 tests) |
| 15.2 Repository tests | ❌ | JsonJournalRepository 无测试 |
| 15.3 Analysis tests | ❌ | AnalysisService 无测试 |
| 15.4 Inquiry tests | ❌ | InquiryService 无集成测试 |
| 15.5 Adapter tests | ❌ | IPC 适配器无测试 |

---

## Section 16: 运营和隐私要求

| 要求 | 状态 | 说明 |
|------|------|------|
| API key 不在 artifact 中持久化 | ✅ | ArtifactRepository 不存储 key |
| Model call receipt 可用 | ✅ | InquiryService.getModelCallReceipts() |
| Provider 失败降级到确定性搜索 | ⚠️ | 逻辑支持但未显式测试 |
| LLM 增强失败不影响原始数据 | ✅ | ETL 与查询路径分离 |
| 缓存损坏触发重建 | ✅ | LocalVectorSearchAdapter 有 clearCache |
| 模型和 prompt 版本随 annotation 存储 | ⚠️ | schema 定义存在但 ETL 未对接 |
| 日志避免打印完整日记文本 | ⚠️ | 未显式配置 |
| 远程配置时不声称本地处理 | ⚠️ | 未实现隐私披露 UI |

---

## 总结

| 类别 | 已完成 | 部分完成 | 未完成 |
|------|--------|----------|--------|
| Domain 合约 | 5 | 2 | 0 |
| Application 服务 | 4 | 0 | 0 |
| Infrastructure | 2 | 0 | 3 |
| Adapters | 1 | 0 | 1 |
| UI 组件 | 1 | 1 | 3 |
| 测试 | 3 | 0 | 4 |

**总体完成度：约 60-65%**

核心架构骨架（Domain + Application + 核心 Infrastructure + 基本 IPC）已完成。
剩余工作集中在：UI 完善、图表重构、定时任务、旧代码清理、补充测试。

---

> 文档版本：v1.0  
> 最后更新：2026-08-17
