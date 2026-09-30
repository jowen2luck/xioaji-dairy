<template>
  <div class="react-panel">
    <div class="panel-header">
      <div class="panel-header-left">
        <n-icon size="15" color="var(--accent-gold)"><SparklesIcon /></n-icon>
        <span class="panel-header-title">思维链</span>
        <span v-if="steps.length > 0" class="step-count-badge">{{ steps.length }}</span>
      </div>
      <div class="panel-header-actions">
        <n-tooltip trigger="hover" placement="left">
          <template #trigger>
            <n-button quaternary circle size="tiny" class="close-btn" @click="$emit('close')">
              <template #icon><n-icon size="13"><CloseIcon /></n-icon></template>
            </n-button>
          </template>
          收起面板
        </n-tooltip>
      </div>
    </div>
    
    <!-- 空状态 -->
    <div v-if="steps.length === 0" class="empty-state">
      <n-empty description="等待对话开始..." size="small">
        <template #icon>
          <n-icon size="40" color="var(--color-text-secondary)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </n-icon>
        </template>
        <template #extra>
          <n-text depth="3" style="font-size: 12px;">
            发送消息后，这里会实时展示 AI 的推理过程
          </n-text>
        </template>
      </n-empty>
    </div>
    
    <!-- ReAct 步骤手风琴布局 -->
    <!-- ReAct 步骤手风琴布局（极简扁平流式） -->
    <div v-else class="steps-container">
      <n-collapse 
        v-model:expanded-names="expandedNamesArray" 
        accordion
        class="react-collapse"
      >
        <n-collapse-item 
          v-for="(step, idx) in steps" 
          :key="idx"
          :name="idx"
          :class="['step-item', `step-${step.action || step.type}`]"
        >
          <!-- 极简手风琴标题（轻量微标 + 简明动作 + 弱化时间） -->
          <template #header>
            <div class="step-header">
              <span class="step-indicator" :class="`indicator-${step.action || step.type}`">
                <n-icon size="13" v-if="step.action === 'tool_calls' || step.type === 'tool_calls'"><ToolIcon /></n-icon>
                <n-icon size="13" v-else-if="step.action === 'final_answer'"><CheckIcon /></n-icon>
                <n-icon size="13" v-else-if="step.type === 'user_query'"><UserIcon /></n-icon>
                <n-icon size="13" v-else><SparklesIcon /></n-icon>
              </span>
              <span class="step-type-badge">{{ getStepLabel(step) }}</span>
              <span class="step-title" :title="getStepTitle(step)">{{ getStepTitle(step) }}</span>
              <span class="step-time">{{ formatTime(step.timestamp || step.time) }}</span>
            </div>
          </template>
          
          <!-- 步骤内容：扁平流式排版，去除多层嵌套框 -->
          <div class="step-content">
            <!-- 深度思考内容 (CoT) - 优雅引文线 -->
            <div v-if="step.reasoning_content" class="flow-reasoning deep">
              <div class="reasoning-meta">
                <n-icon size="12"><ThinkIcon /></n-icon>
                <span>深度思考推理</span>
              </div>
              <div class="flow-text">{{ step.reasoning_content }}</div>
            </div>
            
            <!-- 思考过程（无显式 CoT 时的轻量思考） -->
            <div 
              v-else-if="step.reasoning && !isPlaceholderReasoning(step.reasoning)" 
              class="flow-reasoning"
            >
              <div class="flow-text">{{ step.reasoning }}</div>
            </div>
            
            <!-- 用户问题（极简预览） -->
            <div v-if="step.type === 'user_query'" class="flow-query">
              <div class="query-bubble">{{ step.query }}</div>
            </div>
            
            <!-- 工具调用（单行紧凑胶囊） -->
            <div v-if="step.tools && step.tools.length > 0" class="flow-tools">
              <div v-for="(tool, ti) in step.tools" :key="ti" class="tool-chip">
                <div class="tool-chip-bar">
                  <span class="chip-icon">⚡</span>
                  <span class="chip-name">{{ getToolLabel(tool.name || tool) }}</span>
                  <span v-if="getToolBriefArg(tool.args)" class="chip-arg-preview" :title="getToolBriefArg(tool.args)">
                    {{ getToolBriefArg(tool.args) }}
                  </span>
                  <button 
                    v-if="tool.args && Object.keys(tool.args).length > 0" 
                    type="button"
                    class="chip-toggle-btn"
                    @click.stop="toggleToolArgs(idx, ti)"
                  >
                    {{ isToolArgsOpen(idx, ti) ? '收起' : '参数' }}
                  </button>
                </div>
                <div v-if="isToolArgsOpen(idx, ti)" class="tool-chip-details">
                  <n-code :code="formatJSON(tool.args)" language="json" :word-wrap="true" />
                </div>
              </div>
            </div>
            
            <!-- 工具结果（轻量状态与摘要） -->
            <div v-if="step.results && step.results.length > 0" class="flow-results">
              <div v-for="(result, ri) in step.results" :key="ri" class="result-row">
                <div class="result-status-bar">
                  <span class="status-icon" :class="{ ok: result.success, err: !result.success }">
                    {{ result.success ? '✓' : '✗' }}
                  </span>
                  <span class="result-tool-name">{{ getToolLabel(result.name) }}</span>
                  <span class="result-brief" v-if="getRecordCount(result.result) > 0">
                    返回 {{ getRecordCount(result.result) }} 条记录
                  </span>
                  <button 
                    v-if="result.result && !hasRecords(result.result)" 
                    type="button"
                    class="result-detail-btn"
                    @click.stop="toggleRawResult(idx, ri)"
                  >
                    {{ isRawResultOpen(idx, ri) ? '收起' : '详情' }}
                  </button>
                </div>
                
                <!-- 检索记录横滑展示（卡片微型化、扁平化） -->
                <div v-if="hasRecords(result.result)" class="records-compact-container">
                  <div class="records-compact-track">
                    <div 
                      v-for="(record, rci) in getRecords(result.result).slice(0, 8)" 
                      :key="rci" 
                      class="mini-record-card"
                    >
                      <div class="mini-card-header">
                        <span class="record-type-badge">{{ record.shanggexiangmu || '日记' }}</span>
                        <span class="record-date">{{ formatRecordTime(record.time) }}</span>
                      </div>
                      <div class="mini-card-body" v-html="formatGanshou(record.ganshou || record.content)"></div>
                    </div>
                  </div>
                  <div v-if="getRecordCount(result.result) > 8" class="more-hint-clean">
                    共 {{ getRecordCount(result.result) }} 条记录
                  </div>
                </div>

                <!-- 原始结果展开 -->
                <div v-if="isRawResultOpen(idx, ri)" class="raw-data-box">
                  <n-code :code="formatJSON(result.result)" language="json" :word-wrap="true" />
                </div>
              </div>
            </div>
            
            <!-- 最终答案标识 -->
            <div v-if="step.action === 'final_answer' && !step.reasoning_content" class="final-badge-clean">
              <n-icon size="13" color="#18a058"><CheckIcon /></n-icon>
              <span>推理结束，已生成最终回答</span>
            </div>
            
            <!-- 加载中动画 -->
            <div v-if="step.type === 'loading'" class="loading-state-clean">
              <span class="loading-label">{{ step.detail || '正在思考' }}</span>
              <span class="loading-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </span>
            </div>
          </div>
        </n-collapse-item>
      </n-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed, h, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  steps: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close'])

