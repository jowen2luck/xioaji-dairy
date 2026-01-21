<template>
  <div class="tool-tester">
    <div class="header">
      <div class="title">工具测试台</div>
      <div class="actions">
        <!-- 顶部操作区 -->
      </div>
    </div>
    
    <div class="main-content">
      <!-- 左侧边栏：用例管理 -->
      <div class="sidebar">
        <div class="sidebar-header">
          <span>测试用例</span>
          <n-button size="tiny" secondary type="primary" @click="createNewCase">
            <template #icon><n-icon><AddIcon /></n-icon></template>
            新建
          </n-button>
        </div>
        
        <n-tabs type="segment" size="small" v-model:value="caseTab">
          <n-tab-pane name="presets" tab="预设" />
          <n-tab-pane name="custom" tab="自定义" />
        </n-tabs>
        
        <div class="case-list">
          <n-scrollbar>
            <div 
              v-for="item in currentList" 
              :key="item.id" 
              class="case-item"
              :class="{ active: currentCaseId === item.id }"
              @click="selectCase(item)"
            >
              <div class="case-info">
                <div class="case-name">{{ item.name }}</div>
                <div class="case-tool">{{ item.tool }}</div>
              </div>
              <div class="case-actions" v-if="caseTab === 'custom'">
                <n-button size="tiny" quaternary circle type="error" @click.stop="deleteCase(item.id)">
                  <template #icon><n-icon><TrashIcon /></n-icon></template>
                </n-button>
              </div>
            </div>
            <div v-if="currentList.length === 0" class="empty-state">
              暂无数据
            </div>
          </n-scrollbar>
        </div>
      </div>
      
      <!-- 右侧：执行与结果 -->
      <div class="runner-panel">
        <!-- 执行控制栏 -->
        <div class="runner-toolbar">
          <n-space align="center">
            <n-select 
              v-model:value="currentTool" 
              :options="toolOptions" 
              size="small" 
              style="width: 160px"
              placeholder="选择工具"
            />
            <n-input 
              v-model:value="currentCaseName" 
              size="small" 
              placeholder="用例名称" 
              style="width: 200px"
              :disabled="caseTab === 'presets'"
            />
            <n-button size="small" type="primary" @click="runCurrent" :loading="running">
              <template #icon><n-icon><PlayIcon /></n-icon></template>
              运行
            </n-button>
            <n-button size="small" @click="saveCase" v-if="caseTab === 'custom' || !currentCaseId">
              <template #icon><n-icon><SaveIcon /></n-icon></template>
              保存
            </n-button>
            <n-button size="small" @click="formatJson">
              格式化 JSON
            </n-button>
          </n-space>
        </div>
        
        <!-- JSON 编辑器 -->
        <div class="json-editor">
          <n-input
            v-model:value="jsonContent"
            type="textarea"
            placeholder="请输入测试参数 JSON..."
            :status="jsonStatus"
            style="height: 100%; font-family: monospace;"
          />
        </div>
        
        <!-- 结果展示区 -->
        <div class="result-viewer">
          <div class="result-header">
            <span>执行结果</span>
            <span v-if="lastRunTime" class="time-tag">耗时: {{ lastDuration }}ms</span>
          </div>
          
          <div v-if="!result" class="result-empty">
            点击运行查看结果
          </div>
          
          <n-tabs v-else type="line" size="small" style="height: 100%">
            <n-tab-pane name="visual" tab="可视化">
              <div class="visual-content">
                <div v-if="result.isError" class="error-box">
                  {{ result.error }}
                </div>
                <div v-else>
                   <!-- 概览卡片 -->
                   <n-grid :cols="4" :x-gap="12" style="margin-bottom: 12px">
                     <n-gi>
                       <n-statistic label="Records" :value="recordCount" />
                     </n-gi>
                     <n-gi>
                       <n-statistic label="AI Enhanced" :value="aiCount" />
                     </n-gi>
                     <n-gi>
                       <n-statistic label="Status" value="Success">
                         <template #prefix><n-icon color="#18a058"><CheckIcon /></n-icon></template>
                       </n-statistic>
                     </n-gi>
                   </n-grid>
                   
                   <!-- Summary -->
                   <n-card size="small" title="LLM Summary" style="margin-bottom: 12px" v-if="summaryText">
                     <div class="summary-text">{{ summaryText }}</div>
                   </n-card>
                   
                   <!-- 表格预览 -->
                   <n-data-table
                    v-if="tableData.length > 0"
                    :columns="tableColumns"
                    :data="tableData"
                    :max-height="250"
                    size="small"
                   />
                </div>
              </div>
            </n-tab-pane>
            <n-tab-pane name="raw" tab="原始 JSON">
              <n-scrollbar>
                <pre class="json-view">{{ formatJSON(result.raw) }}</pre>
              </n-scrollbar>
            </n-tab-pane>
            <n-tab-pane name="debug" tab="Debug 信息">
              <n-scrollbar>
                <pre class="json-view">{{ formatJSON(result.debug) }}</pre>
              </n-scrollbar>
            </n-tab-pane>
          </n-tabs>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { 
  NButton, NInput, NSelect, NSpace, NTabs, NTabPane, 
  NIcon, NScrollbar, NGrid, NGi, NStatistic, NCard,
  NDataTable, useMessage
} from 'naive-ui'
import { 
  Play as PlayIcon, 
  Save as SaveIcon, 
  Add as AddIcon, 
  Trash as TrashIcon,
  CheckmarkCircle as CheckIcon
} from '@vicons/ionicons5'

