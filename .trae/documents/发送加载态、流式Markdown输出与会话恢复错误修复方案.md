## 目标
- 发送按钮与输入框在请求进行中显示加载态并禁用，避免重复触发。
- 实现流式输出样式（逐字/逐段更新），且在更新过程中即时进行 Markdown 解析与渲染。
- 修复页面切换后会话丢失与 `toLocaleTimeString is not a function` 错误，保证历史消息正常恢复与时间显示稳定。

## 改动点
- 加载与禁用
  - 在 `AgentWorkbench.vue` 新增 `sending` 状态；`n-button` 绑定 `:loading="sending" :disabled="sending"`，输入框 `:disabled="sending"`。
  - `send()` 开头 `if (sending.value) return`；在主调用与二次生成阶段设置 `sending.value = true`，在 `finally`/所有分支末尾统一 `sending.value = false`。
  - 阻止回车重复触发：`@keypress.enter="!sending && send()"` 或函数内防抖。

- 流式输出（两种实现，自动降级）
  1) 无后端流支持时的前端渐进渲染：
     - 在进入“二次生成”阶段先插入一条 agent 消息 `isStreaming=true, content=''`。
     - 生成完成后将完整文本按句/段拆分，使用 `setInterval/throttle` 逐段写入 `content`，每次增量调用 `md.render(partial)`。
     - 完成后标记 `isStreaming=false`，保留最终 Markdown。
  2) 有后端流支持（建议接口）：
     - 在 `preload` 暴露 `assistant.chatStream(payload)`，主进程通过提供方的流（SSE/WebSocket/SDK streaming）转发 `assistant:stream-chunk` 与 `assistant:stream-end`。
     - 组件监听 `window.assistant.onChunk`（或通过 `ipcRenderer.on`）逐次追加文本，节流渲染 Markdown；结束时合并全文并写入 `toolTrace`。
  - 两者均保持现有两阶段流程（工具→二次生成），流式仅作用于“二次生成”阶段输出。

- Markdown 渲染
  - 复用已有 `markdown-it`；新增 `renderMarkdownStream(text)`（内部节流），避免高频 re-render 卡顿。
  - 在 agent 气泡中，如果 `isStreaming` 为真，展示“正在生成…”提示与骨架；否则展示最终 Markdown。

- 会话恢复与时间格式错误修复
  - `formatTime` 改为健壮版本：`function formatTime(t){ const d = (t instanceof Date) ? t : new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString('zh-CN') }`。
  - 在 `onMounted` 加载 `assistant-conversation` 后，统一将 `time` 转换为 ISO 字符串或保留原始但按上述函数渲染；保存时将 `time` 存为 `Date.toISOString()` 保证跨页恢复。
  - 校验恢复结构：若消息对象缺失字段（如 `sender`/`content`），进行过滤或补全，避免 render 警告与异常。

- 体验与样式
  - 在发送按钮右侧加微型 `n-spin` 或按钮自带 loading；输入框在 `sending` 时禁用且显示占位“正在生成…”。
  - 流式渲染过程使用轻量节流（例如 100ms/次），保证顺畅且不阻塞。

## 验证
- 多次点击“发送”时只以第一次为准，按钮与输入框进入加载态。
- 在无流后端情况下，回答逐段出现且 Markdown（代码块、列表）正常渲染；有流后端时按 token/段落即刻展示。
- 切换 Tab 后返回，历史消息仍在；不再出现 `toLocaleTimeString` 异常；控制台无渲染错误警告。

## 交付
- 更新上述组件逻辑与样式，若你同意也可扩展 `preload/main` 流式接口；完成后我将运行并验证交互与错误修复。