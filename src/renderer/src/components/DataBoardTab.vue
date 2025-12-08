<template>
  <div class="data-board-tab-wrapper">
    <!-- 固定顶部控制栏 -->
    <div class="fixed-header">
      <div class="controls">
        <n-card style="width: 100%">
          <FilterBar
            :project-options="projectOptions"
            :value="{ query: searchQuery, project: projectFilter, dateRange }"
            @update:value="onFilterUpdate"
            @import="importData"
            @reset="resetFilters"
            @etl-enhance="startETLEnhancement"
            :etl-processing="etlProcessing"
          />
          
          <!-- ETL 进度条区域 -->
          <div class="etl-progress-section" v-if="etlProcessing || etlStats.processed > 0">
            <n-divider style="margin: 16px 0" />
            <n-space vertical size="medium">
              <n-space align="center" justify="space-between">
                <n-text depth="3">
                  已处理 {{ etlStats.processed }} / {{ etlStats.total }} 条
                </n-text>
                <n-text depth="3" v-if="etlStats.cached > 0">
                  已缓存 {{ etlStats.cached }} 条
                </n-text>
                <n-text depth="3" v-if="etlStats.failed > 0" type="error">
                  失败 {{ etlStats.failed }} 条
                </n-text>
              </n-space>
              
              <n-progress
                type="line"
                :percentage="etlProgressPercentage"
                :status="etlProgressStatus"
                :show-indicator="false"
              />
              <n-text style="text-align: center; display: block;">
                {{ etlProgressPercentage }}%
              </n-text>
            </n-space>
          </div>
        </n-card>
      </div>

      <n-alert v-if="message" :type="message.type" closable @close="message = null">
        {{ message.text }}
      </n-alert>
    </div>

    <!-- 主内容区域 -->
    <div class="content-wrapper">
      <!-- 2:1 双栏布局主体 -->
      <div class="dual-column-layout">
        <!-- 左侧主轴 (70%) - 沉浸式阅读区 -->
        <div class="main-column">
          <!-- 记录列表 -->
          <n-spin :show="loading">
            <n-empty v-if="filteredData.length === 0" description="没有找到匹配的记录" />
            <div v-else class="records-list">
              <div v-for="(item, index) in paginatedData" :key="index" class="record-item">
                <!-- 动态选择渲染组件：有 AI 数据用增强卡片，否则用普通卡片 -->
                <EnhancedRecordCard
                  v-if="item._ai_meta"
                  :record="item"
                  @tag-click="handleTagClick"
                  @request-analysis="handleRequestAnalysis"
                />
                <RecordCard
                  v-else
                  :record="item"
                  :show-ai-meta="true"
                  :hoverable="true"
                  :clickable="false"
                  @click="handleRecordClick"
                  @tag-click="handleTagClick"
                />
              </div>
            </div>
          </n-spin>
        </div>

        <!-- 右侧边栏 (30%) - 灵感与时光侧栏 -->
        <div class="sidebar-column">
          <div class="sidebar-sticky">
            <!-- 那年今日 -->
            <FlashbackCard :all-data="allData" />
            
            <!-- 随机漫步 -->
            <SerendipityCard :all-data="allData" />
            
            <!-- 洞察概览 -->
            <QuickStatsCard :all-data="allData" />
          </div>
        </div>
      </div>
    </div>

    <!-- 固定底部分页器 -->
    <div v-if="filteredData.length > 0" class="fixed-footer">
      <div class="pagination-container">
        <n-space align="center" justify="space-between" style="width: 100%">
          <div class="pagination-info">
            <n-text depth="2">
              共 {{ filteredData.length }} 条 / 第 {{ currentPage }} 页
            </n-text>
          </div>
          
          <n-pagination
            v-model:page="currentPage"
            :page-count="pageCount"
            :page-size="pageSize"
            :item-count="filteredData.length"
            @update:page="handlePageChange"
            size="small"
            :show-size-picker="false"
            :show-quick-jumper="loadConfig().pagination.enableQuickJump"
          />
          
          <div class="pagination-size">
            <n-text depth="2" style="margin-right: 12px">每页</n-text>
            <n-select
              v-model:value="pageSize"
              :options="pageSizeOptions"
              size="small"
              style="width: 80px"
              @update:value="handlePageSizeChange"
            />
            <n-text depth="2" style="margin-left: 8px">条</n-text>
          </div>
        </n-space>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import FilterBar from './FilterBar.vue'