const message = useMessage()

// ==================== State ====================
const toolOptions = [
  { label: 'calendar_resolver', value: 'calendar_resolver' },
  { label: 'search_records', value: 'search_records' },
  { label: 'query_records', value: 'query_records' },
  { label: 'metadata_explorer', value: 'metadata_explorer' },
  { label: 'sql_analysis', value: 'sql_analysis' },
  { label: 'insight_analyst', value: 'insight_analyst' }
]

const caseTab = ref('presets')
const currentTool = ref('search_records')
const currentCaseName = ref('未命名测试')
const currentCaseId = ref(null)
const jsonContent = ref('{}')
const running = ref(false)
const result = ref(null)
const lastRunTime = ref(null)
const lastDuration = ref(0)

// 监听工具选择变化，自动加载该工具的第一个预设模板
watch(currentTool, (newTool) => {
  // 如果当前是自定义用例，或者已经在编辑中（有ID），则不自动覆盖
  // 仅当用户在新建状态或明确想切换工具模板时生效
  // 但为了响应用户"切换工具时自动填好参数"的需求，这里策略调整为：
  // 只要切换了工具，且当前内容不属于该工具（防止误切），就自动填充该工具的第一个预设
  
  // 检查当前 JSON 内容是否属于新工具（简单判断）
  // 或者更直接点：如果是预设模式，或者当前没有选中特定用例，就自动切换
  
  // 查找该工具的第一个全参数模板（优先）或普通模板
  const template = presets.find(p => p.tool === newTool && p.name.includes('全参数')) 
    || presets.find(p => p.tool === newTool)
    
  if (template) {
    // 不改变选中状态，只改变编辑器内容，方便用户直接运行
    // 如果用户是在浏览预设列表，可能不需要自动变，但用户显式在下拉框切工具时，通常是想用新工具
    jsonContent.value = JSON.stringify(template.content, null, 2)
    currentCaseName.value = template.name
    // 清除选中状态，避免保存时覆盖原预设（虽然预设不可覆盖）
    if (caseTab.value === 'presets') {
      currentCaseId.value = template.id
    } else {
      currentCaseId.value = null
      currentCaseName.value = `新 ${newTool} 测试`
    }
    result.value = null
  }
})

