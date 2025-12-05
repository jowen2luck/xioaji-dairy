<template>
  <div 
    class="journal-card" 
    :class="[
      `type-${record._ai_meta?.content_type?.toLowerCase() || 'default'}`,
      `depth-${record._ai_meta?.content_depth || 'normal'}`,
      { 'is-compact': compact, 'is-loading': !record._ai_meta, 'is-expanded': isExpanded }
    ]"
  >
    <!-- ================= 状态 1: 待分析 ================= -->
    <div v-if="!record._ai_meta" class="placeholder-state">
      <div class="placeholder-content">
        <n-icon size="40" :component="SparklesOutline" class="pulse-icon" />
        <div class="placeholder-text">
          <h3>AI 正在阅读你的记忆...</h3>
          <p>分析完成后将生成情绪图谱与智慧洞察</p>
        </div>
        <n-button 
          size="small" 
          secondary 
          round 
          type="primary" 
          @click="$emit('request-analysis', record)"
        >
          立即唤醒分析
        </n-button>
      </div>
    </div>

    <!-- ================= 状态 2: 完整展示 ================= -->
    <div v-else class="card-container">
      
      <!-- 1. 顶栏：类型 + 领域 + 深度 + 双指标 -->
      <div class="card-header">
        <div class="header-left">
          <!-- 内容体裁 -->
          <n-tag 
            :color="getContentTypeStyle(meta.content_type)" 
            size="small" 
            round
            :bordered="false"
            class="type-tag"
          >
            {{ getContentTypeLabel(meta.content_type) }}
          </n-tag>
          <!-- 生活领域 -->
          <n-tag 
            v-if="meta.primary_domain" 
            :color="getDomainStyle(meta.primary_domain)" 
            size="small" 
            round
            :bordered="false"
          >
            {{ getDomainLabel(meta.primary_domain) }}
          </n-tag>
          <!-- 内容深度徽章 -->
          <span v-if="meta.content_depth" :class="['depth-badge', `depth-${meta.content_depth}`]">
            {{ { shallow: '浅', normal: '中', deep: '深' }[meta.content_depth] }}
          </span>
          <span class="separator">|</span>
          <span class="time-text">{{ formatTime(record.time) }}</span>
        </div>
        
        <!-- 能量 & 专注双指标 -->
        <div class="metrics-group">
          <div v-if="typeof meta.energy_level === 'number'" :class="['metric-item', getEnergyClass(meta.energy_level)]" title="能量水平">
            <n-icon :component="FlashOutline" />
            <span>{{ meta.energy_level }}</span>
            <div class="micro-bar"><div class="micro-fill" :style="{ width: meta.energy_level * 10 + '%' }"></div></div>
          </div>
          <div v-if="typeof meta.focus_level === 'number'" class="metric-item focus" title="专注程度">
            <n-icon :component="EyeOutline" />
            <span>{{ meta.focus_level }}</span>
            <div class="micro-bar"><div class="micro-fill" :style="{ width: meta.focus_level * 10 + '%' }"></div></div>
          </div>
        </div>
      </div>

      <!-- 2. AI 摘要 -->
      <div v-if="meta.summary" class="summary-block">
        <span class="summary-label">✨</span>
        {{ meta.summary }}
      </div>
        
      <!-- 3. 正文 + 金句 -->
      <div class="card-body">
        <MarkdownRenderer v-if="record.ganshou" :content="record.ganshou" class="content-block" />
        
        <div v-if="showQuotes && meta.key_quotes?.length" class="quotes-wrapper">
          <div v-for="(quote, idx) in meta.key_quotes.slice(0, 2)" :key="idx" class="quote-item">
            <span class="quote-mark">"</span>{{ quote }}<span class="quote-mark">"</span>
          </div>
        </div>
      </div>

      <!-- 4. 情绪维度 (主要展示区) -->
      <div v-if="!compact || showAllInCompact" class="emotion-section">
        <div class="meta-label">😊 MOOD</div>
        <div class="tags-group">
          <n-tag
            v-for="mood in meta.mood_tags || []"
            :key="mood"
            :color="getMoodColor(mood)"
            size="small"
            round
            class="mood-pill"
            @click="$emit('tag-click', 'mood', mood)"
          >
            {{ mood }}
          </n-tag>
        </div>
        <div v-if="meta.root_cause" class="insight-text">
          <span class="insight-icon">💡</span> {{ meta.root_cause }}
        </div>
      </div>

      <!-- 5. 场景 & 物理维度 -->
      <div v-if="hasPhysicalContext" class="context-section">
        <div class="context-row-main">
          <!-- 位置 -->
          <span v-if="meta.location" class="context-chip location">
            <n-icon :component="LocationOutline" />{{ meta.location }}
          </span>
          <!-- 交互类型 -->
          <span v-if="meta.interaction_type" class="context-chip interaction">
            {{ getInteractionIcon(meta.interaction_type) }} {{ getInteractionLabel(meta.interaction_type) }}
          </span>
          <!-- 人物 -->
          <span v-for="p in (meta.people_involved || []).slice(0, 3)" :key="'p_' + p" class="mini-tag person" @click="$emit('tag-click', 'person', p)">
            @{{ p }}
          </span>
        </div>
        
        <!-- 生理感受 -->
        <div v-if="meta.physiological_sensations?.length" class="physio-row">
          <n-icon :component="BodyOutline" class="physio-icon" />
          <n-tag v-for="s in meta.physiological_sensations" :key="s" size="tiny" :type="getPhysioType(meta.physiological_valence)" round>
            {{ s }}
          </n-tag>
        </div>
        
        <!-- 物品标签（可展开） -->
        <div v-if="meta.items?.length" class="items-row">
          <span v-for="i in displayedItems" :key="'i_' + i" class="mini-tag item" @click="$emit('tag-click', 'item', i)">
            #{{ i }}
          </span>
          <span v-if="meta.items.length > 4" class="more-toggle" @click="showAllItems = !showAllItems">
            {{ showAllItems ? '收起' : `+${meta.items.length - 4}更多` }}
          </span>
        </div>
      </div>

      <!-- 6. 待办事项 -->
      <div v-if="meta.next_steps?.length" class="next-steps-section">
        <div class="meta-label">📋 OPEN LOOPS</div>
        <div class="steps-list">
          <div v-for="(step, idx) in meta.next_steps" :key="idx" class="step-item">
            <span class="step-bullet">•</span>
            <span>{{ step }}</span>
          </div>
        </div>
      </div>

      <!-- 7. 心理维度 (折叠展示) -->
      <div v-if="hasPsychData && (!compact || showAllInCompact)" class="psych-section">
        <div class="psych-toggle" @click="showPsychology = !showPsychology">
          <span class="psych-toggle-icon">{{ showPsychology ? '▼' : '▶' }}</span>
          <span class="psych-toggle-text">心理分析</span>
        </div>
        <div v-show="showPsychology" class="psych-items">
          <!-- 时空取向 -->
          <div v-if="meta.time_orientation" class="psych-row">
            <span class="psych-icon">{{ getTimeOrientationIcon(meta.time_orientation) }}</span>
            <span>{{ getTimeOrientationLabel(meta.time_orientation) }}</span>
          </div>
          <!-- 马斯洛需求 -->
          <div v-if="meta.maslow_need" class="psych-row">
            <span class="psych-icon">💎</span>
            <span class="need-tag">{{ meta.maslow_need }}</span>
          </div>
          <!-- 掌控感 -->
          <div v-if="typeof meta.agency_level === 'number'" class="agency-bar-wrapper">
            <span class="psych-icon">🎮</span>
            <div class="agency-bar">
              <div class="agency-track">
                <div class="agency-fill" :class="meta.agency_level >= 0 ? 'positive' : 'negative'" :style="getAgencyStyle(meta.agency_level)"></div>
                <div class="agency-center"></div>
              </div>
              <span class="agency-value">{{ meta.agency_level > 0 ? '+' : '' }}{{ meta.agency_level }}</span>
            </div>
          </div>
          <!-- 思维模式异常警告 -->
          <div v-if="hasDistortions" class="thinking-warning">
            <n-icon :component="WarningOutline" />
            <span v-for="p in meta.thinking_patterns?.filter(x => x !== 'Rational' && x !== '理性客观')" :key="p" class="distortion-tag">{{ p }}</span>
          </div>
        </div>
      </div>

      <!-- 8. 底部 Footer -->
      <div class="card-footer">
        <div class="footer-info">
          <n-icon :component="TimeOutline" depth="3" />
          <span>{{ record.chixushijian || '未知时长' }}</span>
        </div>
        <div class="footer-info">
          <n-icon :component="FolderOpenOutline" depth="3" />
          <span>{{ record.shanggexiangmu || '未分类' }}</span>
        </div>
        <n-button v-if="compact" text size="tiny" @click="isExpanded = !isExpanded">
          {{ isExpanded ? '收起' : '展开详情' }}
        </n-button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale' 
