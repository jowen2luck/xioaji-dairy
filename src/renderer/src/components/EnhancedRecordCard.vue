<template>
  <div 
    class="journal-card" 
    :class="[
      `depth-${record._ai_meta?.content_depth || 'normal'}`,
      { 'is-compact': compact, 'is-loading': !record._ai_meta, 'has-no-content': !hasContent }
    ]"
    :style="{ '--accent-color': accentColor }"
  >
    <!-- 左侧装饰条 (核心颜色标识) -->
    <div class="card-accent-bar"></div>

    <!-- ================= 状态 1: 待分析 (保持原样) ================= -->
    <div v-if="!record._ai_meta" class="placeholder-state">
      <div class="placeholder-content">
        <n-icon size="32" :component="SparklesOutline" class="pulse-icon" />
        <div class="placeholder-text">AI 正在阅读...</div>
      </div>
    </div>

    <!-- ================= 状态 2: 完整展示 ================= -->
    <div v-else class="card-inner">
      
      <!-- 1. 头部：类型 + 时间 + 核心指标 -->
      <div class="card-header">
        <div class="header-left">
          <span class="type-label">{{ getContentTypeLabel(meta.content_type) }}</span>
          <span class="divider">·</span>
          <span class="time-text">{{ formatTime(record.time) }}</span>
          
          <!-- 领域标签 (仅在非生活类显示，避免信息过噪) -->
          <n-tag 
            v-if="meta.primary_domain && meta.primary_domain !== 'LifeLog'" 
            size="tiny" 
            round 
            :bordered="false" 
            class="domain-tag"
          >
            {{ getDomainLabel(meta.primary_domain) }}
          </n-tag>
        </div>

        <div class="header-right">
          <!-- 能量 & 专注 (简化版：仅图标+数字) -->
          <div v-if="typeof meta.energy_level === 'number'" class="stat-pill" title="能量水平">
            <n-icon :component="FlashOutline" :color="getEnergyColor(meta.energy_level)"/>
            <span class="stat-num">{{ meta.energy_level }}</span>
          </div>
          <div v-if="typeof meta.focus_level === 'number'" class="stat-pill" title="专注程度">
            <n-icon :component="EyeOutline" class="focus-icon"/>
            <span class="stat-num">{{ meta.focus_level }}</span>
          </div>
        </div>
      </div>

      <!-- 2. AI 摘要 (作为导语存在) -->
      <div v-if="meta.summary" class="summary-section">
        <n-icon :component="SparklesOutline" class="summary-icon" />
        <span class="summary-text">{{ meta.summary }}</span>
      </div>

      <!-- 3. 主内容区 (有内容才显示，无内容直接隐藏) -->
      <div v-if="hasContent" class="content-body">
        <!-- Markdown 正文 -->
        <MarkdownRenderer :content="record.ganshou" class="markdown-content" />
        
        <!-- 金句展示 -->
        <div v-if="showQuotes && meta.key_quotes?.length" class="quotes-section">
          <div v-for="(quote, idx) in meta.key_quotes.slice(0, 2)" :key="idx" class="quote-item">
            {{ quote }}
          </div>
        </div>

        <!-- 待办事项 (Next Steps) -->
        <div v-if="meta.next_steps?.length" class="next-steps">
          <div class="section-title-mini">OPEN LOOPS</div>
          <div v-for="(step, idx) in meta.next_steps" :key="idx" class="step-row">
            <span class="checkbox">☐</span> {{ step }}
          </div>
        </div>
      </div>

      <!-- 4. 情绪与洞察 (即使无正文，此区域也重点展示) -->
      <div class="mood-section">
        <div class="mood-list">
          <n-tag
            v-for="mood in meta.mood_tags || []"
            :key="mood"
            :color="getMoodColor(mood)"
            size="small"
            round
            class="mood-tag"
            @click="$emit('tag-click', 'mood', mood)"
          >
            {{ mood }}
          </n-tag>
        </div>
        <!-- 深度归因 -->
        <div v-if="meta.root_cause" class="insight-box">
          <span class="insight-label">💡 洞察：</span>
          {{ meta.root_cause }}
        </div>
      </div>

      <!-- 5. 心理分析折叠区 -->
      <div v-if="hasPsychData && (!compact || showAllInCompact)" class="psych-container">
        <div class="psych-toggle-btn" @click="showPsychology = !showPsychology">
          <span>🧠 心理维度分析</span>
          <n-icon :component="showPsychology ? ChevronUp : ChevronDown" />
        </div>
        
        <div v-show="showPsychology" class="psych-content">
          <div class="psych-grid">
            <div v-if="meta.maslow_need" class="psych-item">
              <span class="p-label">需求层级</span>
              <span class="p-val highlight">{{ meta.maslow_need }}</span>
            </div>
            <div v-if="meta.time_orientation" class="psych-item">
              <span class="p-label">时空取向</span>
              <span class="p-val">{{ getTimeOrientationLabel(meta.time_orientation) }}</span>
            </div>
            <div v-if="typeof meta.agency_level === 'number'" class="psych-item">
              <span class="p-label">掌控感</span>
              <span class="p-val" :class="meta.agency_level >= 0 ? 'pos' : 'neg'">
                {{ meta.agency_level > 0 ? '+' : '' }}{{ meta.agency_level }}
              </span>
            </div>
            <div v-if="hasDistortions" class="psych-item full-width">
              <span class="p-label warning">思维模式预警</span>
              <div class="distortion-list">
                <span v-for="p in meta.thinking_patterns.filter(x => x !== 'Rational')" :key="p" class="d-tag">{{ p }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. 统一底部信息栏 (Metadata Footer) -->
      <div class="card-footer">
        <div class="footer-scroll-area">
          <!-- 物理场景 -->
          <span v-if="meta.location" class="footer-meta">
            <n-icon :component="LocationOutline" /> {{ meta.location }}
          </span>
          <!-- 人物 -->
          <span v-for="p in (meta.people_involved || []).slice(0, 3)" :key="p" class="footer-meta person" @click="$emit('tag-click', 'person', p)">
            @{{ p }}
          </span>
          <!-- 交互 -->
          <span v-if="meta.interaction_type && meta.interaction_type !== 'Solo'" class="footer-meta">
             {{ getInteractionLabel(meta.interaction_type) }}
          </span>
          <!-- 物品 -->
          <span v-for="i in displayedItems" :key="i" class="footer-meta item" @click="$emit('tag-click', 'item', i)">
            #{{ i }}
          </span>
          <!-- 生理感受 -->
          <span v-if="meta.physiological_sensations?.length" class="footer-meta physio">
            <n-icon :component="BodyOutline" /> {{ meta.physiological_sensations[0] }}
          </span>
        </div>
        
        <div class="footer-right">
          <span class="meta-separator">|</span>
          <span class="footer-info">{{ record.chixushijian || '未记录时长' }}</span>
          <span v-if="record.shanggexiangmu" class="footer-info">📁 {{ record.shanggexiangmu }}</span>
        </div>
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
  EyeOutline, LocationOutline, BodyOutline, ChevronDownOutline as ChevronDown, 
  ChevronUpOutline as ChevronUp
} from '@vicons/ionicons5'