// 当前展开的步骤索引
const activeStep = ref(null)

// 展开的步骤名称数组（用于 v-model 绑定）
const expandedNamesArray = computed({
  get: () => activeStep.value !== null ? [activeStep.value] : [],
  set: (val) => { activeStep.value = val?.[0] ?? null }
})

// 监听 steps 变化，自动展开最后一个
watch(() => props.steps.length, (newLen) => {
  if (newLen > 0) {
    activeStep.value = newLen - 1
  }
}, { immediate: true })

// 监听外部事件，展开指定步骤
const handleExpandStep = (event) => {
  const { stepIndex } = event.detail || {}
  if (typeof stepIndex === 'number' && stepIndex >= 0 && stepIndex < props.steps.length) {
    activeStep.value = stepIndex
    // 滚动到对应位置
    nextTick(() => {
      const container = document.querySelector('.steps-container')
      const target = container?.querySelectorAll('.n-collapse-item')?.[stepIndex]
      if (target && container) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }
}

onMounted(() => {
  window.addEventListener('expand-react-step', handleExpandStep)
})

onUnmounted(() => {
  window.removeEventListener('expand-react-step', handleExpandStep)
})

// 工具名称映射
const TOOL_LABELS = {
  create_record: '新建日记',
  update_record: '更新日记',
  delete_record: '删除日记',
  search_records: '综合检索 (双路+重排)',
  query_records: '条件筛选 (属性过滤)',
  sql_analysis: '统计分析',
  calendar_resolver: '日期推算',
  metadata_explorer: '元数据探索',
  insight_analyst: '洞察分析',
  get_record_detail: '查看详情'
}

const getToolLabel = (name) => TOOL_LABELS[name] || name

// 图标组件
const ThinkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 2L9.5 8.5L3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5zm6.5 14.5l-1.5 3.5l-3.5 1.5l3.5 1.5l1.5 3.5l1.5-3.5l3.5-1.5l-3.5-1.5z"/>' }) }
const SparklesIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>' }) }
const CloseIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"/>' }) }
const UserIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 4a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"/>' }) }
const ToolIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9c-2-2-5-2.4-7.4-1.3L9 6L6 9L1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4"/>' }) }
const ResultIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H5V5h14zm-7-2h2v-4h4v-2h-4V7h-2v4H8v2h4z"/>' }) }
const CheckIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10s10-4.5 10-10S17.5 2 12 2m-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8z"/>' }) }
const TimeIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10s10-4.5 10-10S17.5 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m.5-13H11v6l5.25 3.15l.75-1.23l-4.5-2.67z"/>' }) }

// 格式化感受内容（HTML化）
const formatGanshou = (text) => {
  if (!text) return ''
  return String(text).replace(/\n/g, '<br>').slice(0, 300)
}

// 获取标签类型
const getTagType = (step) => {
  const action = step.action || step.type
  const types = {
    user_query: 'info',
    thinking: 'info',
    tool_calls: 'warning',
    final_answer: 'success',
    loading: 'default',
    error: 'error'
  }
  return types[action] || 'default'
}

// 控制工具参数展开状态
const openToolArgs = ref({})
const toggleToolArgs = (stepIdx, toolIdx) => {
  const key = `${stepIdx}_${toolIdx}`
  openToolArgs.value[key] = !openToolArgs.value[key]
}
const isToolArgsOpen = (stepIdx, toolIdx) => {
  return !!openToolArgs.value[`${stepIdx}_${toolIdx}`]
}

// 控制原始结果展开状态
const openRawResults = ref({})
const toggleRawResult = (stepIdx, resIdx) => {
  const key = `${stepIdx}_${resIdx}`
  openRawResults.value[key] = !openRawResults.value[key]
}
const isRawResultOpen = (stepIdx, resIdx) => {
  return !!openRawResults.value[`${stepIdx}_${resIdx}`]
}

// 提取工具核心入参简短预览
const getToolBriefArg = (args) => {
  if (!args || typeof args !== 'object') return ''
  if (args.query) return `"${truncate(args.query, 16)}"`
  if (args.date) return `日期: ${args.date}`
  if (args.sql) return `SQL: "${truncate(args.sql, 16)}"`
  if (args.field) return `字段: ${args.field}`
  const keys = Object.keys(args)
  if (keys.length > 0) {
    const firstKey = keys[0]
    return `${firstKey}: ${truncate(String(args[firstKey]), 14)}`
  }
  return ''
}

// 获取步骤轻量微标标签
const getStepLabel = (step) => {
  const action = step.action || step.type
  const labels = {
    user_query: '提问',
    thinking: '思考',
    tool_calls: '工具',
    final_answer: '完成',
    loading: '进行中',
    error: '错误'
  }
  return labels[action] || '步骤'
}

// 获取步骤标题
const getStepTitle = (step) => {
  const action = step.action || step.type
  
  if (action === 'user_query') {
    return truncate(step.query, 40)
  }
  
  if (action === 'tool_calls' && step.tools) {
    const toolNames = step.tools.map(t => getToolLabel(t.name || t)).join('、')
    return `调用工具: ${toolNames}`
  }
  
  if (action === 'thinking' && step.tools) {
    const toolNames = step.tools.map(t => getToolLabel(t.name || t)).join('、')
    return `规划工具: ${toolNames}`
  }

  if (action === 'final_answer') {
    return '生成最终回复'
  }
  
  if (action === 'loading') {
    return step.detail || '正在处理...'
  }
  
  return step.title || '思考中...'
}

// 格式化时间
const formatTime = (time) => {
  if (!time) return ''
  try {
    const d = time instanceof Date ? time : new Date(time)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

// 格式化记录时间
const formatRecordTime = (time) => {
  if (!time) return ''
  try {
    const d = new Date(time)
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}

// 格式化 JSON
const formatJSON = (obj) => {
  if (!obj) return ''
  try {
    const str = JSON.stringify(obj, null, 2)
    return str.length > 500 ? str.slice(0, 500) + '\n...' : str
  } catch {
    return String(obj)
  }
}

// 截断文本
const truncate = (text, len) => {
  if (!text) return ''
  const str = String(text)
  return str.length > len ? str.slice(0, len) + '...' : str
}

// 判定是否为占位思考文本（避免在面板中展示冗余无意义文字）
const isPlaceholderReasoning = (text) => {
  if (!text) return true
  const trimmed = String(text).trim()
  return (
    trimmed === '已生成最终回复' ||
    trimmed === '已生成最终答案' ||
    trimmed === '思考中...' ||
    trimmed === '已完成' ||
    trimmed === '(无显式推理)'
  )
}

// 检查是否有记录（支持多层嵌套格式）
const hasRecords = (result) => {
  if (!result) return false
  // 直接是数组
  if (Array.isArray(result) && result.length > 0) return true
  // result.records
  if (result.records && Array.isArray(result.records) && result.records.length > 0) return true
  // result.data.records（嵌套格式，如 search_records 工具）
  if (result.data?.records && Array.isArray(result.data.records) && result.data.records.length > 0) return true
  // result.data 是数组
  if (result.data && Array.isArray(result.data) && result.data.length > 0 && !result.data?.analysisType) return true
  return false
}

// 获取记录列表
const getRecords = (result) => {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (result.records && Array.isArray(result.records)) return result.records
  if (result.data?.records && Array.isArray(result.data.records)) return result.data.records
  if (result.data && Array.isArray(result.data) && !result.data?.analysisType) return result.data
  return []
}

// 获取记录数量
const getRecordCount = (result) => {
  return getRecords(result).length
}

// 检查是否为 SQL 分析结果
const isSqlAnalysis = (result) => {
  if (!result) return false
  // 检查 toolName 或 data.analysisType
  return result.toolName === 'sql_analysis' || result.data?.analysisType
}

// 检查 SQL 分析是否有数据
const hasSqlData = (result) => {
  const data = result?.data?.data
  return data && Array.isArray(data) && data.length > 0
}

// 获取 SQL 分析的记录数
const getSqlRecordCount = (result) => {
  return result?.data?.recordCount || 0
}

// 获取 SQL 分析的 AI 增强数
const getSqlAiCount = (result) => {
  return result?.data?.aiEnhancedCount || 0
}

// 检查是否为 metadata_explorer 结果
const isMetadataExplorer = (result) => {
  if (!result) return false
  // 检查 toolName 或者 data 中的字段
  return result.toolName === 'metadata_explorer' || 
         (result.data?.field && Array.isArray(result.data?.metadata))
}

// 检查 metadata_explorer 是否有数据
const hasMetadataData = (result) => {
  // 数据在 data 字段中
  const data = result.toolName === 'metadata_explorer' ? result.data : result
  return data?.metadata && Array.isArray(data.metadata) && data.metadata.length > 0
}

// 检查是否为 insight_analyst 结果
const isInsightAnalyst = (result) => {
  if (!result) return false
  // 检查 toolName 或者 data 中的 analysisType
  return result.toolName === 'insight_analyst' || 
         (result.data?.analysisType !== undefined)
}

// 检查 insight_analyst 是否有数据
const hasInsightData = (result) => {
  // 数据在 data 字段中
  const data = result.toolName === 'insight_analyst' ? result.data : result
  // insight_analyst 即使 data.data 为空对象，也可能有 insight 和统计信息
  return data && (data.insight || data.recordCount > 0)
}

// metadata_explorer 数据访问辅助函数
const getMetadataField = (result) => {
  const data = result.toolName === 'metadata_explorer' ? result.data : result
  return data?.field || ''
}

const getMetadataTotal = (result) => {
  const data = result.toolName === 'metadata_explorer' ? result.data : result
  return data?.total || 0
}

const getMetadataReturned = (result) => {
  const data = result.toolName === 'metadata_explorer' ? result.data : result
  return data?.returned || 0
}

const getMetadataHasMore = (result) => {
  const data = result.toolName === 'metadata_explorer' ? result.data : result
  return data?.hasMore || false
}

const getMetadataItems = (result) => {
  const data = result.toolName === 'metadata_explorer' ? result.data : result
  return data?.metadata || []
}

// insight_analyst 数据访问辅助函数
const getInsightSummary = (result) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.insight || ''
}

const getInsightRecordCount = (result) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.recordCount || 0
}

const getInsightAiCoverage = (result) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.aiCoverage || 0
}

const getInsightData = (result) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.data || {}
}

// 检查是否为 emotion_energy_correlation 分析
const isEmotionEnergyAnalysis = (result) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.analysisType === 'emotion_energy_correlation'
}

