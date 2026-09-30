# Daily Log Vue — Target Architecture 完成度差距分析

> 日期：2026-08-17  
> 范围：对照 `TARGET_ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md` 逐项核查当前代码实现状态

---

## 总体完成度

| 阶段 | 状态 | 完成度 |
|------|------|--------|
| Phase 0: Contracts and characterization | 部分完成 | 40% |
| Phase 1: Unified journal and analysis core | 部分完成 | 55% |
| Phase 2: Inquiry engine and continuous follow-up | 部分完成 | 45% |
| Phase 3: Explore-first product experience | 未开始 | 5% |
| Phase 4: Shared reviews and working MCP | 部分完成 | 50% |
| Phase 5: Cleanup and hardening | 未开始 | 0% |

---

## Phase 0: Contracts and Characterization

### 已完成

- [x] `src/main/domain/contracts.js` — JournalRecord 标准化函数 `normalizeJournalRecord`
- [x] `src/main/domain/inquiry/InquirySessionStore.js` — 会话存储骨架
- [x] `.mimocode/tools/daily-log.test.ts` — 7 个 MCP 动作的单元测试
- [x] `.mimocode/tools/daily-log.integration.test.ts` — 与 SummaryService 的集成测试

### 未完成

- [ ] 运行时 Schema 验证（Zod 或 JSON Schema）
  - 合约当前仅为 JSDoc 注释，无运行时校验
  - 需要为 JournalRecord、DerivedAnnotation、InquiryPlan、EvidencePack、ExplorationResult 添加 Zod schema
- [ ] 测试运行器配置（package.json 中无 test 脚本、无 vitest.config）
  - 测试文件位于 `.mimocode/tools/` 但 `package.json` scripts 缺少 `test` 命令
  - 无法通过 `npm test` 执行
- [ ] 特征测试套件未覆盖全部能力域（缺少 semantic search、comparison、timeline 的特征测试）
- [ ] MCP health 基线测试（当前 MCP health 从未被独立测试过）
- [ ] 标准 fixtures 文件（缺少 people/weekdays/HTML edge cases 的 sanitized fixtures）

### 建议实现优先级

1. **高优**：添加 vitest 配置 + test 脚本到 package.json
2. **高优**：为核心合约添加 Zod schema（JournalRecord、EvidencePack、InquiryPlan、ExplorationResult）
3. **中优**：补充 semantic search 和 comparison 的特征测试
4. **低优**：MCP health 基线测试

---

## Phase 1: Unified Journal and Analysis Core

### 已完成

- [x] `JsonJournalRepository` — JSON 持久化 + 修订号原子递增 + 安全写入
- [x] `JournalService` — CRUD + 失效回调钩子
- [x] `AnalysisService` — exactQuery / semanticSearch / aggregate / execute → EvidencePack
- [x] EvidencePack 构建器（含 EvidenceRef、ComputedMetric）
- [x] 修订失效机制（`revision` + `flush()` 原子写入）
- [x] `application/index.js` — 中央服务工厂（单例模式）
- [x] MCP Server 已使用新服务（`mcp-server/index.js` import JournalService + AnalysisService）

### 未完成

- [ ] `JsonDerivedDataRepository` — 派生数据仓库（目标架构 §11 规定独立存储）
  - 当前 `ai_meta_index.json` 和 `vector_db_incremental.json` 仍为直接文件访问
  - 需要统一的 DerivedDataRepository 管理修订失效 + 缓存重建
- [ ] IPC 重定向 — 当前 `ipcHandlers.js` 仍直接调用旧 `searchRecords.js` / `SqlService.js`
  - 新的 `AnalysisService` 未在 Agent Executor 链路中被使用
  - "吸星大法"路径仍依赖旧工具体系
- [ ] `AnalysisService.semanticSearch` 当前为关键词匹配降级版（无真实向量搜索接入）
  - 旧 `searchRecords.js` 中完整的 Max-Sim 多粒度切片算法未被迁移
