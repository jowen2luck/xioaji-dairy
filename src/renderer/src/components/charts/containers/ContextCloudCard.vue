<template>
  <n-card title="物与境" hoverable>
    <template #header-extra>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-icon :component="InfoIcon" />
        </template>
        识别生活中的高频场域与器物
      </n-tooltip>
    </template>
    
    <n-spin :show="loading">
      <n-tabs type="line" v-if="!error">
        <n-tab-pane name="locations" tab="场域">
          <div v-if="cloudData.locations.length > 0" class="chart-container">
            <WordCloudChart :data="cloudData.locations" title="场域" />
          </div>
          <n-empty v-else description="暂无场域数据" />
        </n-tab-pane>
        
        <n-tab-pane name="items" tab="器物">
          <div v-if="cloudData.items.length > 0" class="chart-container">
            <WordCloudChart :data="cloudData.items" title="器物" />
          </div>
          <n-empty v-else description="暂无器物数据" />
        </n-tab-pane>
      </n-tabs>
      
      <div v-else class="error-message">
        <n-result status="error" :title="error" />
      </div>
    </n-spin>
  </n-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { InformationCircleOutline as InfoIcon } from '@vicons/ionicons5'
import WordCloudChart from '../base/WordCloudChart.vue'

const loading = ref(false)
const error = ref(null)
const cloudData = ref({
  locations: [],
  items: []
})

const fetchData = async () => {
  loading.value = true
  error.value = null
  
  try {
    const response = await window.electron.ipcRenderer.invoke('tool-execute', 'sql_analysis', {
      analysisType: 'context_cloud',
      params: { limit: 30 }
    })
    
    if (response.isError || !response.data) {
      throw new Error(response.data?.error || '数据获取失败')
    }
    
    // ToolResult 多层嵌套：response.data.data.data 是真正的分析结果
    const resultData = response.data?.data?.data || response.data?.data || { locations: [], items: [] }
    cloudData.value = resultData
    console.log('[ContextCloudCard] Data loaded:', {
      locations: cloudData.value.locations?.length || 0,
      items: cloudData.value.items?.length || 0
    })
  } catch (err) {
    console.error('[ContextCloudCard] Error:', err)
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
  height: 350px;
}

.error-message {
  text-align: center;
  padding: 40px 0;
}
</style>
