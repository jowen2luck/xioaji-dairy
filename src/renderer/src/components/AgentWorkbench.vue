<template>
  <div class="workbench">
    <n-grid cols="1 s:1 m:3 l:3" responsive="screen" :x-gap="12" :y-gap="12">
      <n-grid-item :span="2">
        <n-card class="panel">
          <div class="chat-content">
            <div class="messages" ref="messagesRef">
              <div class="bubble agent">
                <div class="bubble-content" v-html="renderMarkdown('请在右侧选择模型与配置，然后开始对话或调用工具。')"></div>
                <div class="time">{{ formatTime(welcomeTime) }}</div>
              </div>
              <div v-for="(m, i) in messages" :key="i" :class="['bubble', m.sender]">
                <template v-if="m.sender === 'agent' && m.toolTrace && m.toolTrace.length">
                  <n-collapse>
                    <n-collapse-item :title="toolTraceTitle(m.toolTrace)">
                      <div class="trace-wrap">
                        <div v-for="(s, idx) in m.toolTrace" :key="idx" class="trace-block">
                          <div class="trace-title">{{ s.name }}</div>
                          <!-- 意图说明文本 -->
                          <div v-if="s.type === 'intent' && s.result && s.result.text">
                            <n-p>{{ s.result.text }}</n-p>
                          </div>
                          <!-- 检索结果卡片化展示 -->
                          <template v-else-if="s.type === 'tool' && s.toolName === 'search_records' && viewOf(s).kind === 'array'">
                            <div class="trace-table-wrap">
                              <n-grid cols="1 s:1 m:2 l:3 xl:4" responsive="screen" :x-gap="12" :y-gap="12">
                                <n-grid-item v-for="(item, i2) in viewOf(s).rows.slice(0, 12)" :key="i2">
                                  <n-card hoverable>
                                    <n-space vertical>
                                      <n-space justify="space-between">
                                        <n-tag type="info">{{ item.shanggexiangmu || '未分类' }}</n-tag>
                                        <n-time :time="new Date(item.time)" v-if="item.time" />
                                      </n-space>
                                      <n-text depth="secondary">持续时间: {{ item.chixushijian || '-' }}</n-text>
                                      <n-p v-html="formatThoughts(item.ganshou)"></n-p>
                                    </n-space>
                                  </n-card>
                                </n-grid-item>
                              </n-grid>
                            </div>
                          </template>
                          <!-- 通用对象视图 -->
                          <div v-else-if="viewOf(s).kind === 'object'" class="trace-desc-wrap">
                            <n-descriptions label-placement="left" bordered size="small">
                              <n-descriptions-item v-for="item in (viewOf(s).items)" :key="item.key" :label="item.label">
                                <span class="kv">{{ formatValue(item.value) }}</span>
                              </n-descriptions-item>
                            </n-descriptions>
                          </div>
                          <!-- 通用数组表格视图 -->
                          <div v-else-if="viewOf(s).kind === 'array'" class="trace-table-wrap">
                            <n-data-table :columns="columnsOf(viewOf(s))" :data="viewOf(s).rows" size="small" :bordered="true" />
                          </div>
                          <!-- 文本视图 -->
                          <div v-else>
                            <pre class="tool-result">{{ viewOf(s).text }}</pre>
                          </div>
                        </div>
                      </div>
                    </n-collapse-item>
                  </n-collapse>
                </template>
                <div class="bubble-content" v-html="m.sender === 'agent' ? renderMarkdown(m.content) : m.content" />
                <div class="time">{{ formatTime(m.time) }}</div>
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
      </n-grid-item>
      <n-grid-item :span="1">
        <n-card class="panel" title="配置">
          <n-form label-placement="top">
            <n-form-item label="模型">
              <n-select v-model:value="config.model" :options="modelOptions" />
            </n-form-item>
            <n-form-item label="推理点 Base URL">
              <n-select v-model:value="config.selectedBaseURL" :options="baseURLOptions" />
            </n-form-item>
            <n-form-item label="模型">
              <n-select v-model:value="config.selectedModel" :options="currentModels" />
            </n-form-item>
            <n-form-item label="系统提示词">
              <n-input type="textarea" v-model:value="config.systemPrompt" placeholder="描述助手角色、可用工具、输出格式" />
            </n-form-item>
            <n-form-item label="意图识别模型">
              <n-select v-model:value="config.intentModel" :options="currentModels" />
            </n-form-item>
            <n-form-item label="温度">
              <n-input-number v-model:value="config.temperature" :min="0" :max="2" :step="0.1" />
            </n-form-item>
            <n-form-item label="Top P">
              <n-input-number v-model:value="config.top_p" :min="0" :max="1" :step="0.05" />
            </n-form-item>
            <n-form-item label="启用工具">
              <n-checkbox-group v-model:value="enabledTools">
                <n-checkbox value="search_records">检索记录</n-checkbox>
              </n-checkbox-group>
            </n-form-item>
            <n-space>
              <n-button @click="invoke('search_records')">检索记录</n-button>
            </n-space>
          </n-form>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { NGrid, NGridItem, NCard, NForm, NFormItem, NSelect, NInput, NInputNumber, NInputGroup, NButton, NCheckbox, NCheckboxGroup, NSpace, NTag, NCollapse, NCollapseItem, NDescriptions, NDescriptionsItem, NDataTable, NTime, NText, NP } from 'naive-ui'