- [ ] `AnalysisService.compare()` 方法未实现（目标架构 §8.2 要求）
- [ ] `AnalysisService` 缺少 timeline/pattern 分析能力
- [ ] AlaSQL 引擎包装层未实现（目标架构要求 `AlaSqlAnalysisAdapter` 放在 infrastructure/analysis 下）
- [ ] Feature flag 机制缺失（IPC 重定向需要 feature flag 以支持灰度切换）

### 建议实现优先级

1. **高优**：将向量搜索能力从 `searchRecords.js` 迁移为 `AnalysisService` 的适配器
2. **高优**：实现 `JsonDerivedDataRepository` 或统一缓存管理
3. **高优**：IPC 重定向（将 Agent IPC handler 切换到 InquiryService）
4. **中优**：添加 `compare()` 方法 + timeline 分析
5. **中优**：将 AlaSQL 包装为 `AlaSqlAnalysisAdapter`
6. **低优**：Feature flag 机制

---

## Phase 2: Inquiry Engine and Continuous Follow-up

### 已完成

- [x] `InquirySessionStore` — 会话创建/更新/证据包关联
- [x] `InquiryService.start()` — 新询问入口
- [x] `InquiryService.followUp()` — 追问入口（结构骨架）
- [x] `AnswerComposer` — 事实/计算/假设/建议 四级认知分离
- [x] `ExplorationResult` 结构（含 facts/computations/hypotheses/suggestions/followUps）

### 未完成

- [ ] **Validated InquiryPlan Generation（核心缺口）**
  - 当前 `InquiryService` 中 plan 是硬编码的，未使用 LLM 进行查询规划
  - 目标架构要求 QueryPlanner 生成 plan 并验证（仅允许 allow-listed operations）
  - 当前 `intent/analyzer.js` 的 LLM 分析结果未被 InquiryService 使用
- [ ] ModelCallReceipt（模型调用收据）— 目标架构 §7.6 要求记录 provider/model/purpose/recordIds
  - 当前 LLM 调用无收据追踪
- [ ] `AnswerComposer` 的假设生成未对接真实 LLM
  - 当前 hypotheses 是静态模板文本，非模型生成
  - 需要 `composition` 类型的 LLM 调用
- [ ] followUp 的 scope 智能演化逻辑
  - 当前 followUp 的 plan 与 start() 完全相同，未根据 session state 调整
  - 目标架构要求"复用电报、缩窄范围、扩展范围、替换范围"四种策略
- [ ] Citation integrity（引用完整性校验）
  - 目标架构 §15.4 要求"每个引用的 evidence ID 必须存在于 evidence pack 中"
  - 当前缺少此校验
- [ ] 失败回退机制（目标架构 §9.2 step 3：planning 失败 → 安全降级为 exact/semantic 或请求澄清）

### 建议实现优先级

1. **高优**：QueryPlanner — 生成并验证 InquiryPlan（对接 LLM + allow-list 校验）
2. **高优**：followUp scope 智能演化（四种策略：reuse/narrow/extend/replace）
3. **高优**：ModelCallReceipt 全程追踪
4. **中优**：AnswerComposer 接入真实 LLM 生成交互式假设
5. **中优**：Citation integrity 校验
6. **低优**：Planning failure 降级策略

---

## Phase 3: Explore-First Product Experience

### 已完成

- [x] 旧组件基础（AgentWorkbench.vue、ReActPanel.vue、AnalysisPage.vue、Dashboard.vue）

### 未完成

- [ ] `src/renderer/src/features/` 目录结构未创建
- [ ] Explore 屏幕（目标架构 §10.2 要求的对话区 + 证据面板 + 范围显示 + 限制披露 + 追问建议）
- [ ] Journal 管理屏幕（目标架构 §10.3 作为次要屏幕）
- [ ] Reviews 体验（ChroniclePage 重命名为 Reviews 并从 evidence pack 渲染）
- [ ] 证据面板（点击答案引用 → 打开原始记录）
- [ ] 图表从 EvidencePack 渲染（当前 Chart 组件直接调用工具）
- [ ] 假设/限制/事实的 UI 标签区分
- [ ] ToolTester 限制为开发模式隐藏
- [ ] 主工作流可在不打开数据管理/工具测试的情况下完成

