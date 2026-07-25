<template>
  <article class="summary-card" :class="summaryTypeClass">
    <!-- Header -->
    <header class="summary-header">
      <div class="summary-badge">
        <span class="badge-icon">{{ badgeIcon }}</span>
        <span class="badge-text">{{ badgeText }}</span>
      </div>
      <div class="summary-period">
        <span class="period-range">{{ periodRange }}</span>
        <span class="period-meta">{{ recordCountText }}</span>
      </div>
    </header>

    <!-- Stats Overview -->
    <section class="stats-overview" v-if="summary.stats">
      <div class="stat-item" v-if="summary.stats.avgEnergyLevel">
        <span class="stat-label">平均能量</span>
        <span class="stat-value">{{ summary.stats.avgEnergyLevel }}</span>
        <div class="stat-bar">
          <div class="stat-fill energy" :style="{ width: `${summary.stats.avgEnergyLevel * 10}%` }"></div>
        </div>
      </div>
      <div class="stat-item" v-if="summary.stats.avgFocusLevel">
        <span class="stat-label">平均专注</span>
        <span class="stat-value">{{ summary.stats.avgFocusLevel }}</span>
        <div class="stat-bar">
          <div class="stat-fill focus" :style="{ width: `${summary.stats.avgFocusLevel * 10}%` }"></div>
        </div>
      </div>
      <div class="stat-item" v-if="summary.stats.totalDurationHours">
        <span class="stat-label">总时长</span>
        <span class="stat-value large">{{ summary.stats.totalDurationHours }}h</span>
      </div>
    </section>

    <!-- Mood Distribution -->
    <section class="mood-section" v-if="summary.stats?.moodDistribution?.length">
      <h4 class="section-title">情绪分布</h4>
      <div class="mood-cloud">
        <span 
          v-for="mood in topMoods" 
          :key="mood.mood" 
          class="mood-tag"
          :style="{ opacity: 0.5 + mood.percentage / 100 }"
        >
          {{ mood.mood }} <span class="mood-count">{{ mood.count }}</span>
        </span>
      </div>
    </section>

    <!-- Content (AI Narrative) -->
    <section class="content-section">
      <h4 class="section-title">{{ contentTitle }}</h4>
      <div class="content-body markdown-body" v-html="renderedContent"></div>
    </section>

    <!-- Wisdom Quotes -->
    <section class="quotes-section" v-if="summary.stats?.wisdomQuotes?.length">
      <h4 class="section-title">✦ 本期金句</h4>
      <div class="quotes-list">
        <blockquote v-for="(quote, index) in summary.stats.wisdomQuotes.slice(0, 3)" :key="index" class="quote-item">
          {{ quote }}
        </blockquote>
      </div>
    </section>

    <!-- Top Projects & People -->
    <section class="network-section" v-if="hasNetworkData">
      <div class="network-column" v-if="summary.stats?.topProjects?.length">
        <h4 class="section-title">高频项目</h4>
        <ul class="network-list">
          <li v-for="project in summary.stats.topProjects.slice(0, 3)" :key="project.project">
            <span class="network-name">{{ project.project }}</span>
            <span class="network-count">{{ project.count }}次</span>
          </li>
        </ul>
      </div>
      <div class="network-column" v-if="summary.stats?.peopleNetwork?.length">
        <h4 class="section-title">核心人物</h4>
        <ul class="network-list">
          <li v-for="person in summary.stats.peopleNetwork.slice(0, 3)" :key="person.person">
            <span class="network-name">{{ person.person }}</span>
            <span class="network-count">{{ person.count }}次</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Footer -->
    <footer class="summary-footer">
      <span class="created-at">生成于 {{ formattedCreatedAt }}</span>
      <span class="model-info">{{ summary.model }}</span>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  summary: {
    type: Object,
    required: true
  }
})

// Computed
const summaryTypeClass = computed(() => {
  return `summary-${props.summary._summary_type}`
})

const badgeIcon = computed(() => {
  const icons = {
    weekly: '📅',
    monthly: '📆',
    yearly: '🎉'
  }
  return icons[props.summary._summary_type] || '📝'
})

const badgeText = computed(() => {
  const texts = {
    weekly: '周总结',
    monthly: '月总结',
    yearly: '年总结'
  }
  return texts[props.summary._summary_type] || '总结'
})

const periodRange = computed(() => {
  const period = props.summary._summary_period
  if (!period) return ''
  
  if (props.summary._summary_type === 'weekly') {
    return `${period.year} 年 第 ${period.week} 周`
  } else if (props.summary._summary_type === 'monthly') {
    return `${period.year} 年 ${period.month} 月`
  } else if (props.summary._summary_type === 'yearly') {
    return `${period.year} 年度`
  }
  return `${period.start} - ${period.end}`
})

const recordCountText = computed(() => {
  const count = props.summary.stats?.recordCount || props.summary._source_record_ids?.length || 0
  return `基于 ${count} 条记录`
})

const contentTitle = computed(() => {
  const titles = {
    weekly: '📜 本周故事',
    monthly: '📖 月度回顾',
    yearly: '🌟 年度叙事'
  }
  return titles[props.summary._summary_type] || '内容'
})

const renderedContent = computed(() => {
  if (!props.summary.content) return ''
  return marked(props.summary.content, { breaks: true })
})

const topMoods = computed(() => {
  return (props.summary.stats?.moodDistribution || []).slice(0, 8)
})

const hasNetworkData = computed(() => {
  return props.summary.stats?.topProjects?.length > 0 || 
         props.summary.stats?.peopleNetwork?.length > 0
})

