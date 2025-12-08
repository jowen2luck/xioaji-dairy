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
            
            <n-form-item label="意图识别模型">
              <n-select v-model:value="assistantConfig.intentModel" :options="currentModels" />
            </n-form-item>
            
            <n-form-item label="温度">
              <n-slider v-model:value="assistantConfig.temperature" :min="0" :max="2" :step="0.1" />
              <n-input-number 
                v-model:value="assistantConfig.temperature" 
                :min="0" 
                :max="2" 
                :step="0.1" 
                size="small" 
                style="margin-top: 8px; width: 100px;"
              />
            </n-form-item>
            
            <n-form-item label="Top P">
              <n-slider v-model:value="assistantConfig.top_p" :min="0" :max="1" :step="0.05" />
              <n-input-number 
                v-model:value="assistantConfig.top_p" 
                :min="0" 
                :max="1" 
                :step="0.05" 
                size="small" 
                style="margin-top: 8px; width: 100px;"
              />
            </n-form-item>
            
            <n-form-item label="启用工具">
              <n-checkbox-group v-model:value="assistantConfig.enabledTools">
                <n-space vertical>
                  <n-checkbox value="search_records">检索记录（语义搜索）</n-checkbox>
                  <n-checkbox value="query_records">查询记录（精确筛选）</n-checkbox>
                  <n-checkbox value="sql_analysis">SQL 分析（统计分析）</n-checkbox>
                </n-space>
              </n-checkbox-group>
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- 图表配置 -->
        <n-tab-pane name="charts" tab="图表配置">
          <n-collapse>
            <!-- 共振分析配置 -->
            <n-collapse-item title="共振分析" name="resonance">
              <n-form label-placement="left" label-width="140">
                <n-form-item label="赋能者阈值">
                  <n-input-number v-model:value="chartsConfig.resonance.boosterThreshold" :min="0" :max="10" />
                </n-form-item>
                <n-form-item label="消耗者阈值">
                  <n-input-number v-model:value="chartsConfig.resonance.drainerThreshold" :min="0" :max="10" />
                </n-form-item>
                <n-form-item label="最少出现次数">
                  <n-input-number v-model:value="chartsConfig.resonance.minOccurrences" :min="1" />
                </n-form-item>
                <n-form-item label="榜单展示数量">
                  <n-input-number v-model:value="chartsConfig.resonance.topN" :min="1" :max="20" />
                </n-form-item>
              </n-form>
            </n-collapse-item>

            <!-- 四象限配置 -->
            <n-collapse-item title="四象限状态" name="quadrant">
              <n-form label-placement="left" label-width="140">
                <n-form-item label="能量分界线">
                  <n-input-number 
                    v-model:value="chartsConfig.quadrant.energyMidpoint" 
                    :min="0" 
                    :max="10" 
                    placeholder="null=动态中位数"
                    clearable
                  />
                  <n-text depth="3" style="font-size: 12px; margin-top: 4px;">留空则使用动态中位数</n-text>
                </n-form-item>
                <n-form-item label="掌控感分界线">
                  <n-input-number 
                    v-model:value="chartsConfig.quadrant.agencyMidpoint" 
                    :min="-5" 
                    :max="5" 
                    placeholder="null=动态中位数"
                    clearable
                  />
                  <n-text depth="3" style="font-size: 12px; margin-top: 4px;">留空则使用动态中位数</n-text>
                </n-form-item>
              </n-form>
            </n-collapse-item>

            <!-- 能量气象站配置 -->
            <n-collapse-item title="能量气象站" name="energy">
              <n-form label-placement="left" label-width="140">
                <n-form-item label="生理状态最小显示%">
                  <n-input-number v-model:value="chartsConfig.energyWeather.physicalStateMinDisplay" :min="0" :max="100" />
                </n-form-item>
              </n-form>
            </n-collapse-item>

            <!-- 通用配置 -->
            <n-collapse-item title="通用设置" name="common">
              <n-form label-placement="left" label-width="140">
                <n-form-item label="默认加载记录数">
                  <n-input-number v-model:value="chartsConfig.common.defaultLimit" :min="100" :max="2000" :step="100" />
                </n-form-item>
                <n-form-item label="最大加载记录数">
                  <n-input-number v-model:value="chartsConfig.common.maxLimit" :min="500" :max="5000" :step="100" />
                </n-form-item>
                <n-form-item label="动画时长(ms)">
                  <n-input-number v-model:value="chartsConfig.common.animationDuration" :min="0" :max="1000" :step="100" />
                </n-form-item>
              </n-form>
            </n-collapse-item>
          </n-collapse>
        </n-tab-pane>
      </n-tabs>

      <template #footer>
        <n-space justify="space-between">
          <n-button @click="resetToDefault" type="warning">
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
  intentModel: loadedConfig.intentModel,
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
    intentModel: assistantConfig.value.intentModel,
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
      intentModel: DEFAULT_CONFIG.intentModel,
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
:deep(.n-drawer-body-content-wrapper) {
  padding-bottom: 60px;
}
</style>
