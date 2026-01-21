<template>
  <div class="workbench">
    <div class="workbench-layout">
      <!-- 左侧：对话区 -->
      <div class="chat-section">
        <n-card class="panel">
          <div class="chat-content">
            <div class="messages" ref="messagesRef" :class="{ 'visible': isLayoutReady }">
              <div class="bubble agent">
                <div class="bubble-content">
                  <MarkdownRenderer content="请开始对话或调用工具。点击右上角设置按钮进行配置。" />
                </div>
                <div class="time">{{ formatTime(welcomeTime) }}</div>
              </div>
              <div v-for="(m, i) in messages" :key="i" :class="['bubble', m.sender]">
                <div class="bubble-content">
                  <MarkdownRenderer v-if="m.sender === 'agent'" :content="m.content" />
                  <div v-else v-html="m.content"></div>
                </div>
                <div class="bubble-footer">
                  <span class="time">{{ formatTime(m.time) }}</span>
                  <div class="bubble-actions">
                    <!-- 复制按钮 -->
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <n-button 
                          quaternary 
                          circle 
                          size="tiny" 
                          class="action-btn"
                          @click="copyToClipboard(m.content)"
                        >
                          <template #icon>
                            <n-icon size="14"><CopyIcon /></n-icon>
                          </template>
                        </n-button>
                      </template>
                      复制
                    </n-tooltip>
                    <!-- 思维记录切换按钮 -->
                    <n-tooltip v-if="m.reactIndex !== undefined" trigger="hover">
                      <template #trigger>
                        <n-button 
                          quaternary 
                          circle 
                          size="tiny" 
                          class="action-btn"
                          @click="scrollToReactStep(m.reactIndex, m.conversationId)"
                        >
                          <template #icon>
                            <n-icon size="14"><BrainIcon /></n-icon>
                          </template>
                        </n-button>
                      </template>
                      查看思维记录
                    </n-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <n-input-group>
              <n-input v-model:value="input" :disabled="sending" placeholder="输入问题或工具指令..." size="large" @keypress.enter="onEnter" />
              <n-button type="primary" size="large" :loading="sending" :disabled="sending" @click="send">发送</n-button>
            </n-input-group>
          </template>
        </n-card>
      </div>

      <!-- 右侧：思维记录面板（常驻） -->
      <div class="sidebar-section">
        <ReActPanel :steps="reactSteps" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed, h } from 'vue'
import { useMessage } from 'naive-ui'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '@renderer/config/assistant'
import ReActPanel from './ReActPanel.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const message = useMessage()

// 思维图标
const BrainIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 2a9 9 0 0 0-9 9c0 4.17 2.84 7.67 6.69 8.69L12 22l2.31-2.31C18.16 18.67 21 15.17 21 11a9 9 0 0 0-9-9m0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3s-3-1.34-3-3s1.34-3 3-3"/>' }) }

// 复制图标
const CopyIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H9V4h10v12zM5 6H3v14c0 1.1.9 2 2 2h14v-2H5V6z"/>' }) }

const messages = ref([])
const input = ref('')
const messagesRef = ref(null)
const welcomeTime = ref(new Date())
const sending = ref(false)

// ReAct 思维链面板状态（常驻显示）
const reactSteps = ref([])

// 历史对话的思维记录缓存（每次对话的思维记录）
const conversationReacts = ref({})

// 布局就绪状态 - 用于控制透明度，实现无闪烁滚动
const isLayoutReady = ref(false)

// 自动滚动到底部
const scrollToBottom = async (smooth = false) => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// 从全局设置加载配置
const c0 = loadConfig()
const enabledTools = ref(c0.enabledTools || ['search_records', 'query_records', 'sql_analysis'])
const TOOL_LABELS = { 
  search_records: '检索记录',
  query_records: '查询记录',
  sql_analysis: 'SQL 分析'
}

// 滚动到指定的思维步骤（支持切换历史对话）
const scrollToReactStep = (stepIndex, conversationId) => {
  // 如果指定了对话ID，先切换思维记录
  if (conversationId && conversationReacts.value[conversationId]) {
    reactSteps.value = conversationReacts.value[conversationId]
  }
  // 发送事件通知 ReActPanel 展开指定步骤
  const event = new CustomEvent('expand-react-step', { detail: { stepIndex } })
  window.dispatchEvent(event)
}

// 添加思维步骤到面板
const addReActStep = (step) => {
  reactSteps.value.push({
    ...step,
    time: new Date()
  })
}

// 清空思维步骤
const clearReActSteps = () => {
  reactSteps.value = []
}