import RecordCard from './RecordCard.vue'
import EnhancedRecordCard from './EnhancedRecordCard.vue'
import FlashbackCard from './FlashbackCard.vue'
import SerendipityCard from './SerendipityCard.vue'
import QuickStatsCard from './QuickStatsCard.vue'
import { loadConfig } from '../config/assistant.ts'

// Props
const props = defineProps({
  initialData: {
    type: Array,
    default: () => []
  }
})

// Emits
const emit = defineEmits(['data-updated', 'message'])

// 状态管理
const allData = ref(props.initialData)
const searchQuery = ref('')
const projectFilter = ref(null)
const dateRange = ref(null)
const startDate = ref('')
const endDate = ref('')
const message = ref(null)
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(loadConfig().pagination.pageSize)

// ETL 增强状态
const etlProcessing = ref(false)
const etlStats = ref({
  total: 0,
  processed: 0,
  cached: 0,
  failed: 0
})

// 计算属性
const projects = computed(() => {
  const projectSet = new Set()
  allData.value.forEach(item => {
    if (item.shanggexiangmu) {
      projectSet.add(item.shanggexiangmu)
    }
  })
  return Array.from(projectSet)
})

const projectOptions = computed(() => {
  return projects.value.map(project => ({
    label: project,
    value: project
  }))
})

const filteredData = computed(() => {
  let result = allData.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(item => {
      return (item.ganshou && item.ganshou.toLowerCase().includes(query)) ||
             (item.shanggexiangmu && item.shanggexiangmu.toLowerCase().includes(query))
    })
  }

  if (projectFilter.value) {
    result = result.filter(item => item.shanggexiangmu === projectFilter.value)
  }

  if (startDate.value) {
    result = result.filter(item => item.time >= startDate.value)
  }

  if (endDate.value) {
    result = result.filter(item => item.time <= endDate.value)
  }

  return result
})

const pageCount = computed(() => {
  return Math.ceil(filteredData.value.length / pageSize.value)
})

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredData.value.slice(start, end)
})

// AI 增强统计
const aiEnhancedCount = computed(() => {
  return filteredData.value.filter(item => item._ai_meta !== null && item._ai_meta !== undefined).length
})

const aiEnhancementRate = computed(() => {
  if (filteredData.value.length === 0) return 0
  return Math.round((aiEnhancedCount.value / filteredData.value.length) * 100)
})

// ETL 进度计算
const etlProgressPercentage = computed(() => {
  if (etlStats.value.total === 0) return 0
  const percentage = Math.round((etlStats.value.processed / etlStats.value.total) * 100)
  return Math.min(100, Math.max(0, percentage))
})

const etlProgressStatus = computed(() => {
  if (etlStats.value.failed > 0) return 'error'
  if (etlProcessing.value) return 'info'
  if (etlStats.value.processed === etlStats.value.total && etlStats.value.total > 0) return 'success'
  return 'default'
})

// 方法
const handlePageChange = (page) => {
  currentPage.value = page
}

const handlePageSizeChange = (newSize) => {
  pageSize.value = newSize
  // 分页数变化后，重置到第一页
  currentPage.value = 1
}

const pageSizeOptions = [
  { label: '6', value: 6 },
  { label: '10', value: 10 },
  { label: '15', value: 15 },
  { label: '20', value: 20 },
  { label: '30', value: 30 }
]

const handleRecordClick = (record) => {
  console.log('Record clicked:', record._id)
}

const handleTagClick = (tagType, tagValue) => {
  console.log('Tag clicked:', tagType, tagValue)
  // 可以在这里添加标签筛选逻辑
}

const handleRequestAnalysis = (record) => {
  console.log('Request analysis for record:', record._id)
  // 可以触发单条记录的增量 ETL 处理
}

const handleDateRangeChange = (value) => {
  if (value && value.length === 2) {
    startDate.value = new Date(value[0]).toISOString().split('T')[0]
    endDate.value = new Date(value[1]).toISOString().split('T')[0]
  } else {
    startDate.value = ''
    endDate.value = ''
  }
}

const onFilterUpdate = (v) => {
  searchQuery.value = v.query
  projectFilter.value = v.project
  dateRange.value = v.dateRange
  handleDateRangeChange(v.dateRange)
}