import MarkdownRenderer from './MarkdownRenderer.vue'
import { 
  SparklesOutline, FlashOutline, TimeOutline, FolderOpenOutline,
  EyeOutline, LocationOutline, BodyOutline, WarningOutline
} from '@vicons/ionicons5'

const props = defineProps({
  record: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  showQuotes: { type: Boolean, default: true },
  showAllInCompact: { type: Boolean, default: false }
})

defineEmits(['tag-click', 'request-analysis'])

const isExpanded = ref(false)
const showAllItems = ref(false)
const showPsychology = ref(false)

const meta = computed(() => props.record._ai_meta || {})

const displayedItems = computed(() => {
  const items = meta.value.items || []
  return showAllItems.value ? items : items.slice(0, 4)
})

const hasPhysicalContext = computed(() => {
  const m = meta.value
  return m.location || m.interaction_type || m.people_involved?.length || m.items?.length || m.physiological_sensations?.length
})

const hasDistortions = computed(() => {
  const patterns = meta.value.thinking_patterns || []
  return patterns.some(p => p !== 'Rational' && p !== '理性客观')
})

const hasPsychData = computed(() => {
  const m = meta.value
  return m.time_orientation || m.maslow_need || typeof m.agency_level === 'number' || hasDistortions.value
})

// ============ 样式映射函数 ============

