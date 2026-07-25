<template>
  <div class="react-panel">
    <div class="panel-header">
      <n-text strong>思维记录</n-text>
      <n-badge v-if="steps.length > 0" :value="steps.length" type="info" />
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
          <!-- 手风琴标题（包含标签、标题、时间） -->
          <template #header>
            <div class="step-header">
              <n-tag :type="getTagType(step)" size="small" round class="step-tag">
                {{ getStepLabel(step) }}
              </n-tag>
              <span class="step-title">{{ getStepTitle(step) }}</span>
              <span class="step-time">{{ formatTime(step.timestamp || step.time) }}</span>
            </div>
          </template>
          
          <!-- 步骤内容 -->
          <div class="step-content">
            <!-- 深度思考内容（新增） -->
            <div v-if="step.reasoning_content" class="deep-thinking-section">
              <div class="section-label">
                <n-icon size="14"><ThinkIcon /></n-icon>
                <span>深度思考</span>
              </div>
              <div class="thinking-text">{{ step.reasoning_content }}</div>
            </div>
            
            <!-- 思考内容 -->
            <div v-if="step.reasoning" class="reasoning-section">
              <div class="section-label">
                <n-icon size="14"><ThinkIcon /></n-icon>
                <span>思考过程</span>
              </div>
              <div class="reasoning-text">{{ step.reasoning }}</div>
            </div>
            
            <!-- 用户问题（第一步） -->
            <div v-if="step.type === 'user_query'" class="query-section">
              <div class="section-label">
                <n-icon size="14"><UserIcon /></n-icon>
                <span>用户问题</span>
              </div>
              <div class="query-text">{{ step.query }}</div>
            </div>
            
            <!-- 工具调用信息 -->
            <div v-if="step.tools && step.tools.length > 0" class="tools-section">
              <div class="section-label">
                <n-icon size="14"><ToolIcon /></n-icon>
                <span>工具调用</span>
              </div>
              <div v-for="(tool, ti) in step.tools" :key="ti" class="tool-item">
                <div class="tool-name">
                  <n-tag type="warning" size="small">{{ getToolLabel(tool.name || tool) }}</n-tag>
                </div>
                <div v-if="tool.args" class="tool-args">
                  <n-code :code="formatJSON(tool.args)" language="json" :word-wrap="true" />
                </div>
              </div>
            </div>
            
            <!-- 工具结果（检索结果用卡片布局） -->
            <div v-if="step.results && step.results.length > 0" class="results-section">
              <div class="section-label">
                <n-icon size="14"><ResultIcon /></n-icon>
                <span>执行结果</span>
              </div>
              
              <div v-for="(result, ri) in step.results" :key="ri" class="result-item">
                <div class="result-header">
                  <n-tag :type="result.success ? 'success' : 'error'" size="small">
                    {{ result.success ? '✓' : '✗' }} {{ getToolLabel(result.name) }}
                  </n-tag>
                  <span class="result-count" v-if="getRecordCount(result.result) > 0">
                    {{ getRecordCount(result.result) }} 条记录
                  </span>
                </div>
                
                <!-- 检索记录结果用卡片横滑 -->
                <div v-if="hasRecords(result.result)" class="records-carousel">
                  <div class="records-track">
                    <div 
                      v-for="(record, rci) in getRecords(result.result).slice(0, 10)" 
                      :key="rci" 
                      class="record-card"
                    >
                      <!-- 卡片头部：类型 + 时间 -->
                      <div class="record-card-header">
                        <div class="header-left">
                          <n-tag size="tiny" type="info" round :bordered="false">{{ record.shanggexiangmu || '未分类' }}</n-tag>
                          <span class="separator">|</span>
                          <span class="record-time">{{ formatRecordTime(record.time) }}</span>
                        </div>
                      </div>
                      <!-- 卡片内容：可滚动 -->
                      <div class="record-card-body">
                        <div class="record-content" v-html="formatGanshou(record.ganshou || record.content)"></div>
                      </div>
                      <!-- 卡片底部：时长 -->
                      <div class="record-card-footer">
                        <n-icon size="12"><TimeIcon /></n-icon>
                        <span>{{ record.chixushijian || '未知时长' }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-if="getRecordCount(result.result) > 10" class="more-hint">
                    <n-text depth="3">还有 {{ getRecordCount(result.result) - 10 }} 条更多结果...</n-text>
                  </div>
                </div>
                
                <!-- metadata_explorer 结果（表格展示） -->
                <div v-else-if="isMetadataExplorer(result.result)" class="metadata-result">
                  <div v-if="hasMetadataData(result.result)" class="metadata-table">
                    <div class="metadata-header">
                      <n-text depth="3" style="font-size: 12px;">
                        字段: {{ getMetadataField(result.result) }} | 总计: {{ getMetadataTotal(result.result) }} 条
                        <span v-if="getMetadataHasMore(result.result)">（仅显示前 {{ getMetadataReturned(result.result) }} 条）</span>
                      </n-text>
                    </div>
                    <div class="metadata-items">
                      <div 
                        v-for="(item, idx) in getMetadataItems(result.result)" 
                        :key="idx" 
                        class="metadata-item"
                      >
                        <span class="metadata-value">{{ item.value }}</span>
                        <n-tag size="tiny" type="info" round>{{ item.count }}</n-tag>
                      </div>
                    </div>
                  </div>
                  <n-empty v-else description="未找到相关元数据" size="small" />
                </div>
                
                <!-- insight_analyst 结果（展示洞察和统计） -->
                <div v-else-if="isInsightAnalyst(result.result)" class="insight-result">
                  <div v-if="hasInsightData(result.result)" class="insight-content">
                    <!-- 情绪-能量关联分析：增强展示 -->
                    <div v-if="isEmotionEnergyAnalysis(result.result)" class="emotion-energy-analysis">
                      <!-- 洞察摘要 -->
                      <div v-if="getInsightSummary(result.result)" class="insight-summary-card">
                        <n-alert type="info" :bordered="false">
                          <template #icon>
                            <n-icon><ThinkIcon /></n-icon>
                          </template>
                          {{ getInsightSummary(result.result) }}
                        </n-alert>
                      </div>
                      
                      <!-- 三态能量对比 -->
                      <div class="emotion-stats-grid">
                        <div class="emotion-stat-card positive">
                          <div class="stat-label">
                            <span class="label-dot"></span>
                            <span>正面情绪</span>
                          </div>
                          <div class="stat-value">{{ getEmotionEnergy(result.result, 'positive') }}</div>
                          <div class="stat-extra">
                            <span class="sample-count">{{ getEmotionCount(result.result, 'positive') }} 样本</span>
                            <span v-if="getEmotionStdDev(result.result, 'positive') !== null" class="std-dev">
                              ±{{ getEmotionStdDev(result.result, 'positive') }}
                            </span>
                          </div>
                          <!-- 实心进度条 -->
                          <div class="energy-bar">
                            <div class="energy-fill" :style="{ width: getEnergyBarWidth(result.result, 'positive') }"></div>
                          </div>
                        </div>
                        
                        <div class="emotion-stat-card neutral">
                          <div class="stat-label">
                            <span class="label-dot"></span>
                            <span>中性情绪</span>
                          </div>
                          <div class="stat-value">{{ getEmotionEnergy(result.result, 'neutral') }}</div>
                          <div class="stat-extra">
                            <span class="sample-count">{{ getEmotionCount(result.result, 'neutral') }} 样本</span>
                            <span v-if="getEmotionStdDev(result.result, 'neutral') !== null" class="std-dev">
                              ±{{ getEmotionStdDev(result.result, 'neutral') }}
                            </span>
                          </div>
                          <div class="energy-bar">
                            <div class="energy-fill" :style="{ width: getEnergyBarWidth(result.result, 'neutral') }"></div>
                          </div>
                        </div>
                        
                        <div class="emotion-stat-card negative">
                          <div class="stat-label">
                            <span class="label-dot"></span>
                            <span>负面情绪</span>
                          </div>
                          <div class="stat-value">{{ getEmotionEnergy(result.result, 'negative') }}</div>
                          <div class="stat-extra">
                            <span class="sample-count">{{ getEmotionCount(result.result, 'negative') }} 样本</span>
                            <span v-if="getEmotionStdDev(result.result, 'negative') !== null" class="std-dev">
                              ±{{ getEmotionStdDev(result.result, 'negative') }}
                            </span>
                          </div>
                          <div class="energy-bar">
                            <div class="energy-fill" :style="{ width: getEnergyBarWidth(result.result, 'negative') }"></div>
                          </div>
                        </div>
                      </div>
                      
                      <!-- 分析质量指标 -->
                      <div class="quality-indicators">
                        <div class="quality-item">
                          <span class="quality-label">总样本数</span>
                          <span class="quality-value">{{ getQualityMetric(result.result, 'totalSamples') }}</span>
                        </div>
                        <div class="quality-item">
                          <span class="quality-label">数据覆盖率</span>
                          <span class="quality-value">{{ getQualityMetric(result.result, 'coverage') }}%</span>
                        </div>
                        <div v-if="getComparisonSignificance(result.result)" class="quality-item">
                          <span class="quality-label">显著性</span>
                          <n-tag :type="getSignificanceTagType(result.result)" size="tiny" round>
                            {{ getSignificanceLabel(result.result) }}
                          </n-tag>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 其他类型分析：使用通用展示 -->
                    <div v-else class="generic-insight">
                      <!-- 洞察摘要 -->
                      <div v-if="getInsightSummary(result.result)" class="insight-summary">
                        <n-alert type="info" :bordered="false">
                          <template #icon>
                            <n-icon><ThinkIcon /></n-icon>
                          </template>
                          {{ getInsightSummary(result.result) }}
                        </n-alert>
                      </div>
                      
                      <!-- 统计信息 -->
                      <div class="insight-stats">
                        <n-statistic label="分析记录数" :value="getInsightRecordCount(result.result)" />
                        <n-statistic label="AI增强覆盖" :value="getInsightAiCoverage(result.result) + '%'" />
                      </div>
                    </div>
                    
                    <!-- 详细数据（折叠展示） -->
                    <n-collapse :default-expanded-names="[]" class="insight-data-collapse">
                      <n-collapse-item title="查看详细数据" name="detail">
                        <n-code :code="formatJSON(getInsightData(result.result))" language="json" :word-wrap="true" />
                      </n-collapse-item>
                    </n-collapse>
                  </div>
                  <n-empty v-else description="分析结果为空" size="small">
                    <template #extra>
                      <n-text depth="3" style="font-size: 12px;">可能没有匹配的数据，请尝试调整查询条件</n-text>
                    </template>
                  </n-empty>
                </div>
                
                <!-- SQL分析结果（含空状态） -->
                <div v-else-if="isSqlAnalysis(result.result)" class="sql-analysis-result">
                  <div v-if="hasSqlData(result.result)" class="sql-data-summary">
                    <n-statistic label="记录数" :value="getSqlRecordCount(result.result)" />
                    <n-statistic label="AI增强数" :value="getSqlAiCount(result.result)" />
                  </div>
                  <n-empty v-else description="分析结果为空" size="small">
                    <template #extra>
                      <n-text depth="3" style="font-size: 12px;">可能没有匹配的数据，请尝试调整查询条件</n-text>
                    </template>
                  </n-empty>
                </div>
                
                <!-- 其他结果用代码块展示 -->
                <div v-else-if="result.result" class="result-json">
                  <n-code :code="formatJSON(result.result)" language="json" :word-wrap="true" />
                </div>
              </div>
            </div>
            
            <!-- 最终答案标识 -->
            <div v-if="step.action === 'final_answer'" class="final-badge">
              <n-icon size="16" color="#52c41a"><CheckIcon /></n-icon>
              <span>已生成最终答案</span>
            </div>
            
            <!-- 加载中状态(省略号动画) -->
            <div v-if="step.type === 'loading'" class="loading-state">
              <span class="thinking-text">{{ step.detail || '正在思考' }}</span>
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
  search_records: '检索记录',
  query_records: '查询记录',
  sql_analysis: 'SQL 分析',
  metadata_explorer: '元数据探索',
  insight_analyst: '洞察分析'
}

