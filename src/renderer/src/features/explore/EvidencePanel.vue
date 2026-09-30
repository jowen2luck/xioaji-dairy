<template>
  <div class="evidence-panel">
    <n-card size="small" title="Evidence">
      <div v-if="evidence.length === 0" class="empty-state">
        No evidence yet. Start by asking a question.
      </div>
      <div v-else class="evidence-list">
        <div
          v-for="ev in evidence"
          :key="ev.id"
          class="evidence-item"
          @click="$emit('select', ev)"
        >
          <div class="evidence-meta">
            <n-tag size="small" type="info">{{ ev.occurredAt?.slice(0, 10) }}</n-tag>
            <span v-if="ev.relevance" class="relevance-score">
              {{ (ev.relevance * 100).toFixed(0) }}%
            </span>
          </div>
          <div class="evidence-excerpt">{{ ev.excerpt }}</div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { NCard, NTag } from 'naive-ui'

defineProps({
  evidence: { type: Array, default: () => [] },
})

defineEmits(['select'])
</script>

<style scoped>
.evidence-panel { height: 100%; overflow: auto; }
.empty-state { padding: 20px; text-align: center; color: #999; }
.evidence-list { display: flex; flex-direction: column; gap: 8px; }
.evidence-item {
  padding: 8px 12px;
  border-left: 3px solid #2080f0;
  background: rgba(32, 128, 240, 0.05);
  cursor: pointer;
  transition: background 0.2s;
}
.evidence-item:hover { background: rgba(32, 128, 240, 0.1); }
.evidence-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.relevance-score { font-size: 12px; color: #999; }
.evidence-excerpt { font-size: 13px; color: #666; }
</style>