const getContentTypeStyle = (type) => {
  const map = {
    'DailyLog': { color: '#f2f5f9', textColor: '#475569' },
    'Reflection': { color: '#f0fdf4', textColor: '#166534' },
    'Letter': { color: '#fff7ed', textColor: '#9a3412' },
    'Idea': { color: '#eff6ff', textColor: '#1e40af' },
    'Dream': { color: '#faf5ff', textColor: '#7c3aed' }
  }
  return map[type] || { color: '#f5f5f5', textColor: '#666' }
}

const getContentTypeLabel = (type) => {
  const map = { 'DailyLog': '日志', 'Reflection': '复盘', 'Letter': '书信', 'Idea': '灵感', 'Dream': '梦境' }
  return map[type] || type
}

const getDomainStyle = (domain) => {
  const map = {
    'Career': { color: '#fef3c7', textColor: '#92400e' },
    'Academic': { color: '#dbeafe', textColor: '#1e40af' },
    'Relationship': { color: '#fce7f3', textColor: '#be185d' },
    'Health': { color: '#d1fae5', textColor: '#065f46' },
    'Entertainment': { color: '#fae8ff', textColor: '#86198f' },
    'PersonalGrowth': { color: '#e0e7ff', textColor: '#4338ca' },
    'LifeLog': { color: '#f5f5f4', textColor: '#57534e' }
  }
  return map[domain] || { color: '#f5f5f5', textColor: '#666' }
}

const getDomainLabel = (domain) => {
  const map = {
    'Career': '职场', 'Academic': '学术', 'Relationship': '社交',
    'Health': '健康', 'Entertainment': '娱乐', 'PersonalGrowth': '成长', 'LifeLog': '生活'
  }
  return map[domain] || domain
}

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    return formatDistanceToNow(new Date(timeStr), { addSuffix: true, locale: zhCN })
  } catch { return timeStr }
}

