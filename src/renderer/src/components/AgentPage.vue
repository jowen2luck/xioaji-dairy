<template>
  <div class="agent-container">
    <n-card class="nav-bar">
      <div class="nav-content">
        <h1 class="nav-title">智能助手</h1>
      </div>
    </n-card>
    
    <div class="container">
      <n-card class="chat-container">
        <template #header>
          <div class="chat-header">
            <h2>智能助手</h2>
            <p>使用自然语言查询和分析您的日记数据</p>
          </div>
        </template>
        
        <div class="trace-container" v-if="traceSteps.length">
          <n-card>
            <div class="trace-step" v-for="(s, i) in traceSteps" :key="i">
              {{ s.title }} · {{ formatTime(s.time) }} — {{ s.detail }}
            </div>
          </n-card>
        </div>
        <div class="chat-messages" ref="chatMessages">
          <n-card class="message agent">
            <div class="message-content">
              您好！我是您的智能助手。我可以帮您：
              <br>• 搜索特定的日记内容
              <br>• 分析您的数据趋势
              <br>• 比较不同项目的表现
              <br>• 提供个性化的洞察和建议
              <br><br>请告诉我您想了解什么？
            </div>
          </n-card>
          
          <n-card 
            v-for="(message, index) in messages" 
            :key="index" 
            :class="['message', message.sender]"
          >
            <div class="message-content" v-html="message.content"></div>
            <div class="message-time">{{ formatTime(message.time) }}</div>
          </n-card>
          
          <n-card v-if="isProcessing" class="message agent">
            <div class="typing-indicator">
              <span class="typing-dots">助手正在思考</span>
            </div>
          </n-card>
        </div>
        
        <template #footer>
          <div class="chat-input-container">
            <n-input-group>
              <n-input 
                v-model:value="inputMessage" 
                placeholder="输入您的问题..." 
                @keypress.enter="sendMessage"
                :disabled="isProcessing"
                size="large"
              />
              <n-button 
                @click="sendMessage" 
                :disabled="isProcessing || !inputMessage.trim()"
                type="primary"
                size="large"
              >
                发送
              </n-button>
            </n-input-group>
          </div>
        </template>
      </n-card>
      
      <n-card class="quick-actions" title="快速操作">
        <n-space vertical :size="12">
          <n-button 
            v-for="action in quickActionsList" 
            :key="action.text"
            @click="quickAction(action.query)"
            quaternary
            size="medium"
          >
            {{ action.text }}
          </n-button>
        </n-space>
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { NCard, NInput, NInputGroup, NButton, NSpace } from 'naive-ui'
import { DEFAULT_CONFIG } from '../config/assistant'

// 状态管理
const messages = ref([])
const inputMessage = ref('')
const isProcessing = ref(false)
const chatMessages = ref(null)

// 工作流轨迹：记录助手每次回复的步骤
const traceSteps = ref([])

// 快速操作列表
const quickActionsList = ref([
  { text: '查看最近一周的记录', query: '最近一周的记录' },
  { text: '分析我的情绪趋势', query: '情绪分析' },
  { text: '项目完成情况统计', query: '项目统计' },
  { text: '记录时间分布分析', query: '时间分布' },
  { text: '查看我的成就', query: '成就统计' },
  { text: '找出最活跃的项目', query: '最活跃的项目' }
])

// 方法
const formatTime = (time) => {
  return time.toLocaleTimeString('zh-CN')
}