const props = defineProps({
  record: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  showQuotes: { type: Boolean, default: true },
  showAllInCompact: { type: Boolean, default: false }
})

defineEmits(['tag-click', 'request-analysis'])

const showPsychology = ref(false)
const meta = computed(() => props.record._ai_meta || {})

// 核心逻辑：是否有正文内容
const hasContent = computed(() => {
  return props.record.ganshou && props.record.ganshou.trim().length > 0
})

// 根据内容类型获取主色调 (Accent Color)
const accentColor = computed(() => {
  const type = meta.value.content_type
  const map = {
    'DailyLog': '#3b82f6',     // 蓝
    'Reflection': '#10b981',   // 绿
    'Letter': '#f59e0b',       // 橙黄 (书信)
    'Idea': '#8b5cf6',         // 紫
    'Dream': '#ec4899',        // 粉
    'default': '#64748b'       // 灰
  }
  return map[type] || map['default']
})

const displayedItems = computed(() => {
  return (meta.value.items || []).slice(0, 2)
})

const hasDistortions = computed(() => {
  const patterns = meta.value.thinking_patterns || []
  return patterns.some(p => p !== 'Rational' && p !== '理性客观')
})

const hasPsychData = computed(() => {
  const m = meta.value
  return m.time_orientation || m.maslow_need || typeof m.agency_level === 'number' || hasDistortions.value
})

