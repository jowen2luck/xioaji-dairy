<template>
  <article class="diary-page parchment-style" :style="pageThemeStyle">
    <!-- Page Header -->
    <header class="page-header">
      <div class="date-group">
        <span class="day-number">{{ String(record._meta_day).padStart(2, '0') }}</span>
        <div class="month-year-col">
          <span class="month-str">{{ getMonthAbbr(record._meta_month) }}</span>
          <span class="year-str">{{ record._meta_year }}</span>
        </div>
      </div>
      <div class="header-divider"></div>
      <div class="meta-tags">
        <span class="weekday-tag">{{ record._meta_weekday }}</span>
        <span class="domain-text" v-if="record._ai_meta?.primary_domain">
          / {{ record._ai_meta.primary_domain }}
        </span>
      </div>
    </header>

    <!-- Content Grid: Main + Sidebar -->
    <div class="content-grid">
      <!-- Main Column - Reading Area -->
      <main class="main-column">
        <!-- AI Summary as Lead with Drop Cap -->
        <div class="summary-lead" v-if="record._ai_meta?.summary">
          <span class="lead-cap">S</span>ummary — {{ record._ai_meta.summary }}
        </div>

        <!-- Main Text Content -->
        <div class="main-text markdown-body" v-html="sanitizedContent"></div>

        <!-- Key Quotes Section -->
        <div class="quotes-section" v-if="record._ai_meta?.key_quotes?.length">
          <div class="quote-symbol">❝</div>
          <blockquote 
            v-for="(quote, index) in record._ai_meta.key_quotes" 
            :key="index"
            class="quote-item"
          >
            {{ quote }}
          </blockquote>
        </div>
      
        <!-- Postscript (Next Steps) -->
        <div class="postscript-section" v-if="record._ai_meta?.next_steps?.length">
          <div class="ps-divider">
            <span class="ps-mark">P.S.</span>
          </div>
          <ul class="ps-list">
            <li v-for="(step, index) in record._ai_meta.next_steps" :key="index">
              <span class="ps-bullet">✦</span> {{ step }}
            </li>
          </ul>
        </div>
      </main>

     <!-- Side Column - Marginalia (页边注) -->
      <aside class="side-column">
        <div class="sidebar-sticky">
          
          <!-- A. Basic Metadata List -->
          <div class="meta-list">
            
            <!-- Project -->
            <div class="meta-item" v-if="record.shanggexiangmu">
              <span class="meta-label">PROJECT</span>
              <span class="meta-value highlight">{{ record.shanggexiangmu }}</span>
            </div>

            <!-- People -->
            <div class="meta-item" v-if="record._ai_meta?.people_involved?.length">
              <span class="meta-label">PEOPLE</span>
              <span class="meta-value">{{ record._ai_meta.people_involved.join(', ') }}</span>
            </div>

            <!-- Duration -->
            <div class="meta-item" v-if="record._meta_duration_min">
              <span class="meta-label">DURATION</span>
              <span class="meta-value">{{ formatDuration(record._meta_duration_min) }}</span>
            </div>

            <!-- Location -->
            <div class="meta-item" v-if="record._ai_meta?.location">
              <span class="meta-label">LOCATION</span>
              <span class="meta-value">{{ record._ai_meta.location }}</span>
            </div>

            <!-- Items/Objects -->
            <div class="meta-item" v-if="record._ai_meta?.items?.length">
              <span class="meta-label">OBJECTS</span>
              <span class="meta-value">{{ record._ai_meta.items.join(', ') }}</span>
            </div>
          </div>

          <!-- B. State Section (Energy & Mood) -->
          <div class="state-section">
            
            <!-- Energy Bar -->
            <div class="energy-block" v-if="record._ai_meta?.energy_level">
              <div class="bar-header">
                <span class="meta-label">ENERGY</span>
                <span class="bar-num">{{ record._ai_meta.energy_level }}</span>
              </div>
              <div class="progress-track">
                <div 
                  class="progress-fill" 
                  :style="{ width: `${record._ai_meta.energy_level * 10}%` }"
                ></div>
              </div>
            </div>

            <!-- Physio (Body Sensation) -->
            <!-- <div class="meta-item" v-if="record.tiyan">
              <span class="meta-label">PHYSIO</span>
              <span class="meta-value italic">{{ record.tiyan }}</span>
            </div> -->

            <!-- Mood Tags Cloud -->
            <div class="mood-cloud" v-if="record._ai_meta?.mood_tags?.length">
              <span v-for="tag in record._ai_meta.mood_tags" :key="tag" class="mood-dot">
                {{ tag }}
              </span>
            </div>
          </div>

          <!-- C. Insight Block -->
          <div class="insight-block" v-if="record._ai_meta?.root_cause">
            <span class="meta-label">INSIGHT</span>
            <p class="insight-text">
              "{{ record._ai_meta.root_cause }}"
            </p>
          </div>

          <!-- D. TODO Block (Next Steps) -->
          <div class="todo-block" v-if="record._ai_meta?.next_steps?.length">
            <span class="meta-label">TODO</span>
            <ul class="todo-list">
              <li v-for="(step, index) in record._ai_meta.next_steps" :key="index" class="todo-item">
                <span class="checkbox">☐</span>
                <span class="todo-text">{{ step }}</span>
              </li>
            </ul>
          </div>

        </div>
      </aside>
    </div>

    <!-- Page Footer - Minimal Page Number -->
    <footer class="page-footer">
      <span class="page-num">— {{ pageNumber }} —</span>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  record: {
    type: Object,
    required: true
  },
  pageNumber: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 1
  }
})