const showMessage = (text, type = 'info') => {
  message.value = { text, type }
  emit('message', { text, type })
  setTimeout(() => {
    message.value = null
  }, 5000)
}

const importData = async () => {
  try {
    if (window.electron && window.electron.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke('open-file-dialog')
      if (result && !result.error) {
        const previousCount = allData.value.length
        const saveResult = await window.electron.ipcRenderer.invoke('save-data', result)

        if (saveResult.success) {
          const updatedData = await window.electron.ipcRenderer.invoke('etl:get-enriched-data')
          if (updatedData && !updatedData.error) {
            allData.value = updatedData
            emit('data-updated', updatedData)
            const currentCount = updatedData.length
            const addedCount = currentCount - previousCount
            showMessage(`数据导入成功！新增 ${addedCount} 条记录，总共 ${currentCount} 条记录。`, 'success')
          } else {
            showMessage('数据导入成功，但加载更新后数据失败。', 'warning')
          }
        } else {
          showMessage(`数据保存失败: ${saveResult.error}`, 'error')
        }
      } else if (result && result.error) {
        showMessage(`导入数据失败: ${result.error}`, 'error')
      } else {
        showMessage('导入已取消或未选择文件。', 'info')
      }
    } else {
      showMessage('Electron API 不可用', 'error')
    }
  } catch (error) {
    showMessage(`导入数据时出错: ${error.message}`, 'error')
  }
}

const resetFilters = () => {
  searchQuery.value = ''
  projectFilter.value = null
  dateRange.value = null
  startDate.value = ''
  endDate.value = ''
}

const startETLEnhancement = async () => {
  try {
    console.log('[DataBoardTab] Starting ETL enhancement...')
    if (!window.electron || !window.electron.ipcRenderer) {
      showMessage('Electron API 不可用', 'error')
      return
    }
    
    const config = loadConfig()
    const etlConfig = {
      ...config.etl,
      systemPrompt: config.prompts.etlSystem
    }
    
    if (!etlConfig.enabled) {
      showMessage('ETL 增强功能未启用', 'warning')
      return
    }
    
    etlProcessing.value = true
    showMessage('开始智能增强，使用实际数据，请稍候...', 'info')
    
    const result = await window.electron.ipcRenderer.invoke('etl:start', etlConfig)
    
    if (result.success) {
      showMessage(result.message, 'success')
    } else {
      showMessage(`ETL 启动失败: ${result.error}`, 'error')
      etlProcessing.value = false
    }
    
  } catch (error) {
    console.error('ETL 启动失败:', error)
    showMessage(`ETL 启动失败: ${error.message}`, 'error')
    etlProcessing.value = false
  }
}

const handleETLEvent = (data) => {
  if (!data || !data.type) {
    console.warn('[DataBoardTab] Invalid ETL event:', data)
    return
  }
  
  console.log('[DataBoardTab] ETL Event:', data.type, data.data)
  
  switch (data.type) {
    case 'start':
      etlProcessing.value = true
      etlStats.value = {
        total: data.data.total,
        processed: 0,
        cached: 0,
        failed: 0
      }
      break
      
    case 'progress':
      etlStats.value = {
        total: data.data.total,
        processed: data.data.processed,
        cached: data.data.cached,
        failed: data.data.failed
      }
      break
      
    case 'record-updated':
      refreshDataSilently()
      break
      
    case 'complete':
      console.log('[DataBoardTab] ETL Complete, starting data refresh...')
      etlStats.value = {
        total: data.data.stats.total,
        processed: data.data.stats.processed,
        cached: data.data.stats.cached,
        failed: data.data.stats.failed
      }
      refreshData().then(() => {
        console.log('[DataBoardTab] Data refreshed, ending loading state...')
        etlProcessing.value = false
        showMessage(
          `智能增强完成！总计 ${data.data.stats.total} 条，处理 ${data.data.stats.processed} 条，缓存 ${data.data.stats.cached} 条，失败 ${data.data.stats.failed} 条`, 
          data.data.stats.failed > 0 ? 'warning' : 'success'
        )
      }).catch(err => {
        console.error('[DataBoardTab] Error refreshing data:', err)
        etlProcessing.value = false
        showMessage('数据刷新失败', 'error')
      })
      break
      
    case 'error':
      console.error('[DataBoardTab] ETL Error:', data.data)
      etlProcessing.value = false
      showMessage(`智能增强出错: ${data.data.error || '未知错误'}`, 'error')
      break
  }
}