import MarkdownIt from 'markdown-it'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '@renderer/config/assistant'
import { toView } from '@renderer/utils/jsonView'

const messages = ref([])
const input = ref('')
const messagesRef = ref(null)
const traceSteps = ref([])
const welcomeTime = ref(new Date())
const expandedStepNames = ref([])
const allStepsExpanded = ref(false)
const sending = ref(false)

// 初始化MarkdownIt
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})


const c0 = loadConfig()
const config = ref({
  selectedBaseURL: c0.selectedBaseURL,
  selectedModel: c0.selectedModel,
  systemPrompt: c0.prompts.chatSystem,
  temperature: c0.temperature,
  top_p: c0.top_p,
  useMock: false,
  intentModel: c0.intentModel
})

// 监听配置变化并保存到本地存储
watch(() => config.value.selectedModel, (newModel) => {
  saveConfig({ selectedModel: newModel })
})

watch(() => config.value.selectedBaseURL, (newBaseURL) => {
  saveConfig({ selectedBaseURL: newBaseURL })
})

watch(() => config.value.systemPrompt, (newPrompt) => {
  saveConfig({ prompts: { chatSystem: newPrompt } })
})

watch(() => config.value.temperature, (newTemp) => {
  saveConfig({ temperature: newTemp })
})

watch(() => config.value.top_p, (newTopP) => {
  saveConfig({ top_p: newTopP })
})

watch(() => config.value.useMock, (val) => {
  /* mock flag ignored */
})

watch(() => config.value.intentModel, (val) => {
  saveConfig({ intentModel: val })
})

const modelOptions = ref([])

const baseURLOptions = computed(() => {
  return DEFAULT_CONFIG.baseURLs.map(entry => ({
    label: entry.url,
    value: entry.url
  }))
})

const currentModels = computed(() => {
  const selectedEntry = DEFAULT_CONFIG.baseURLs.find(entry => entry.url === config.value.selectedBaseURL)
  return (selectedEntry?.models || []).map(model => ({
    label: model,
    value: model
  }))
})

// 根据用户要求，只默认启用检索记录工具
const enabledTools = ref(['search_records'])
const TOOL_LABELS = { search_records: '检索记录' }
const intentTags = ref([])
const steps = ref([])

