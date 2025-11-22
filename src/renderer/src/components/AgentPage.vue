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
      const result = await window.electron.ipcRenderer.invoke('intelligent-query', message)
      
      if (result.success) {
        traceSteps.value.push({ type: 'tool', title: '查询数据', detail: result.data.type, time: new Date() })
        // 格式化响应
        const formattedResponse = formatResponse(result.data)
        messages.value.push({
          content: formattedResponse,
          sender: 'agent',
          time: new Date()
        })
        traceSteps.value.push({ type: 'result', title: '生成回复', detail: '完成', time: new Date() })
      } else {
        messages.value.push({
          content: `抱歉，处理您的请求时出现了错误：${result.error}`,
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

const formatResponse = (data) => {
  let response = ''
  
  switch (data.type) {
    case 'search':
      response = formatSearchResults(data.results)
      break
    case 'statistics':
      response = formatStatistics(data.statistics)
      break
    case 'comparison':
      response = formatComparison(data.comparison)
      break
    case 'trend':
      response = formatTrend(data.trend)
      break
    case 'error':
      response = data.message
      break
    default:
      response = '我理解您的请求，但暂时无法提供相关信息。'
  }
  
  if (data.suggestions && data.suggestions.length > 0) {
    response += '<br><br><strong>建议：</strong><br>'
    response += data.suggestions.map(s => `• ${s}`).join('<br>')
  }
  
  return response
}

const formatSearchResults = (results) => {
  if (!results || results.length === 0) {
    return '没有找到符合条件的记录。'
  }
  
  let response = `找到 <strong>${results.length}</strong> 条记录：<br><br>`
  
  results.slice(0, 5).forEach(result => {
    response += `<strong>${result.time ? new Date(result.time).toLocaleDateString('zh-CN') : '未知日期'}</strong> - ${result.shanggexiangmu || '无项目'}<br>`
    response += `感想：${result.ganshou || '无'}<br>`
    if (result.chengjiu) {
      response += `成就：已完成<br>`
    }
    response += '<br>'
  })
  
  if (results.length > 5) {
    response += `... 还有 ${results.length - 5} 条记录。`
  }
  
  return response
}

const formatStatistics = (statistics) => {
  let response = '<strong>统计结果：</strong><br><br>'
  
  if (statistics.total !== undefined) {
    response += `总记录数：${statistics.total}<br>`
  }
  
  if (statistics.avgDuration !== undefined) {
    response += `平均时长：${statistics.avgDuration}<br>`
  }
  
  if (statistics.projects) {
    response += '<br><strong>项目统计：</strong><br>'
    Object.entries(statistics.projects).forEach(([project, stats]) => {
      response += `• ${project}：${stats}条记录<br>`
    })
  }
  
  if (statistics.emotions) {
    response += '<br><strong>情绪统计：</strong><br>'
    Object.entries(statistics.emotions).forEach(([emotion, count]) => {
      response += `• ${emotion}：${count}次<br>`
    })
  }
  
  if (statistics.achievements) {
    response += `<br><strong>成就统计：</strong><br>• 完成成就：${statistics.achievements}项<br>`
  }
  
  return response
}

const formatComparison = (comparison) => {
  let response = '<strong>对比分析：</strong><br><br>'
  
  if (comparison && typeof comparison === 'object') {
    Object.entries(comparison).forEach(([project, data]) => {
      response += `• ${project}：${data.count}条记录`
      if (data.avgDuration) {
        response += `，平均时长${Math.round(data.avgDuration)}分钟`
      }
      if (data.achievements !== undefined) {
        response += `，成就${data.achievements}项`
      }
      response += '<br>'
    })
  } else {
    response += '暂无比较数据。'
  }
  
  return response
}

const formatTrend = (trend) => {
  let response = '<strong>趋势分析：</strong><br><br>'
  
  if (trend && typeof trend === 'object') {
    if (Object.keys(trend).length > 0) {
      Object.entries(trend).forEach(([key, data]) => {
        response += `<strong>${key}趋势：</strong><br>`
        if (Array.isArray(data)) {
          data.forEach(item => {
            response += `• ${item.date || item.month || '未知时间'}：${item.count}条记录<br>`
          })
        } else if (typeof data === 'object') {
          Object.entries(data).forEach(([time, count]) => {
            response += `• ${time}：${count}条记录<br>`
          })
        }
        response += '<br>'
      })
    } else {
      response += '暂无趋势数据。'
    }
  } else {
    response += '暂无趋势数据。'
  }
  
  return response
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