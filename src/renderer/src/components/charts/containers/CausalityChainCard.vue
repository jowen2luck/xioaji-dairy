<template>
  <n-card title="因果链路" size="small" :bordered="false" class="causality-card">
    <template #header-extra>
      <n-space size="small">
        <n-select
          v-model:value="selectedMood"
          :options="moodOptions"
          size="small"
          style="width: 120px"
          @update:value="analyze"
        />
        <n-button text @click="analyze">
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
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
      <div class="chain-header">
        <n-tag type="warning" size="large" round>
          {{ selectedMood }}
        </n-tag>
        <span class="chain-arrow">→</span>
        <span class="chain-label">常见触发因</span>
        <span class="chain-arrow">→</span>
        <span class="chain-label">对应行为</span>
      </div>

      <!-- 因果流 -->
      <div class="causality-flows">
        <div
          v-for="(flow, index) in causalityFlows"
          :key="index"
          class="flow-item"
        >
          <div class="flow-cause">
            <n-tag size="small" type="info">{{ flow.cause }}</n-tag>
            <span class="flow-count">{{ flow.count }}次</span>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-actions">
            <n-tag
              v-for="action in flow.actions"
              :key="action.name"
              size="small"
              :bordered="false"
            >
              {{ action.name }} ({{ action.count }})
            </n-tag>
          </div>
        </div>
        <n-empty v-if="causalityFlows.length === 0" description="暂无因果链路数据" />
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { NCard, NSpace, NButton, NIcon, NSpin, NAlert, NTag, NEmpty, NSelect } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'

const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0
  }
})

const loading = ref(false)
const error = ref(null)
const causalityFlows = ref([])
const selectedMood = ref('焦虑')

const moodOptions = [
  { label: '焦虑', value: '焦虑' },
  { label: '沮丧', value: '沮丧' },
  { label: '孤独', value: '孤独' },
  { label: '开心', value: '开心' },
  { label: '满足', value: '满足' }
]

// 分析数据
async function analyze() {
  loading.value = true
  error.value = null

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'insight_analyst',
      {
        analysisType: 'causality_chain',
        params: {
          moodTag: selectedMood.value,
          limit: 200
        }
      }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    const toolPayload = result.data?.data || null
    const analysis = toolPayload?.data || null
    const flows = analysis?.flows || []
    causalityFlows.value = Array.isArray(flows) ? flows : []

  } catch (err) {
    console.error('[CausalityChainCard] 分析失败:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  analyze()
})

watch(
  () => props.refreshKey,
  () => {
    analyze()
  }
)
</script>

<style scoped>
.causality-card {
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
  gap: 20px;
}

.chain-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--n-color-embedded);
  border-radius: 8px;
  justify-content: center;
}

.chain-arrow {
  font-size: 20px;
  font-weight: bold;
  color: var(--n-primary-color);
}

.chain-label {
  font-size: 14px;
  color: var(--n-text-color-2);
  font-weight: 500;
}

.causality-flows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.flow-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--n-color);
  border-radius: 8px;
  border: 1px solid var(--n-border-color);
  transition: all 0.3s;
}

.flow-item:hover {
  border-color: var(--n-primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.flow-cause {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 150px;
}

.flow-count {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.flow-arrow {
  font-size: 18px;
  font-weight: bold;
  color: var(--n-primary-color);
}

.flow-actions {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
