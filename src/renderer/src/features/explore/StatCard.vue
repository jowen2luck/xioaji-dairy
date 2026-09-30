<template>
  <n-grid :x-gap="12" :y-gap="12" :cols="4">
    <n-gi v-for="metric in metrics" :key="metric.id">
      <n-card size="small" :title="metric.label">
        <n-statistic :value="metric.value !== null ? metric.value : 'N/A'">
          <template #suffix>{{ metric.unit || '' }}</template>
        </n-statistic>
        <template #footer>
          <n-text depth="3" style="font-size: 11px">
            Sample: {{ metric.sampleSize }} entries
          </n-text>
        </template>
      </n-card>
    </n-gi>
  </n-grid>
</template>

<script setup>
import { NGrid, NGi, NCard, NStatistic, NText } from 'naive-ui'

defineProps({
  /** EvidencePack computed metrics */
  metrics: { type: Array, default: () => [] },
})
</script>