const getMoodColor = (mood) => {
  // 丰富的情绪配色方案
  const moodColorMap = {
    // 积极情绪 - 暖色系
    '开心': { color: '#fef3c7', textColor: '#f59e0b', borderColor: '#fde68a' },
    '愉快': { color: '#fef9c3', textColor: '#eab308', borderColor: '#fef08a' },
    '满足': { color: '#dcfce7', textColor: '#22c55e', borderColor: '#bbf7d0' },
    '兴奋': { color: '#fce7f3', textColor: '#ec4899', borderColor: '#fbcfe8' },
    '自豪': { color: '#ddd6fe', textColor: '#8b5cf6', borderColor: '#c4b5fd' },
    '心流': { color: '#e0e7ff', textColor: '#6366f1', borderColor: '#c7d2fe' },
    '专注': { color: '#cffafe', textColor: '#06b6d4', borderColor: '#a5f3fc' },
    '确幸': { color: '#fed7aa', textColor: '#ea580c', borderColor: '#fdba74' },
    '温暖': { color: '#ffe4e6', textColor: '#f43f5e', borderColor: '#fecdd3' },
    '怀旧': { color: '#e9d5ff', textColor: '#a855f7', borderColor: '#d8b4fe' },
    '治愈': { color: '#d1fae5', textColor: '#10b981', borderColor: '#a7f3d0' },
    '放松': { color: '#ccfbf1', textColor: '#14b8a6', borderColor: '#99f6e4' },
    '意犹未尽': { color: '#fce7f3', textColor: '#db2777', borderColor: '#f9a8d4' },
    '兴致勃勃': { color: '#ffedd5', textColor: '#f97316', borderColor: '#fed7aa' },
    '期待': { color: '#dbeafe', textColor: '#3b82f6', borderColor: '#bfdbfe' },
    '激励': { color: '#fef2f2', textColor: '#ef4444', borderColor: '#fecaca' },
    
    // 消极情绪 - 冷色系
    '焦虑': { color: '#fef3c7', textColor: '#d97706', borderColor: '#fde68a' },
    '沮丧': { color: '#e0e7ff', textColor: '#4f46e5', borderColor: '#c7d2fe' },
    '难过': { color: '#dbeafe', textColor: '#1d4ed8', borderColor: '#bfdbfe' },
    '烦躁': { color: '#fee2e2', textColor: '#dc2626', borderColor: '#fecaca' },
    '愤怒': { color: '#fecaca', textColor: '#991b1b', borderColor: '#fca5a5' },
    '疲惫': { color: '#e5e7eb', textColor: '#6b7280', borderColor: '#d1d5db' },
    '压力': { color: '#f3e8ff', textColor: '#7c3aed', borderColor: '#e9d5ff' },
    '不安': { color: '#fbcfe8', textColor: '#be185d', borderColor: '#f9a8d4' },
    '挫败': { color: '#ccfbf1', textColor: '#0f766e', borderColor: '#5eead4' },
    
    // 中性情绪
    '平静': { color: '#f0fdfa', textColor: '#0d9488', borderColor: '#ccfbf1' },
    '释然': { color: '#ecfdf5', textColor: '#059669', borderColor: '#d1fae5' },
    '惊讶': { color: '#fffbeb', textColor: '#d97706', borderColor: '#fef3c7' }
  }
  
  return moodColorMap[mood] || { color: '#f5f5f4', textColor: '#78716c', borderColor: '#e7e5e4' }
}

const getEnergyClass = (level) => {
  if (level >= 8) return 'energy-high'
  if (level >= 5) return 'energy-med'
  return 'energy-low'
}

const getTimeOrientationIcon = (orientation) => {
  const map = { 'Past': '⏮️', 'Present': '⏺️', 'Future': '⏭️', 'Timeless': '♾️' }
  return map[orientation] || '🕐'
}

const getTimeOrientationLabel = (orientation) => {
  const map = { 'Past': '回望过去', 'Present': '当下此刻', 'Future': '展望未来', 'Timeless': '超越时空' }
  return map[orientation] || orientation
}

const getAgencyStyle = (level) => {
  const absLevel = Math.abs(level)
  const width = (absLevel / 5) * 50
  if (level >= 0) {
    return { left: '50%', width: width + '%' }
  } else {
    return { right: '50%', width: width + '%' }
  }
}

const getInteractionIcon = (type) => {
  const map = { 'Solo': '👤', 'OneOnOne': '👥', 'Group': '👪', 'Crowd': '🏟️' }
  return map[type] || '👤'
}

const getInteractionLabel = (type) => {
  const map = { 'Solo': '独处', 'OneOnOne': '一对一', 'Group': '小组', 'Crowd': '人群' }
  return map[type] || type
}

const getPhysioType = (valence) => {
  const map = { 'Positive': 'success', 'Negative': 'error', 'Neutral': 'default', 'Mixed': 'warning' }
  return map[valence] || 'default'
}
</script>

