<template>
  <n-drawer
    v-model:show="show"
    :width="600"
    placement="right"
  >
    <n-drawer-content title="全局设置" closable>
      <n-tabs type="segment" animated>
        <!-- 智能体配置 -->
        <n-tab-pane name="assistant" tab="智能助手">
          <n-form label-placement="top" label-width="auto">
            <n-form-item label="推理点 Base URL">
              <n-select v-model:value="assistantConfig.selectedBaseURL" :options="baseURLOptions" />
            </n-form-item>
            
            <n-form-item label="模型">
              <n-select v-model:value="assistantConfig.selectedModel" :options="currentModels" />
            </n-form-item>
            
            <n-form-item label="系统提示词">
              <n-input 
                type="textarea" 
                v-model:value="assistantConfig.systemPrompt" 
                placeholder="描述助手角色、可用工具、输出格式"
                :autosize="{ minRows: 4, maxRows: 10 }"
              />
            </n-form-item>
            
            <n-form-item label="温度">
              <n-slider v-model:value="assistantConfig.temperature" :min="0" :max="1" :step="0.1" />
              <div class="slider-value">{{ assistantConfig.temperature }}</div>
            </n-form-item>
            
            <n-form-item label="Top P">
              <n-slider v-model:value="assistantConfig.top_p" :min="0" :max="1" :step="0.1" />
              <div class="slider-value">{{ assistantConfig.top_p }}</div>
            </n-form-item>
            
            <n-form-item label="启用的工具">
              <n-checkbox-group v-model:value="assistantConfig.enabledTools">
                <n-space>
                  <n-checkbox value="search_records">语义搜索</n-checkbox>
                  <n-checkbox value="query_records">精确查询</n-checkbox>
                  <n-checkbox value="sql_analysis">统计分析</n-checkbox>
                  <n-checkbox value="calendar_resolver">日历解析</n-checkbox>
                  <n-checkbox value="metadata_explorer">元数据探索</n-checkbox>
                  <n-checkbox value="insight_analyst">深度洞察</n-checkbox>
                </n-space>
              </n-checkbox-group>
            </n-form-item>
          </n-form>
        </n-tab-pane>
        
        <!-- 图表配置 -->
        <n-tab-pane name="charts" tab="图表">
          <n-form label-placement="top" label-width="auto">
            <n-form-item label="启用的图表">
              <n-checkbox-group v-model:value="chartsConfig.enabledCharts">
                <n-space vertical>
                  <n-checkbox value="pyramid">能量金字塔</n-checkbox>
                  <n-checkbox value="rose">情绪玫瑰图</n-checkbox>
                  <n-checkbox value="bar">情绪分布柱状图</n-checkbox>
                  <n-checkbox value="scatter">能量散点图</n-checkbox>
                  <n-checkbox value="heatmap">活动热力图</n-checkbox>
                  <n-checkbox value="wordcloud">词云图</n-checkbox>
                  <n-checkbox value="causality">因果链图</n-checkbox>
                  <n-checkbox value="matrix">状态矩阵</n-checkbox>
                  <n-checkbox value="resonance">共振分析</n-checkbox>
                  <n-checkbox value="composition">生活构成</n-checkbox>
                  <n-checkbox value="weather">能量天气</n-checkbox>
                  <n-checkbox value="context">上下文云</n-checkbox>
                  <n-checkbox value="temporal">时间锚点</n-checkbox>
                </n-space>
              </n-checkbox-group>
            </n-form-item>
            
            <n-form-item label="图表尺寸">
              <n-radio-group v-model:value="chartsConfig.chartSize">
                <n-space>
                  <n-radio value="small">小</n-radio>
                  <n-radio value="medium">中</n-radio>
                  <n-radio value="large">大</n-radio>
                </n-space>
              </n-radio-group>
            </n-form-item>
          </n-form>
        </n-tab-pane>
      </n-tabs>
      
      <template #footer>
        <n-space justify="space-between">
          <n-button @click="resetToDefault">
            恢复默认
          </n-button>
          <n-space>
            <n-button @click="show = false">
              取消
            </n-button>
            <n-button type="primary" @click="saveSettings">
              保存
            </n-button>
          </n-space>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../config/assistant'
import { loadChartsConfig, saveChartsConfig } from '../config/chartsConfig'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible'])

const show = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 智能体配置
const loadedConfig = loadConfig()
const assistantConfig = ref({
  selectedBaseURL: loadedConfig.selectedBaseURL,
  selectedModel: loadedConfig.selectedModel,
  systemPrompt: loadedConfig.prompts.chatSystem,
  temperature: loadedConfig.temperature,
  top_p: loadedConfig.top_p,
  enabledTools: [...loadedConfig.enabledTools]
})

// 图表配置
const chartsConfig = ref(loadChartsConfig())

// 加载时刷新配置
onMounted(() => {
  chartsConfig.value = loadChartsConfig()
})

// Base URL 选项
const baseURLOptions = computed(() => {
  const urls = DEFAULT_CONFIG.baseURLs || []
  return urls.map(entry => ({
    label: entry.url,
    value: entry.url
  }))
})

// 当前可用模型
const currentModels = computed(() => {
  const urls = DEFAULT_CONFIG.baseURLs || []
  const selectedEntry = urls.find(entry => entry.url === assistantConfig.value.selectedBaseURL)
  return (selectedEntry?.models || []).map(model => ({
    label: model,
    value: model
  }))
})

// 保存设置
const saveSettings = () => {
  // 保存智能体配置
  saveConfig({
    selectedBaseURL: assistantConfig.value.selectedBaseURL,
    selectedModel: assistantConfig.value.selectedModel,
    temperature: assistantConfig.value.temperature,
    top_p: assistantConfig.value.top_p,
    enabledTools: assistantConfig.value.enabledTools,
    prompts: {
      chatSystem: assistantConfig.value.systemPrompt
    }
  })

  // 保存图表配置到 localStorage
  saveChartsConfig(chartsConfig.value)

  // 触发全局配置更新事件
  window.dispatchEvent(new CustomEvent('settings-updated', {
    detail: {
      assistant: assistantConfig.value,
      charts: chartsConfig.value
    }
  }))

  show.value = false
}

// 恢复默认
const resetToDefault = () => {
  if (confirm('确定要恢复所有设置到默认值吗？')) {
    assistantConfig.value = {
      selectedBaseURL: DEFAULT_CONFIG.selectedBaseURL,
      selectedModel: DEFAULT_CONFIG.selectedModel,
      systemPrompt: DEFAULT_CONFIG.prompts.chatSystem,
      temperature: DEFAULT_CONFIG.temperature,
      top_p: DEFAULT_CONFIG.top_p,
      enabledTools: [...DEFAULT_CONFIG.enabledTools]
    }
    // 重新加载默认图表配置
    chartsConfig.value = loadChartsConfig()
    // 清除 localStorage
    localStorage.removeItem('charts-config')
  }
}
</script>

<style scoped>
.slider-value {
  margin-top: 4px;
  font-size: 12px;
  color: #666;
}

:deep(.n-drawer-body-content-wrapper) {
  padding-bottom: 60px;
}
</style>