// ============ 辅助函数 ============

const getContentTypeLabel = (type) => {
  const map = { 'DailyLog': '日志', 'Reflection': '复盘', 'Letter': '书信', 'Idea': '灵感', 'Dream': '梦境' }
  return map[type] || '记录'
}

const getDomainLabel = (domain) => {
  const map = { 'Career': '职场', 'Academic': '学术', 'Relationship': '社交', 'Health': '健康', 'Entertainment': '娱乐', 'PersonalGrowth': '成长', 'LifeLog': '生活' }
  return map[domain] || domain
}

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    return formatDistanceToNow(new Date(timeStr), { addSuffix: true, locale: zhCN })
  } catch { return timeStr }
}

const getEnergyColor = (level) => {
  if (level >= 8) return '#22c55e' // Green
  if (level >= 5) return '#f59e0b' // Orange
  return '#ef4444' // Red
}

// 优化的情绪颜色逻辑：返回浅色背景
const getMoodColor = (mood) => {
  // 定义颜色映射，这里只返回主题色，CSS 中会通过 opacity 处理
  const colorMap = {
    '开心': '#f59e0b', '愉快': '#eab308', '满足': '#22c55e',
    '焦虑': '#d97706', '难过': '#1d4ed8', '愤怒': '#dc2626',
    '平静': '#0d9488', '专注': '#06b6d4', '疲惫': '#64748b'
  }
  // 默认灰色
  const baseColor = colorMap[mood] || '#64748b'
  
  // Naive UI tag color object structure
  return { 
    color: `color-mix(in srgb, ${baseColor} 10%, transparent)`, // 极浅背景
    textColor: baseColor, 
    borderColor: `color-mix(in srgb, ${baseColor} 30%, transparent)` 
  }
}

const getTimeOrientationLabel = (o) => {
  const map = { 'Past': '过去', 'Present': '当下', 'Future': '未来', 'Timeless': '超越' }
  return map[o] || o
}

const getInteractionLabel = (t) => {
  const map = { 'Solo': '独处', 'OneOnOne': '1v1', 'Group': '小组', 'Crowd': '人群' }
  return map[t] || t
}
</script>

