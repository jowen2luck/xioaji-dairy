<template>
  <div class="dashboard-container">
    <div class="top-row">
      <div class="tabs-wrap">
        <n-tabs type="line" animated v-model:value="activeTab">
          <template #suffix>
  <div class="theme-wrap">
        <ThemeSwitcher />
      </div>
          </template>
      <n-tab-pane name="dashboard" tab="数据看板">
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
          </n-card>
        </div>
        
        <n-alert v-if="message" :type="message.type" closable>
          {{ message.text }}
        </n-alert>
        
        <n-card>
          <n-statistic label="记录总数" :value="filteredData.length" />
        </n-card>
        
        <n-spin :show="loading">
          <n-empty v-if="filteredData.length === 0" description="没有找到匹配的记录" />
          <n-grid v-else cols="1 s:1 m:2 l:3 xl:4 2xl:4" responsive="screen" :x-gap="12" :y-gap="12">
            <n-grid-item v-for="(item, index) in paginatedData" :key="index">
              <!-- 根据是否有 AI 元数据选择显示增强或简化卡片 -->
              <EnhancedRecordCard 
                v-if="item._ai_meta"
                :record="item"
                :compact="false"
                @tag-click="handleTagClick"
                @request-analysis="handleAnalysisRequest"
              />
              <SimpleRecordCard 
                v-else
                :record="item"
                :compact="false"
              />
            </n-grid-item>
          </n-grid>
        </n-spin>
        
        <div v-if="filteredData.length > 0" class="pagination-container">
          <n-pagination
            v-model:page="currentPage"
            :page-count="pageCount"
            :page-size="pageSize"
            :item-count="filteredData.length"
            @update:page="handlePageChange"
          />
        </div>
      </n-tab-pane>
      
      <n-tab-pane name="analysis" tab="数据分析">
        <AnalysisPage />
      </n-tab-pane>
      
          <n-tab-pane name="agent" tab="智能助手">
            <AgentWorkbench />
          </n-tab-pane>
        </n-tabs>
      </div>
    
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AnalysisPage from './AnalysisPage.vue'
import AgentPage from './AgentPage.vue'
import AgentWorkbench from './AgentWorkbench.vue'
import FilterBar from './FilterBar.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import EnhancedRecordCard from './EnhancedRecordCard.vue'
import SimpleRecordCard from './SimpleRecordCard.vue'
import { FolderOpenOutline, SearchOutline } from '@vicons/ionicons5'
import { useThemeVars } from 'naive-ui'
import { loadConfig } from '../config/assistant.ts'

const themeVars = useThemeVars()

// 状态管理
const activeTab = ref('dashboard')
const allData = ref([])
const searchQuery = ref('')
const projectFilter = ref(null)
const dateRange = ref(null)
const startDate = ref('')
const endDate = ref('')
const message = ref(null)
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(12)
const etlProcessing = ref(false)

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
  
  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(item => {
      return (item.ganshou && item.ganshou.toLowerCase().includes(query)) ||
             (item.shanggexiangmu && item.shanggexiangmu.toLowerCase().includes(query))
    })
  }
  
  // 项目过滤
  if (projectFilter.value) {
    result = result.filter(item => item.shanggexiangmu === projectFilter.value)
  }
  
  // 日期过滤
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

// 方法
const handlePageChange = (page) => {
  currentPage.value = page
}

const formatTime = (time) => {
  if (!time) return '未知时间'
  return new Date(time).toLocaleString('zh-CN')
}

