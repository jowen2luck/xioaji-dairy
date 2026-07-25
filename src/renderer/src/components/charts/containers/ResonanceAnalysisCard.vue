<template>
  <n-card title="共振分析" size="small" :bordered="false" class="resonance-card">
    <template #header-extra>
      <n-space size="small">
        <n-select
          v-model:value="selectedDimension"
          :options="dimensionOptions"
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
      <n-grid :x-gap="16" :y-gap="16" :cols="2">
        <!-- 赋能榜（绿色） -->
        <n-gi>
          <div class="ranking-section boosters">
            <div class="section-header">
              <n-icon size="20" color="#52c41a"><TrendingUpOutline /></n-icon>
              <span class="section-title">赋能者（Boosters）</span>
            </div>
            <div class="ranking-list">
              <div
                v-for="(item, index) in boosters"
                :key="item.name"
                class="ranking-item booster-item"
              >
                <div class="rank-badge">{{ index + 1 }}</div>
                <div class="item-info">
                  <div class="item-name">{{ item.name }}</div>
                  <div class="item-stats">
                    平均能量: {{ item.avg.toFixed(1) }} | 提升: +{{ item.impact.toFixed(1) }}
                  </div>
                </div>
                <div class="item-count">{{ item.count }}次</div>
              </div>
              <n-empty v-if="boosters.length === 0" description="暂无数据" size="small" />
            </div>
          </div>
        </n-gi>

        <!-- 消耗榜（红色） -->
        <n-gi>
          <div class="ranking-section drainers">
            <div class="section-header">
              <n-icon size="20" color="#ff4d4f"><TrendingDownOutline /></n-icon>
              <span class="section-title">消耗者（Drainers）</span>
            </div>
            <div class="ranking-list">
              <div
                v-for="(item, index) in drainers"
                :key="item.name"
                class="ranking-item drainer-item"
              >
                <div class="rank-badge">{{ index + 1 }}</div>
                <div class="item-info">
                  <div class="item-name">{{ item.name }}</div>
                  <div class="item-stats">
                    平均能量: {{ item.avg.toFixed(1) }} | 降低: {{ item.impact.toFixed(1) }}
                  </div>
                </div>
                <div class="item-count">{{ item.count }}次</div>
              </div>
              <n-empty v-if="drainers.length === 0" description="暂无数据" size="small" />
            </div>
          </div>
        </n-gi>
      </n-grid>
    </div>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NCard, NSpace, NButton, NIcon, NSpin, NAlert, NGrid, NGi, NEmpty, NSelect } from 'naive-ui'
import { RefreshOutline, TrendingUpOutline, TrendingDownOutline } from '@vicons/ionicons5'

const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0
  }
})

const loading = ref(false)
const error = ref(null)
const selectedDimension = ref('location')
const boostersData = ref([])
const drainersData = ref([])

const dimensionOptions = [
  { label: '地点', value: 'location' },
  { label: '人物', value: 'people_involved' },
  { label: '物品', value: 'items' }
]

const boosters = computed(() => boostersData.value || [])
const drainers = computed(() => drainersData.value || [])

// 分析数据
async function analyze() {
  loading.value = true
  error.value = null

  try {
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'insight_analyst',
      {
        analysisType: 'resonance_analysis',
        params: { dimension: selectedDimension.value }
      }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    const toolPayload = result.data?.data || null
    const analysis = toolPayload?.data || null
    boostersData.value = Array.isArray(analysis?.boosters) ? analysis.boosters : []
    drainersData.value = Array.isArray(analysis?.drainers) ? analysis.drainers : []

  } catch (err) {
    console.error('[ResonanceAnalysisCard] 分析失败:', err)
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
.resonance-card {
  height: 100%;
}
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

.ranking-section {
  border-radius: 8px;
  padding: 16px;
  background: var(--n-color);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--n-divider-color);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color);
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  transition: all 0.3s;
}

.booster-item {
  background: rgba(82, 196, 26, 0.1);
  border-left: 3px solid #52c41a;
}

.booster-item:hover {
  background: rgba(82, 196, 26, 0.2);
  transform: translateX(4px);
}

.drainer-item {
  background: rgba(255, 77, 79, 0.1);
  border-left: 3px solid #ff4d4f;
}

.drainer-item:hover {
  background: rgba(255, 77, 79, 0.2);
  transform: translateX(4px);
}

.rank-badge {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--n-primary-color);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  font-weight: 500;
  color: var(--n-text-color);
  font-size: 14px;
}

.item-stats {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.item-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--n-text-color-3);
  padding: 4px 8px;
  background: var(--n-color-embedded);
  border-radius: 4px;
}
</style>