// 保存当前对话的思维记录
const saveCurrentReacts = (conversationId) => {
  if (conversationId && reactSteps.value.length > 0) {
    conversationReacts.value[conversationId] = [...reactSteps.value]
    // 持久化到 localStorage
    try {
      localStorage.setItem('assistant-reacts', JSON.stringify(conversationReacts.value))
    } catch (e) {
      console.error('保存思维记录失败', e)
    }
  }
}

// 监听全局设置更新
const handleSettingsUpdate = (event) => {
  const { assistant } = event.detail || {}
  if (assistant) {
    enabledTools.value = assistant.enabledTools || enabledTools.value
  }
}

onMounted(async () => {
  // 监听设置更新事件
  window.addEventListener('settings-updated', handleSettingsUpdate)
  
  // 加载历史会话
  try {
    const raw = localStorage.getItem('assistant-conversation')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) messages.value = parsed
    }
  } catch (e) {
    console.error('加载历史会话失败', e)
  }
  
  // 加载历史思维记录
  try {
    const reactsRaw = localStorage.getItem('assistant-reacts')
    if (reactsRaw) {
      const parsed = JSON.parse(reactsRaw)
      if (parsed && typeof parsed === 'object') {
        conversationReacts.value = parsed
      }
    }
  } catch (e) {
    console.error('加载思维记录失败', e)
  }
  
  // 【无闪烁滚动方案】
  // 1. 等待 DOM 渲染完成
  await nextTick()
  
  // 2. 瞬间滚动到底部（无动画，用户看不到）
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
  
  // 3. 使用 requestAnimationFrame 确保在下一帧渲染时才显示内容
  // 避免用户看到滚动跳跃过程
  requestAnimationFrame(() => {
    isLayoutReady.value = true
  })
})

const formatTime = (t) => {
  try {
    const d = t instanceof Date ? t : new Date(t)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('zh-CN')
  } catch { return '' }
}