const formattedCreatedAt = computed(() => {
  if (!props.summary.created_at) return ''
  const date = new Date(props.summary.created_at)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})
</script>

<style scoped>
.summary-card {
  background: linear-gradient(135deg, #fdfbf7 0%, #f8f4ec 100%);
  border: 2px solid var(--gold-accent, #c8ae7d);
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 60px;
  position: relative;
  overflow: hidden;
}

.summary-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--gold-accent, #c8ae7d), #d4af7a, var(--gold-accent, #c8ae7d));
}

/* Type-specific styles */
.summary-weekly {
  --summary-accent: #c8ae7d;
}

.summary-monthly {
  --summary-accent: #7dafca;
  border-color: #7dafca;
}

.summary-monthly::before {
  background: linear-gradient(90deg, #7dafca, #a0c4d4, #7dafca);
}

.summary-yearly {
  --summary-accent: #ca7d9a;
  border-color: #ca7d9a;
}

.summary-yearly::before {
  background: linear-gradient(90deg, #ca7d9a, #d4a0b4, #ca7d9a);
}

/* Header */
.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
}

.summary-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(200, 174, 125, 0.15);
  padding: 8px 16px;
  border-radius: 20px;
}

.badge-icon {
  font-size: 20px;
}

.badge-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--summary-accent);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.summary-period {
  text-align: right;
}

.period-range {
  display: block;
  font-family: 'Playfair Display', serif;
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
}

.period-meta {
  display: block;
  font-size: 12px;
  color: #8A7A6A;
  margin-top: 4px;
}

/* Stats Overview */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: #8A7A6A;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.stat-value {
  font-family: 'Playfair Display', serif;
  font-size: 24px;
  font-weight: 600;
  color: var(--summary-accent);
}

.stat-value.large {
  font-size: 28px;
}

.stat-bar {
  height: 4px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.stat-fill.energy {
  background: linear-gradient(90deg, #f0c674, #de935f);
}

.stat-fill.focus {
  background: linear-gradient(90deg, #81a2be, #5e8ab4);
}

/* Section Title */
.section-title {
  font-family: 'Playfair Display', serif;
  font-size: 14px;
  font-weight: 600;
  color: #5a4a3c;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Mood Section */
.mood-section {
  margin-bottom: 24px;
}

.mood-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mood-tag {
  font-size: 13px;
  color: #5a4a3c;
  background: rgba(200, 174, 125, 0.1);
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid rgba(200, 174, 125, 0.3);
}

.mood-count {
  font-size: 11px;
  color: var(--summary-accent);
  margin-left: 4px;
}

/* Content Section */
.content-section {
  margin-bottom: 24px;
}

.content-body {
  font-family: 'Merriweather', serif;
  font-size: 15px;
  line-height: 1.9;
  color: #2c3e50;
}

.content-body :deep(h1),
.content-body :deep(h2),
.content-body :deep(h3) {
  font-family: 'Playfair Display', serif;
  color: #5a4a3c;
  margin-top: 24px;
  margin-bottom: 12px;
}

.content-body :deep(h2) {
  font-size: 18px;
  border-bottom: 1px solid rgba(200, 174, 125, 0.3);
  padding-bottom: 8px;
}

.content-body :deep(h3) {
  font-size: 16px;
}

.content-body :deep(blockquote) {
  border-left: 3px solid var(--summary-accent);
  padding-left: 16px;
  margin: 16px 0;
  font-style: italic;
  color: #5a4a3c;
}

.content-body :deep(ul),
.content-body :deep(ol) {
  padding-left: 20px;
  margin: 12px 0;
}

.content-body :deep(li) {
  margin-bottom: 8px;
}

/* Quotes Section */
.quotes-section {
  margin-bottom: 24px;
  padding: 20px;
  background: rgba(200, 174, 125, 0.08);
  border-radius: 12px;
}

.quotes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quote-item {
  font-family: 'Playfair Display', serif;
  font-size: 14px;
  font-style: italic;
  color: #5a4a3c;
  padding: 0;
  margin: 0;
  border: none;
  position: relative;
  padding-left: 20px;
}

.quote-item::before {
  content: "❝";
  position: absolute;
  left: 0;
  color: var(--summary-accent);
  font-size: 16px;
}

/* Network Section */
.network-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
}

.network-column {
  padding: 16px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
}

.network-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.network-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.network-list li:last-child {
  border-bottom: none;
}

.network-name {
  font-size: 14px;
  color: #2c3e50;
}

.network-count {
  font-size: 12px;
  color: var(--summary-accent);
  font-weight: 600;
}

/* Footer */
.summary-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 12px;
  color: #8A7A6A;
}

.model-info {
  font-family: monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 8px;
  border-radius: 4px;
}

/* Responsive */
@media (max-width: 768px) {
  .summary-card {
    padding: 24px;
  }
  
  .stats-overview {
    grid-template-columns: 1fr;
  }
  
  .network-section {
    grid-template-columns: 1fr;
  }
  
  .summary-header {
    flex-direction: column;
    gap: 16px;
  }
  
  .summary-period {
    text-align: left;
  }
}

/* Dark mode */
[data-theme="dark"] .summary-card {
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-color: #d4af7a;
}

[data-theme="dark"] .period-range,
[data-theme="dark"] .network-name,
[data-theme="dark"] .content-body {
  color: #e8e6e3;
}

[data-theme="dark"] .section-title,
[data-theme="dark"] .mood-tag,
[data-theme="dark"] .quote-item {
  color: #d4cfc7;
}

[data-theme="dark"] .stats-overview,
[data-theme="dark"] .network-column {
  background: rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] .quotes-section {
  background: rgba(212, 175, 122, 0.1);
}
</style>
