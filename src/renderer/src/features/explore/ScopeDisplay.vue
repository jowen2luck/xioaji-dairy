<template>
  <div class="scope-display" v-if="hasScope">
    <span class="label">Scope:</span>
    <n-tag v-if="scope.dateRange?.start" size="small" type="warning">
      {{ scope.dateRange.start.slice(0, 10) }} ~ {{ scope.dateRange.end?.slice(0, 10) }}
    </n-tag>
    <n-tag v-for="p in (scope.projects || [])" :key="p" size="small" type="info">
      {{ p }}
    </n-tag>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NTag } from 'naive-ui'

const props = defineProps({
  scope: { type: Object, default: () => ({}) },
})

const hasScope = computed(() => {
  const s = props.scope
  return (s.dateRange?.start) || (s.projects && s.projects.length > 0)
})
</script>

<style scoped>
.scope-display {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  padding: 4px 0;
}
.label { font-size: 12px; color: #999; }
</style>