const getToolLabel = (name) => TOOL_LABELS[name] || name

// 图标组件
const ThinkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M12 2a9 9 0 0 0-9 9c0 4.17 2.84 7.67 6.69 8.69L12 22l2.31-2.31C18.16 18.67 21 15.17 21 11a9 9 0 0 0-9-9m0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3s-3-1.34-3-3s1.34-3 3-3"/>' }) }
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

// 获取步骤标签
const getStepLabel = (step) => {
  const action = step.action || step.type
  const labels = {
    user_query: '用户输入',
    thinking: `推理 ${step.iteration || ''}`,
    tool_calls: `迭代 ${step.iteration || ''}`,
    final_answer: '最终答案',
    loading: '处理中',
    error: '错误'
  }
  return labels[action] || `步骤 ${step.iteration || ''}`
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
  display: flex;
  flex-direction: column;
  background: var(--color-card-bg);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
  flex-shrink: 0;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.steps-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 手风琴样式 */
.react-collapse {
  background: transparent;
}

.react-collapse :deep(.n-collapse-item) {
  background: var(--color-background);
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.react-collapse :deep(.n-collapse-item__header) {
  padding: 10px 12px;
  background: var(--color-background-soft);
}

.react-collapse :deep(.n-collapse-item__content-inner) {
  padding: 0;
}

/* 步骤头部 */
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.step-tag {
  flex-shrink: 0;
}

.step-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-left: auto;
  padding-left: 8px;
}

/* 步骤内容 */
.step-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 各内容区块 */
.section-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.reasoning-section,
.query-section,
.tools-section,
.results-section,
.deep-thinking-section {
  background: var(--color-background-soft);
  border-radius: 6px;
  padding: 10px;
}

.reasoning-text,
.query-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  word-break: break-word;
  white-space: pre-wrap;
}