// 预设数据
const presets = [
  // Calendar Resolver
  {
    id: 'c1', name: '时间解析: 模糊语义', tool: 'calendar_resolver',
    content: { query: '上周三' }
  },
  {
    id: 'c_full', name: '【模板】时间解析 (全参数)', tool: 'calendar_resolver',
    content: {
      query: '2025年11月',
      baseDate: '2025-06-01T12:00:00' // 可选，模拟当前时间
    }
  },

  // Search Records - 常用
  { 
    id: 's1', name: '语义搜索: 基础查询', tool: 'search_records', 
    content: { 
      query: '开心 或者是 难过', 
      limit: 5 
    } 
  },
  { 
    id: 's2', name: '语义搜索: 带时间范围', tool: 'search_records', 
    content: { 
      query: '工作 压力', 
      limit: 10,
      conditions: { 
        dateRange: { start: '2025-01-01 00:00:00', end: '2026-12-31 23:59:59' }
      } 
    } 
  },
  { 
    id: 's3', name: '语义搜索: 负面情绪聚焦', tool: 'search_records', 
    content: { 
      query: '焦虑 迷茫', 
      limit: 5,
      conditions: { 
        emotionFocus: 'worst' 
      } 
    } 
  },
  // Search Records - 全参数模板
  { 
    id: 's_full', name: '【模板】语义搜索 (全参数)', tool: 'search_records', 
    content: { 
      query: '这里填写想要搜索的意象或关键词', 
      limit: 10,
      minScore: 0.2,
      conditions: { 
        dateRange: { start: '2025-01-01 00:00:00', end: '2026-12-31 23:59:59' },
        emotionFocus: null // 可选值: 'worst' 或 null
      } 
    } 
  },

  // Query Records - 常用
  { 
    id: 'q1', name: '精确查询: 最近一周', tool: 'query_records', 
    content: { 
      dateRange: { start: '2025-01-01', end: '2025-01-07' }, // 请修改日期
      pageSize: 10,
      sortBy: 'time_desc'
    } 
  },
  { 
    id: 'q2', name: '精确查询: 特定项目', tool: 'query_records', 
    content: { 
      project: 'DailyLog',
      pageSize: 20
    } 
  },
  {
    id: 'q3', name: '精确查询: 情绪筛选', tool: 'query_records',
    content: {
      moodTags: ['开心', '兴奋'],
      pageSize: 10
    }
  },
  // Query Records - 全参数模板
  { 
    id: 'q_full', name: '【模板】精确查询 (全参数)', tool: 'query_records', 
    content: {
      dateRange: { start: '2025-01-01', end: '2026-12-31' },
      project: null, // "项目名称"
      weekday: null, // "周一"/"周二"...
      isWeekend: null, // true/false
      timeRange: null, // "上午"/"下午"/"晚上"/"深夜"
      durationMin: null, // 最小分钟数
      durationMax: null, // 最大分钟数
      keywordsAny: [], // ["关键词1", "关键词2"] (满足任一)
      keywordsAll: [], // ["关键词A", "关键词B"] (同时满足)
      keywordsExclude: [], // ["排除词"]
      moodTags: [], // ["开心", "焦虑"]
      minEnergyLevel: null, // 1-10
      maxEnergyLevel: null,
      peopleInvolved: null, // "某人"
      contentType: null, // "DailyLog"/"Reflection"/"Idea"
      hasQuotes: null, // true/false
      page: 1,
      pageSize: 20,
      sortBy: 'time_desc' // "time_desc"/"time_asc"/"duration_desc"/"energy_desc"
    } 
  },

  // Metadata Explorer
  {
    id: 'm1', name: '元数据: 浏览项目列表', tool: 'metadata_explorer',
    content: { field: 'projects', limit: 20 }
  },
  {
    id: 'm2', name: '元数据: 搜索人物', tool: 'metadata_explorer',
    content: { field: 'people_involved', search: '', limit: 20 }
  },
  {
    id: 'm_full', name: '【模板】元数据探索 (全参数)', tool: 'metadata_explorer',
    content: { 
      field: 'mood_tags', // people_involved, mood_tags, items, locations, projects, content_type
      search: '', 
      limit: 20 
    }
  },

  // SQL Analysis
  {
    id: 'sql1', name: '统计: 项目概览', tool: 'sql_analysis',
    content: { analysisType: 'by_project', params: { limit: 10 } }
  },
  {
    id: 'sql2', name: '统计: 情绪分布', tool: 'sql_analysis',
    content: { analysisType: 'mood_distribution', params: {} }
  },
  {
    id: 'sql_full', name: '【模板】基础统计 (全参数)', tool: 'sql_analysis',
    content: { 
      analysisType: 'general_aggregation', // summary, by_project, energy_trend, general_aggregation...
      params: { 
        groupByField: '_meta_project',
        metric: 'count', // count, sum, avg
        targetField: null,
        limit: 10
      } 
    }
  },

  // Insight Analyst
  {
    id: 'in1', name: '洞察: 情绪能量相关性', tool: 'insight_analyst',
    content: { analysisType: 'emotion_energy_correlation', params: {} }
  },
  {
    id: 'in2', name: '洞察: 人际网络', tool: 'insight_analyst',
    content: { analysisType: 'people_network', params: {} }
  },
  {
    id: 'in_full', name: '【模板】深度洞察 (全参数)', tool: 'insight_analyst',
    content: { 
      analysisType: 'activity_calendar', // emotion_energy_correlation, people_network, biorhythm_stats...
      params: { 
        filter_project: null,
        filter_date_range: { start: '2025-01-01', end: '2026-12-31' },
        limit: 20
      } 
    }
  }
]