const formatThoughts = (thoughts) => {
  if (!thoughts) return ''
  return thoughts.replace(/\n/g, '<br>')
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
        // 保存数据到本地
        const saveResult = await window.electron.ipcRenderer.invoke('save-data', result)
        
        if (saveResult.success) {
          // 重新加载合并后的数据
          const updatedData = await window.electron.ipcRenderer.invoke('load-data')
          if (updatedData && !updatedData.error) {
            allData.value = updatedData
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
        console.error('导入数据失败:', result.error)
      } else {
        showMessage('导入已取消或未选择文件。', 'info')
      }
    } else {
      showMessage('Electron API 不可用', 'error')
      console.error('Electron API not available')
    }
  } catch (error) {
    showMessage(`导入数据时出错: ${error.message}`, 'error')
    console.error('导入数据时出错:', error)
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
    console.log('[Dashboard] Starting ETL enhancement...')
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
    console.warn('[Dashboard] Invalid ETL event:', data)
    return
  }
  
  console.log('[Dashboard] ETL Event:', data.type, data.data)
  
  switch (data.type) {
    case 'complete':
      console.log('[Dashboard] ETL Complete, starting data refresh...')
      refreshData().then(() => {
        console.log('[Dashboard] Data refreshed, ending loading state...')
        etlProcessing.value = false
        showMessage(
          `智能增强完成！总计 ${data.data.stats.total} 条，处理 ${data.data.stats.processed} 条，缓存 ${data.data.stats.cached} 条，失败 ${data.data.stats.failed} 条`, 
          data.data.stats.failed > 0 ? 'warning' : 'success'
        )
      }).catch(err => {
        console.error('[Dashboard] Error refreshing data:', err)
        etlProcessing.value = false
        showMessage('数据刷新失败', 'error')
      })
      break
      
    case 'error':
      console.error('[Dashboard] ETL Error:', data.data)
      etlProcessing.value = false
      showMessage(`智能增强出错: ${data.data.error || '未知错误'}`, 'error')
      break
  }
}

const refreshData = async () => {
  try {
    console.log('[Dashboard] Invoking load-data...')
    const data = await window.electron.ipcRenderer.invoke('load-data')
    console.log('[Dashboard] Received data:', data ? data.length : 0, 'records')
    if (data && !data.error) {
      allData.value = data
      console.log('[Dashboard] Data updated successfully')
    } else {
      console.warn('[Dashboard] Invalid data received:', data)
    }
  } catch (error) {
    console.error('[Dashboard] 刷新数据失败:', error)
    throw error
  }
}

const handleTagClick = (tagType, tagValue) => {
  console.log('[Dashboard] Tag clicked:', tagType, tagValue)
  if (tagType === 'mood') {
    searchQuery.value = tagValue
  }
}

const handleAnalysisRequest = (record) => {
  console.log('[Dashboard] Analysis request for record:', record._id)
  // 可以实现上次整理逐条记录的配置
}

// 生命周期
onMounted(async () => {
  try {
    if (window.electron && window.electron.ipcRenderer) {
      loading.value = true
      const data = await window.electron.ipcRenderer.invoke('load-data')
      if (data && !data.error) {
        allData.value = data
        if (data.length > 0) {
          showMessage(`成功加载 ${data.length} 条本地数据。`, 'success')
        }
      } else if (data && data.error) {
        showMessage(`加载数据失败: ${data.error}`, 'error')
      }
    } else {
      // 在浏览器环境中，我们可以模拟一些数据或显示提示
      console.warn('Electron API not available - running in browser environment')
      // 可以选择显示提示或加载示例数据
      // showMessage('Electron API 不可用 - 正在浏览器环境中运行', 'warning')
    }
    loading.value = false
    
    // 注册 ETL 事件监听
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('etl:event', handleETLEvent)
    }
  } catch (error) {
    showMessage(`加载数据时出错: ${error.message}`, 'error')
    console.error('加载数据时出错:', error)
    loading.value = false
  }
})

onUnmounted(() => {
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.removeListener('etl:event', handleETLEvent)
  }
})
</script>

<style scoped>
.dashboard-container {
  min-height: 100vh;
}

.controls { margin-bottom: 24px; }
.filter-container { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.filter-item { flex: 1 1 220px; min-width: 220px; }

.header {
  display: none;
}

.top-row { display: flex; align-items: center; gap: 12px; }
.tabs-wrap { flex: 1; min-width: 0; }
.theme-wrap { flex: none; }
</style>