async function send() {
  if (sending.value) return
  const text = input.value.trim()
  if (!text) return

  // 从全局配置加载
  const config = loadConfig()

  console.log('[send] input', text)
  sending.value = true
  
  // 生成对话ID
  const conversationId = `conv_${Date.now()}`
  
  messages.value.push({ content: text, sender: 'user', time: new Date().toISOString(), reactIndex: 0, conversationId })
  input.value = ''
  await scrollToBottom()
  
  // 清空并初始化思维链
  clearReActSteps()
  
  // 推送：用户输入
  addReActStep({ 
    type: 'user_query', 
    action: 'user_query',
    query: text,
    timestamp: new Date().toISOString()
  })
  
  // 推送:加载中(思考状态)
  const loadingStepIndex = reactSteps.value.length
  addReActStep({ 
    type: 'loading', 
    action: 'loading',
    detail: '正在思考',
    timestamp: new Date().toISOString()
  })
  
  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false })
  const sysinfo = `\n【系统信息】当前时间：${nowStr}；时区：UTC+8；语言：中文。`
  
  // 【改进】构建完整的消息历史，包括之前的对话
  const messagesPayload = [
    { role: 'system', content: `${config.prompts.chatSystem}${sysinfo}` }
  ]
  
  // 添加排除初始欢迎信息的历史消息
  messages.value.forEach(msg => {
    messagesPayload.push({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    })
  })
  
  // 添加当前消息
  messagesPayload.push({
    role: 'user',
    content: text
  })
  
  console.log('[AgentWorkbench] Sending message history with', messagesPayload.length, 'messages')

  const tools = enabledTools.value.map(name => ({ type: 'function', function: { name } }))
  console.log('[send] enabledTools', enabledTools.value)
  
  let result
  try {
    let requestConfig = { 
      messages: messagesPayload, 
      model: config.selectedModel, 
      baseURL: config.selectedBaseURL, 
      tools, 
      userQuery: text,
      config: { 
        temperature: config.temperature, 
        top_p: config.top_p 
      },
      mock: false,
      intentModel: config.intentModel
    }
    console.log('[assistant:chat] request', requestConfig)
    
    // 【改进】模拟流式步骤推送 - 启动轮询检查后端日志(简化版:直接等待结果)
    result = await window.assistant?.chat?.(requestConfig)
    console.log('[assistant:chat] result', result)
  } catch (e) {
    console.log('[assistant:chat] exception', e)
    // 移除加载状态，推送错误
    reactSteps.value.splice(loadingStepIndex, 1)
    addReActStep({ 
      type: 'error', 
      action: 'error',
      reasoning: `调用异常：${e?.message || '未知错误'}`,
      timestamp: new Date().toISOString()
    })
    const errDetail = escapeHTML(JSON.stringify({ name: e?.name, message: e?.message }, null, 2))
    messages.value.push({ content: `<pre>${errDetail}</pre>`, sender: 'agent', time: new Date().toISOString() })
    await scrollToBottom()
    sending.value = false
    return
  }

  // 移除加载状态
  reactSteps.value.splice(loadingStepIndex, 1)

  if (result?.success) {
    // 从后端获取完整的 ReAct 步骤
    const stateSteps = result.data?.state?.steps || []
    console.log('[ReAct] Backend steps:', stateSteps)
    
    // 【改进】逐步推送 ReAct 迭代步骤,模拟实时显示
    for (let i = 0; i < stateSteps.length; i++) {
      const step = stateSteps[i]
      addReActStep({
        ...step,
        type: step.action,
        time: new Date(step.timestamp || Date.now())
      })
      
      // 每个步骤之间添加短暂延迟,增强实时感
      if (i < stateSteps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    }
    
    // 获取最终答案
    const finalAnswer = result.data?.content
    
    if (finalAnswer) {
      console.log('[ReAct] Final answer received, length:', finalAnswer.length)
      
      // 添加最终答案步骤到思维链
      addReActStep({
        type: 'final_answer',
        action: 'final_answer',
        reasoning: '已根据工具结果生成最终回复',
        timestamp: new Date().toISOString()
      })
      
      // 【改进】流式输出最终答案(关联思维记录索引)
      const streamIndex = messages.value.length
      const finalReactIndex = reactSteps.value.length - 1 // 关联最后一个思维步骤
      messages.value.push({ content: '', sender: 'agent', time: new Date().toISOString(), isStreaming: true, reactIndex: finalReactIndex, conversationId })
      
      // 增加流式打字速度,提升体验
      await streamMessageContent(streamIndex, finalAnswer, 40, 50) // 更快的速度
      messages.value[streamIndex].isStreaming = false
      
      // 保存当前对话的思维记录
      saveCurrentReacts(conversationId)
      
      try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
      await scrollToBottom()
      sending.value = false
      return
    }
    
    // 向后兼容：如果没有 finalAnswer 但有工具结果
    const toolSteps = stateSteps.filter(step => step.action === 'tool_calls')
    const allToolResults = []
    toolSteps.forEach(step => {
      if (step.results && Array.isArray(step.results)) {
        allToolResults.push(...step.results)
      }
    })
    
    if (allToolResults.length === 0) {
      const msg = '未执行任何工具或未返回结果。'
      addReActStep({ 
        type: 'error', 
        action: 'error',
        reasoning: msg,
        timestamp: new Date().toISOString()
      })
      messages.value.push({ content: msg, sender: 'agent', time: new Date().toISOString() })
      await scrollToBottom()
      sending.value = false
      return
    }
    
    // 旧模式：需要手动综合工具结果
    const toolPayload = allToolResults.map(t => ({ name: t.name, result: t.result }))
    const synthMessages = [
      { role: 'system', content: `${config.prompts.chatSystem}${sysinfo}。请基于下列工具输出，按照系统提示词回答用户的问题。` },
      { role: 'user', content: `用户问题：${text}\n工具输出：\n${JSON.stringify(toolPayload, null, 2)}` }
    ]
    const streamIndex = messages.value.length
    messages.value.push({ content: '', sender: 'agent', time: new Date().toISOString(), isStreaming: true })
    
    let synth
    try {
      synth = await window.assistant?.chat?.({
        messages: synthMessages,
        model: config.selectedModel,
        baseURL: config.selectedBaseURL,
        tools: [],
        userQuery: '',
        config: { temperature: config.temperature, top_p: config.top_p },
        mock: false,
        intentModel: config.intentModel,
        disableTools: true
      })
    } catch (e) {
    const msg = `生成阶段失败：${e?.message || '未知错误'}`
      messages.value[streamIndex] = { content: msg, sender: 'agent', time: new Date().toISOString() }
      await scrollToBottom()
      sending.value = false
      return
    }
    
    const final = synth?.data?.content || synth?.data?.raw?.choices?.[0]?.message?.content
    if (!final) {
      const msg = '模型未生成最终回答'
      messages.value[streamIndex] = { content: msg, sender: 'agent', time: new Date().toISOString() }
      await scrollToBottom()
      sending.value = false
      return
    }
    
    await streamMessageContent(streamIndex, final, 40, 50)
    messages.value[streamIndex].isStreaming = false
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
    await scrollToBottom()
  } else {
    const errDetail = escapeHTML(JSON.stringify(result || {}, null, 2))
    addReActStep({ 
      type: 'error', 
      action: 'error',
      reasoning: `调用失败：${result?.error?.message || '未知错误'}`,
      timestamp: new Date().toISOString()
    })
    messages.value.push({ content: `<pre>${errDetail}</pre>`, sender: 'agent', time: new Date().toISOString() })
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
    await scrollToBottom()
  }
  
  sending.value = false
}