const customCases = ref([])

// ==================== Computed ====================
const currentList = computed(() => {
  return caseTab.value === 'presets' ? presets : customCases.value
})

const jsonStatus = computed(() => {
  try {
    JSON.parse(jsonContent.value)
    return undefined
  } catch (e) {
    return 'error'
  }
})

const recordCount = computed(() => {
  if (!result.value || result.value.isError) return 0
  const data = result.value.raw?.data || result.value.raw
  return data?.records?.length || 0
})

const aiCount = computed(() => {
  if (!result.value || result.value.isError) return 0
  const data = result.value.raw?.data || result.value.raw
  return data?.aiEnhancedCount || 0
})

const summaryText = computed(() => {
  if (!result.value || result.value.isError) return ''
  const data = result.value.raw?.data || result.value.raw
  return data?.summary || ''
})

const tableData = computed(() => {
  if (!result.value || result.value.isError) return []
  const data = result.value.raw?.data || result.value.raw
  return (data?.records || []).slice(0, 50) // 限制显示数量
})

const tableColumns = computed(() => {
  if (tableData.value.length === 0) return []
  const first = tableData.value[0]
  // 选取前 5 个非对象字段作为列
  return Object.keys(first)
    .filter(k => typeof first[k] !== 'object' && k !== 'id')
    .slice(0, 5)
    .map(k => ({ title: k, key: k, ellipsis: { tooltip: true } }))
})

// ==================== Methods ====================

// 初始化
onMounted(() => {
  loadCustomCases()
  // 默认选中第一个预设
  if (presets.length > 0) {
    selectCase(presets[0])
  }
})

