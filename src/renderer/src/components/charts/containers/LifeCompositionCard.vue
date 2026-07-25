<template>
  <n-card title="生活重心" hoverable>
    <template #header-extra>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-icon :component="InfoIcon" />
        </template>
        识别生命时间的主要流向
      </n-tooltip>
    </template>
    
    <n-spin :show="loading">
      <div v-if="!error && chartData.length > 0" class="chart-container">
        <RoseChart :data="chartData" />
      </div>
      <n-empty v-else-if="!loading && chartData.length === 0" description="暂无数据" />
      <div v-else-if="error" class="error-message">
        <n-result status="error" :title="error" />
      </div>
    </n-spin>
  </n-card>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { InformationCircleOutline as InfoIcon } from '@vicons/ionicons5'
import RoseChart from '../base/RoseChart.vue'

const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0
  }
})

const loading = ref(false)
const error = ref(null)
const chartData = ref([])

const fetchData = async () => {
  loading.value = true
  error.value = null
  
  try {
    // 调用后端 IPC
    const response = await window.electron.ipcRenderer.invoke('tool-execute', 'insight_analyst', {
      analysisType: 'life_composition'
    })
    
    if (response.isError || !response.data) {
      throw new Error(response.data?.error || '数据获取失败')
    }
    
    // ToolResult 多层嵌套：response.data.data.data 是真正的分析结果
    const resultData = response.data?.data?.data || response.data?.data || []
    chartData.value = Array.isArray(resultData) ? resultData : []
    console.log('[LifeCompositionCard] Data loaded:', chartData.value.length)
  } catch (err) {
    console.error('[LifeCompositionCard] Error:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})

watch(
  () => props.refreshKey,
  () => {
    fetchData()
  }
)
</script>

<style scoped>
.chart-container {
  height: 400px;
}

.error-message {
  text-align: center;
  padding: 40px 0;
}
</style>
