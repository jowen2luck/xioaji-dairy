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
import { ref, computed, onMounted } from 'vue'
import { NCard, NButton, NIcon, NSpin, NAlert, NTag, NSpace, NDivider, NGrid, NGi, NStatistic } from 'naive-ui'
import { RefreshOutline, CheckmarkCircleOutline } from '@vicons/ionicons5'
import ScatterChart from '../base/ScatterChart.vue'
import { quadrantConfig } from '../../../config/chartsConfig.js'

const loading = ref(false)
const error = ref(null)
const rawData = ref([])

// 散点数据
const scatterData = computed(() => {
  return rawData.value.map(record => ({
    energy: record._ai_meta?.energy_level || 0,
    agency: record._ai_meta?.agency_level || 0,
    label: record._ai_meta?.main_action || '未知',
    tooltip: record._ai_meta?.root_cause || ''
  }))
})

// 象限统计
const quadrantStats = computed(() => {
  if (rawData.value.length === 0) return null

  const stats = {
    flow: { label: quadrantConfig.labels.flow, count: 0, percentage: 0 },
    relax: { label: quadrantConfig.labels.relax, count: 0, percentage: 0 },
    fight: { label: quadrantConfig.labels.fight, count: 0, percentage: 0 },
    helpless: { label: quadrantConfig.labels.helpless, count: 0, percentage: 0 }
  }

  // 获取分界线：使用配置中的固定值，或动态计算中位数
  let energyMidpoint = quadrantConfig.energyMidpoint
  let agencyMidpoint = quadrantConfig.agencyMidpoint

  if (energyMidpoint === null || agencyMidpoint === null) {
    // 动态计算中位数（注意：需要复制数组以避免修改原数组）
    const energies = rawData.value.map(r => r._ai_meta?.energy_level || 5)
    const agencies = rawData.value.map(r => r._ai_meta?.agency_level || 0)
    
    // 使用展开运算符复制数组后再排序
    if (energyMidpoint === null) {
      const sortedEnergies = [...energies].sort((a, b) => a - b)
      energyMidpoint = sortedEnergies[Math.floor(sortedEnergies.length / 2)]
    }
    if (agencyMidpoint === null) {
      const sortedAgencies = [...agencies].sort((a, b) => a - b)
      agencyMidpoint = sortedAgencies[Math.floor(sortedAgencies.length / 2)]
    }
  }

  rawData.value.forEach(record => {
    const energy = record._ai_meta?.energy_level || 5
    const agency = record._ai_meta?.agency_level || 0

    // 使用分界线判断象限
    if (energy >= energyMidpoint && agency >= agencyMidpoint) stats.flow.count++
    else if (energy < energyMidpoint && agency >= agencyMidpoint) stats.relax.count++
    else if (energy >= energyMidpoint && agency < agencyMidpoint) stats.fight.count++
    else stats.helpless.count++
  })

  const total = rawData.value.length
  Object.keys(stats).forEach(key => {
    stats[key].percentage = Math.round((stats[key].count / total) * 100)
  })

  return stats
})

// 获取数据
async function fetchData() {
  loading.value = true
  error.value = null

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'query_records',
      { limit: 500 }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    // ToolResult 多层嵌套：result.data.data 包含 records 属性
    const toolData = result.data?.data || result.data
    const records = toolData?.records || []

    // 过滤有效数据
    rawData.value = records.filter(r =>
      r._ai_meta &&
      typeof r._ai_meta.energy_level === 'number' &&
      typeof r._ai_meta.agency_level === 'number'
    )

    if (rawData.value.length === 0) {
      throw new Error('暂无可用的状态数据')
    }

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