function loadCustomCases() {
  try {
    const saved = localStorage.getItem('tool_tester_cases')
    if (saved) {
      customCases.value = JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load custom cases', e)
  }
}

function saveCustomCases() {
  localStorage.setItem('tool_tester_cases', JSON.stringify(customCases.value))
}

function selectCase(item) {
  currentCaseId.value = item.id
  currentTool.value = item.tool
  currentCaseName.value = item.name
  jsonContent.value = JSON.stringify(item.content, null, 2)
  result.value = null // 清空结果
}

function createNewCase() {
  caseTab.value = 'custom'
  currentCaseId.value = null
  currentCaseName.value = '新测试用例'
  jsonContent.value = '{}'
  currentTool.value = 'search_records'
  result.value = null
}

function saveCase() {
  try {
    const content = JSON.parse(jsonContent.value)
    
    if (currentCaseId.value && caseTab.value === 'custom') {
      // 更新现有
      const idx = customCases.value.findIndex(c => c.id === currentCaseId.value)
      if (idx !== -1) {
        customCases.value[idx] = {
          ...customCases.value[idx],
          name: currentCaseName.value,
          tool: currentTool.value,
          content
        }
        message.success('已更新')
      }
    } else {
      // 新建
      const newId = 'c_' + Date.now()
      const newCase = {
        id: newId,
        name: currentCaseName.value,
        tool: currentTool.value,
        content
      }
      customCases.value.push(newCase)
      currentCaseId.value = newId
      caseTab.value = 'custom'
      message.success('已保存')
    }
    saveCustomCases()
  } catch (e) {
    message.error('JSON 格式错误，无法保存')
  }
}

function deleteCase(id) {
  customCases.value = customCases.value.filter(c => c.id !== id)
  saveCustomCases()
  if (currentCaseId.value === id) {
    createNewCase()
  }
  message.success('已删除')
}

function formatJson() {
  try {
    const obj = JSON.parse(jsonContent.value)
    jsonContent.value = JSON.stringify(obj, null, 2)
  } catch (e) {
    message.error('JSON 格式错误')
  }
}

function formatJSON(obj) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

async function runCurrent() {
  if (running.value) return
  
  try {
    const args = JSON.parse(jsonContent.value)
    running.value = true
    const start = Date.now()
    
    const res = await window.assistant.invokeTool(currentTool.value, args)
    
    lastDuration.value = Date.now() - start
    lastRunTime.value = new Date()
    
    if (res.success) {
      result.value = {
        isError: false,
        raw: res.data,
        debug: res.data?.debug
      }
      message.success('执行成功')
    } else {
      result.value = {
        isError: true,
        error: res.error || 'Unknown error'
      }
      message.error('执行失败')
    }
    
  } catch (e) {
    message.error('参数解析失败: ' + e.message)
  } finally {
    running.value = false
  }
}

</script>

<style scoped>
.tool-tester {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--n-color-modal);
}

.header {
  flex: none;
  padding: 12px 16px;
  border-bottom: 1px solid var(--n-border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 16px;
  font-weight: bold;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  border-right: 1px solid var(--n-border-color);
  display: flex;
  flex-direction: column;
  background-color: var(--n-color-modal);
}

.sidebar-header {
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.case-list {
  flex: 1;
  overflow: hidden;
  padding: 8px;
}

.case-item {
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s;
}

.case-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.case-item.active {
  background-color: var(--n-color-primary);
  color: white;
}

.case-item.active .case-tool {
  color: rgba(255, 255, 255, 0.8);
}

.case-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.case-tool {
  font-size: 11px;
  color: var(--text-color-3);
  margin-top: 2px;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--text-color-3);
  font-size: 12px;
}

.runner-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.runner-toolbar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--n-border-color);
}

.json-editor {
  height: 200px;
  padding: 12px;
  border-bottom: 1px solid var(--n-border-color);
}

.result-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 12px 12px 12px;
}

.result-header {
  padding: 8px 4px;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
}

.time-tag {
  font-size: 12px;
  color: var(--text-color-3);
}

.result-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-3);
}

.visual-content {
  padding: 12px 0;
}

.summary-text {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-color-2);
}

.json-view {
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-box {
  color: #d03050;
  padding: 12px;
  background-color: rgba(208, 48, 80, 0.1);
  border-radius: 4px;
}
</style>
