## 待解决问题
- 右上角主题切换占位大：需要改为 `NSwitch` 并加太阳/月亮图标。
- 页面过高导致输入框常在屏幕下方：需要控制卡片内部高度与滚动，保证输入区始终可见。
- 工具链展示分散：将“意图识别标签+已启用工具标签+工具结果面板”合并为统一的步骤列表，每步包含名称与结果。
- 绿色工具标题重复显示：统一展示方式，避免同名在多个区域重复呈现。

## 方案概述
- 使用 Naive UI 的 `NSwitch`（配合 `@vicons/ionicons5` 的太阳/月亮图标）替换双按钮主题切换。
- 为聊天列建立固定高度的分区：顶部“工具步骤”固定高，下面“消息气泡”固定高滚动，卡片底部输入区可视。
- 合并工具链：构造 `steps = [{ type: 'intent', name, result }, { type: 'tool', name, result }, ...]`，用 `n-collapse` 或 `n-list` 统一展示，每步显示中文名与简要结果，点击可展开 JSON 详情。
- 去重展示：取消单独的“已启用工具”标签与“工具结果面板”标题，统一在 `steps` 中展示，杜绝重复。

## 具体改动
- 主题切换
  - 文件：`src/renderer/src/components/ThemeSwitcher.vue`
  - 替换为：`<n-switch v-model:value="isDark" size="medium"><template #checked>🌙 深色</template><template #unchecked>☀️ 浅色</template></n-switch>`
  - 逻辑：`isDark` 改变时调用 `setTheme(isDark ? 'dark' : 'light')`；初始化读取 `getCurrentTheme()`。
  - 可选：使用 `MoonOutline`/`SunnyOutline` 图标（`@vicons/ionicons5`）美化。

- 布局与高度
  - 文件：`src/renderer/src/components/AgentWorkbench.vue`
  - 在聊天卡片内部建立三段：
    - `工具步骤区`：高度固定如 `180px`，`overflow: auto`。
    - `消息区`：高度固定如 `420px`，`overflow: auto`，使用微信绿气泡（已有基础，颜色 `#95ec69`）。
    - `输入区`：卡片 `footer` 保持可见，不被上方区域撑出屏幕。
  - 样式：通过 `.tool-steps { height: 180px; overflow: auto }` 与 `.messages { height: 420px; overflow: auto }` 控制滚动，外层不再拉长页面。

- 合并工具链展示
  - 文件：`src/renderer/src/components/AgentWorkbench.vue`
  - 状态：新增 `steps` 数组，用中文工具名映射（沿用 `TOOL_LABELS`）。
  - 赋值：
    - 意图返回时 push `{ type: 'intent', name: labels.join('、'), result: null }`
    - 工具调用后将每个 `toolResults` push `{ type: 'tool', name: 中文名, result: tr.result }`
  - 展示：用 `n-list` 或 `n-collapse`（更紧凑）渲染每个步骤：
    - 标题：`step.name`（绿色主题）
    - 详情：`<pre>` 展示 JSON 摘要（截断长文本）
  - 去重：移除现有“已启用工具标签”和“工具结果面板”，只保留 `steps`。

- 同步与稳定性
  - 工具勾选同步：保留对 `enabledTools` 的监听，将其用于构造 `tools` 参数并在 `steps` 内只显示调用的工具结果，避免与勾选标签重复。
  - 消息闪烁：欢迎时间使用固定 `welcomeTime`；消息区滚动只在新消息 push 后触发，减少不必要重绘。

## 交互与视觉
- 主题切换为紧凑 `NSwitch`，右上角占位显著缩小。
- 工具与结果合并为一个清晰的时间线/折叠列表，用户无需在多个区域查找。
- 聊天输入始终可见，不需要下滑才能看到。

## 修改范围与文件
- `src/renderer/src/components/ThemeSwitcher.vue`（主题切换 UI 与逻辑）
- `src/renderer/src/components/AgentWorkbench.vue`（聊天列结构、步骤列表、样式调整、状态与赋值逻辑）
- 如需细化主题变量可扩展 `src/renderer/src/utils/theme.js`（保持现有即可）。

确认后我将按以上步骤实施，保证无布局重复与闪烁，并让工具链与结果统一、可读。