const refreshData = async () => {
  try {
    console.log('[DataBoardTab] Invoking etl:get-enriched-data...')
    const data = await window.electron.ipcRenderer.invoke('etl:get-enriched-data')
    console.log('[DataBoardTab] Received enriched data:', data ? data.length : 0, 'records')
    if (data && !data.error) {
      allData.value = data
      emit('data-updated', data)
      console.log('[DataBoardTab] Data updated successfully')
    } else {
      console.warn('[DataBoardTab] Invalid data received:', data)
    }
  } catch (error) {
    console.error('[DataBoardTab] 刷新数据失败:', error)
    throw error
  }
}

const refreshDataSilently = async () => {
  try {
    const data = await window.electron.ipcRenderer.invoke('etl:get-enriched-data')
    if (data && !data.error) {
      allData.value = data
    }
  } catch (error) {
    console.error('刷新数据失败:', error)
  }
}

// 暴露 ref 给父组件使用
const setData = (data) => {
  allData.value = data
}

const setLoading = (val) => {
  loading.value = val
}

defineExpose({
  setData,
  setLoading,
  allData
})

// 生命周期: 自动加载增强数据
onMounted(async () => {
  console.log('[DataBoardTab] Component mounted, loading enriched data...')
  
  // 自动加载增强数据（包含 AI 缓存）
  if (window.electron && window.electron.ipcRenderer) {
    try {
      loading.value = true
      const data = await window.electron.ipcRenderer.invoke('etl:get-enriched-data')
      if (data && !data.error) {
        allData.value = data
        emit('data-updated', data)
        console.log('[DataBoardTab] Auto-loaded enriched data:', data.length, 'records')
        
        // 统计 AI 增强情况
        const aiCount = data.filter(item => item._ai_meta).length
        if (aiCount > 0) {
          showMessage(`已加载 ${data.length} 条记录，其中 ${aiCount} 条已完成 AI 增强`, 'success')
        } else {
          showMessage(`已加载 ${data.length} 条记录，尚未进行 AI 增强`, 'info')
        }
      }
    } catch (error) {
      console.error('[DataBoardTab] Error auto-loading data:', error)
      showMessage('自动加载数据失败', 'error')
    } finally {
      loading.value = false
    }
    
    // 注册 ETL 事件监听
    window.electron.ipcRenderer.on('etl:event', handleETLEvent)
  }
})

onUnmounted(() => {
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('etl:event')
  }
})
</script>

<style scoped>
.data-board-tab-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 固定顶部 */
.fixed-header {
  flex-shrink: 0;
  overflow-y: auto;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color);
  z-index: 100;
}

.controls {
  padding: 16px;
  margin-bottom: 0;
}

/* 主内容区域 */
.content-wrapper {
  flex: 1;
  overflow: hidden;
  padding: 2px 16px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 双栏布局核心 */
.dual-column-layout {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧主轴 - 沉浸式阅读区 */
.main-column {
  flex: 1;
  min-width: 0;
  max-width: 70%;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.record-item {
  width: 100%;
}

/* 右侧边栏 - 灵感与时光 */
.sidebar-column {
  width: 30%;
  min-width: 280px;
  max-width: 360px;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.sidebar-sticky {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 固定底部 - 精美分页器 */
.fixed-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--n-border-color);
  background: var(--n-color);
  padding: 0 16px;
  z-index: 100;
}

.pagination-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

.pagination-info {
  min-width: 200px;
}

.pagination-size {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.etl-progress-section {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .dual-column-layout {
    flex-direction: column;
  }
  
  .main-column {
    max-width: 100%;
  }
  
  .sidebar-column {
    width: 100%;
    max-width: 100%;
    height: auto;
  }
  
  .sidebar-sticky {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
  
  .sidebar-sticky > * {
    flex: 1;
    min-width: 280px;
  }
}

@media (max-width: 768px) {
  .content-wrapper {
    padding: 12px;
  }

  .fixed-footer {
    padding: 0px 12px;
  }

  .pagination-container {
    flex-direction: column;
    gap: 12px;
  }

  .sidebar-sticky {
    flex-direction: column;
  }
  
  .sidebar-sticky > * {
    min-width: 100%;
  }
}
</style>
