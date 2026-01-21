<template>
  <div class="chapter-cover">
    
    <div class="cover-header">
      <h1 class="month-title">{{ monthName }}</h1>
      <div class="year-subtitle">{{ year }}</div>
    </div>

    <div class="energy-ribbon-container">
      <div class="ribbon-label">DAILY SPECTRUM</div>
      <div class="energy-ribbon">
        <div 
          v-for="(r, i) in records" 
          :key="i"
          class="ribbon-segment"
          :style="{ 
            backgroundColor: getEnergyColor(r._ai_meta?.energy_level),
            height: getEnergyHeight(r._ai_meta?.energy_level)
          }"
          :title="formatDate(r.time)"
          @click="$emit('select-date', r.time)"
        ></div>
      </div>
    </div>

    <!-- Monthly Rhythm Chart -->
    <div class="rhythm-chart-section" v-if="records.length > 1">
      <div class="ribbon-label">MONTHLY RHYTHM</div>
      <div class="chart-container">
        <svg viewBox="0 0 400 120" class="rhythm-svg" preserveAspectRatio="none">
          <!-- Baseline -->
          <line x1="0" y1="60" x2="400" y2="60" class="axis-line" />
          
          <!-- Energy Line -->
          <polyline
            :points="energyPointsChart"
            fill="none"
            stroke="var(--accent-gold, #c8ae7d)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="line-energy"
          />
          
          <!-- Focus Line -->
          <polyline
            :points="focusPointsChart"
            fill="none"
            stroke="var(--text-sepia, #5a4a3c)"
            stroke-width="1.5"
            stroke-dasharray="4,4"
            class="line-focus"
            opacity="0.6"
          />
        </svg>
        <div class="chart-legend">
          <span>— Energy</span>
          <span style="opacity: 0.6">- - Focus</span>
        </div>
      </div>
    </div>

    <div class="cover-stats">
      <div class="stat-box">
        <span class="stat-val">{{ avgEnergy.toFixed(1) }}</span>
        <span class="stat-lbl">Avg Energy</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-box">
        <span class="stat-val">{{ avgFocus.toFixed(1) }}</span>
        <span class="stat-lbl">Avg Focus</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-box">
        <span class="stat-val">{{ totalHours.toFixed(0) }}h</span>
        <span class="stat-lbl">Total Time</span>
      </div>
    </div>

    <div class="cover-themes" v-if="topKeywords.length">
      <div class="themes-list">
        <span 
          v-for="(kw, i) in topKeywords" 
          :key="i"
          class="theme-word"
          :style="{ fontSize: getKeywordSize(kw.count), opacity: getKeywordOpacity(kw.count) }"
        >
          {{ kw.word }}
        </span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  records: {
    type: Array,
    default: () => []
  },
  month: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['select-date'])

// Computed values
const monthName = computed(() => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return months[props.month - 1]
})

const daysInMonth = computed(() => {
  return new Date(props.year, props.month, 0).getDate()
})

const avgFocus = computed(() => {
  const withFocus = props.records.filter(r => r._ai_meta?.focus_level)
  if (withFocus.length === 0) return 0
  return withFocus.reduce((sum, r) => sum + r._ai_meta.focus_level, 0) / withFocus.length
})

const avgEnergy = computed(() => {
  const withEnergy = props.records.filter(r => r._ai_meta?.energy_level)
  if (withEnergy.length === 0) return 0
  return withEnergy.reduce((sum, r) => sum + r._ai_meta.energy_level, 0) / withEnergy.length
})

const totalHours = computed(() => {
  return props.records.reduce((sum, r) => sum + (r._meta_duration_min || 0), 0) / 60
})

const topKeywords = computed(() => {
  const wordCount = {}
  props.records.forEach(r => {
    // Extract from summary
    if (r._ai_meta?.summary) {
      const words = r._ai_meta.summary.split(/[，,。！？\s]+/).filter(w => w.length > 1 && w.length < 10)
      words.forEach(w => {
        wordCount[w] = (wordCount[w] || 0) + 1
      })
    }
    // Extract from mood_tags
    if (r._ai_meta?.mood_tags) {
      r._ai_meta.mood_tags.forEach(tag => {
        wordCount[tag] = (wordCount[tag] || 0) + 2
      })
    }
  })
  
  return Object.entries(wordCount)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
})

