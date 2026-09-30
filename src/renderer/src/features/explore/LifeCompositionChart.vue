<template>
  <n-card title="生活重心" hoverable size="small">
    <template #header-extra>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-icon :component="InfoIcon" />
        </template>
        基于 EvidencePack 数据驱动
      </n-tooltip>
    </template>

    <div v-if="chartData.length > 0" class="chart-container">
      <RoseChart :data="chartData" />
    </div>
    <n-empty v-else description="暂无分布数据" />
  </n-card>
</template>

<script setup>
import { computed } from 'vue'
import { InformationCircleOutline as InfoIcon } from '@vicons/ionicons5'
import RoseChart from '../../components/charts/base/RoseChart.vue'

const props = defineProps({
  /** EvidencePack metrics array */
  metrics: { type: Array, default: () => [] },
})

// Find life composition metric and transform to chart data
const chartData = computed(() => {
  const composition = props.metrics.find(m =>
    m.operation === 'life_composition' || m.label?.includes('Composition')
  )
  if (!composition || !composition.value) return []
  const value = composition.value
  if (Array.isArray(value)) return value
  if (typeof value === 'object') {
    return Object.entries(value).map(([name, val]) => ({ name, value: val }))
  }
  return []
})
</script>

<style scoped>
.chart-container { height: 300px; }
</style>
