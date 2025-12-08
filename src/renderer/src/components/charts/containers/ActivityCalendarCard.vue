<template>
  <n-card title="律动" hoverable>
    <template #header-extra>
      <n-space>
        <n-select
          v-model:value="selectedYear"
          :options="yearOptions"
          size="small"
          style="width: 100px"
          @update:value="fetchData"
        />
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-icon :component="InfoIcon" />
          </template>
          识别周期性的"留白"或"爆发"模式
        </n-tooltip>
      </n-space>
    </template>
    
    <n-spin :show="loading">
      <div v-if="!error && calendarData.length > 0" class="chart-container">
        <CalendarHeatmap :data="calendarData" :year="selectedYear" />
      </div>
      <n-empty v-else-if="!loading && calendarData.length === 0" description="暂无数据" />
      <div v-else-if="error" class="error-message">
        <n-result status="error" :title="error" />
      </div>
    </n-spin>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { InformationCircleOutline as InfoIcon } from '@vicons/ionicons5'
import CalendarHeatmap from '../base/CalendarHeatmap.vue'

const loading = ref(false)
const error = ref(null)
const calendarData = ref([])
const selectedYear = ref(new Date().getFullYear())

// 生成最近5年的选项
const yearOptions = computed(() => {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 5 }, (_, i) => ({
    label: `${currentYear - i}年`,
    value: currentYear - i
  }))
})

const fetchData = async () => {
  loading.value = true
  error.value = null
  
  try {
    const response = await window.electron.ipcRenderer.invoke('tool-execute', 'sql_analysis', {
      analysisType: 'activity_calendar',
      params: {
        dateRange: {
          start: `${selectedYear.value}-01-01`,
          end: `${selectedYear.value}-12-31`
        }
      }
    })
    
    if (response.isError || !response.data) {
      throw new Error(response.data?.error || '数据获取失败')
    }
    
    // ToolResult 多层嵌套：response.data.data.data 是真正的分析结果
    const resultData = response.data?.data?.data || response.data?.data || []
    calendarData.value = Array.isArray(resultData) ? resultData : []
    console.log('[ActivityCalendarCard] Data loaded:', calendarData.value.length)
  } catch (err) {
    console.error('[ActivityCalendarCard] Error:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.chart-container {
  height: 280px;
}

.error-message {
  text-align: center;
  padding: 40px 0;
}
</style>