// Calculate chart points for rhythm visualization
const calculateChartPoints = (field) => {
  if (props.records.length === 0) return '0,60 400,60'
  
  const dayMap = new Map()
  props.records.forEach(r => {
    const day = r._meta_day || new Date(r.time).getDate()
    dayMap.set(day, r._ai_meta?.[field] || 5)
  })
  
  const points = []
  const totalDays = daysInMonth.value
  const stepX = totalDays > 1 ? 400 / (totalDays - 1) : 0
  
  for (let i = 1; i <= totalDays; i++) {
    const val = dayMap.get(i) !== undefined ? dayMap.get(i) : 5
    const x = (i - 1) * stepX
    const y = 110 - (val / 10) * 100
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  
  return points.join(' ')
}

const energyPointsChart = computed(() => calculateChartPoints('energy_level'))
const focusPointsChart = computed(() => calculateChartPoints('focus_level'))

const energyPoints = computed(() => {
  // This is used for the old SVG implementation (if needed)
  // Keeping for backward compatibility but not rendered
  return ''
})

const energyPointsLarge = computed(() => {
  // This is used for the old SVG implementation (if needed)
  // Keeping for backward compatibility but not rendered
  return ''
})

const focusPoints = computed(() => {
  // This is used for the old SVG implementation (if needed)
  // Keeping for backward compatibility but not rendered
  return ''
})

const focusPointsLarge = computed(() => {
  // This is used for the old SVG implementation (if needed)
  // Keeping for backward compatibility but not rendered
  return ''
})

const thinkingPatterns = computed(() => {
  const patterns = {}
  props.records.forEach(r => {
    if (r._ai_meta?.thinking_patterns) {
      r._ai_meta.thinking_patterns.forEach(p => {
        patterns[p] = (patterns[p] || 0) + 1
      })
    }
  })
  
  return Object.entries(patterns)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
})

const maslowDistribution = computed(() => {
  const needs = {}
  props.records.forEach(r => {
    const need = r._ai_meta?.maslow_need
    if (need) {
      needs[need] = (needs[need] || 0) + 1
    }
  })
  
  const total = Object.values(needs).reduce((a, b) => a + b, 0) || 1
  
  return Object.entries(needs)
    .map(([name, count]) => ({ 
      name, 
      count,
      percent: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
})

const domainDistribution = computed(() => {
  const domains = {}
  const domainColors = {
    'Career': '#4CAF50',
    'Academic': '#2196F3',
    'Relationship': '#E91E63',
    'Health': '#FF9800',
    'Entertainment': '#9C27B0',
    'PersonalGrowth': '#00BCD4',
    'LifeLog': '#607D8B'
  }
  
  props.records.forEach(r => {
    const domain = r._ai_meta?.primary_domain || 'LifeLog'
    domains[domain] = (domains[domain] || 0) + 1
  })
  
  const total = Object.values(domains).reduce((a, b) => a + b, 0) || 1
  
  return Object.entries(domains)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
      color: domainColors[name] || '#9E9E9E'
    }))
    .sort((a, b) => b.count - a.count)
})

// === 1. 十级能量色谱 (Low -> High) ===
// 1-3: 枯竭/灰蓝  4-6: 平静/米白  7-8: 活跃/金黄  9-10: 燃烧/绯红
const energyPalette = {
  1: '#2d3436', 2: '#4b6584', 3: '#778ca3', // Cold/Dark
  4: '#a5b1c2', 5: '#d1d8e0', 6: '#f7f1e3', // Neutral
  7: '#ffeaa7', 8: '#fdcb6e',               // Warm
  9: '#e17055', 10: '#d63031'               // Hot
}

const getEnergyColor = (level) => {
  if (!level) return energyPalette[5]
  const rounded = Math.round(level)
  return energyPalette[Math.max(1, Math.min(10, rounded))] || energyPalette[5]
}

// 让高度随能量波动，更像声波/墨迹
const getEnergyHeight = (level) => {
  return `${40 + (level || 5) * 6}%`
}

// 辅助样式函数
const getKeywordSize = (count) => {
  const maxCount = Math.max(...topKeywords.value.map(k => k.count), 1)
  return `${12 + Math.min(count * 2, 24)}px`
}

const getKeywordOpacity = (count) => {
  return 0.4 + Math.min(count * 0.1, 0.6)
}

const formatDate = (time) => {
  const d = new Date(time)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.chapter-cover {
  text-align: center;
  font-family: 'Playfair Display', serif;
  color: var(--text-sepia, #5a4a3c);
  padding-bottom: 20px;
}

/* 标题区 */
.cover-header {
  margin-bottom: 40px;
}

.month-title {
  font-size: 80px;
  font-weight: 400;
  margin: 0;
  line-height: 1;
  color: var(--accent-gold, #c8ae7d);
  letter-spacing: -2px;
}

.year-subtitle {
  font-family: 'Lato', sans-serif;
  font-size: 14px;
  letter-spacing: 6px;
  margin-top: 10px;
  color: var(--text-muted, #9ca3af);
  text-transform: uppercase;
}

/* 能量光谱带 */
.energy-ribbon-container {
  margin: 60px auto;
  max-width: 600px;
}

.ribbon-label {
  font-family: 'Lato', sans-serif;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--text-muted, #9ca3af);
  margin-bottom: 12px;
  text-transform: uppercase;
}

.energy-ribbon {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.ribbon-segment {
  width: 6px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.3s;
}

.ribbon-segment:hover {
  transform: scaleY(1.2);
  filter: brightness(1.1);
}

/* 指标区 */
.cover-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 40px;
  margin-bottom: 50px;
}

.stat-box {
  display: flex;
  flex-direction: column;
}

.stat-val {
  font-size: 32px;
  font-style: italic;
  color: var(--text-ink, #2c3e50);
}

.stat-lbl {
  font-family: 'Lato', sans-serif;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted, #9ca3af);
  margin-top: 4px;
}

.stat-divider {
  width: 1px;
  height: 30px;
  background: rgba(0,0,0,0.1);
}

/* 关键词区 */
.cover-themes {
  max-width: 500px;
  margin: 0 auto;
}

.themes-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.theme-word {
  line-height: 1.4;
  color: var(--text-ink, #2c3e50);
  transition: color 0.3s;
}

.theme-word:hover {
  color: var(--accent-gold, #c8ae7d);
}

/* 月度心电图 */
.rhythm-chart-section {
  margin: 40px auto;
  max-width: 700px;
  text-align: center;
}

.chart-container {
  margin-top: 10px;
  position: relative;
  padding: 0 20px;
}

.rhythm-svg {
  width: 100%;
  height: 120px;
  overflow: visible;
}

.axis-line {
  stroke: var(--text-muted, #9ca3af);
  stroke-width: 1;
  stroke-dasharray: 2 4;
  opacity: 0.3;
}

.line-energy,
.line-focus {
  transition: all 0.5s ease;
}

.chart-legend {
  margin-top: 8px;
  font-family: 'Lato', sans-serif;
  font-size: 10px;
  color: var(--text-muted, #9ca3af);
  display: flex;
  justify-content: center;
  gap: 20px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
</style>