// 获取情绪能量值
const getEmotionEnergy = (result, emotionType) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  const value = data?.[emotionType]
  return value !== null && value !== undefined ? value : '-'
}

// 获取情绪样本数
const getEmotionCount = (result, emotionType) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.counts?.[emotionType] || 0
}

// 获取情绪标准差
const getEmotionStdDev = (result, emotionType) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.stats?.[emotionType]?.stdDev ?? null
}

// 计算能量条宽度（相对于 10 分满分）
const getEnergyBarWidth = (result, emotionType) => {
  const value = getEmotionEnergy(result, emotionType)
  if (value === '-') return '0%'
  return `${(parseFloat(value) / 10) * 100}%`
}

// 获取质量指标
const getQualityMetric = (result, metricName) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.quality?.[metricName] || 0
}

// 获取显著性级别
const getComparisonSignificance = (result) => {
  const data = result.toolName === 'insight_analyst' ? result.data : result
  return data?.comparison?.significance || null
}

// 显著性标签文本
const getSignificanceLabel = (result) => {
  const sig = getComparisonSignificance(result)
  const labels = { high: '高', medium: '中', low: '低' }
  return labels[sig] || '-'
}

// 显著性标签类型
const getSignificanceTagType = (result) => {
  const sig = getComparisonSignificance(result)
  const types = { high: 'success', medium: 'warning', low: 'default' }
  return types[sig] || 'default'
}
</script>

