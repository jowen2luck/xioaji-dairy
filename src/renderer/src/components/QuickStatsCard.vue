<template>
  <n-card class="quick-stats-card" :bordered="false">
    <template #header>
      <div class="card-header">
        <span class="header-icon">📊</span>
        <span class="header-title">洞察概览</span>
      </div>
    </template>
    
    <div class="stats-content">
      <!-- 核心数字 -->
      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-value">{{ stats.totalRecords }}</div>
          <div class="stat-label">记录总数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" :style="{ color: getEnergyColor() }">
            {{ stats.avgEnergy }}
          </div>
          <div class="stat-label">平均能量</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ stats.thisMonthCount }}</div>
          <div class="stat-label">本月记录</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ stats.aiEnhancedRate }}%</div>
          <div class="stat-label">AI增强率</div>
        </div>
      </div>
      
      <!-- 本月情绪词云 (简化版：热门标签) -->
      <div class="mood-section" v-if="stats.topMoods.length > 0">
        <div class="section-label">近期情绪</div>
        <div class="mood-cloud">
          <n-tag 
            v-for="(mood, index) in stats.topMoods" 
            :key="mood.tag"
            :size="getMoodSize(index)"
            round
            :bordered="false"
            class="mood-cloud-tag"
            :style="{ opacity: 1 - index * 0.15 }"
          >
            {{ mood.tag }}
            <template #icon>
              <span class="mood-count">{{ mood.count }}</span>
            </template>
          </n-tag>
        </div>
      </div>
      
      <!-- 能量趋势迷你图 -->
      <div class="trend-section" v-if="stats.recentEnergy.length > 0">
        <div class="section-label">
          <span>能量趋势</span>
          <span class="trend-indicator" :class="trendDirection">
            {{ trendDirection === 'up' ? '↗' : trendDirection === 'down' ? '↘' : '→' }}
          </span>
        </div>
        <div class="mini-chart">
          <div 
            v-for="(energy, index) in stats.recentEnergy" 
            :key="index"
            class="chart-bar"
            :style="{ 
              height: `${energy * 10}%`,
              backgroundColor: getBarColor(energy)
            }"
            :title="`能量: ${energy}`"
          ></div>
        </div>
      </div>
      
      <!-- 高频项目 -->
      <div class="project-section" v-if="stats.topProject">
        <div class="section-label">最常投入</div>
        <div class="top-project">
          <n-tag type="info" size="small" round>
            📁 {{ stats.topProject.name }}
          </n-tag>
          <span class="project-hours">{{ stats.topProject.hours }}h</span>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  allData: { type: Array, default: () => [] }
})

const stats = ref({
  totalRecords: 0,
  avgEnergy: 0,
  thisMonthCount: 0,
  aiEnhancedRate: 0,
  topMoods: [],
  recentEnergy: [],
  topProject: null
})

// 计算统计数据
const calculateStats = () => {
  if (!props.allData || props.allData.length === 0) {
    stats.value = {
      totalRecords: 0,
      avgEnergy: 0,
      thisMonthCount: 0,
      aiEnhancedRate: 0,
      topMoods: [],
      recentEnergy: [],
      topProject: null
    }
    return
  }
  
  const data = props.allData
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  
  // 1. 总记录数
  stats.value.totalRecords = data.length
  
  // 2. AI 增强率
  const aiEnhanced = data.filter(r => r._ai_meta).length
  stats.value.aiEnhancedRate = Math.round((aiEnhanced / data.length) * 100)
  
  // 3. 本月记录数
  stats.value.thisMonthCount = data.filter(r => {
    if (!r.time) return false
    const date = new Date(r.time)
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear
  }).length
  
  // 4. 平均能量值 (仅计算有 AI 元数据的记录)
  const energyRecords = data.filter(r => r._ai_meta?.energy_level)
  if (energyRecords.length > 0) {
    const totalEnergy = energyRecords.reduce((sum, r) => sum + r._ai_meta.energy_level, 0)
    stats.value.avgEnergy = (totalEnergy / energyRecords.length).toFixed(1)
  } else {
    stats.value.avgEnergy = '-'
  }
  
  // 5. 情绪标签统计 (本月)
  const moodCount = {}
  data.forEach(r => {
    if (!r._ai_meta?.mood_tags) return
    r._ai_meta.mood_tags.forEach(tag => {
      moodCount[tag] = (moodCount[tag] || 0) + 1
    })
  })
  stats.value.topMoods = Object.entries(moodCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }))
  
  // 6. 最近7条记录的能量趋势
  const recentRecords = [...data]
    .filter(r => r._ai_meta?.energy_level)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 7)
    .reverse()
  stats.value.recentEnergy = recentRecords.map(r => r._ai_meta.energy_level)
  
  // 7. 高频项目
  const projectTime = {}
  data.forEach(r => {
    if (!r.shanggexiangmu) return
    const duration = r._meta_duration_min || 0
    projectTime[r.shanggexiangmu] = (projectTime[r.shanggexiangmu] || 0) + duration
  })
  const topEntry = Object.entries(projectTime).sort((a, b) => b[1] - a[1])[0]
  if (topEntry) {
    stats.value.topProject = {
      name: topEntry[0],
      hours: Math.round(topEntry[1] / 60)
    }
  }
}

