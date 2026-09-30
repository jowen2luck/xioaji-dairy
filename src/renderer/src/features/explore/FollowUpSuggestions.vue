<template>
  <div class="followup-suggestions">
    <span class="label">Suggestions:</span>
    <n-tag
      v-for="suggestion in suggestions"
      :key="suggestion"
      size="small"
      type="success"
      clickable
      @click="$emit('select', suggestion)"
    >
      {{ suggestion }}
    </n-tag>
  </div>
</template>

<script setup>
import { NTag } from 'naive-ui'

defineProps({
  suggestions: { type: Array, default: () => [] },
})

defineEmits(['select'])
</script>

<style scoped>
.followup-suggestions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 0;
}
.label { font-size: 12px; color: #999; }
</style>