// Computed: Theme color from xinqing
const pageThemeStyle = computed(() => {
  const color = props.record.xinqing || '#9E9E9E'
  return {
    '--theme-color': color,
    '--theme-color-light': `${color}20`,
    '--theme-color-medium': `${color}40`
  }
})

// Computed: Sanitized content (basic HTML cleanup)
const sanitizedContent = computed(() => {
  let html = props.record.ganshou || ''
  // Remove excessive inline styles but keep structure
  html = html.replace(/style="[^"]*"/gi, '')
  return html
})

// Computed: Has assets to show
const hasAssets = computed(() => {
  return (props.record._ai_meta?.next_steps?.length > 0) || 
         (props.record._ai_meta?.key_quotes?.length > 0)
})

// Computed: Has context info
const hasContext = computed(() => {
  return props.record._ai_meta?.location || 
         props.record._ai_meta?.people_involved?.length || 
         props.record.shanggexiangmu ||
         props.record._meta_duration_min
})

// Computed: Has stats
const hasStats = computed(() => {
  return props.record._ai_meta?.energy_level || 
         props.record._ai_meta?.focus_level ||
         props.record._ai_meta?.agency_level !== null
})

// Computed: Normalized Agency for display (0-10 scale)
const normalizedAgency = computed(() => {
  let a = props.record._ai_meta?.agency_level
  if (a === null || a === undefined) return 5
  // If agency is -5 to 5, normalize to 0-10
  if (a < 0) return Math.max(0, 5 + a)
  if (a > 10) return 10
  return a
})

// === Radar Chart Calculation (Vitality Triangle) ===
// Coordinate system: 0,0 at top-left, 100x100 canvas. Center at 50,55. Radius ~40.
const radarPoints = computed(() => {
  const e = props.record._ai_meta?.energy_level || 0
  const f = props.record._ai_meta?.focus_level || 0
  const a = normalizedAgency.value
  
  // Top point (Energy): angle -90 degrees (pointing up)
  const eY = 55 - (e / 10) * 40
  
  // Bottom-right point (Focus): angle 30 degrees
  const fRad = (30 * Math.PI) / 180
  const fX = 50 + (f / 10) * 40 * Math.cos(fRad)
  const fY = 55 + (f / 10) * 40 * Math.sin(fRad)
  
  // Bottom-left point (Agency): angle 150 degrees
  const aRad = (150 * Math.PI) / 180
  const aX = 50 + (a / 10) * 40 * Math.cos(aRad)
  const aY = 55 + (a / 10) * 40 * Math.sin(aRad)

  return `50,${eY.toFixed(1)} ${fX.toFixed(1)},${fY.toFixed(1)} ${aX.toFixed(1)},${aY.toFixed(1)}`
})

// Individual coordinates for circle markers
const energyXY = computed(() => {
  const e = props.record._ai_meta?.energy_level || 0
  return { x: 50, y: 55 - (e / 10) * 40 }
})

const focusXY = computed(() => {
  const f = props.record._ai_meta?.focus_level || 0
  const rad = (30 * Math.PI) / 180
  return { 
    x: 50 + (f / 10) * 40 * Math.cos(rad), 
    y: 55 + (f / 10) * 40 * Math.sin(rad) 
  }
})

const agencyXY = computed(() => {
  const a = normalizedAgency.value
  const rad = (150 * Math.PI) / 180
  return { 
    x: 50 + (a / 10) * 40 * Math.cos(rad), 
    y: 55 + (a / 10) * 40 * Math.sin(rad) 
  }
})