<style scoped>
.react-panel {
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-parchment, #1b1b1f);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08));
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.08));
  background: var(--bg-parchment-soft, #222226);
  flex-shrink: 0;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-header-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-charcoal, var(--color-text));
}

.step-count-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--bg-parchment-mute, rgba(255, 255, 255, 0.08));
  color: var(--text-muted, rgba(200, 190, 170, 0.6));
  font-weight: 600;
}

.panel-header-actions {
  display: flex;
  align-items: center;
}

.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.steps-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

/* 手风琴样式 */
.react-collapse {
  background: transparent;
}

.react-collapse :deep(.n-collapse-item) {
  background: var(--bg-parchment-soft, #222226);
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08));
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.react-collapse :deep(.n-collapse-item--active) {
  border-color: var(--border-subtle, rgba(200, 174, 125, 0.35));
}

.react-collapse :deep(.n-collapse-item__header) {
  padding: 8px 12px;
  background: transparent;
}

.react-collapse :deep(.n-collapse-item__content-inner) {
  padding: 0;
}

/* 步骤头部：极简微标 + 动作意图 + 时间 */
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.step-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--bg-parchment-mute, rgba(200, 174, 125, 0.12));
  color: var(--accent-gold, #C8AE7D);
  flex-shrink: 0;
}

