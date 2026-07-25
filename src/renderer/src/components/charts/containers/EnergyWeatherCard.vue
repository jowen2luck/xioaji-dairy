<template>
  <n-card title="能量气象站" size="small" :bordered="false" class="energy-weather-card">
    <template #header-extra>
      <n-space>
        <n-select
          v-model:value="groupBy"
          :options="groupByOptions"
          size="small"
          style="width: 100px"
        />
        <n-button text @click="refresh">
          <template #icon>
            <n-icon><RefreshOutline /></n-icon>
          </template>
        </n-button>
      </n-space>
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
      <!-- 趋势图 -->
      <div class="trend-chart-wrapper">
        <TrendLineChart :data="trendData" />
      </div>

      <!-- 生理状态图表 -->
      <div class="sensations-section" v-if="topSensations.length > 0">
        <n-divider />
        <div class="section-title">生理状态频率</div>
        <div class="sensation-bars">
          <div v-for="item in topSensations" :key="item.word" class="sensation-bar-item">
            <div class="sensation-label">
              <span :class="['sensation-dot', `sensation-${getValenceClass(item.valence)}`]"></span>
              <span class="sensation-word">{{ item.word }}</span>
            </div>
            <div class="sensation-bar-wrapper">
              <n-progress
                type="line"
                :percentage="getPercentage(item.count)"
                :height="12"
                :show-indicator="false"
                :color="getProgressColor(item.valence)"
                rail-color="rgba(255,255,255,0.1)"
              />
            </div>
            <span class="sensation-count">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- 情绪价值分布图表 -->
      <div class="valence-section" v-if="valenceRatio">
        <n-divider />
        <div class="section-title">情绪价值分布</div>
        <div class="valence-chart">
          <!-- 堆叠进度条 -->
          <div class="valence-stacked-bar">
            <div 
              class="valence-segment positive" 
              :style="{ width: valenceRatio.positive + '%' }"
              v-if="valenceRatio.positive > 0"
            >
              <span v-if="valenceRatio.positive > 10">{{ valenceRatio.positive }}%</span>
            </div>
            <div 
              class="valence-segment neutral" 
              :style="{ width: valenceRatio.neutral + '%' }"
              v-if="valenceRatio.neutral > 0"
            >
              <span v-if="valenceRatio.neutral > 10">{{ valenceRatio.neutral }}%</span>
            </div>
            <div 
              class="valence-segment negative" 
              :style="{ width: valenceRatio.negative + '%' }"
              v-if="valenceRatio.negative > 0"
            >
              <span v-if="valenceRatio.negative > 10">{{ valenceRatio.negative }}%</span>
            </div>
          </div>
          <!-- 图例 -->
          <div class="valence-legend">
            <div class="legend-item">
              <span class="legend-dot positive"></span>
              <span>积极 {{ valenceRatio.positive }}%</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot neutral"></span>
              <span>中性 {{ valenceRatio.neutral }}%</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot negative"></span>
              <span>消极 {{ valenceRatio.negative }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NCard, NSpace, NButton, NIcon, NSpin, NAlert, NDivider, NSelect, NProgress } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import TrendLineChart from '../base/TrendLineChart.vue'

const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0
  }
})

const loading = ref(false)
const error = ref(null)
const rawData = ref(null)
const groupBy = ref('day')

const groupByOptions = [
  { label: '按日', value: 'day' },
  { label: '按周', value: 'week' }
]

// 趋势数据（格式化为图表所需格式）
const trendData = computed(() => {
  if (!rawData.value?.trends) return []
  return rawData.value.trends.map(item => ({
    period: item.period,
    energy: item.avgEnergy,
    focus: item.avgFocus
  }))
})

// Top 生理感受词（取前8个）
const topSensations = computed(() => {
  if (!rawData.value?.sensations) return []
  return rawData.value.sensations.slice(0, 8)
})

// 正负比率
const valenceRatio = computed(() => rawData.value?.valenceRatio || null)

// 计算最大值用于百分比
const maxSensationCount = computed(() => {
  if (!topSensations.value.length) return 1
  return Math.max(...topSensations.value.map(s => s.count))
})

// 获取百分比
function getPercentage(count) {
  return Math.round((count / maxSensationCount.value) * 100)
}

// 根据情绪价值决定样式类
function getValenceClass(valence) {
  if (valence === 'Positive') return 'positive'
  if (valence === 'Negative') return 'negative'
  return 'neutral'
}

// 获取进度条颜色
function getProgressColor(valence) {
  if (valence === 'Positive') return '#63e2b7'
  if (valence === 'Negative') return '#e88080'
  return '#70c0e8'
}

// 调用工具获取数据
async function fetchData() {
  loading.value = true
  error.value = null

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'insight_analyst',
      {
        analysisType: 'biorhythm_stats',
        params: { groupBy: groupBy.value }
      }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    // ToolResult 多层嵌套：result.data.data.data 是真正的分析结果
    const resultData = result.data?.data?.data || result.data?.data || null
    rawData.value = resultData
  } catch (err) {
    console.error('[EnergyWeatherCard] 数据获取失败:', err)
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
.energy-weather-card {
  height: 100%;
}

.loading-container,
.error-container {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.trend-chart-wrapper {
  height: 300px;
}

.sensations-section,
.valence-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--n-text-color);
  opacity: 0.7;
}

/* 生理状态条形图 */
.sensation-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sensation-bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sensation-label {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 80px;
  flex-shrink: 0;
}

.sensation-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sensation-dot.sensation-positive {
  background: #63e2b7;
}

.sensation-dot.sensation-negative {
  background: #e88080;
}

.sensation-dot.sensation-neutral {
  background: #70c0e8;
}

.sensation-word {
  font-size: 13px;
  color: var(--n-text-color);
}

.sensation-bar-wrapper {
  flex: 1;
}

.sensation-count {
  width: 32px;
  text-align: right;
  font-size: 12px;
  color: var(--n-text-color);
  opacity: 0.7;
}

/* 情绪价值分布图表 */
.valence-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.valence-stacked-bar {
  display: flex;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
}

.valence-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  transition: width 0.3s ease;
}

.valence-segment.positive {
  background: linear-gradient(90deg, #63e2b7, #36d399);
}

.valence-segment.neutral {
  background: linear-gradient(90deg, #70c0e8, #4fa8d5);
}

.valence-segment.negative {
  background: linear-gradient(90deg, #e88080, #d66969);
}

.valence-legend {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend-dot.positive {
  background: #63e2b7;
}

.legend-dot.neutral {
  background: #70c0e8;
}

.legend-dot.negative {
  background: #e88080;
}
</style>