/* 深度思考根据样式（新增） */
.deep-thinking-section {
  background: linear-gradient(135deg, rgba(102, 51, 153, 0.05) 0%, var(--color-background-soft) 100%);
  border: 1px solid rgba(102, 51, 153, 0.2);
  margin-bottom: 12px;
}

.deep-thinking-section .section-label {
  color: #663399;
  font-weight: 700;
}

.thinking-text {
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text);
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 4px;
  border-left: 3px solid #663399;
  font-style: italic;
  margin-top: 6px;
}

/* 工具调用卡片 */
.tool-item {
  background: var(--color-background);
  border-radius: 6px;
  padding: 8px;
  margin-top: 6px;
  border: 1px solid var(--color-border);
}

.tool-name {
  margin-bottom: 6px;
}

.tool-args :deep(.n-code) {
  font-size: 11px;
  max-height: 120px;
  overflow: auto;
}

/* 结果卡片 */
.result-item {
  margin-top: 8px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-count {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* 检索结果卡片横滑（参照数据看板简化版） */
.records-carousel {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 8px;
}

.records-carousel::-webkit-scrollbar {
  height: 6px;
}

.records-carousel::-webkit-scrollbar-track {
  background: var(--color-background-soft);
  border-radius: 3px;
}

.records-carousel::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.records-carousel::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}

.records-track {
  display: flex;
  gap: 12px;
  padding: 4px 0;
}

/* 记录卡片 - 参照 SimpleRecordCard 简化版 */
.record-card {
  flex-shrink: 0;
  width: 240px;
  height: 180px; /* 固定高度 */
  background: var(--color-card-bg, var(--color-background));
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.2s ease;
}

.record-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.3);
}

