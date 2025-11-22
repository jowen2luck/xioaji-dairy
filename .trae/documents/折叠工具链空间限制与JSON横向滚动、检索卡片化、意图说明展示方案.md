## 目标
- 展开后的工具链区域设定固定最大高度与双向滚动，不遮挡后续消息。
- JSON 与表格内容支持横向滚动，避免竖向无限拉长。
- 检索结果采用首页卡片样式（项目标签、时间、持续时间、文本），在工具链折叠中卡片化展示。
- 在意图分析步骤中显示模型给出的“语句说明/理由文本”。

## 具体改动
- 样式限制与滚动
  - 为工具链折叠内的内容容器设置 `max-height: 320px; overflow: auto;`；子块 `trace-block` 设置 `overflow: auto` 以支持横向滚动。
  - 为 `<pre class="tool-result">` 增加 `white-space: pre; overflow: auto;` 实现水平滚动；对象/表格容器包一层 div 设 `overflow: auto`。
- JSON/表格横向滚动
  - 在 `viewOf(s)` 为数组对象时，`n-data-table` 外包裹 `.trace-table-wrap` 容器，样式 `overflow: auto; max-height: 280px;` 提供横向与纵向滚动。
  - 对象视图使用 `n-descriptions` 外层包裹 `.trace-desc-wrap` 设 `overflow: auto;`。
- 检索结果卡片化
  - 针对 `toolName === 'search_records'` 的步骤：
    - 若结果为数组对象，使用 `n-grid` + `n-card hoverable`，卡片内部结构参考 `src/renderer/src/components/Dashboard.vue`（`n-tag` 项目、`n-time` 时间、`n-text` 持续、`n-p` 感受）。
    - 默认展示前 12 条，并提供“展开更多/收起”按钮；容器依旧受 `max-height` 限制。
- 意图说明展示
  - 在第一次模型调用结果中提取说明文本：优先使用 `result.data.debug.intentText || result.data.intentText || result.data.raw.choices[0].message.content`；
  - 在 `steps` 中的 `type: 'intent'` 结果追加 `reasonText` 并在折叠中渲染一段说明区域。

## 代码位置
- `src/renderer/src/components/AgentWorkbench.vue`
  - 渲染折叠：在 agent 气泡内部折叠框中，为不同视图类型加容器包裹与滚动样式；`search_records` 专用卡片渲染逻辑；在“意图建议”步骤渲染 `reasonText`。
  - 样式：新增 `.trace-wrap`, `.trace-block`, `.trace-table-wrap`, `.trace-desc-wrap`, `.tool-result` 的滚动与白空设置。
- 保持已实现的 `jsonView.ts/templates.ts`，仅在渲染层增加容器与判断。

## 验证
- 触发检索：折叠区域卡片化展示，纵向受限可滚动，横向溢出可滚动；点击“展开更多”查看更多。
- 大对象/长行 JSON：`pre` 与表格可横向滚动；整体不遮挡下一条消息。
- 意图分析：在“意图建议”折叠项下方显示模型的说明文本。

## 交付
- 修改上述文件并启动开发环境进行验证，确保热重载生效与交互顺畅；如有样式冲突进行微调。请确认后我立即实施。