.step-type-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-gold, #C8AE7D);
  background: var(--bg-parchment-mute, rgba(200, 174, 125, 0.1));
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.step-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-charcoal, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary));
  opacity: 0.7;
  margin-left: auto;
  padding-left: 6px;
}

/* 步骤内容：扁平流式排版 */
.step-content {
  padding: 8px 12px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 深度思考/思考过程：优雅引文样式 (Quote Style) */
.flow-reasoning {
  border-left: 2px solid var(--border-subtle, rgba(200, 174, 125, 0.4));
  padding: 4px 0 4px 10px;
  margin: 2px 0;
}

.flow-reasoning.deep {
  border-left-color: var(--accent-gold, #C8AE7D);
  background: rgba(200, 174, 125, 0.04);
  border-radius: 0 6px 6px 0;
  padding: 6px 8px 6px 10px;
}

.reasoning-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-gold, #C8AE7D);
  margin-bottom: 4px;
}

.flow-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-charcoal, var(--color-text));
  word-break: break-word;
  white-space: pre-wrap;
}

/* 用户问题极简气泡 */
.flow-query {
  margin: 2px 0;
}

.query-bubble {
  display: inline-block;
  font-size: 12px;
  line-height: 1.5;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--bg-parchment-mute, rgba(0, 0, 0, 0.05));
  color: var(--text-charcoal, var(--color-text));
}