[data-theme="dark"] .record-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* 卡片头部 */
.record-card-header {
  padding: 10px 12px;
  border-bottom: 1px dashed var(--color-border);
  flex-shrink: 0;
}

.record-card-header .header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.record-card-header .separator {
  color: var(--color-border);
  font-size: 10px;
}

.record-card-header .record-time {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* 卡片内容 - 可上下滚动 */
.record-card-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
}

.record-card-body::-webkit-scrollbar {
  width: 4px;
}

.record-card-body::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

.record-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  word-break: break-word;
}

/* 卡片底部 */
.record-card-footer {
  padding: 8px 12px;
  border-top: 1px dashed var(--color-border);
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.more-hint {
  margin-top: 8px;
  text-align: center;
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(82, 196, 26, 0.1);
  border-radius: 6px;
  color: #52c41a;
  font-size: 13px;
}

/* 加载状态(省略号动画) */
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.thinking-text {
  color: var(--color-text);
  font-weight: 500;
}

.loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.loading-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
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

/* 步骤类型边框颜色 */
.step-item.step-user_query :deep(.n-collapse-item) {
  border-left: 3px solid #1890ff;
}

.step-item.step-tool_calls :deep(.n-collapse-item) {
  border-left: 3px solid #722ed1;
}

.step-item.step-final_answer :deep(.n-collapse-item) {
  border-left: 3px solid #52c41a;
}

.step-item.step-loading :deep(.n-collapse-item) {
  border-left: 3px solid #faad14;
}

.step-item.step-error :deep(.n-collapse-item) {
  border-left: 3px solid #ff4d4f;
}

/* 响应式 */
@media (max-width: 768px) {
  .record-card {
    width: 180px;
  }
}
</style>