onMounted(async () => {
  // 强制关闭模拟，以真实工作流为准
  config.value.useMock = false
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

  console.log('[send] input', text)
  sending.value = true
  messages.value.push({ content: text, sender: 'user', time: new Date().toISOString() })
  input.value = ''
  traceSteps.value = []
  steps.value = []
  steps.value.push({ type: 'think', name: `理解问题：${text}`, result: { query: text } })
  traceSteps.value.push({ type: 'think', title: '理解问题', detail: text, time: new Date() })

  // 执行意图分析
  console.log('[intent] analyzing start')
  traceSteps.value.push({ type: 'intent', title: '意图分析', detail: '正在分析用户意图...', time: new Date() })
  
  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false })
  const sysinfo = `\n【系统信息】当前时间：${nowStr}；时区：UTC+8；语言：中文。`
  const messagesPayload = [
    { role: 'system', content: `${config.value.systemPrompt}${sysinfo}` },
    { role: 'user', content: text }
  ]
  console.log('[send] messagesPayload', messagesPayload)

  const tools = enabledTools.value.map(name => ({ type: 'function', function: { name } }))
  console.log('[send] enabledTools', enabledTools.value)
  let result
  try {
    let requestConfig={ 
      messages: messagesPayload, 
      model: config.value.selectedModel, 
      baseURL: config.value.selectedBaseURL, 
      tools, 
      userQuery: text,
      config: { 
        temperature: config.value.temperature, 
        top_p: config.value.top_p 
      },
      mock: config.value.useMock,
      intentModel: config.value.intentModel
    }
    console.log('[assistant:chat] request', requestConfig)
    result = await window.assistant?.chat?.(requestConfig)
    console.log('[assistant:chat] result', result)
  } catch (e) {
    const errDetail = escapeHTML(JSON.stringify({ name: e?.name, message: e?.message, stack: e?.stack }, null, 2))
    console.log('[assistant:chat] exception', e)
    steps.value.push({ type: 'error', name: '调用异常', result: { name: e?.name, message: e?.message } })
    messages.value.push({ content: `<pre>${errDetail}</pre>`, sender: 'agent', time: new Date().toISOString() })
    sending.value = false
    return
  }

  if (result?.success) {
    
    if (Array.isArray(result.data?.intentTools)) {
      const labels = result.data.intentTools.map(n => TOOL_LABELS[n] || n)
      console.log('[intent] tools', result.data.intentTools)
      intentTags.value = labels
      steps.value.push({ type: 'intent', name: `意图建议：${labels.join('、')}`, result: { tools: labels } })
      traceSteps.value.push({ type: 'intent', title: '意图分析结果', detail: `建议使用工具: ${labels.join('、')}` , time: new Date() })
    }
    // 意图说明文本（模型返回的语句）
    const intentReason = result?.data?.debug?.intentText || result?.data?.intentText || result?.data?.raw?.choices?.[0]?.message?.content
    if (intentReason) {
      steps.value.push({ type: 'intent', name: '意图说明', result: { text: intentReason } })
    }
    const debugInfo = result.data?.debug ? JSON.stringify(result.data.debug, null, 2) : null
    if (debugInfo) {
      console.log('[debug]', result.data.debug)
      steps.value.push({ type: 'debug', name: '调试信息', result: JSON.parse(debugInfo) })
      const extracted = result.data?.debug?.extracted
      console.log('[think] extracted', extracted)
      if (extracted) steps.value.push({ type: 'think', name: '理解问题（解析结果）', result: extracted })
    }
    const called = (result.data.toolResults || []).map(t => ({ name: TOOL_LABELS[t.name] || t.name, toolName: t.name, res: t.result }))
    console.log('[tools] results', result.data.toolResults)
    called.forEach(c => steps.value.push({ type: 'tool', name: c.name, toolName: c.toolName, result: c.res }))
    traceSteps.value.push({ type: 'tool', title: '调用工具', detail: called.map(c => c.name).join('、') || '无' , time: new Date() })
    const hasToolOutput = called.length > 0
    if (!hasToolOutput) {
      const msg = '未执行任何工具或未返回结果，已停止生成。'
      console.log('[flow] stop', msg)
      steps.value.push({ type: 'error', name: '流程中止', result: { message: msg } })
      messages.value.push({ content: msg, sender: 'agent', time: new Date().toISOString() })
      await nextTick(); if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      sending.value = false
      return
    }
    const toolPayload = result.data.toolResults.map(t => ({ name: t.name, result: t.result }))
    const synthMessages = [
      { role: 'system', content: `${config.value.systemPrompt}${sysinfo}。请基于下列工具输出，按照系统提示词回答用户的问题。` },
      { role: 'user', content: `用户问题：${text}\n工具输出：\n${JSON.stringify(toolPayload, null, 2)}` }
    ]
    const streamIndex = messages.value.length
    messages.value.push({ content: '', sender: 'agent', time: new Date().toISOString(), isStreaming: true })
    console.log('[synthesis] messages', synthMessages)
    let synth
    try {
      synth = await window.assistant?.chat?.({
        messages: synthMessages,
        model: config.value.model,
        baseURL: config.value.baseURL,
        tools: [],
        userQuery: '',
        config: { temperature: config.value.temperature, top_p: config.value.top_p },
        mock: false,
        intentModel: config.value.intentModel,
        disableTools: true
      })
      console.log('[synthesis] result', synth)
    } catch (e) {
      const msg = `生成阶段失败：${e?.message || '未知错误'}`
      steps.value.push({ type: 'error', name: '生成失败', result: { message: msg } })
      messages.value[streamIndex] = { content: msg, sender: 'agent', time: new Date().toISOString() }
      await nextTick(); if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      sending.value = false
      return
    }
    const final = synth?.data?.raw?.choices?.[0]?.message?.content
    console.log('[synthesis] content', final)
    if (!final) {
      const msg = '模型未生成最终回答'
      steps.value.push({ type: 'error', name: '生成为空', result: { message: msg } })
      messages.value[streamIndex] = { content: msg, sender: 'agent', time: new Date().toISOString() }
      await nextTick(); if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      sending.value = false
      return
    }
    const trace = [...steps.value]
    trace.push({ type: 'final', name: '生成回复', result: final })
    await streamMessageContent(streamIndex, final)
    messages.value[streamIndex].isStreaming = false
    messages.value[streamIndex].toolTrace = trace
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
    steps.value = []
    await nextTick(); if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    traceSteps.value.push({ type: 'result', title: '生成回复', detail: '完成', time: new Date() })
  } else {
    const errDetail = escapeHTML(JSON.stringify(result || {}, null, 2))
    console.log('[assistant:chat] failed', result)
    steps.value.push({ type: 'error', name: '调用失败', result: result || {} })
    messages.value.push({ content: `<pre>${errDetail}</pre>`, sender: 'agent', time: new Date().toISOString() })
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
    sending.value = false
  }
}

