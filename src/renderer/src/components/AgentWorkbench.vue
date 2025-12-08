<template>
  <div class="workbench">
    <div class="workbench-layout">
      <!-- 左侧：对话区 -->
      <div class="chat-section">
        <n-card class="panel">
          <div class="chat-content">
            <div class="messages" ref="messagesRef">
              <div class="bubble agent">
                <div class="bubble-content" v-html="renderMarkdown('请开始对话或调用工具。点击右上角设置按钮进行配置。')"></div>
                <div class="time">{{ formatTime(welcomeTime) }}</div>
              </div>
              <div v-for="(m, i) in messages" :key="i" :class="['bubble', m.sender]">
                <div class="bubble-content" v-html="m.sender === 'agent' ? renderMarkdown(m.content) : m.content" />
                <div class="bubble-footer">
                  <span class="time">{{ formatTime(m.time) }}</span>
                  <!-- 思维记录切换按钮 -->
                  <n-tooltip v-if="m.reactIndex !== undefined" trigger="hover">
                    <template #trigger>
                      <n-button 
                        quaternary 
                        circle 
                        size="tiny" 
                        class="react-btn"
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
import MarkdownIt from 'markdown-it'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '@renderer/config/assistant'
import ReActPanel from './ReActPanel.vue'

// 思维图标
const BrainIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 2a9 9 0 0 0-9 9c0 4.17 2.84 7.67 6.69 8.69L12 22l2.31-2.31C18.16 18.67 21 15.17 21 11a9 9 0 0 0-9-9m0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3s-3-1.34-3-3s1.34-3 3-3"/>' }) }

const messages = ref([])
const input = ref('')
const messagesRef = ref(null)
const welcomeTime = ref(new Date())
const sending = ref(false)

// ReAct 思维链面板状态（常驻显示）
const reactSteps = ref([])

// 历史对话的思维记录缓存（每次对话的思维记录）
const conversationReacts = ref({})

// 初始化MarkdownIt
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

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
  
  // 清空并初始化思维链
  clearReActSteps()
  
  // 推送：用户输入
  addReActStep({ 
    type: 'user_query', 
    action: 'user_query',
    query: text,
    timestamp: new Date().toISOString()
  })
  
  // 推送：加载中
  const loadingStepIndex = reactSteps.value.length
  addReActStep({ 
    type: 'loading', 
    action: 'loading',
    detail: '正在分析并调用工具...',
    timestamp: new Date().toISOString()
  })
  
  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false })
  const sysinfo = `\n【系统信息】当前时间：${nowStr}；时区：UTC+8；语言：中文。`
  const messagesPayload = [
    { role: 'system', content: `${config.prompts.chatSystem}${sysinfo}` },
    { role: 'user', content: text }
  ]

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
    sending.value = false
    return
  }

  // 移除加载状态
  reactSteps.value.splice(loadingStepIndex, 1)

  if (result?.success) {
    // 从后端获取完整的 ReAct 步骤
    const stateSteps = result.data?.state?.steps || []
    console.log('[ReAct] Backend steps:', stateSteps)
    
    // 推送每个 ReAct 迭代步骤
    stateSteps.forEach(step => {
      addReActStep({
        ...step,
        type: step.action, // 使用 action 作为 type
        time: new Date(step.timestamp || Date.now())
      })
    })
    
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
      
      // 流式输出最终答案（关联思维记录索引）
      const streamIndex = messages.value.length
      const finalReactIndex = reactSteps.value.length - 1 // 关联最后一个思维步骤
      messages.value.push({ content: '', sender: 'agent', time: new Date().toISOString(), isStreaming: true, reactIndex: finalReactIndex, conversationId })
      
      await streamMessageContent(streamIndex, finalAnswer)
      messages.value[streamIndex].isStreaming = false
      
      // 保存当前对话的思维记录
      saveCurrentReacts(conversationId)
      
      try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
      await nextTick()
      if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
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
      sending.value = false
      return
    }
    
    const final = synth?.data?.content || synth?.data?.raw?.choices?.[0]?.message?.content
    if (!final) {
      const msg = '模型未生成最终回答'
      messages.value[streamIndex] = { content: msg, sender: 'agent', time: new Date().toISOString() }
      sending.value = false
      return
    }
    
    await streamMessageContent(streamIndex, final)
    messages.value[streamIndex].isStreaming = false
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
    await nextTick()
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
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

// 渲染Markdown内容的函数
function renderMarkdown(content) {
  if (!content) return ''
  return md.render(content)
}

function onEnter() { if (!sending.value) send() }

function formatThoughts(thoughts) {
  if (!thoughts) return ''
  return String(thoughts).replace(/\n/g, '<br>')
}

async function streamMessageContent(index, text) {
  return new Promise((resolve) => {
    const chunkSize = 80
    let cursor = 0
    const timer = setInterval(async () => {
      cursor = Math.min(text.length, cursor + chunkSize)
      messages.value[index].content = text.slice(0, cursor)
      await nextTick(); if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      if (cursor >= text.length) { clearInterval(timer); sending.value = false; resolve(null) }
    }, 60)
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
  padding: 12px;
}

/* --- 4. 气泡 --- */
.bubble {
  max-width: 72%;
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

/* 思维记录按钮 */
.react-btn {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.react-btn:hover {
  opacity: 1;
}

.bubble:hover .react-btn {
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
