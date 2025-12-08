<template>
  <n-card class="serendipity-card" :bordered="false">
    <template #header>
      <div class="card-header">
        <span class="header-icon">🎲</span>
        <span class="header-title">随机漫步</span>
        <n-button 
          quaternary 
          circle 
          size="tiny" 
          class="refresh-btn"
          @click="pickRandomRecord"
          :disabled="loading"
        >
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
        </n-button>
      </div>
    </template>
    
    <n-spin :show="loading" size="small">
      <div v-if="randomRecord" class="serendipity-content">
        <!-- 时间信息 -->
        <div class="record-time">
          <n-icon :component="TimeOutline" size="12" />
          <span>{{ formatRelativeTime(randomRecord.time) }}</span>
        </div>
        
        <!-- 金句展示 (如果有) -->
        <div v-if="displayQuote" class="quote-block">
          <div class="quote-mark">"</div>
          <div class="quote-text">{{ displayQuote }}</div>
        </div>
        
        <!-- 或者摘要/内容片段 -->
        <div v-else class="content-snippet">
          {{ getSnippet() }}
        </div>
        
        <!-- 情绪与能量 -->
        <div class="meta-row" v-if="randomRecord._ai_meta">
          <!-- 情绪标签 -->
          <div class="mood-chips" v-if="randomRecord._ai_meta.mood_tags?.length">
            <n-tag 
              v-for="mood in randomRecord._ai_meta.mood_tags.slice(0, 2)" 
              :key="mood"
              size="tiny" 
              round
              :bordered="false"
              class="mood-chip"
            >
              {{ mood }}
            </n-tag>
          </div>
          
          <!-- 能量值 -->
          <div class="energy-badge" v-if="randomRecord._ai_meta.energy_level">
            <span class="energy-icon">⚡</span>
            <span class="energy-num" :style="{ color: getEnergyColor() }">
              {{ randomRecord._ai_meta.energy_level }}
            </span>
          </div>
        </div>
        
        <!-- 项目标签 -->
        <div class="project-tag" v-if="randomRecord.shanggexiangmu">
          <n-tag size="small" :bordered="false" round>
            📁 {{ randomRecord.shanggexiangmu }}
          </n-tag>
        </div>
      </div>
      
      <!-- 无数据状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">🌟</div>
        <div class="empty-text">记录更多故事</div>
        <div class="empty-hint">让时光机器有更多惊喜可寻</div>
      </div>
    </n-spin>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { RefreshOutline, TimeOutline } from '@vicons/ionicons5'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { loadConfig } from '../config/assistant.ts'

const props = defineProps({
  allData: { type: Array, default: () => [] }
})

const loading = ref(false)
const randomRecord = ref(null)

// 获取配置中的筛选条件
const getSerendipityConfig = () => {
  try {
    const config = loadConfig()
    return config.serendipity || {
      preferHighEnergy: true,
      minEnergyLevel: 6,
      preferWithQuotes: true,
      excludeMoodTags: ['焦虑', '沮丧', '愤怒', '难过']
    }
  } catch {
    return {
      preferHighEnergy: true,
      minEnergyLevel: 6,
      preferWithQuotes: true,
      excludeMoodTags: ['焦虑', '沮丧', '愤怒', '难过']
    }
  }
}