async function invoke(name) {
  traceSteps.value = []
  traceSteps.value.push({ type: 'tool', title: '直接调用工具', detail: name, time: new Date() })
  const res = await window.assistant?.invokeTool?.(name, {})
  if (res?.success) {
    const trace = [{ type: 'tool', name: `直接调用：${name}`, toolName: name, result: res.data }]
    messages.value.push({ content: '工具调用完成', sender: 'agent', time: new Date(), toolTrace: trace })
    try { localStorage.setItem('assistant-conversation', JSON.stringify(messages.value)) } catch {}
  } else {
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

function toolTraceTitle(trace) {
  const tools = trace.filter(t => t.type === 'tool').map(t => t.name)
  const uniq = Array.from(new Set(tools))
  return `工具链（${uniq.join('、') || '无'}）`
}

function viewOf(step) {
  if (!step) return { kind: 'text', text: '' }
  const name = step.toolName || undefined
  return toView(step.result, name)
}

function columnsOf(view) {
  return (view.columns || []).map(k => ({ title: k, key: k }))
}

function formatValue(v) {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

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

// 切换所有步骤的展开/收缩状态
function toggleAllSteps() {
  if (allStepsExpanded.value) {
    // 收起所有
    expandedStepNames.value = []
  } else {
    // 展开所有
    expandedStepNames.value = steps.value.map((_, i) => i)
  }
  allStepsExpanded.value = !allStepsExpanded.value
}

// 监听展开状态变化
watch(expandedStepNames, (newVal) => {
  allStepsExpanded.value = newVal.length === steps.value.length
})
</script>

<style scoped>
/* --- 1. 整体布局容器 --- */
.workbench {
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 让 grid 自己决定高度，不强制 100%（你的 bug 来源之一） */
::v-deep() .n-grid {
  flex: 1;
  min-height: 0;
}

/* --- 2. 左右两侧的卡片都占满高度 --- */
.panel {
  height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-card-bg);
  overflow: hidden;
}

/* 修复配置页按钮错乱的关键点：保持内容正常流动 */
::v-deep() .n-card__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

/* 页脚保持正常 */
::v-deep() .n-card__footer {
  flex-shrink: 0;
}

/* --- 3. 聊天结构 --- */
.chat-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 可滚动区域（唯一允许滚动的地方） */
.messages {
  flex: 1;
  min-height: 0;
  /* max-height: calc(900vh - 360px); */
  overflow-y: auto;
  padding: 12px;
}

/* --- 4. 工具步骤区域 --- */
.tool-steps { display: none; }

.tool-steps-header { 
  margin-bottom: 8px; 
  text-align: right; 
}

.tool-result {
  margin: 0;
  font-size: 12px;
  background: var(--color-background-soft);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px;
  overflow: auto;
  white-space: pre;
  max-height: 200px;
}

.trace-wrap { max-height: 320px; overflow: auto; }
.trace-table-wrap { max-height: 280px; overflow: auto; }
.trace-desc-wrap { max-height: 280px; overflow: auto; }

/* --- 5. 气泡 --- */
.bubble {
  max-width: 72%;
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
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

.kv { white-space: break-spaces; }

.time {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 4px;
  color: var(--color-text);
}
.trace-block { margin-bottom: 8px; }
.trace-title { font-weight: 600; margin-bottom: 6px; }
</style>
