
<script setup>
import { ref, computed, onMounted } from 'vue'
import AnalysisPage from './AnalysisPage.vue'
import AgentPage from './AgentPage.vue'
import { FolderOpenOutline, SearchOutline } from '@vicons/ionicons5'
import { zhCN } from 'naive-ui'

// 新增暗黑模式控制
const isDarkMode = ref(false)

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
}

// 状态管理
const activeTab = ref('dashboard')
const allData = ref([])
const searchQuery = ref('')
const projectFilter = ref(null)
const dateRange = ref(null)
const startDate = ref('')
const endDate = ref('')
const message = ref(null)

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

// 方法
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

// 生命周期
onMounted(async () => {
  try {
    if (window.electron && window.electron.ipcRenderer) {
      const data = await window.electron.ipcRenderer.invoke('load-data')
      if (data && !data.error) {
        allData.value = data
        if (data.length > 0) {
          // 计算最早和最晚时间
          const dates = data
            .map(item => new Date(item.time))
            .filter(date => !isNaN(date.getTime()))
            
          if (dates.length > 0) {
            const earliestDate = new Date(Math.min(...dates.map(date => date.getTime())))
            const latestDate = new Date(Math.max(...dates.map(date => date.getTime())))
            
            // 设置默认日期范围为最早和最晚时间
            dateRange.value = [earliestDate.getTime(), latestDate.getTime()]
            startDate.value = earliestDate.toISOString().split('T')[0]
            endDate.value = latestDate.toISOString().split('T')[0]
          }
          
          showMessage(`成功加载 ${data.length} 条本地数据。`, 'success')
        }
      } else if (data && data.error) {
        showMessage(`加载数据失败: ${data.error}`, 'error')
      }
    } else {
      showMessage('Electron API 不可用', 'error')
      console.error('Electron API not available')
    }
  } catch (error) {
    showMessage(`加载数据时出错: ${error.message}`, 'error')
    console.error('加载数据时出错:', error)
  }
})
</script>

<template>
  <div class="dashboard-container" :class="{ dark: isDarkMode }">
    <!-- 切换暗黑模式按钮 -->
    <button @click="toggleDarkMode">切换模式</button>
    
    <n-tabs type="line" animated v-model:value="activeTab">
      <n-tab-pane name="dashboard" tab="数据看板">
        <div class="controls">
          <n-space vertical>
            <n-button type="primary" @click="importData">
              <template #icon>
                <n-icon><FolderOpenOutline /></n-icon>
              </template>
              导入 Excel 数据
            </n-button>
            
            <n-input 
              v-model:value="searchQuery" 
              placeholder="输入关键词搜索感想"
              clearable
            >
              <template #prefix>
                <n-icon><SearchOutline /></n-icon>
              </template>
            </n-input>
            
            <n-select
              v-model:value="projectFilter"
              placeholder="按项目筛选"
              :options="projectOptions"
              clearable
            />
            
            <n-date-picker 
              v-model:value="dateRange" 
              type="daterange" 
              clearable
              @update:value="handleDateRangeChange"
              :locale="zhCN"
            />
            
            <n-button @click="resetFilters">
              重置筛选
            </n-button>
          </n-space>
        </div>
        
        <n-alert v-if="message" :type="message.type" closable>
          {{ message.text }}
        </n-alert>
        
        <n-card>
          <n-statistic label="记录总数" :value="filteredData.length" />
        </n-card>
        
        <n-list>
          <n-list-item v-for="(item, index) in filteredData" :key="index">
            <n-card>
              <n-space vertical>
                <n-space justify="space-between">
                  <n-tag type="info">{{ item.shanggexiangmu || '未分类' }}</n-tag>
                  <n-time :time="new Date(item.time)" v-if="item.time" />
                </n-space>
                <n-text depth="secondary">持续时间: {{ item.chixushijian }}</n-text>
                <n-p v-html="formatThoughts(item.ganshou)"></n-p>
              </n-space>
            </n-card>
          </n-list-item>
        </n-list>
      </n-tab-pane>
      
      <n-tab-pane name="analysis" tab="数据分析">
        <AnalysisPage />
      </n-tab-pane>
      
      <n-tab-pane name="agent" tab="智能助手">
        <AgentPage />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>


/* 暗黑模式 */
.dashboard-container.dark {
  --bg-color: #333;
  --text-color: #fff;
}

.controls {
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.n-card {
  margin-bottom: 20px;
  width: calc(33% - 20px); /* 多栏布局 */
}

.n-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  padding: 10px;
}

/* 为整个dashboard容器添加滚动 */
.dashboard-container {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  background-color: var(--color-background-soft);
  color: var(--color-text);
  min-height: 100vh;
  overflow-y: auto;
}
</style>