const sendMessage = async () => {
  const message = inputMessage.value.trim()
  if (!message || isProcessing.value) return
  
  // 添加用户消息
  messages.value.push({
    content: message,
    sender: 'user',
    time: new Date()
  })
  
  inputMessage.value = ''
  
  // 显示处理状态
  isProcessing.value = true
  
  try {
    // 调用智能助手API
    if (window.electron && window.electron.ipcRenderer) {
      traceSteps.value = []
      traceSteps.value.push({ type: 'think', title: '理解问题', detail: message, time: new Date() })
      
      // 使用新的 assistant:chat 接口
      const result = await window.electron.ipcRenderer.invoke('assistant:chat', {
        userQuery: message,
        messages: [
          {
            role: 'system',
            content: DEFAULT_CONFIG.prompts?.chatSystem || '你是一个专业的日记分析助手，可以帮助用户查询、分析和理解他们的日记数据。请用简洁、友好的方式回答问题。'
          },
          {
            role: 'user',
            content: message
          }
        ],
        model: DEFAULT_CONFIG.selectedModel || 'qwen-plus-2025-09-11',
        baseURL: DEFAULT_CONFIG.selectedBaseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        tools: DEFAULT_CONFIG.enabledTools.map(name => ({ name }))
      })
      
      if (result.success) {
        // 显示工具调用轨迹
        if (result.data.state && result.data.state.steps) {
          result.data.state.steps.forEach(step => {
            if (step.action === 'tool_calls' && step.tools) {
              traceSteps.value.push({ 
                type: 'tool', 
                title: '调用工具', 
                detail: step.tools.join(', '), 
                time: new Date() 
              })
            }
          })
        }
        
        // 显示 LLM 生成的回复（已经是自然语言）
        messages.value.push({
          content: result.data.content || '抱歉，我无法生成回复。',
          sender: 'agent',
          time: new Date()
        })
        traceSteps.value.push({ type: 'result', title: '生成回复', detail: '完成', time: new Date() })
      } else {
        messages.value.push({
          content: `抱歉，处理您的请求时出现了错误：${result.error?.message || result.error}`,
          sender: 'agent',
          time: new Date()
        })
      }
    } else {
      console.error('Electron API not available')
    }
  } catch (error) {
    messages.value.push({
      content: `抱歉，处理您的请求时出现了错误：${error.message}`,
      sender: 'agent',
      time: new Date()
    })
  } finally {
    isProcessing.value = false
    // 滚动到底部
    await nextTick()
    if (chatMessages.value) {
      chatMessages.value.scrollTop = chatMessages.value.scrollHeight
    }
  }
}

const quickAction = (query) => {
  inputMessage.value = query
  sendMessage()
}
</script>

<style scoped>
.agent-container {
  height: 100%;
  width: 100%;
}

.nav-bar {
  margin-bottom: 24px;
}

.nav-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-title {
  color: white;
  font-size: 24px;
  font-weight: bold;
}

.container {
  width: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.chat-container {
  overflow: hidden;
  margin-bottom: 20px;
}

.chat-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: var(--color-text); padding: 20px; text-align: center; }

.chat-header h2 {
  margin: 0;
  font-size: 24px;
}

.chat-header p {
  margin: 10px 0 0 0;
  opacity: 0.9;
  font-size: 14px;
}

.chat-messages { height: 400px; overflow-y: auto; padding: 20px; background-color: var(--color-card-bg); }

.message {
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.message.user {
  align-items: flex-end;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.4;
  word-wrap: break-word;
}

.message.user .message-content {
  color: white;
}

.message.agent .message-content { color: var(--color-text); border: 1px solid var(--color-border); }

.message-time {
  font-size: 11px;
  color: #999;
  margin-top: 5px;
}

.chat-input-container { padding: 20px; background: var(--color-card-bg); border-top: 1px solid var(--color-border); }



.chat-input {
  flex: 1;
  font-size: 16px;
}

.chat-input:focus {
  border-color: #667eea;
}

.chat-input:disabled {
  opacity: 0.6;
}



.send-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}



.typing-indicator {
  padding: 12px 16px;
  background: white;
  border-radius: 18px;
  border: 1px solid #e0e0e0;
  font-size: 14px;
  color: #666;
}

.typing-dots::after {
  content: '';
  animation: typing 1.5s infinite;
}

@keyframes typing {
  0% { content: '.'; }
  33% { content: '..'; }
  66% { content: '...'; }
  100% { content: '.'; }
}
.message.user .message-content { background: var(--color-button-primary); }

/* 工作流路径显示 */
.trace-container { margin-bottom: 12px; }
.trace-step { font-size: 12px; color: var(--color-text); border-left: 3px solid var(--color-border); padding-left: 8px; margin-bottom: 6px; }
</style>