<template>
  <n-card title="需求金字塔" size="small" :bordered="false" class="pyramid-card">
    <template #header-extra>
      <n-button text @click="refresh">
        <template #icon>
          <n-icon><RefreshOutline /></n-icon>
        </template>
      </n-button>
    </template>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <n-spin size="medium" />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-container">
      <n-alert type="error" :title="error" />
    </div>

    <!-- 数据展示 -->
    <div v-else class="content-wrapper">
      <!-- 金字塔图 -->
      <div class="pyramid-wrapper">
        <PyramidChart :data="chartData" />
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { NCard, NButton, NIcon, NSpin, NAlert } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import PyramidChart from '../base/PyramidChart.vue'

const loading = ref(false)
const error = ref(null)
const rawData = ref(null)

// 图表数据
const chartData = computed(() => rawData.value || [])

// 调用工具获取数据
async function fetchData() {
  loading.value = true
  error.value = null

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'sql_analysis',
      {
        analysisType: 'psych_distribution'
      }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    // ToolResult 多层嵌套：result.data.data.data 是真正的分析结果
    const resultData = result.data?.data?.data || result.data?.data || []
    rawData.value = Array.isArray(resultData) ? resultData : []
  } catch (err) {
    console.error('[PyramidCard] 数据获取失败:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function refresh() {
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.pyramid-card {
  height: 100%;
}

.loading-container,
.error-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pyramid-wrapper {
  height: 400px;
}
</style>
