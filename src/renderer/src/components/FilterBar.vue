<template>
  <div class="filter-bar-unified">
    <!-- 主工具条：响应式网格/弹性布局 -->
    <div class="main-toolbar">
      <!-- 1. 搜索输入区 -->
      <div class="toolbar-search">
        <n-input
          v-model:value="localValue.query"
          placeholder="搜索日记感悟..."
          clearable
          size="small"
          class="filter-search-input"
          @update:value="emitUpdate"
        >
          <template #prefix>
            <n-icon size="14" class="search-icon"><SearchOutline /></n-icon>
          </template>
        </n-input>
      </div>

      <!-- 2. 操作按钮组 (一键整理、导入、记一笔) -->
      <div class="toolbar-actions">
        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button 
              secondary
              size="small"
              class="compact-tool-btn etl-btn"
              @click="() => { console.log('[FilterBar] ETL-enhance button clicked!'); $emit('etl-enhance') }"
              :loading="etlProcessing"
              :disabled="etlProcessing"
            >
              <template #icon>
                <n-icon size="13"><SparklesOutline /></n-icon>
              </template>
              <span class="btn-text">一键整理</span>
            </n-button>
          </template>
          使用小鸡 AI 提炼标签、心绪与能量值
        </n-tooltip>

        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button 
              quaternary
              size="small" 
              class="compact-tool-btn" 
              @click="$emit('import')"
            >
              <template #icon>
                <n-icon size="13"><FolderOpenOutline /></n-icon>
              </template>
              <span class="btn-text">导入</span>
            </n-button>
          </template>
          批量导入日记 Excel / CSV
        </n-tooltip>

        <n-button 
          type="primary" 
          size="small" 
          class="compact-hero-btn" 
          @click="$emit('create')"
        >
          <template #icon>
            <span class="hero-btn-emoji">🐥</span>
          </template>
          <span>记一笔</span>
        </n-button>
      </div>

      <!-- 3. 条件筛选组 (项目、日期、高级筛选、重置) -->
      <div class="toolbar-filters">
        <!-- 项目/分类筛选 -->
        <n-select
          v-model:value="localValue.project"
          placeholder="全部项目"
          :options="projectOptions"
          clearable
          size="small"
          class="filter-select-project"
          @update:value="emitUpdate"
        />

        <!-- 日期区间筛选 -->
        <n-date-picker
          v-model:value="localValue.dateRange"
          type="daterange"
          clearable
          size="small"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          class="filter-date-picker"
          @update:value="emitUpdate"
        />

        <!-- 高级筛选折叠展开按钮 -->
        <n-button
          size="small"
          :secondary="!isAdvancedOpen && !hasAdvancedFilters"
          :type="hasAdvancedFilters ? 'primary' : 'default'"
          class="filter-toggle-btn"
          @click="isAdvancedOpen = !isAdvancedOpen"
        >
          <template #icon>
            <n-icon size="13"><FilterOutline /></n-icon>
          </template>
          <span>筛选</span>
          <span v-if="hasAdvancedFilters" class="filter-badge-dot"></span>
        </n-button>

        <!-- 满足任一筛选条件时出现重置按钮 -->
        <n-button
          v-if="hasAnyFilter"
          quaternary
          size="small"
          class="filter-reset-btn"
          @click="handleReset"
        >
          重置
        </n-button>
      </div>
    </div>

    <!-- 高级筛选展开行 (折叠式次级微面板) -->
    <transition name="slide-fade">
      <div v-show="isAdvancedOpen" class="advanced-filter-bar">
        <div class="adv-item">
          <span class="adv-label">内容类型:</span>
          <n-select
            v-model:value="localValue.contentType"
            placeholder="全部类型"
            :options="contentTypeOptions"
            clearable
            size="small"
            class="adv-select"
            @update:value="emitUpdate"
          />
        </div>

        <div class="adv-item adv-slider-item">
          <span class="adv-label">能量范围 ({{ localValue.energyRange ? `${localValue.energyRange[0]}-${localValue.energyRange[1]}` : '0-10' }}):</span>
          <div class="slider-box">
            <n-slider
              v-model:value="localValue.energyRange"
              range
              :min="0"
              :max="10"
              :step="1"
              @update:value="emitUpdate"
            />
          </div>
        </div>

        <n-button 
          quaternary 
          size="tiny" 
          class="adv-close-btn" 
          @click="isAdvancedOpen = false"
        >
          收起
        </n-button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { reactive, watch, ref, computed } from 'vue'
import { FolderOpenOutline, SearchOutline, SparklesOutline, FilterOutline } from '@vicons/ionicons5'