async function invoke(name) {
  clearReActSteps()
  addReActStep({ type: 'tool_calls', action: 'tool_calls', tools: [{ name }], timestamp: new Date().toISOString() })
  const res = await window.assistant?.invokeTool?.(name, {})
  if (res?.success) {
    addReActStep({ 
      type: 'tool_calls', 
      action: 'tool_calls', 
      reasoning: '工具调用完成',
      results: [{ name, result: res.data, success: true }],
      timestamp: new Date().toISOString()
    })
    messages.value.push({ content: '工具调用完成', sender: 'agent', time: new Date() })
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
  } else {
    addReActStep({ type: 'error', action: 'error', reasoning: `失败：${res?.error}`, timestamp: new Date().toISOString() })
    messages.value.push({ content: `失败：${res?.error}`, sender: 'agent', time: new Date() })
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
  }
}

function escapeHTML(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) }

// 复制到剪贴板
const copyToClipboard = async (content) => {
  try {
    // 移除 HTML 标签，提取纯文本
    const div = document.createElement('div')
    div.innerHTML = content
    const plainText = div.textContent || div.innerText || ''
    
    // 使用 Clipboard API 复制
    await navigator.clipboard.writeText(plainText)
    console.log('已复制到剪贴板')
    message.success('已复制到剪贴板')
  } catch (err) {
    console.error('复制失败:', err)
    // 降级方案：使用 execCommand
    try {
      const textarea = document.createElement('textarea')
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      console.log('已复制到剪贴板（降级方案）')
      message.success('已复制到剪贴板')
    } catch (fallbackErr) {
      console.error('复制失败（降级方案也失败）:', fallbackErr)
      message.error('复制失败，请重试')
    }
  }
}

function onEnter() { if (!sending.value) send() }

function formatThoughts(thoughts) {
  if (!thoughts) return ''
  return String(thoughts).replace(/\n/g, '<br>')
}

/**
 * 流式渲染消息内容
 * @param {number} index - 消息索引
 * @param {string} text - 完整文本
 * @param {number} chunkSize - 每次渲染的字符数
 * @param {number} interval - 渲染间隔(毫秒)
 */
async function streamMessageContent(index, text, chunkSize = 80, interval = 60) {
  return new Promise((resolve) => {
    let cursor = 0
    const timer = setInterval(async () => {
      cursor = Math.min(text.length, cursor + chunkSize)
      messages.value[index].content = text.slice(0, cursor)
      await scrollToBottom()
      if (cursor >= text.length) { clearInterval(timer); resolve(null) }
    }, interval)
  })
}
</script>

<style scoped>
/* --- 1. 整体布局容器 --- */
.workbench {
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workbench-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

/* 左侧对话区 */
.chat-section {
  flex: 1;
  min-width: 0;
}

/* 右侧思维记录面板（常驻） */
.sidebar-section {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- 2. 卡片样式 --- */
.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-card-bg);
  overflow: hidden;
}

:deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  padding: 4px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

:deep(.n-card__footer) {
  flex-shrink: 0;
}

/* --- 3. 聊天结构 --- */
.chat-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  /* 无闪烁滚动方案 - 默认隐藏 */
  opacity: 0;
  transition: opacity 0.2s ease-in;
}

.messages.visible {
  /* 布局就绪后显示 */
  opacity: 1;
}

/* --- 4. 气泡 --- */
.bubble {
  max-width: 80%;
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  position: relative;
}

.bubble.agent {
  background: var(--color-bubble-agent);
  color: #2f3b52;
  border-top-left-radius: 4px;
}

.bubble.user {
  background: var(--color-bubble-user);
  color: #0b3419;
  margin-left: auto;
  border-top-right-radius: 4px;
}

.bubble-content {
  word-break: break-word;
  color: var(--color-text);
}

.time {
  font-size: 11px;
  opacity: 0.7;
  color: var(--color-text);
}

/* 气泡底部 */
.bubble-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  gap: 8px;
}

/* 气泡操作按钮组 */
.bubble-actions {
  display: flex;
  gap: 4px;
}

/* 操作按钮 */
.action-btn {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.action-btn:hover {
  opacity: 1;
}

.bubble:hover .action-btn {
  opacity: 0.8;
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .sidebar-section {
    width: 300px;
  }
}

@media (max-width: 768px) {
  .workbench-layout {
    flex-direction: column;
  }
  
  .sidebar-section {
    width: 100%;
    height: 250px;
  }
}
</style>
