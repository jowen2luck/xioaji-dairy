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
          <div class="etl-progress-section" v-if="etlProcessing || summaryProcessing || etlStats.processed > 0">
            <n-divider style="margin: 16px 0" />
            <n-space vertical size="medium">
              <!-- ETL 进度 -->
              <template v-if="etlStats.total > 0">
                <n-space align="center" justify="space-between">
                  <n-text depth="3">
                    AI 增强: 已处理 {{ etlStats.processed }} / {{ etlStats.total }} 条
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
              </template>
              
              <!-- 总结生成进度 -->
              <template v-if="summaryProcessing">
                <n-space align="center">
                  <n-spin size="small" />
                  <n-text depth="3">{{ summaryMessage }}</n-text>
                </n-space>
              </template>
              
              <!-- 总结统计 -->
              <template v-if="summaryStats.weeklyGenerated > 0 || summaryStats.monthlyGenerated > 0">
                <n-text depth="3" type="success">
                  总结生成: 周总结 {{ summaryStats.weeklyGenerated }} 篇，月总结 {{ summaryStats.monthlyGenerated }} 篇
                </n-text>
              </template>
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
              <div v-for="(item, index) in paginatedData" :key="item._id || index" class="record-item">
                <!-- 总结卡片 -->
                <SummaryCard
                  v-if="item._type === 'summary'"
                  :summary="item"
                />
                <!-- 有 AI 数据用增强卡片 -->
                <EnhancedRecordCard
                  v-else-if="item._ai_meta"
                  :record="item"
                  @tag-click="handleTagClick"
                  @request-analysis="handleRequestAnalysis"
                  @refresh="refreshDataSilently"
                />
                <!-- 普通卡片 -->
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
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useDialog } from 'naive-ui'
import FilterBar from './FilterBar.vue'
import RecordCard from './RecordCard.vue'
import EnhancedRecordCard from './EnhancedRecordCard.vue'
import SummaryCard from './chronicle/SummaryCard.vue'
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
const summaries = ref([]) // 总结数据
const searchQuery = ref('')
const projectFilter = ref(null)
const contentTypeFilter = ref(null) // 新增内容类型筛选
const energyRangeFilter = ref([0, 10]) // 新增能量值筛选
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

// 总结生成状态
const summaryProcessing = ref(false)
const summaryMessage = ref('')
const summaryStats = ref({
  weeklyGenerated: 0,
  monthlyGenerated: 0,
  errors: []
})

const dialog = useDialog()

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
  // 过滤普通记录
  let records = allData.value

  // 1. 搜索
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    records = records.filter(item => {
      return (item.ganshou && item.ganshou.toLowerCase().includes(query)) ||
             (item.shanggexiangmu && item.shanggexiangmu.toLowerCase().includes(query))
    })
  }

  // 2. 项目筛选
  if (projectFilter.value) {
    records = records.filter(item => item.shanggexiangmu === projectFilter.value)
  }

  // 3. 日期筛选
  if (startDate.value) {
    records = records.filter(item => item.time >= startDate.value)
  }

  if (endDate.value) {
    records = records.filter(item => item.time <= endDate.value)
  }

  // 4. 内容类型筛选 (如果选了 Summary, 这里 records 会被清空，在下面合并时只剩 summary)
  if (contentTypeFilter.value) {
    if (contentTypeFilter.value === 'Summary') {
      records = [] // 只看总结
    } else {
      // 筛选特定类型的记录
      const targetType = contentTypeFilter.value
      records = records.filter(item => {
        // 尝试匹配 _ai_meta.content_type (可能是英文或中文)
        const type = item._ai_meta?.content_type
        if (!type) return false
        
        // 简单映射匹配
        if (targetType === 'Log') return type === 'Log' || type === '日志'
        if (targetType === 'Review') return type === 'Review' || type === '复盘'
        if (targetType === 'Dream') return type === 'Dream' || type === '梦境'
        return type === targetType
      })
    }
  }

  // 5. 能量值筛选
  // 仅对有能量值的记录生效，如果没有能量值且开启了筛选，通常默认不显示或根据需求。
  // 这里逻辑：如果有 energy_level，必须在范围内。如果没有且不是 Summary (Summary 也有 stats)，则过滤掉?
  // 用户说 "筛选对应的能量范围的记录"，通常 imply 只有有能量的记录才显示。
  const [minEnergy, maxEnergy] = energyRangeFilter.value || [0, 10]
  if (minEnergy > 0 || maxEnergy < 10) {
    records = records.filter(item => {
      const level = item._ai_meta?.energy_level
      return typeof level === 'number' && level >= minEnergy && level <= maxEnergy
    })
  }

  // 过滤总结
  let filteredSummaries = summaries.value
  
  // 总结也受部分筛选影响 (如日期、搜索、类型)
  // 日期筛选
  if (startDate.value || endDate.value) {
    filteredSummaries = filteredSummaries.filter(s => {
      const summaryDate = s.time.split('T')[0]
      if (startDate.value && summaryDate < startDate.value) return false
      if (endDate.value && summaryDate > endDate.value) return false
      return true
    })
  }
  
  // 类型筛选
  if (contentTypeFilter.value && contentTypeFilter.value !== 'Summary') {
    // 如果选了 Log/Review/Dream，则不显示 Summary
    filteredSummaries = []
  }

  // 能量筛选 (可选：总结也有 avgEnergyLevel，是否应用？用户说筛选记录，暂时只对记录生效，或者对总结也生效?)
  // 既然用户意图是回顾，总结也应该受能量筛选影响比较合理 (看那周平均能量)
  if (minEnergy > 0 || maxEnergy < 10) {
    filteredSummaries = filteredSummaries.filter(s => {
      const level = s.stats?.avgEnergyLevel
      return typeof level === 'number' && level >= minEnergy && level <= maxEnergy
    })
  }

  // 合并记录和总结，按时间倒序排列
  const combined = [...records, ...filteredSummaries]
  combined.sort((a, b) => new Date(b.time) - new Date(a.time))

  return combined
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
  contentTypeFilter.value = v.contentType
  energyRangeFilter.value = v.energyRange
  handleDateRangeChange(v.dateRange)
}