/* 工具调用（单行紧凑胶囊，去除巨大多层背景） */
.flow-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-chip {
  background: var(--bg-parchment-mute, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--border-light, rgba(200, 174, 125, 0.2));
  border-radius: 6px;
  padding: 5px 8px;
}

.tool-chip-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.chip-icon {
  font-size: 12px;
  color: var(--accent-gold, #e6a23c);
}

.chip-name {
  font-weight: 600;
  color: var(--text-sepia, #5A4A3C);
}

.chip-arg-preview {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted, #8A7A6A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}

.chip-toggle-btn,
.result-detail-btn {
  background: none;
  border: none;
  font-size: 10px;
  color: var(--accent-gold, #C8AE7D);
  cursor: pointer;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  transition: background 0.15s;
}

.chip-toggle-btn:hover,
.result-detail-btn:hover {
  background: rgba(200, 174, 125, 0.15);
}

.tool-chip-details,
.raw-data-box {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-light, rgba(200, 174, 125, 0.2));
}

.tool-chip-details :deep(.n-code),
.raw-data-box :deep(.n-code) {
  font-size: 11px;
  max-height: 120px;
  overflow: auto;
}

/* 工具结果流式条目 */
.flow-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-icon {
  font-size: 11px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: bold;
}

.status-icon.ok {
  background: rgba(24, 160, 88, 0.12);
  color: #18a058;
}

.status-icon.err {
  background: rgba(208, 48, 80, 0.12);
  color: #d03050;
}

.result-tool-name {
  font-weight: 500;
  color: var(--text-charcoal, var(--color-text));
}

.result-brief {
  font-size: 11px;
  color: var(--text-muted, #8A7A6A);
}

/* 扁平微型日记横滑列表 */
.records-compact-container {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0 4px 0;
}

.records-compact-container::-webkit-scrollbar {
  height: 4px;
}

.records-compact-container::-webkit-scrollbar-thumb {
  background: var(--border-subtle, rgba(200, 174, 125, 0.3));
  border-radius: 2px;
}

.records-compact-track {
  display: flex;
  gap: 8px;
}

.mini-record-card {
  flex-shrink: 0;
  width: 170px;
  height: 90px;
  background: var(--bg-parchment-soft, rgba(0, 0, 0, 0.03));
  border: 1px solid var(--border-light, rgba(200, 174, 125, 0.25));
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.mini-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
}

.record-type-badge {
  font-weight: 600;
  color: var(--accent-gold, #C8AE7D);
}

.record-date {
  color: var(--text-muted, #8A7A6A);
  font-size: 10px;
}

.mini-card-body {
  flex: 1;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-charcoal, var(--color-text));
  overflow-y: auto;
  word-break: break-word;
}

.more-hint-clean {
  font-size: 10px;
  color: var(--text-muted, #8A7A6A);
  padding: 2px 4px;
}

/* 最终回答与加载状态极简样式 */
.final-badge-clean {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #18a058;
  padding: 2px 0;
}

.loading-state-clean {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent-gold, #C8AE7D);
  padding: 4px 0;
}

.loading-dots {
  display: inline-flex;
  gap: 3px;
}

.loading-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: currentColor;
  animation: pulse-dot 1.2s infinite ease-in-out;
}

.loading-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse-dot {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* 非记录类结果 */
.result-json :deep(.n-code) {
  font-size: 11px;
  max-height: 150px;
  overflow: auto;
}

/* SQL 分析结果 */
.sql-analysis-result {
  padding: 8px;
  background: var(--color-background);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.sql-data-summary {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.sql-data-summary :deep(.n-statistic) {
  text-align: center;
}

.sql-data-summary :deep(.n-statistic-value) {
  font-size: 20px;
  color: var(--color-primary);
}

/* metadata_explorer 结果 */
.metadata-result {
  padding: 8px;
  background: var(--color-background);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.metadata-header {
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.metadata-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.metadata-items::-webkit-scrollbar {
  width: 4px;
}

.metadata-items::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

.metadata-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-background-soft);
  border-radius: 4px;
  transition: background 0.2s ease;
}

.metadata-item:hover {
  background: var(--color-background-hover);
}

.metadata-value {
  font-size: 13px;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* insight_analyst 结果 */
.insight-result {
  padding: 12px;
  background: var(--color-background);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.insight-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 情绪-能量分析增强展示 */
.emotion-energy-analysis {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.insight-summary-card {
  margin-bottom: 2px;
}

.insight-summary-card :deep(.n-alert) {
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
}

/* 三态能量对比网格 */
.emotion-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

/* 情绪统计卡片 */
.emotion-stat-card {
  background: var(--color-background-soft);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.emotion-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.emotion-stat-card.positive {
  border-color: rgba(82, 196, 26, 0.3);
  background: linear-gradient(135deg, rgba(82, 196, 26, 0.05) 0%, var(--color-background-soft) 100%);
}

.emotion-stat-card.neutral {
  border-color: rgba(128, 128, 128, 0.2);
  background: linear-gradient(135deg, rgba(128, 128, 128, 0.03) 0%, var(--color-background-soft) 100%);
}

.emotion-stat-card.negative {
  border-color: rgba(245, 108, 108, 0.3);
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.05) 0%, var(--color-background-soft) 100%);
}

/* 标签 */
.stat-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.label-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.positive .label-dot {
  background: #52c41a;
}

.neutral .label-dot {
  background: #8c8c8c;
}

.negative .label-dot {
  background: #f56c6c;
}

/* 能量值 */
.stat-value {
  font-size: 28px;
  font-weight: 600;
  line-height: 1;
  margin-bottom: 6px;
}

.positive .stat-value {
  color: #52c41a;
}

.neutral .stat-value {
  color: #8c8c8c;
}

.negative .stat-value {
  color: #f56c6c;
}

/* 附加信息 */
.stat-extra {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.sample-count {
  opacity: 0.8;
}

.std-dev {
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
  font-family: 'Consolas', monospace;
}

/* 能量进度条 */
.energy-bar {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.energy-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.positive .energy-fill {
  background: linear-gradient(90deg, #52c41a 0%, #73d13d 100%);
}

.neutral .energy-fill {
  background: linear-gradient(90deg, #8c8c8c 0%, #a6a6a6 100%);
}

.negative .energy-fill {
  background: linear-gradient(90deg, #f56c6c 0%, #ff8787 100%);
}

/* 质量指标 */
.quality-indicators {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 10px;
  background: var(--color-background-soft);
  border-radius: 6px;
  border: 1px dashed var(--color-border);
}

.quality-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quality-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.quality-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

/* 通用洞察展示 */
.generic-insight {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.insight-summary {
  margin-bottom: 4px;
}

.insight-summary :deep(.n-alert) {
  font-size: 13px;
}

.insight-stats {
  display: flex;
  gap: 24px;
  justify-content: center;
  padding: 8px 0;
}

.insight-stats :deep(.n-statistic) {
  text-align: center;
}

.insight-stats :deep(.n-statistic-value) {
  font-size: 20px;
  color: var(--color-primary);
}

.insight-data-collapse :deep(.n-collapse-item__header) {
  font-size: 12px;
  padding: 8px 12px;
}

.insight-data-collapse :deep(.n-code) {
  font-size: 11px;
  max-height: 200px;
  overflow: auto;
}

/* 最终答案标识 */
.final-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(82, 196, 26, 0.08);
  border: 1px solid rgba(82, 196, 26, 0.25);
  border-radius: 4px;
  color: #52c41a;
  font-size: 12px;
  width: fit-content;
}

/* 加载状态(省略号动画) */
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: var(--text-muted, var(--color-text-secondary));
  font-size: 12px;
}

.loading-label {
  color: var(--text-charcoal, var(--color-text));
  font-weight: 500;
}

.loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.loading-dots .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-gold, #C8AE7D);
  animation: dotPulse 1.4s infinite ease-in-out;
}

.loading-dots .dot:nth-child(1) {
  animation-delay: 0s;
}

.loading-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 步骤类型左侧边框装饰 - 柔和色系 */
.step-item.step-user_query {
  border-left: 2px solid rgba(24, 144, 255, 0.5) !important;
}

.step-item.step-tool_calls {
  border-left: 2px solid rgba(114, 46, 209, 0.55) !important;
}

.step-item.step-final_answer {
  border-left: 2px solid rgba(82, 196, 26, 0.55) !important;
}

.step-item.step-loading {
  border-left: 2px solid var(--accent-gold, #C8AE7D) !important;
}

.step-item.step-error {
  border-left: 2px solid rgba(255, 77, 79, 0.6) !important;
}

/* 响应式 */
@media (max-width: 768px) {
  .record-card {
    width: 180px;
  }
}
</style>
