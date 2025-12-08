<template>
  <n-card class="flashback-card" :bordered="false">
    <template #header>
      <div class="card-header">
        <span class="header-icon">⏳</span>
        <span class="header-title">那年今日</span>
      </div>
    </template>
    
    <n-spin :show="loading" size="small">
      <div v-if="flashbackRecord" class="flashback-content">
        <!-- 时间标签 -->
        <div class="time-badge">
          <n-tag :type="getTimeBadgeType()" size="small" round>
            {{ getTimeLabel() }}
          </n-tag>
        </div>
        
        <!-- 情绪标签 -->
        <div v-if="flashbackRecord._ai_meta?.mood_tags?.length" class="mood-tags">
          <n-tag 
            v-for="mood in flashbackRecord._ai_meta.mood_tags.slice(0, 3)" 
            :key="mood"
            size="tiny" 
            round
            :bordered="false"
            class="mood-tag"
          >
            {{ mood }}
          </n-tag>
        </div>
        
        <!-- AI 摘要或原文摘录 -->
        <div class="summary-text">
          {{ getSummary() }}
        </div>
        
        <!-- 能量值指示 -->
        <div v-if="flashbackRecord._ai_meta?.energy_level" class="energy-indicator">
          <span class="energy-label">能量</span>
          <n-progress 
            type="line" 
            :percentage="flashbackRecord._ai_meta.energy_level * 10" 
            :height="6"
            :show-indicator="false"
            :color="getEnergyColor()"
          />
          <span class="energy-value">{{ flashbackRecord._ai_meta.energy_level }}/10</span>
        </div>
        
        <!-- 项目信息 -->
        <div class="project-info" v-if="flashbackRecord.shanggexiangmu">
          <n-icon :component="FolderOutline" size="12" />
          <span>{{ flashbackRecord.shanggexiangmu }}</span>
        </div>
      </div>
      
      <!-- 无数据状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">暂无历史同日记录</div>
        <div class="empty-hint">开始记录后，明年今日便能重温今天的故事</div>
      </div>
    </n-spin>
    
    <template #footer v-if="flashbackRecord">
      <div class="card-footer">
        <span class="footer-date">{{ formatFullDate(flashbackRecord.time) }}</span>
      </div>
    </template>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { FolderOutline } from '@vicons/ionicons5'

const props = defineProps({
  allData: { type: Array, default: () => [] }
})

const loading = ref(false)
const flashbackRecord = ref(null)
const yearsAgo = ref(1) // 几年前

// 查找历史同日记录
const findFlashbackRecord = () => {
  if (!props.allData || props.allData.length === 0) {
    flashbackRecord.value = null
    return
  }
  
  loading.value = true
  
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentDay = today.getDate()
  
  // 策略1: 尝试找去年今日
  let found = findRecordForDate(today.getFullYear() - 1, currentMonth, currentDay)
  if (found) {
    yearsAgo.value = 1
    flashbackRecord.value = found
    loading.value = false
    return
  }
  
  // 策略2: 尝试找前年今日
  found = findRecordForDate(today.getFullYear() - 2, currentMonth, currentDay)
  if (found) {
    yearsAgo.value = 2
    flashbackRecord.value = found
    loading.value = false
    return
  }
  
  // 策略3: 找上个月的今日
  const lastMonth = new Date(today.getFullYear(), currentMonth - 1, currentDay)
  found = findRecordForDate(lastMonth.getFullYear(), lastMonth.getMonth(), currentDay)
  if (found) {
    yearsAgo.value = 0 // 标记为上月
    flashbackRecord.value = found
    loading.value = false
    return
  }
  
  // 策略4: 找本周去年的高能量记录
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lastYearWeekRecords = props.allData.filter(record => {
    if (!record.time) return false
    const recordDate = new Date(record.time)
    const lastYearStart = new Date(today.getFullYear() - 1, currentMonth, currentDay - 7)
    const lastYearEnd = new Date(today.getFullYear() - 1, currentMonth, currentDay + 7)
    return recordDate >= lastYearStart && recordDate <= lastYearEnd
  })
  
  // 优先选择有 AI 增强且能量值高的记录
  if (lastYearWeekRecords.length > 0) {
    const sorted = lastYearWeekRecords.sort((a, b) => {
      const energyA = a._ai_meta?.energy_level || 0
      const energyB = b._ai_meta?.energy_level || 0
      return energyB - energyA
    })
    yearsAgo.value = 1
    flashbackRecord.value = sorted[0]
  } else {
    flashbackRecord.value = null
  }
  
  loading.value = false
}

// 查找特定日期的记录
const findRecordForDate = (year, month, day) => {
  return props.allData.find(record => {
    if (!record.time) return false
    const recordDate = new Date(record.time)
    return recordDate.getFullYear() === year && 
           recordDate.getMonth() === month && 
           recordDate.getDate() === day
  })
}

// 获取摘要文本
const getSummary = () => {
  if (!flashbackRecord.value) return ''
  
  // 优先使用 AI 摘要
  if (flashbackRecord.value._ai_meta?.summary) {
    return flashbackRecord.value._ai_meta.summary
  }
  
  // 否则截取原文
  const text = flashbackRecord.value.ganshou || ''
  const plainText = text.replace(/<[^>]+>/g, '').trim()
  return plainText.length > 80 ? plainText.slice(0, 80) + '...' : plainText
}

// 获取时间标签类型
const getTimeBadgeType = () => {
  if (yearsAgo.value === 0) return 'info'
  if (yearsAgo.value === 1) return 'warning'
  return 'success'
}

// 获取时间标签文字
const getTimeLabel = () => {
  if (yearsAgo.value === 0) return '上个月'
  if (yearsAgo.value === 1) return '去年今日'
  return `${yearsAgo.value}年前`
}

// 获取能量颜色
const getEnergyColor = () => {
  const level = flashbackRecord.value?._ai_meta?.energy_level || 0
  if (level >= 7) return '#22c55e'
  if (level >= 4) return '#f59e0b'
  return '#ef4444'
}

// 格式化完整日期
const formatFullDate = (timeStr) => {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

// 监听数据变化
watch(() => props.allData, () => {
  findFlashbackRecord()
}, { immediate: true })

onMounted(() => {
  findFlashbackRecord()
})
</script>

<style scoped>
.flashback-card {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(245, 158, 11, 0.04) 100%);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 12px;
}

[data-theme="dark"] .flashback-card {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.06) 100%);
  border-color: rgba(251, 191, 36, 0.3);
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
}

.flashback-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.time-badge {
  display: flex;
}

.mood-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mood-tag {
  background: rgba(251, 191, 36, 0.15);
  color: #b45309;
}

[data-theme="dark"] .mood-tag {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.summary-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #334155);
  padding: 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 8px;
  border-left: 3px solid #fbbf24;
}

[data-theme="dark"] .summary-text {
  background: rgba(0, 0, 0, 0.2);
  color: var(--color-text, #e2e8f0);
}

.energy-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.energy-label {
  color: var(--color-text-secondary, #64748b);
  flex-shrink: 0;
}

.energy-value {
  color: var(--color-text-secondary, #64748b);
  font-family: monospace;
  flex-shrink: 0;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
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

.card-footer {
  display: flex;
  justify-content: flex-end;
}

.footer-date {
  font-size: 11px;
  color: var(--color-text-light, #94a3b8);
}
</style>