const showMessage = (text, type = 'info') => {
  message.value = { text, type }
  emit('message', { text, type })
  setTimeout(() => {
    message.value = null
  }, 5000)
}

const formatMissingMessage = (missing, incomplete) => {
  const lines = []

  if (missing?.weekly?.length) {
    lines.push('周总结发现缺失天数：')
    missing.weekly.forEach(item => {
      const days = item.missingDays?.length ? `（${item.missingDays.join(', ')}）` : ''
      lines.push(`• ${item.year} 年第 ${item.week} 周 缺失 ${item.missingDays.length} 天${days}`)
    })
  }

  if (missing?.monthly?.length) {
    lines.push('月总结发现缺失数据：')
    missing.monthly.forEach(item => {
      const daysText = item.missingDays?.length ? `缺失 ${item.missingDays.length} 天` : ''
      const weeksText = item.missingWeeks?.length
        ? `缺失周：${item.missingWeeks.map(key => {
            const [y, w] = key.split('-W')
            return `${y} 年第 ${Number(w)} 周`
          }).join(', ')}`
        : ''
      const parts = [daysText, weeksText].filter(Boolean).join('，')
      lines.push(`• ${item.year} 年 ${item.month} 月 ${parts}`)
    })
  }

  if (missing?.yearly?.length) {
    lines.push('年总结发现缺失月份：')
    missing.yearly.forEach(item => {
      const months = item.missingMonths.map(m => `${m.month} 月`).join(', ')
      lines.push(`• ${item.year} 年 缺失 ${months}`)
    })
  }

  if (incomplete?.weekly?.length || incomplete?.monthly?.length) {
    lines.push('以下周期尚未结束，已跳过：')
    incomplete.weekly?.forEach(item => {
      lines.push(`• ${item.year} 年第 ${item.week} 周`)
    })
    incomplete.monthly?.forEach(item => {
      lines.push(`• ${item.year} 年 ${item.month} 月`)
    })
  }

  return lines.join('\n')
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
  contentTypeFilter.value = null
  energyRangeFilter.value = [0, 10]
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
      ...config.etl
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
      console.log('[DataBoardTab] ETL Complete, starting data refresh and summary generation...')
      etlStats.value = {
        total: data.data.stats.total,
        processed: data.data.stats.processed,
        cached: data.data.stats.cached,
        failed: data.data.stats.failed
      }
      refreshData().then(async () => {
        console.log('[DataBoardTab] Data refreshed, starting summary generation...')
        etlProcessing.value = false
        showMessage(
          `智能增强完成！总计 ${data.data.stats.total} 条，处理 ${data.data.stats.processed} 条，缓存 ${data.data.stats.cached} 条`, 
          data.data.stats.failed > 0 ? 'warning' : 'success'
        )
        
        // ETL 完成后自动生成总结
        await startSummaryGeneration()
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

// 总结生成
const startSummaryGeneration = async (allowMissingData = false) => {
  try {
    console.log('[DataBoardTab] Starting summary generation...')
    summaryProcessing.value = true
    summaryMessage.value = '正在检查需要生成的总结...'
    
    const result = await window.electron.ipcRenderer.invoke('summary:auto-generate', {
      generateWeekly: true,
      generateMonthly: true,
      allowMissingData
    })
    
    if (result?.requiresConfirm && !allowMissingData) {
      summaryProcessing.value = false
      summaryMessage.value = ''
      dialog.warning({
        title: '总结数据不完整',
        content: () => h('div', { style: 'white-space: pre-line;' }, formatMissingMessage(result.missing, result.incomplete)),
        positiveText: '继续总结',
        negativeText: '取消总结',
        onPositiveClick: () => {
          return startSummaryGeneration(true)
        },
        onNegativeClick: () => showMessage('已取消总结，请补充数据后再试', 'info')
      })
      return
    }

    if (result.error) {
      console.error('[DataBoardTab] Summary generation error:', result.error)
      showMessage(`总结生成失败: ${result.error}`, 'error')
    } else {
      summaryStats.value = {
        weeklyGenerated: result.weeklyGenerated || 0,
        monthlyGenerated: result.monthlyGenerated || 0,
        errors: result.errors || []
      }
      
      const totalGenerated = (result.weeklyGenerated || 0) + (result.monthlyGenerated || 0)
      if (totalGenerated > 0) {
        showMessage(`总结生成完成！周总结 ${result.weeklyGenerated} 篇，月总结 ${result.monthlyGenerated} 篇`, 'success')
        
        // 刷新总结数据以显示新生成的总结
        const summaryData = await window.electron.ipcRenderer.invoke('summary:get-all')
        if (summaryData && !summaryData.error && Array.isArray(summaryData)) {
          summaries.value = summaryData
          console.log('[DataBoardTab] Refreshed summaries:', summaryData.length, 'items')
        }
      } else {
        showMessage('所有总结均已是最新，无需重新生成', 'info')
      }

      if (result.incompleteSkipped > 0) {
        showMessage('部分周期尚未结束，已跳过生成', 'warning')
      }
    }
  } catch (error) {
    console.error('[DataBoardTab] Summary generation failed:', error)
    showMessage(`总结生成失败: ${error.message}`, 'error')
  } finally {
    summaryProcessing.value = false
    summaryMessage.value = ''
  }
}

// 总结事件处理
const handleSummaryEvent = (data) => {
  if (!data || !data.type) return
  
  console.log('[DataBoardTab] Summary Event:', data.type, data.data)
  
  switch (data.type) {
    case 'summary-progress':
      summaryMessage.value = data.data.message || '正在生成总结...'
      break
      
    case 'summary-complete':
      summaryStats.value = {
        weeklyGenerated: data.data.weeklyGenerated || 0,
        monthlyGenerated: data.data.monthlyGenerated || 0,
        errors: data.data.errors || []
      }
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
      
      // 并行加载记录和总结
      const [data, summaryData] = await Promise.all([
        window.electron.ipcRenderer.invoke('etl:get-enriched-data'),
        window.electron.ipcRenderer.invoke('summary:get-all')
      ])
      
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
      
      // 加载总结数据
      if (summaryData && !summaryData.error && Array.isArray(summaryData)) {
        summaries.value = summaryData
        console.log('[DataBoardTab] Auto-loaded summaries:', summaryData.length, 'items')
      }
    } catch (error) {
      console.error('[DataBoardTab] Error auto-loading data:', error)
      showMessage('自动加载数据失败', 'error')
    } finally {
      loading.value = false
    }
    
    // 注册 ETL 事件监听
    window.electron.ipcRenderer.on('etl:event', handleETLEvent)
    
    // 注册总结事件监听
    window.electron.ipcRenderer.on('summary:event', handleSummaryEvent)
  }
})

onUnmounted(() => {
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('etl:event')
    window.electron.ipcRenderer.removeAllListeners('summary:event')
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