const props = defineProps({
  value: {
    type: Object,
    default: () => ({ 
      query: '', 
      project: null, 
      dateRange: null,
      contentType: null,
      energyRange: [0, 10]
    })
  },
  projectOptions: {
    type: Array,
    default: () => []
  },
  etlProcessing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:value', 'import', 'reset', 'etl-enhance', 'create'])

const localValue = reactive({
  query: props.value.query,
  project: props.value.project,
  dateRange: props.value.dateRange,
  contentType: props.value.contentType,
  energyRange: props.value.energyRange || [0, 10]
})

const isAdvancedOpen = ref(false)

const contentTypeOptions = [
  { label: '📝 日志', value: 'Log' },
  { label: '🔄 复盘', value: 'Review' },
  { label: '💭 梦境', value: 'Dream' },
  { label: '📊 总结', value: 'Summary' }
]

// 是否激活了高级筛选（内容类型非空，或能量范围不是[0,10]）
const hasAdvancedFilters = computed(() => {
  const hasType = !!localValue.contentType
  const hasEnergy = Array.isArray(localValue.energyRange) &&
    (localValue.energyRange[0] > 0 || localValue.energyRange[1] < 10)
  return hasType || hasEnergy
})

// 是否激活了任何筛选
const hasAnyFilter = computed(() => {
  return !!localValue.query || 
    !!localValue.project || 
    !!localValue.dateRange || 
    hasAdvancedFilters.value
})

watch(() => props.value, (v) => {
  localValue.query = v.query
  localValue.project = v.project
  localValue.dateRange = v.dateRange
  localValue.contentType = v.contentType
  localValue.energyRange = v.energyRange || [0, 10]
}, { deep: true })

function emitUpdate() {
  emit('update:value', { ...localValue })
}

function handleReset() {
  localValue.query = ''
  localValue.project = null
  localValue.dateRange = null
  localValue.contentType = null
  localValue.energyRange = [0, 10]
  emit('update:value', { ...localValue })
  emit('reset')
}
</script>

<style scoped>
.filter-bar-unified {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

/* 核心工具条：
   - 默认/高缩放模式（< 1180px，如 Windows 200% 缩放）：
     第一行：搜索输入框（弹性撑满） + 操作按钮群（右对齐）
     第二行：项目分类、日期范围、筛选开关、重置（平铺一整行，杜绝台阶式折叠）
*/
.main-toolbar {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "search actions"
    "filters filters";
  gap: 8px 12px;
  align-items: center;
  width: 100%;
}

.toolbar-search {
  grid-area: search;
  min-width: 0;
  display: flex;
  align-items: center;
}

.filter-search-input {
  width: 100%;
  max-width: 320px;
}

.search-icon {
  opacity: 0.6;
}

.toolbar-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.toolbar-filters {
  grid-area: filters;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.filter-select-project {
  width: 115px;
  flex-shrink: 0;
}

.filter-date-picker {
  width: 220px;
  flex-shrink: 0;
}

.filter-toggle-btn {
  border-radius: 8px;
  font-size: 12px;
  position: relative;
  flex-shrink: 0;
}

.filter-badge-dot {
  width: 6px;
  height: 6px;
  background: #f5a623;
  border-radius: 50%;
  margin-left: 4px;
}

.filter-reset-btn {
  font-size: 12px;
  flex-shrink: 0;
  color: var(--color-text-secondary, #888);
}

.filter-reset-btn:hover {
  color: #d03050;
}

.compact-hero-btn {
  background: linear-gradient(135deg, #f5a623 0%, #f78c1e 100%) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 16px;
  padding: 0 14px;
  height: 32px;
  font-size: 12.5px;
  box-shadow: 0 2px 8px rgba(245, 166, 35, 0.32);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
}

.compact-hero-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 166, 35, 0.42);
}

.hero-btn-emoji {
  font-size: 14px;
  margin-right: 2px;
}

.compact-tool-btn {
  border-radius: 8px;
  height: 32px;
  font-size: 12.5px;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.etl-btn {
  border-color: rgba(94, 129, 244, 0.3);
}

/* 宽屏超宽时 (>= 1180px)，平铺成单行 */
@media (min-width: 1180px) {
  .main-toolbar {
    display: flex;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .toolbar-search {
    flex: 0 1 220px;
  }

  .filter-search-input {
    max-width: 220px;
  }

  .toolbar-filters {
    flex: 1 1 auto;
    width: auto;
  }

  .toolbar-actions {
    margin-left: auto;
  }
}

/* 窄屏或高倍缩放下 (< 580px) */
@media (max-width: 580px) {
  .filter-date-picker {
    width: auto;
    flex: 1 1 170px;
    min-width: 160px;
  }
  .filter-select-project {
    width: 100px;
  }
  .compact-hero-btn {
    padding: 0 10px;
  }
  .compact-tool-btn {
    padding: 0 8px;
  }
}

/* 高级筛选折叠展开条 */
.advanced-filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  background: var(--color-background-soft, rgba(140, 140, 160, 0.08));
  border: 1px dashed var(--color-border, rgba(140, 140, 160, 0.25));
  border-radius: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.adv-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.adv-label {
  font-size: 11.5px;
  color: var(--color-text-secondary, #888);
  white-space: nowrap;
}

.adv-select {
  width: 120px;
}

.adv-slider-item {
  flex: 1;
  min-width: 200px;
  max-width: 340px;
}

.slider-box {
  flex: 1;
  padding: 0 6px;
}

.adv-close-btn {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-secondary, #888);
}

/* 展开平滑过渡 */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>