### 建议实现优先级

1. **高优**：Explore 屏幕布局 + 证据面板联动
2. **高优**：图表重构为 EvidencePack 消费者
3. **中优**：Reviews 体验从 artifact 渲染
4. **中优**：假设/事实 UI 视觉区分
5. **低优**：ToolTester 隐藏 + 开发模式门控

---

## Phase 4: Shared Reviews and Working MCP

### 已完成

- [x] `ReviewService` — weekly/monthly/yearly 周期性 Review 生成
- [x] `ReviewService` 复用 AnalysisService 核心
- [x] MCP Server 已切换到统一应用服务层
- [x] MCP health/list/search/get/stats/summaries/export 7 大工具均已对接

### 未完成

- [ ] 定时任务调度器（目标架构 §9.4 step 1：scheduler 选择 review recipe）
  - 当前 ReviewService.generate() 需手动调用，无自动调度
- [ ] Review artifact 持久化（目标架构 §7.5 Artifacts repository）
  - 当前生成的 review 仅返回内存对象，未保存为 artifact
- [ ] MCP contract tests（目标架构 §14 Scenario E 要求 desktop 与 MCP 产出等效证据）
- [ ] MCP 打包启动命令和配置文档
- [ ] MCP 不导入 `.mimocode` 运行时代码的验证

### 建议实现优先级

1. **高优**：Review artifact 持久化 + 历史查看
2. **中优**：定时任务调度器
3. **中优**：MCP contract tests（desktop vs MCP 等效性）
4. **低优**：MCP 打包启动文档

---

## Phase 5: Cleanup and Hardening

### 已完成

- 无

### 未完成

- [ ] 移除被替代的 query/rerank/adapter 实现（旧 `tools/` 目录中的重复逻辑）
- [ ] 狭窄 IPC allow-list + 生产安全 Electron 设置
- [ ] 缓存存储在可写用户数据路径下（当前 `vector_db_incremental.json` 在 `src/main/.cache/`）
- [ ] 文档更新以匹配真实隐私和 provider 行为
- [ ] 从主路径移除废弃的通用 AI 客户端功能
- [ ] 所有 migration feature flag 设定 owner 和 removal date

---

## 架构层级完成度汇总

### Domain Layer

| 组件 | 状态 | 文件 |
|------|------|------|
| contracts.js (normalizeJournalRecord) | ✅ 基础完成 | `src/main/domain/contracts.js` |
| Zod runtime schemas | ❌ 缺失 | 需新建 |
| InquirySessionStore | ✅ 骨架完成 | `src/main/domain/inquiry/InquirySessionStore.js` |
| QueryPlanner | ❌ 缺失 | 需新建 |
| EvidencePackBuilder | ⚠️ 部分在 AnalysisService | 需独立为 domain service |

### Application Layer

| 组件 | 状态 | 文件 |
|------|------|------|
| JournalService | ✅ 完成 | `src/main/application/JournalService.js` |
| AnalysisService | ⚠️ 骨架（缺 compare/timeline） | `src/main/application/AnalysisService.js` |
| InquiryService | ⚠️ 骨架（缺 plan validation） | `src/main/application/InquiryService.js` |
| ReviewService | ⚠️ 骨架（缺 调度/持久化） | `src/main/application/ReviewService.js` |
| AnswerComposer | ⚠️ 骨架（缺 LLM 对接） | `src/main/application/AnswerComposer.js` |
| 中央工厂 (getXxxService) | ✅ 完成 | `src/main/application/index.js` |

### Infrastructure Layer

| 组件 | 状态 | 文件 |
|------|------|------|
| JsonJournalRepository | ✅ 完成 | `src/main/infrastructure/persistence/JsonJournalRepository.js` |
| JsonDerivedDataRepository | ❌ 缺失 | 需新建 |
| AlaSqlAnalysisAdapter | ❌ 缺失 | 需新建 |
| LocalVectorSearchAdapter | ❌ 缺失 | 需新建（可从 searchRecords.js 提取） |
| OpenAICompatibleGateway | ❌ 缺失 | 需新建（可从 directOpenAI.js 提取） |