// 获取能量颜色
const getEnergyColor = () => {
  const energy = parseFloat(stats.value.avgEnergy)
  if (isNaN(energy)) return '#64748b'
  if (energy >= 7) return '#22c55e'
  if (energy >= 5) return '#f59e0b'
  return '#ef4444'
}

// 获取柱状图颜色
const getBarColor = (energy) => {
  if (energy >= 7) return '#22c55e'
  if (energy >= 5) return '#f59e0b'
  return '#ef4444'
}

// 获取情绪标签大小
const getMoodSize = (index) => {
  if (index === 0) return 'medium'
  if (index < 3) return 'small'
  return 'tiny'
}

// 趋势方向
const trendDirection = computed(() => {
  const energy = stats.value.recentEnergy
  if (energy.length < 2) return 'stable'
  const recent = energy.slice(-3)
  const earlier = energy.slice(0, 3)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length
  if (recentAvg > earlierAvg + 0.5) return 'up'
  if (recentAvg < earlierAvg - 0.5) return 'down'
  return 'stable'
})

// 监听数据变化
watch(() => props.allData, () => {
  calculateStats()
}, { immediate: true, deep: true })
</script>

<style scoped>
.quick-stats-card {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(6, 182, 212, 0.04) 100%);
  border: 1px solid rgba(14, 165, 233, 0.2);
  border-radius: 12px;
}

[data-theme="dark"] .quick-stats-card {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(6, 182, 212, 0.06) 100%);
  border-color: rgba(14, 165, 233, 0.3);
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

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 数字网格 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
}

[data-theme="dark"] .stat-item {
  background: rgba(0, 0, 0, 0.2);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, #334155);
  font-family: 'JetBrains Mono', monospace;
}

[data-theme="dark"] .stat-value {
  color: var(--color-text, #e2e8f0);
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
  margin-top: 2px;
}

/* 区块标签 */
.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 情绪词云 */
.mood-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mood-cloud-tag {
  background: rgba(14, 165, 233, 0.15);
  color: #0284c7;
}

[data-theme="dark"] .mood-cloud-tag {
  background: rgba(14, 165, 233, 0.25);
  color: #38bdf8;
}

.mood-count {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 2px;
}

/* 迷你趋势图 */
.trend-indicator {
  font-size: 14px;
}

.trend-indicator.up {
  color: #22c55e;
}

.trend-indicator.down {
  color: #ef4444;
}

.trend-indicator.stable {
  color: #64748b;
}

.mini-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 40px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
}

[data-theme="dark"] .mini-chart {
  background: rgba(0, 0, 0, 0.2);
}

.chart-bar {
  flex: 1;
  min-width: 8px;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
}

/* 项目区 */
.top-project {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
}

[data-theme="dark"] .top-project {
  background: rgba(0, 0, 0, 0.2);
}

.project-hours {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #334155);
  font-family: monospace;
}

[data-theme="dark"] .project-hours {
  color: var(--color-text, #e2e8f0);
}
</style>
