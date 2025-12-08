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
import { ref, computed, onMounted } from 'vue'
import { NCard, NSpace, NButton, NIcon, NSpin, NAlert, NTag, NEmpty, NSelect } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'

const loading = ref(false)
const error = ref(null)
const rawRecords = ref([])
const selectedMood = ref('焦虑')

const moodOptions = [
  { label: '焦虑', value: '焦虑' },
  { label: '沮丧', value: '沮丧' },
  { label: '孤独', value: '孤独' },
  { label: '开心', value: '开心' },
  { label: '满足', value: '满足' }
]

// 提取关键词（简单实现）
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return []
  
  // 使用正则匹配中文词组（2-6字）
  const matches = text.match(/[\u4e00-\u9fa5]{2,6}/g) || []
  
  // 统计词频
  const wordFreq = {}
  matches.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1
  })
  
  // 返回 Top 5 高频词
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }))
}

// 因果流数据
const causalityFlows = computed(() => {
  if (rawRecords.value.length === 0) return []
  
  // 收集所有 root_cause
  const allCauses = rawRecords.value
    .map(r => r._ai_meta?.root_cause)
    .filter(Boolean)
    .join(' ')
  
  // 提取关键词
  const keywords = extractKeywords(allCauses)
  
  // 为每个关键词构建行为链
  return keywords.map(kw => {
    // 找出包含该关键词的记录
    const relatedRecords = rawRecords.value.filter(r =>
      r._ai_meta?.root_cause?.includes(kw.word)
    )
    
    // 统计对应的行为
    const actionCount = {}
    relatedRecords.forEach(r => {
      const action = r._ai_meta?.main_action
      if (action) {
        actionCount[action] = (actionCount[action] || 0) + 1
      }
    })
    
    // 转换为数组
    const actions = Object.entries(actionCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    
    return {
      cause: kw.word,
      count: kw.count,
      actions
    }
  })
})

// 分析数据
async function analyze() {
  loading.value = true
  error.value = null

  try {
    // 获取特定情绪的记录
    const result = await window.electron.ipcRenderer.invoke(
      'tool-execute',
      'query_records',
      {
        moodTags: [selectedMood.value],
        limit: 200
      }
    )

    if (result.isError || !result.data) {
      throw new Error(result.data?.error || '数据获取失败')
    }

    const toolData = result.data.data || result.data
    rawRecords.value = toolData.records || []

    if (rawRecords.value.length === 0) {
      throw new Error(`暂无"${selectedMood.value}"相关的记录`)
    }

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