### Adapters Layer

| 组件 | 状态 | 文件 |
|------|------|------|
| IPC adapters (split by use case) | ❌ 缺失 | 需拆分 ipcHandlers.js |
| Scheduled review jobs | ❌ 缺失 | 需新建 |
| MCP adapter | ✅ 已完成切换 | `mcp-server/index.js` |

---

## 关键架构缺口 TOP 5

### 1. QueryPlanner 缺失（阻断 Phase 2）

当前 InquiryService 使用硬编码 plan，无法根据用户问题动态生成和验证操作计划。

**影响**：followUp 无法智能演化 scope；系统无法支持"compared with last year"等复杂追问。

**建议实现**：
```
src/main/domain/inquiry/QueryPlanner.js
  - generatePlan(question, sessionState, llmClient) → InquiryPlan
  - validate(plan) → 仅允许 allow-listed operations
  - reuse/narrow/extend/replace 四种 scope 策略
```

### 2. 向量搜索未融合到 AnalysisService

旧的 `searchRecords.js` 包含完整的 Max-Sim 多粒度切片 + 增量缓存，但 AnalysisService.semanticSearch 仅是关键词降级版。

**影响**：新架构路径下语义检索能力退化。

**建议实现**：
```
src/main/infrastructure/retrieval/LocalVectorSearchAdapter.js
  - 从 searchRecords.js 迁移 embedText / vectorSearch / syncVectorDatabase
  - 实现 AnalysisService 的 vectorSearchAdapter 接口
```

### 3. 旧 IPC 路径未切换到新服务

`agent/ipcHandlers.js` 仍在使用旧 `tools/` 体系（searchRecords Tool, sqlAnalysis Tool 等），新的 InquiryService 未被主 Agent 链路调用。

**影响**：用户实际使用的 Agent 链路与新架构并行存在，维护负担加倍。

**建议实现**：
```
src/main/adapters/ipc/inquiryHandler.js   → InquiryService.start/followUp
src/main/adapters/ipc/journalHandler.js   → JournalService CRUD
src/main/adapters/ipc/reviewHandler.js    → ReviewService.generate
```

### 4. 测试基础设施不可用

测试文件存在但无法通过标准命令运行。无运行时 schema 验证。

**影响**：重构无安全网，回归风险高。

### 5. UI 未重构为 Explore-first

产品形态仍为 developer workbench（AgentWorkbench + ToolTester + DataBoard 并列），非 exploration 体验。

**影响**：与目标架构 §4 产品定位不符。

---

## 推荐执行顺序（基于依赖关系）

```
Step 1: 测试基础设施 [3 天]
  - 添加 vitest.config + test 脚本
  - 添加 Zod schemas 到 domain/contracts.js
  - 让现有 .mimocode 测试可通过 npm test 运行

Step 2: 向量搜索适配器 [3 天]
  - 从 searchRecords.js 提取到 LocalVectorSearchAdapter
  - AnalysisService 接入真实语义搜索
  - 旧 searchRecords.js 改为可选 fallback

Step 3: QueryPlanner + followUp 智能演化 [5 天]
  - 实现 Plan 生成 + allow-list 校验
  - 实现 reuse/narrow/extend/replace 策略
  - InquiryService.followUp 接入 session state

Step 4: IPC 重定向 [3 天]
  - 拆分 ipcHandlers.js 为 per-use-case handlers
  - Agent 主链路切换到 InquiryService
  - Feature flag 控制灰度

Step 5: ModelCallReceipt + AnswerComposer LLM [3 天]
  - 全程追踪 LLM 调用
  - AnswerComposer 对接真实 LLM 生成假设

Step 6: Explore UI [5 天]
  - features/explore/ 目录 + 组件
  - 证据面板 + 范围显示
  - 图表从 EvidencePack 渲染

Step 7: Review 持久化 + 调度 [2 天]
  - Artifact 持久化
  - 定时任务

Step 8: 清理 + 加固 [3 天]
  - 移除重复路径
  - 缓存迁移到 userData
  - IPC allow-list
```

---

> 文档版本：v1.0  
> 最后更新：2026-08-17
