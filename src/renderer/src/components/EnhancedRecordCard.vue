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
          <!-- Both modes show the same content, time editing is in header-right -->
          <span class="type-label">{{ getContentTypeLabel(meta.content_type) }}</span>
          <span class="divider">·</span>
          <span class="time-text">{{ formatTime(record.time) }}</span>
          
          <!-- 领域标签 (仅在非生活类显示，避免信息过噪) -->
          <n-tag 
            v-if="meta.primary_domain && meta.primary_domain !== 'LifeLog' && !isEditing" 
            size="tiny" 
            round 
            :bordered="false" 
            class="domain-tag"
          >
            {{ getDomainLabel(meta.primary_domain) }}
          </n-tag>
        </div>

        <div class="header-right">
          <!-- Edit Mode: Time Input -->
          <n-date-picker
            v-if="isEditing"
            v-model:value="editForm.time"
            type="datetime"
            size="small"
            format="yyyy-MM-dd HH:mm"
            style="width: 180px"
          />
          <!-- View Mode -->
          <template v-else>
            <!-- 能量 & 专注 (简化版：仅图标+数字) -->
            <div v-if="typeof meta.energy_level === 'number'" class="stat-pill" title="能量水平">
              <n-icon :component="FlashOutline" :color="getEnergyColor(meta.energy_level)"/>
              <span class="stat-num">{{ meta.energy_level }}</span>
            </div>
            <div v-if="typeof meta.focus_level === 'number'" class="stat-pill" title="专注程度">
              <n-icon :component="EyeOutline" class="focus-icon"/>
              <span class="stat-num">{{ meta.focus_level }}</span>
            </div>
          </template>
          
          <!-- Edit Toggle Button -->
          <n-button
            v-if="!isEditing"
            text
            size="small"
            @click="startEdit"
            title="Edit Record"
          >
            <template #icon>
              <n-icon :component="CreateOutline" />
            </template>
          </n-button>
          
          <!-- Edit Action Buttons -->
          <template v-else>
            <n-button
              text
              size="small"
              @click="cancelEdit"
              :disabled="isSaving"
              title="Cancel"
            >
              <template #icon>
                <n-icon :component="CloseOutline" />
              </template>
            </n-button>
            <n-button
              type="primary"
              size="small"
              @click="saveEdit"
              :loading="isSaving"
              title="Save"
            >
              <template #icon>
                <n-icon :component="CheckmarkOutline" />
              </template>
            </n-button>
          </template>
        </div>
      </div>

      <!-- 2. AI Summary (edit mode or display mode) -->
      <div v-if="meta.summary || isEditing" class="summary-section">
        <n-icon :component="SparklesOutline" class="summary-icon" />
        <n-input
          v-if="isEditing"
          v-model:value="editForm.summary"
          type="textarea"
          placeholder="AI Summary"
          :autosize="{ minRows: 1, maxRows: 3 }"
          :disabled="isSaving"
          style="flex: 1"
        />
        <span v-else class="summary-text">{{ meta.summary }}</span>
      </div>

      <!-- 3. 主内容区 (有内容才显示，无内容直接隐藏) -->
      <div v-if="hasContent || isEditing" class="content-body">
        <!-- Edit Mode: Textarea -->
        <n-input
          v-if="isEditing"
          v-model:value="editForm.ganshou"
          type="textarea"
          placeholder="Edit content..."
          :autosize="{ minRows: 4, maxRows: 20 }"
          :disabled="isSaving"
          class="edit-textarea"
        />
        <!-- View Mode: Markdown -->
        <template v-else>
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
        </template>
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
        <!-- Edit Mode: Additional Fields -->
        <div v-if="isEditing" class="edit-footer">
          <!-- Row 1: Energy & Focus -->
          <div class="edit-section">
            <div class="edit-field-row">
              <span class="edit-label">Energy (1-10):</span>
              <n-input-number 
                v-model:value="editForm.energy_level" 
                :min="1" 
                :max="10"
                size="small"
                style="width: 100px"
              />
            </div>
            <div class="edit-field-row">
              <span class="edit-label">Focus (1-10):</span>
              <n-input-number 
                v-model:value="editForm.focus_level" 
                :min="1" 
                :max="10"
                size="small"
                style="width: 100px"
              />
            </div>
            <div class="edit-field-row">
              <span class="edit-label">Location:</span>
              <n-input 
                v-model:value="editForm.location" 
                placeholder="e.g., Office, Home" 
                size="small"
                style="width: 150px"
              />
            </div>
          </div>
          
          <!-- Row 2: Key Quotes -->
          <div class="edit-section">
            <div class="edit-section-header">
              <span class="edit-label">Key Quotes:</span>
              <n-button text size="tiny" @click="addArrayItem('key_quotes')">
                <n-icon :component="AddOutline" />
              </n-button>
            </div>
            <div v-for="(quote, idx) in editForm.key_quotes" :key="'quote-'+idx" class="array-item-row">
              <n-input 
                v-model:value="editForm.key_quotes[idx]" 
                size="small"
                placeholder="Quote text"
                style="flex: 1"
              />
              <n-button text size="tiny" @click="removeArrayItem('key_quotes', idx)">
                <n-icon :component="TrashOutline" />
              </n-button>
            </div>
          </div>
          
          <!-- Row 3: People -->
          <div class="edit-section">
            <div class="edit-section-header">
              <span class="edit-label">People:</span>
              <n-button text size="tiny" @click="addArrayItem('people_involved')">
                <n-icon :component="AddOutline" />
              </n-button>
            </div>
            <div class="array-tags-row">
              <div v-for="(person, idx) in editForm.people_involved" :key="'person-'+idx" class="array-tag-item">
                <n-input 
                  v-model:value="editForm.people_involved[idx]" 
                  size="tiny"
                  placeholder="Name"
                  style="width: 80px"
                />
                <n-button text size="tiny" @click="removeArrayItem('people_involved', idx)">
                  <n-icon :component="CloseOutline" size="12" />
                </n-button>
              </div>
            </div>
          </div>
          
          <!-- Row 4: Items -->
          <div class="edit-section">
            <div class="edit-section-header">
              <span class="edit-label">Items:</span>
              <n-button text size="tiny" @click="addArrayItem('items')">
                <n-icon :component="AddOutline" />
              </n-button>
            </div>
            <div class="array-tags-row">
              <div v-for="(item, idx) in editForm.items" :key="'item-'+idx" class="array-tag-item">
                <n-input 
                  v-model:value="editForm.items[idx]" 
                  size="tiny"
                  placeholder="Item"
                  style="width: 80px"
                />
                <n-button text size="tiny" @click="removeArrayItem('items', idx)">
                  <n-icon :component="CloseOutline" size="12" />
                </n-button>
              </div>
            </div>
          </div>
          
          <!-- Row 5: Physiological Sensations -->
          <div class="edit-section">
            <div class="edit-section-header">
              <span class="edit-label">Body Feelings:</span>
              <n-button text size="tiny" @click="addArrayItem('physiological_sensations')">
                <n-icon :component="AddOutline" />
              </n-button>
            </div>
            <div class="array-tags-row">
              <div v-for="(sens, idx) in editForm.physiological_sensations" :key="'sens-'+idx" class="array-tag-item">
                <n-input 
                  v-model:value="editForm.physiological_sensations[idx]" 
                  size="tiny"
                  placeholder="Feeling"
                  style="width: 80px"
                />
                <n-button text size="tiny" @click="removeArrayItem('physiological_sensations', idx)">
                  <n-icon :component="CloseOutline" size="12" />
                </n-button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- View Mode: Original Footer -->
        <template v-else>
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
        </template>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale' 
