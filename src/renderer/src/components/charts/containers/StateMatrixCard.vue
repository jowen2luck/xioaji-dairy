<template>
  <n-card title="状态象限" size="small" :bordered="false" class="state-matrix-card">
    <template #header-extra>
      <n-button text @click="refresh">
        <template #icon><n-icon><RefreshOutline /></n-icon></template>
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
      <!-- 散点图 -->
      <div class="chart-wrapper">
        <ScatterChart :data="scatterData" />
      </div>

      <!-- 四象限说明 -->
      <div class="legend-section">
        <n-space size="small">
          <n-tag type="success" size="small">
            <template #icon><n-icon><CheckmarkCircleOutline /></n-icon></template>
            心流区：高能量+高掌控
          </n-tag>
          <n-tag type="info" size="small">
            松弛区：低能量+高掌控
          </n-tag>
          <n-tag type="warning" size="small">
            战斗区：高能量+低掌控
          </n-tag>
          <n-tag type="error" size="small">
            无力区：低能量+低掌控
          </n-tag>
        </n-space>
      </div>

      <!-- 统计信息 -->
      <div class="stats-section" v-if="quadrantStats">
        <n-divider />
        <n-grid :x-gap="12" :y-gap="12" :cols="4">
          <n-gi v-for="(stat, key) in quadrantStats" :key="key">
            <n-statistic :label="stat.label" :value="stat.count">
              <template #suffix>条 ({{ stat.percentage }}%)</template>
            </n-statistic>
          </n-gi>
        </n-grid>
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NCard, NButton, NIcon, NSpin, NAlert, NTag, NSpace, NDivider, NGrid, NGi, NStatistic } from 'naive-ui'
import { RefreshOutline, CheckmarkCircleOutline } from '@vicons/ionicons5'
import ScatterChart from '../base/ScatterChart.vue'
import { quadrantConfig } from '../../../config/chartsConfig.js'

const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0
  }
})

const loading = ref(false)
const error = ref(null)
const points = ref([])
const backendStats = ref(null)

// 散点数据
const scatterData = computed(() => {
  return points.value || []
})

// 象限统计
const quadrantStats = computed(() => {
  if (!backendStats.value) return null
  const keys = ['flow', 'relax', 'fight', 'helpless']
  const mapped = {}
  keys.forEach(k => {
    mapped[k] = {
      label: quadrantConfig.labels[k],
      count: backendStats.value[k]?.count || 0,
      percentage: backendStats.value[k]?.percentage || 0
    }
  })
  return mapped
})

// 获取数据
async function fetchData() {
  loading.value = true
  error.value = null

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'insight_analyst',
      {
        analysisType: 'state_matrix',
        params: {
          energyMidpoint: quadrantConfig.energyMidpoint,
          agencyMidpoint: quadrantConfig.agencyMidpoint
        }
      }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    const toolPayload = result.data?.data || null
    const analysis = toolPayload?.data || null
    points.value = Array.isArray(analysis?.points) ? analysis.points : []
    backendStats.value = analysis?.quadrantStats || null

  } catch (err) {
    console.error('[StateMatrixCard] 数据获取失败:', err)
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

watch(
  () => props.refreshKey,
  () => {
    fetchData()
  }
)
</script>

<style scoped>
.state-matrix-card {
  height: 100%;
}

.loading-container,
.error-container {
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chart-wrapper {
  height: 450px;
}

.legend-section {
  display: flex;
  justify-content: center;
}

.stats-section {
  margin-top: 8px;
}
</style>