// 随机选择一条记录
const pickRandomRecord = () => {
  if (!props.allData || props.allData.length === 0) {
    randomRecord.value = null
    return
  }
  
  loading.value = true
  
  const config = getSerendipityConfig()
  
  // 筛选候选记录
  let candidates = props.allData.filter(record => {
    // 必须有内容
    if (!record.ganshou || record.ganshou.trim().length === 0) return false
    
    // 优先选择高能量记录
    if (config.preferHighEnergy && record._ai_meta?.energy_level) {
      if (record._ai_meta.energy_level < config.minEnergyLevel) return false
    }
    
    // 排除负面情绪记录
    if (config.excludeMoodTags && record._ai_meta?.mood_tags) {
      const hasBadMood = record._ai_meta.mood_tags.some(
        tag => config.excludeMoodTags.includes(tag)
      )
      if (hasBadMood) return false
    }
    
    return true
  })
  
  // 如果筛选后没有记录，放宽条件
  if (candidates.length === 0) {
    candidates = props.allData.filter(record => 
      record.ganshou && record.ganshou.trim().length > 0
    )
  }
  
  // 优先选择有金句的记录
  if (config.preferWithQuotes) {
    const withQuotes = candidates.filter(r => 
      r._ai_meta?.key_quotes?.length > 0
    )
    if (withQuotes.length > 0) {
      candidates = withQuotes
    }
  }
  
  // 随机选择
  if (candidates.length > 0) {
    // 避免选择和当前相同的记录
    let attempts = 0
    let selected = null
    while (attempts < 5) {
      const randomIndex = Math.floor(Math.random() * candidates.length)
      selected = candidates[randomIndex]
      if (!randomRecord.value || selected._id !== randomRecord.value._id || candidates.length === 1) {
        break
      }
      attempts++
    }
    randomRecord.value = selected
  } else {
    randomRecord.value = null
  }
  
  setTimeout(() => {
    loading.value = false
  }, 300)
}

// 获取展示的金句
const displayQuote = computed(() => {
  if (!randomRecord.value?._ai_meta?.key_quotes?.length) return null
  const quotes = randomRecord.value._ai_meta.key_quotes
  // 随机选择一条金句
  return quotes[Math.floor(Math.random() * quotes.length)]
})

// 获取内容片段
const getSnippet = () => {
  if (!randomRecord.value) return ''
  
  // 优先使用 AI 摘要
  if (randomRecord.value._ai_meta?.summary) {
    return randomRecord.value._ai_meta.summary
  }
  
  // 否则截取原文
  const text = randomRecord.value.ganshou || ''
  const plainText = text.replace(/<[^>]+>/g, '').trim()
  return plainText.length > 100 ? plainText.slice(0, 100) + '...' : plainText
}

// 获取能量颜色
const getEnergyColor = () => {
  const level = randomRecord.value?._ai_meta?.energy_level || 0
  if (level >= 8) return '#22c55e'
  if (level >= 6) return '#f59e0b'
  return '#64748b'
}

// 格式化相对时间
const formatRelativeTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    return formatDistanceToNow(new Date(timeStr), { addSuffix: true, locale: zhCN })
  } catch {
    return timeStr
  }
}

// 监听数据变化
watch(() => props.allData, () => {
  if (!randomRecord.value) {
    pickRandomRecord()
  }
}, { immediate: true })

onMounted(() => {
  pickRandomRecord()
})
</script>

<style scoped>
.serendipity-card {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(168, 85, 247, 0.04) 100%);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 12px;
}

[data-theme="dark"] .serendipity-card {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(168, 85, 247, 0.06) 100%);
  border-color: rgba(139, 92, 246, 0.3);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 16px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #334155);
  flex: 1;
}

.refresh-btn {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.refresh-btn:hover {
  opacity: 1;
}

.serendipity-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.quote-block {
  position: relative;
  padding: 16px 16px 16px 24px;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 8px;
  border-left: 3px solid #8b5cf6;
}

[data-theme="dark"] .quote-block {
  background: rgba(139, 92, 246, 0.15);
}

.quote-mark {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 24px;
  font-family: serif;
  color: #8b5cf6;
  opacity: 0.5;
  line-height: 1;
}

.quote-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #334155);
  font-style: italic;
}

[data-theme="dark"] .quote-text {
  color: var(--color-text, #e2e8f0);
}

.content-snippet {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #334155);
  padding: 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 8px;
}

[data-theme="dark"] .content-snippet {
  background: rgba(0, 0, 0, 0.2);
  color: var(--color-text, #e2e8f0);
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mood-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mood-chip {
  background: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
}

[data-theme="dark"] .mood-chip {
  background: rgba(139, 92, 246, 0.25);
  color: #a78bfa;
}

.energy-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
}

[data-theme="dark"] .energy-badge {
  background: rgba(0, 0, 0, 0.2);
}

.energy-icon {
  font-size: 12px;
}

.energy-num {
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.project-tag {
  display: flex;
}

.empty-state {
  text-align: center;
  padding: 20px 0;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
  color: var(--color-text-secondary, #64748b);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--color-text-light, #94a3b8);
}
</style>