// Computed: Non-rational thinking patterns
const nonRationalPatterns = computed(() => {
  const patterns = props.record._ai_meta?.thinking_patterns || []
  return patterns.filter(p => p !== 'Rational' && p !== '理性客观')
})

const hasNonRationalPatterns = computed(() => {
  return nonRationalPatterns.value.length > 0
})

// Methods
const formatDuration = (minutes) => {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`
  } else if (hours > 0) {
    return `${hours}h`
  } else {
    return `${mins}m`
  }
}

const getMonthAbbr = (month) => {
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ]
  return months[(month || 1) - 1] || 'JAN'
}
</script>

<style scoped>
/* ============================================
   Refined Parchment Style (Literary Edition)
   ============================================ */

.diary-page.parchment-style {
  background: transparent;
  padding: 40px 0;
  margin-bottom: 80px;
  position: relative;
  
  /* Theme Colors */
  --ink-primary: #2c3e50;
  --ink-secondary: #5a4a3c;
  --ink-muted: #8A7A6A;
  --gold-accent: #c8ae7d;
  --border-line: rgba(200, 174, 125, 0.4);
  
  /* Theme color from record */
  --theme-color: v-bind('record.xinqing || "#9E9E9E"');
  --theme-color-light: v-bind('(record.xinqing || "#9E9E9E") + "20"');
}

/* ============================================
   Page Header
   ============================================ */
.page-header {
  margin-bottom: 40px;
  position: relative;
}

.date-group {
  display: flex;
  align-items: baseline;
  gap: 16px;
  font-family: var(--font-heading, 'Playfair Display', serif);
  color: var(--ink-primary);
}

.day-number {
  font-size: 64px;
  font-weight: 400;
  line-height: 0.8;
  color: var(--gold-accent);
}

.month-year-col {
  display: flex;
  flex-direction: column;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--ink-secondary);
  font-weight: 600;
}

.year-str {
  font-weight: 300;
  font-size: 12px;
  letter-spacing: 3px;
  margin-top: 4px;
}

.header-divider {
  width: 100%;
  height: 1px;
  border-bottom: 1px dashed var(--border-line);
  margin: 20px 0 12px;
}

.meta-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-ui, 'Lato', sans-serif);
  font-size: 12px;
  color: var(--ink-muted);
  font-style: italic;
}

.weekday-tag {
  font-style: normal;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.domain-text {
  color: var(--gold-accent);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-style: normal;
  font-size: 10px;
  font-weight: 600;
}

/* ============================================
   Content Grid
   ============================================ */
.content-grid {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 60px;
}

/* ============================================
   Main Column (Text Content)
   ============================================ */
.main-column {
  font-family: var(--font-body, 'Merriweather', serif);
}

/* Summary Lead with Drop Cap */
.summary-lead {
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink-secondary);
  margin-bottom: 32px;
  font-style: italic;
  font-weight: 300;
}

.lead-cap {
  font-size: 28px;
  font-weight: 700;
  color: var(--gold-accent);
  line-height: 1;
  margin-right: 2px;
}

/* Main Text & Hyperlink Styling */
.main-text {
  font-size: 16px;
  line-height: 2;
  color: var(--ink-primary);
  text-align: justify;
}

.main-text :deep(p) {
  margin-bottom: 1.2em;
}

/* Golden Underline for Links */
.main-text :deep(a) {
  color: var(--ink-secondary);
  text-decoration: none;
  border-bottom: 1px solid var(--gold-accent);
  transition: all 0.2s ease;
  padding-bottom: 1px;
}

.main-text :deep(a:hover) {
  background: rgba(200, 174, 125, 0.1);
  color: var(--ink-primary);
  border-bottom-color: var(--ink-primary);
}

.main-text :deep(strong) {
  font-weight: 700;
  color: var(--ink-secondary);
}

/* Quotes Section */
.quotes-section {
  margin: 40px 0;
  position: relative;
  text-align: center;
  padding: 0 40px;
}

.quote-symbol {
  font-size: 40px;
  color: var(--gold-accent);
  opacity: 0.4;
  line-height: 1;
  margin-bottom: 16px;
}

.quote-item {
  font-family: var(--font-heading, 'Playfair Display', serif);
  font-size: 17px;
  font-style: italic;
  color: var(--ink-secondary);
  margin: 16px 0;
  line-height: 1.7;
  border: none;
  padding: 0;
}

/* Postscript (Next Steps) */
.postscript-section {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px dashed var(--border-line);
}

.ps-divider {
  margin-bottom: 16px;
}

.ps-mark {
  font-family: var(--font-heading, 'Playfair Display', serif);
  font-size: 14px;
  font-style: italic;
  color: var(--ink-muted);
  letter-spacing: 1px;
}

.ps-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-family: var(--font-ui, 'Lato', sans-serif);
  font-size: 14px;
  color: var(--ink-primary);
  line-height: 1.8;
}

.ps-list li {
  margin-bottom: 8px;
  padding-left: 20px;
  position: relative;
}

.ps-bullet {
  position: absolute;
  left: 0;
  color: var(--gold-accent);
  font-size: 10px;
}

/* ============================================
   Side Column - Marginalia (页边注)
   ============================================ */
.side-column {
  width: 220px;
  flex-shrink: 0;
  padding-top: 10px;
  font-family: var(--font-ui, 'Lato', sans-serif);
}

.sidebar-sticky {
  position: sticky;
  top: 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Common Label Style */
.meta-label {
  display: block;
  font-size: 10px;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 6px;
  font-weight: 700;
}

.meta-value {
  font-size: 13px;
  color: var(--ink-primary);
  line-height: 1.4;
}

.meta-value.highlight {
  color: var(--ink-secondary);
  font-weight: 600;
}

.meta-value.italic {
  font-style: italic;
  color: var(--ink-secondary);
}

/* A. Basic Metadata List */
.meta-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
}

/* B. State Section (Energy & Mood) */
.state-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

/* Energy Bar (Progress Style) */
.energy-block {
  width: 100%;
}

.bar-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.bar-num {
  font-family: var(--font-heading, 'Playfair Display', serif);
  font-style: italic;
  color: var(--gold-accent);
  font-size: 14px;
}

.progress-track {
  height: 2px;
  background: rgba(0, 0, 0, 0.05);
  width: 100%;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--gold-accent);
  position: absolute;
  left: 0;
  top: 0;
  transition: width 0.3s ease;
}

/* Mood Cloud */
.mood-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.mood-dot {
  font-size: 11px;
  color: var(--ink-muted);
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  transition: all 0.2s ease;
}

.mood-dot:hover {
  border-color: var(--gold-accent);
  color: var(--ink-secondary);
}

/* C. Insight Block */
.insight-block {
  display: flex;
  flex-direction: column;
}

.insight-text {
  font-family: var(--font-heading, 'Playfair Display', serif);
  font-style: italic;
  font-size: 14px;
  color: var(--ink-secondary);
  line-height: 1.5;
  margin: 0;
}

/* D. TODO List */
.todo-block {
  display: flex;
  flex-direction: column;
}

.todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--ink-primary);
  line-height: 1.4;
}

.checkbox {
  color: var(--gold-accent);
  font-size: 14px;
  line-height: 1.2;
  user-select: none;
}

.todo-text {
  flex: 1;
}

/* ============================================
   Page Footer - Minimal
   ============================================ */
.page-footer {
  display: flex;
  justify-content: center;
  padding-top: 32px;
  margin-top: 40px;
  border-top: 1px solid var(--border-line);
}

.page-num {
  font-family: var(--font-ui, 'Lato', sans-serif);
  font-size: 11px;
  color: var(--ink-muted);
  letter-spacing: 2px;
}

/* ============================================
   Responsive Design
   ============================================ */
@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  
  .side-column {
    order: -1;
  }
  
  .radar-chart-container {
    max-width: 160px;
  }
}

@media (max-width: 600px) {
  .diary-page.parchment-style {
    padding: 24px 0;
  }
  
  .page-header {
    margin-bottom: 32px;
  }
  
  .day-number {
    font-size: 48px;
  }
  
  .summary-lead {
    font-size: 15px;
  }
  
  .main-text {
    font-size: 15px;
    line-height: 1.8;
  }
  
  .quotes-section {
    padding: 0 20px;
  }
}

/* ============================================
   Dark Mode Adjustments
   ============================================ */
[data-theme="dark"] .diary-page.parchment-style {
  --ink-primary: #e8e6e3;
  --ink-secondary: #d4cfc7;
  --ink-muted: #a39989;
  --gold-accent: #d4af7a;
  --border-line: rgba(212, 175, 122, 0.3);
}

[data-theme="dark"] .radar-shape {
  fill-opacity: 0.25;
}

[data-theme="dark"] .insight-note {
  background: rgba(212, 175, 122, 0.08);
}
</style>