<style scoped>
.journal-card {
  /* 定义局部变量，继承全局主题变量 */
  --bg-primary: var(--color-card-bg, #ffffff);
  --bg-secondary: var(--color-background-mute, #f8fafc);
  --text-main: var(--color-text, #334155);
  --text-sub: var(--color-text-secondary, #64748b);
  --text-muted: var(--color-text-light, #94a3b8);
  --border-color: var(--color-border, #e2e8f0);
  
  /* Accent Color 默认为蓝色，会被 inline style 覆盖 */
  --accent-color: #3b82f6;

  position: relative;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: all 0.2s ease;
  margin-bottom: 16px;
  display: flex;
}

.journal-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.08);
}

/* 1. 左侧装饰条 */
.card-accent-bar {
  width: 4px;
  background: var(--accent-color);
  flex-shrink: 0;
}

/* 2. 内部容器 */
.card-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 防止 flex 子项溢出 */
}

/* 头部 */
.card-header {
  padding: 16px 16px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.type-label {
  font-weight: 700;
  color: var(--accent-color);
}

.divider { color: var(--border-color); }

.time-text {
  color: var(--text-muted);
  font-size: 13px;
}

.domain-tag {
  background: var(--bg-secondary);
  color: var(--text-sub);
}

.header-right {
  display: flex;
  gap: 12px;
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-sub);
  background: var(--bg-secondary);
  padding: 2px 8px;
  border-radius: 99px;
}

.stat-num { font-weight: 600; font-family: monospace; }
.focus-icon { color: #8b5cf6; }

/* 摘要导语 */
.summary-section {
  padding: 0 16px 8px;
  font-size: 13px;
  color: var(--text-sub);
  line-height: 1.5;
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.summary-icon { color: #f59e0b; font-size: 12px; transform: translateY(1px); }
.summary-text { font-style: italic; opacity: 0.9; }

/* 内容区 */
.content-body {
  padding: 8px 16px 16px;
  color: var(--text-main);
}

.markdown-content {
  font-size: 15px;
  line-height: 1.75;
}

/* 金句 */
.quotes-section {
  margin-top: 12px;
  padding-left: 12px;
  border-left: 2px solid var(--accent-color);
}
.quote-item {
  font-size: 14px;
  font-family: serif; /* 衬线体显气质 */
  color: var(--text-sub);
  margin-bottom: 4px;
  font-style: italic;
}

/* 待办 */
.next-steps {
  margin-top: 12px;
  background: var(--bg-secondary);
  padding: 8px 12px;
  border-radius: 6px;
}
.section-title-mini {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.step-row { font-size: 13px; color: var(--text-main); display: flex; gap: 6px; }
.checkbox { color: var(--text-muted); }

/* 情绪区域 */
.mood-section {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mood-list { display: flex; flex-wrap: wrap; gap: 6px; }

.insight-box {
  font-size: 13px;
  color: var(--text-sub);
  background: rgba(var(--accent-color), 0.05); /* 极淡的强调色背景 */
  padding: 6px 10px;
  border-radius: 6px;
  line-height: 1.4;
}
.insight-label { font-weight: 600; color: var(--text-main); }

/* 心理分析面板 */
.psych-container {
  border-top: 1px solid var(--border-color);
}
.psych-toggle-btn {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background: linear-gradient(to bottom, var(--bg-primary), var(--bg-secondary));
}
.psych-toggle-btn:hover { color: var(--accent-color); }

.psych-content {
  background: var(--bg-secondary);
  padding: 8px 16px 12px;
  border-top: 1px dashed var(--border-color);
}
.psych-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px 16px;
}
.psych-item { display: flex; flex-direction: column; gap: 2px; }
.p-label { font-size: 10px; color: var(--text-muted); }
.p-val { font-size: 12px; font-weight: 600; color: var(--text-main); }
.p-val.highlight { color: #db2777; } /* Maslow highlight */
.p-val.pos { color: #16a34a; }
.p-val.neg { color: #ea580c; }
.full-width { grid-column: 1 / -1; }
.distortion-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.d-tag { font-size: 11px; background: #fee2e2; color: #b91c1c; padding: 1px 6px; border-radius: 4px; }

/* 统一底部 */
.card-footer {
  background: var(--bg-secondary);
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-top: 1px solid var(--border-color);
}

.footer-scroll-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex: 1;
}

.footer-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-sub);
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s;
  cursor: default;
}
.footer-meta:hover { background: rgba(0,0,0,0.05); }

.footer-meta.person { color: #4f46e5; background: #e0e7ff; }
.footer-meta.item { color: #059669; }
.footer-meta.physio { color: #db2777; }

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.meta-separator { opacity: 0.3; }

/* 占位状态 */
.placeholder-state {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-muted);
}
.placeholder-content { text-align: center; }
.pulse-icon { animation: pulse 2s infinite; opacity: 0.5; }
@keyframes pulse { 50% { opacity: 1; transform: scale(1.1); } }

/* 暗黑模式适配 (如果你的 APP 只是切换 class 或 data-theme) */
[data-theme="dark"] .journal-card {
  --bg-primary: #1e1e20;
  --bg-secondary: #252529;
  --text-main: #e2e8f0;
  --text-sub: #94a3b8;
  --text-muted: #64748b;
  --border-color: #3f3f46;
}
[data-theme="dark"] .footer-meta.person { background: rgba(79, 70, 229, 0.2); color: #818cf8; }
[data-theme="dark"] .insight-box { background: rgba(255, 255, 255, 0.05); }
</style>