import { useMessage } from 'naive-ui'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { 
  SparklesOutline, FlashOutline, TimeOutline, FolderOpenOutline,
  EyeOutline, LocationOutline, BodyOutline, ChevronDownOutline as ChevronDown, 
  ChevronUpOutline as ChevronUp, CreateOutline, CloseOutline, CheckmarkOutline,
  AddOutline, TrashOutline
} from '@vicons/ionicons5'

const props = defineProps({
  record: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  showQuotes: { type: Boolean, default: true },
  showAllInCompact: { type: Boolean, default: false }
})

const emit = defineEmits(['tag-click', 'request-analysis', 'refresh'])

const message = useMessage()
const showPsychology = ref(false)
const isEditing = ref(false)
const editForm = ref({})
const isSaving = ref(false)

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

// ============ Edit Mode Functions ============

const startEdit = () => {
  // Deep copy raw field values
  editForm.value = {
    // Raw fields (stored in appData.json)
    ganshou: props.record.ganshou || '',
    time: props.record.time ? new Date(props.record.time).getTime() : Date.now(),
    
    // AI meta fields (stored in ai_meta_index.json)
    summary: meta.value.summary || '',
    energy_level: meta.value.energy_level || 5,
    focus_level: meta.value.focus_level || 5,
    key_quotes: [...(meta.value.key_quotes || [])],
    people_involved: [...(meta.value.people_involved || [])],
    items: [...(meta.value.items || [])],
    location: meta.value.location || '',
    physiological_sensations: [...(meta.value.physiological_sensations || [])]
  }
  isEditing.value = true
}

const cancelEdit = () => {
  isEditing.value = false
  editForm.value = {}
}

// Helper functions for array editing
const addArrayItem = (fieldName) => {
  if (!editForm.value[fieldName]) {
    editForm.value[fieldName] = []
  }
  editForm.value[fieldName].push('')
}

const removeArrayItem = (fieldName, index) => {
  editForm.value[fieldName].splice(index, 1)
}

const saveEdit = async () => {
  if (isSaving.value) return
  
  try {
    isSaving.value = true
    
    // Build raw field update payload (only time and ganshou)
    const rawPayload = {
      ganshou: editForm.value.ganshou,
      time: typeof editForm.value.time === 'number' 
        ? new Date(editForm.value.time).toISOString().slice(0, 19)
        : editForm.value.time
    }
    
    // Build AI meta update payload
    const aiMetaPayload = {
      summary: editForm.value.summary,
      energy_level: parseInt(editForm.value.energy_level) || 5,
      focus_level: parseInt(editForm.value.focus_level) || 5,
      key_quotes: editForm.value.key_quotes.filter(q => q.trim() !== ''),
      people_involved: editForm.value.people_involved.filter(p => p.trim() !== ''),
      items: editForm.value.items.filter(i => i.trim() !== ''),
      location: editForm.value.location,
      physiological_sensations: editForm.value.physiological_sensations.filter(s => s.trim() !== '')
    }
    
    // Call backend API with both payloads
    const result = await window.assistant.updateRecord(props.record._id, rawPayload, aiMetaPayload)
    
    if (result.success) {
      message.success('Record updated successfully')
      isEditing.value = false
      // Notify parent to refresh data
      emit('refresh')
    } else {
      message.error(`Update failed: ${result.error}`)
    }
  } catch (error) {
    console.error('[EnhancedRecordCard] Save error:', error)
    message.error('Failed to save changes')
  } finally {
    isSaving.value = false
  }
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

/* ============ Edit Mode Styles ============ */
.edit-textarea {
  font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
}

.edit-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
  width: 100%;
}

.edit-section {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
}

.edit-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.edit-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 90px;
}

.array-item-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.array-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}

.array-tag-item {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-secondary);
  border-radius: 4px;
  padding: 2px 4px;
}

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