<style scoped>
/* 定义变量,优先使用主题提供的旨，冶新 */
.journal-card {
  /* 上传来自全局主题的 CSS 变量（暗亮主题由 theme.js 管理）*/
  --card-bg: var(--color-card-bg, #ffffff);
  --card-border: var(--color-border, #eef2f6);
  --text-main: var(--color-text, #334155);
  --text-sec: var(--color-text-secondary, #64748b);
  --text-light: var(--color-text-light, rgba(0, 0, 0, 0.45)); /* 从主题变量获取 */
  --accent-color: #6366f1;
  
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 0;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.journal-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  border-color: rgba(99, 102, 241, 0.15);
}

.card-container {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.is-compact .card-container {
  padding: 14px;
  gap: 10px;
}

/* ================= 头部设计 ================= */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.separator {
  color: var(--card-border);
  font-size: 12px;
}

.time-text {
  font-size: 13px;
  color: var(--text-light);
  font-weight: 500;
}

/* 深度徽章 */
.depth-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.depth-shallow { background: #f1f5f9; color: #64748b; }
.depth-normal { background: #e0e7ff; color: #4338ca; }
.depth-deep { background: #fef3c7; color: #d97706; }

/* 双指标组 */
.metrics-group {
  display: flex;
  gap: 12px;
}

.metric-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
}

.micro-bar {
  width: 40px;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.micro-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

.energy-high .micro-fill { background: #22c55e; }
.energy-med .micro-fill { background: #f59e0b; }
.energy-low .micro-fill { background: #ef4444; }
.focus .micro-fill { background: #8b5cf6; }

/* ================= 内容区 ================= */
.content-block {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-main);
  margin-bottom: 12px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 6px;
  border-left: 3px solid var(--accent-color);
  word-break: break-word;
  white-space: pre-wrap;
}

[data-theme="dark"] .content-block {
  background: rgba(99, 102, 241, 0.05);
  border-left-color: #818cf8;
}

.summary-block {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-sec);
  margin-bottom: 14px;
  padding: 10px 14px;
  background: rgba(99, 102, 241, 0.04);
  border-radius: 8px;
  border-left: 4px solid var(--accent-color);
}

[data-theme="dark"] .summary-block {
  background: rgba(99, 102, 241, 0.08);
  border-left-color: #818cf8;
}

.summary-label {
  font-weight: 600;
  color: var(--accent-color);
  margin-right: 4px;
}

.card-body { display: flex; flex-direction: column; gap: 12px; }

.quotes-wrapper {
  margin-top: 10px;
  padding: 12px 16px;
  background: rgba(99, 102, 241, 0.03);
  border-radius: 8px;
  border-left: 3px solid var(--accent-color);
}

[data-theme="dark"] .quotes-wrapper {
  background: rgba(99, 102, 241, 0.06);
  border-left-color: #818cf8;
}

.quote-item {
  font-size: 14px;
  color: var(--text-sec);
  font-style: italic;
  position: relative;
}

.quote-mark {
  color: var(--text-light);
  font-weight: bold;
}

/* ================= 情绪区域 (主要展示) ================= */
.emotion-section {
  padding-top: 12px;
  border-top: 1px dashed var(--card-border);
}

.meta-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-light);
  margin-bottom: 8px;
  font-weight: 600;
}

.tags-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.mood-pill {
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s;
}

.mood-pill:hover {
  transform: scale(1.05);
}

.insight-text {
  font-size: 12px;
  color: var(--text-sec);
  line-height: 1.4;
  background: rgba(251, 191, 36, 0.06);
  padding: 6px 10px;
  border-radius: 6px;
}

[data-theme="dark"] .insight-text {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
}

/* 心理维度列 - 折叠区域 */
.psych-section {
  padding-top: 8px;
  border-top: 1px dashed var(--card-border);
}

.psych-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-light);
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
  transition: color 0.2s;
}

.psych-toggle:hover {
  color: var(--text-sec);
}

.psych-toggle-icon {
  font-size: 10px;
  transition: transform 0.2s;
}

.psych-toggle-text {
  font-weight: 500;
}

.psych-items { 
  display: flex; 
  flex-direction: column; 
  gap: 6px; 
  margin-top: 8px;
  padding-left: 16px;
}

.psych-row { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  font-size: 11px; 
  color: var(--text-sec); 
}

.psych-icon { font-size: 12px; }

.need-tag { 
  background: linear-gradient(135deg, #fdf2f8, #fce7f3); 
  padding: 2px 8px; 
  border-radius: 4px; 
  color: #be185d;
  font-weight: 500;
  font-size: 11px;
}

/* 掌控感进度条 */
.agency-bar-wrapper { display: flex; align-items: center; gap: 8px; }
.agency-bar { display: flex; align-items: center; gap: 6px; flex: 1; }
.agency-track {
  position: relative;
  width: 80px;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
}
.agency-center {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  background: #94a3b8;
  transform: translateX(-50%);
}
.agency-fill {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 3px;
}
.agency-fill.positive { background: #22c55e; }
.agency-fill.negative { background: #f97316; }
.agency-value { font-size: 11px; font-weight: 600; color: var(--text-sec); min-width: 24px; }

/* 思维警告 */
.thinking-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #f59e0b;
  font-size: 12px;
}
.distortion-tag {
  background: #fef3c7;
  color: #d97706;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

/* 场景区 */
.context-section {
  padding-top: 12px;
  border-top: 1px dashed var(--card-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-row-main { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.context-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.05);
  color: var(--text-sec);
}

.physio-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.physio-icon { color: var(--text-light); }

.items-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.more-toggle { 
  font-size: 11px; 
  color: var(--accent-color); 
  cursor: pointer; 
  padding: 2px 6px;
}
.more-toggle:hover { text-decoration: underline; }

/* 待办事项 */
.next-steps-section {
  padding-top: 12px;
  border-top: 1px dashed var(--card-border);
}

.steps-list { 
  display: flex; 
  flex-direction: column; 
  gap: 4px; 
  margin-top: 8px; 
}

.step-item { 
  display: flex; 
  align-items: flex-start; 
  gap: 8px; 
  font-size: 13px; 
  color: var(--text-main);
  line-height: 1.5;
}

.step-bullet {
  color: var(--accent-color);
  font-weight: bold;
  margin-top: 2px;
}

/* ================= 底部 Footer ================= */
.card-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-top: -8px;
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-light);
}

.mini-tag { 
  font-size: 11px; 
  padding: 2px 6px; 
  border-radius: 4px; 
  cursor: pointer; 
  transition: transform 0.2s; 
}
.mini-tag:hover { transform: scale(1.05); }
.mini-tag.person { color: #4f46e5; background: rgba(79, 70, 229, 0.1); }
.mini-tag.item { color: #059669; background: rgba(5, 150, 105, 0.1); }

/* ================= Placeholder 状态 ================= */
.placeholder-state {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.04);
}

.placeholder-content {
  text-align: center;
}

.pulse-icon {
  color: #cbd5e1;
  animation: pulse 2s infinite;
}

.placeholder-text h3 {
  font-size: 14px;
  color: var(--text-sec);
  margin: 10px 0 4px;
}

.placeholder-text p {
  font-size: 12px;
  color: var(--text-light);
  margin-bottom: 16px;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* 深色主题适配 */
[data-theme="dark"] .depth-shallow { background: #334155; color: #94a3b8; }
[data-theme="dark"] .depth-normal { background: #312e81; color: #a5b4fc; }
[data-theme="dark"] .depth-deep { background: #78350f; color: #fcd34d; }
[data-theme="dark"] .need-tag { background: linear-gradient(135deg, #4c1d95, #5b21b6); color: #f5d0fe; }
[data-theme="dark"] .mini-tag.person { color: #a5b4fc; background: rgba(79, 70, 229, 0.25); }
[data-theme="dark"] .mini-tag.item { color: #6ee7b7; background: rgba(5, 150, 105, 0.25); }
[data-theme="dark"] .context-chip { background: rgba(99, 102, 241, 0.1); }
[data-theme="dark"] .summary-block { background: rgba(99, 102, 241, 0.08); }
[data-theme="dark"] .quotes-wrapper { background: rgba(99, 102, 241, 0.06); }

/* 响应式微调 */
@media (max-width: 600px) {
  .emotion-section,
  .psych-section {
    padding-top: 8px;
  }
}
</style>