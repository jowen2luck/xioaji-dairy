<template>
  <div class="filter-bar">
    <div class="filter-item">
      <n-button type="primary" size="large" @click="$emit('import')">
        <template #icon>
          <n-icon><FolderOpenOutline /></n-icon>
        </template>
        导入 Excel 数据
      </n-button>
    </div>
    <div class="filter-item">
      <n-button 
        type="primary" 
        size="large" 
        @click="$emit('etl-enhance')"
        :loading="etlProcessing"
        :disabled="etlProcessing"
      >
        <template #icon>
          <n-icon><SparklesOutline /></n-icon>
        </template>
        一键整理
      </n-button>
    </div>
    <div class="filter-item">
      <n-input
        v-model:value="localValue.query"
        placeholder="输入关键词搜索感想"
        clearable
        size="large"
        @update:value="emitUpdate"
      >
        <template #prefix>
          <n-icon><SearchOutline /></n-icon>
        </template>
      </n-input>
    </div>
    <div class="filter-item">
      <n-select
        v-model:value="localValue.project"
        placeholder="按项目筛选"
        :options="projectOptions"
        clearable
        size="large"
        @update:value="emitUpdate"
      />
    </div>
    <div class="filter-item">
      <n-date-picker
        v-model:value="localValue.dateRange"
        type="daterange"
        clearable
        size="large"
        @update:value="emitUpdate"
      />
    </div>
    <div class="filter-item">
      <n-button size="large" ghost @click="$emit('reset')">重置筛选</n-button>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { FolderOpenOutline, SearchOutline, SparklesOutline } from '@vicons/ionicons5'

const props = defineProps({
  value: {
    type: Object,
    default: () => ({ query: '', project: null, dateRange: null })
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

const emit = defineEmits(['update:value', 'import', 'reset', 'etl-enhance'])

const localValue = reactive({
  query: props.value.query,
  project: props.value.project,
  dateRange: props.value.dateRange
})

watch(() => props.value, (v) => {
  localValue.query = v.query
  localValue.project = v.project
  localValue.dateRange = v.dateRange
}, { deep: true })

function emitUpdate() {
  emit('update:value', { ...localValue })
}
</script>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  width: 100%;
}
.filter-item {
  flex: 1 1 220px;
  min-width: 220px;
}
</style>