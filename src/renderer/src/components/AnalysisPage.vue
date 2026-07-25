<template>
  <div class="analysis-page">
    <!-- 顶部标题栏（固定） -->
    <div class="header-bar">
      <div class="header-content">
        <div class="header-left">
          <n-icon :component="AnalyticsIcon" size="28" class="header-icon" />
          <div class="header-text">
            <h1 class="header-title">全维度数据洞察</h1>
            <p class="header-subtitle">基于您的日记生成的 AI 分析报告</p>
          </div>
        </div>
        <n-space size="small">
          <n-button secondary @click="refreshAll" :loading="loading">
            <template #icon><n-icon :component="RefreshIcon" /></template>
            刷新
          </n-button>
          <n-button type="primary" @click="exportReport">
            <template #icon><n-icon :component="DownloadIcon" /></template>
            导出
          </n-button>
        </n-space>
      </div>
    </div>

    <!-- 主体内容区（可滚动） -->
    <div class="content-area">
      <div class="content-inner">
      <!-- 第一层：流年·踪迹 -->
      <section class="layer-section">
        <div class="layer-header">
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-200">
            🍃 第一层：流年·踪迹
          </h2>
          <p class="layer-subtitle">草蛇灰线，伏脉千里 —— 呈现客观记录，不做主观评判</p>
        </div>
        
        <n-grid :x-gap="16" :y-gap="16" :cols="24" class="mt-4">
          <!-- 生活重心 -->
          <n-gi :span="12">
            <LifeCompositionCard :refresh-key="refreshKey" />
          </n-gi>
          
          <!-- 物与境 -->
          <n-gi :span="12">
            <ContextCloudCard :refresh-key="refreshKey" />
          </n-gi>
          
          <!-- 律动 -->
          <n-gi :span="24">
            <ActivityCalendarCard :refresh-key="refreshKey" />
          </n-gi>
        </n-grid>
      </section>

      <!-- 第二层：内观·心像 -->
      <section class="layer-section">
        <div class="layer-header">
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-200">
            🧘 第二层：内观·心像
          </h2>
          <p class="layer-subtitle">心如明镜台 —— 穿透行为表象，描绘内在心理气候</p>
        </div>
        
        <n-grid :x-gap="16" :y-gap="16" :cols="24" class="mt-4">
          <!-- 能量气象站 -->
          <n-gi :span="24">
            <EnergyWeatherCard :refresh-key="refreshKey" />
          </n-gi>
          
          <!-- 需求金字塔 -->
          <n-gi :span="12">
            <PyramidCard :refresh-key="refreshKey" />
          </n-gi>
          
          <!-- 时空锚点 -->
          <n-gi :span="12">
            <TemporalAnchorCard :refresh-key="refreshKey" />
          </n-gi>
        </n-grid>
      </section>

      <!-- 第三层：回响·洞察 -->
      <section class="layer-section">
        <div class="layer-header">
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-200">
            ✨ 第三层：回响·洞察
          </h2>
          <p class="layer-subtitle">念念不忘，必有回响 —— 寻找变量间的隐秘关联</p>
        </div>
        
        <n-grid :x-gap="16" :y-gap="16" :cols="24" class="mt-4">
          <!-- 共振分析 -->
          <n-gi :span="24">
            <ResonanceAnalysisCard :refresh-key="refreshKey" />
          </n-gi>
          
          <!-- 状态象限 -->
          <n-gi :span="12">
            <StateMatrixCard :refresh-key="refreshKey" />
          </n-gi>
          
          <!-- 因果链路 -->
          <n-gi :span="12">
            <CausalityChainCard :refresh-key="refreshKey" />
          </n-gi>
        </n-grid>
      </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { 
  BarChart as AnalyticsIcon, 
  RefreshOutline as RefreshIcon, 
  DownloadOutline as DownloadIcon
} from '@vicons/ionicons5'

// 第一层组件
import LifeCompositionCard from './charts/containers/LifeCompositionCard.vue'
import ContextCloudCard from './charts/containers/ContextCloudCard.vue'
import ActivityCalendarCard from './charts/containers/ActivityCalendarCard.vue'

// 第二层组件
import EnergyWeatherCard from './charts/containers/EnergyWeatherCard.vue'
import PyramidCard from './charts/containers/PyramidCard.vue'
import TemporalAnchorCard from './charts/containers/TemporalAnchorCard.vue'

// 第三层组件
import ResonanceAnalysisCard from './charts/containers/ResonanceAnalysisCard.vue'
import StateMatrixCard from './charts/containers/StateMatrixCard.vue'
import CausalityChainCard from './charts/containers/CausalityChainCard.vue'

const loading = ref(false)
const refreshKey = ref(0)

const refreshAll = () => {
  loading.value = true
  refreshKey.value += 1
  window.setTimeout(() => {
    loading.value = false
  }, 800)
}

const exportReport = () => {
  // TODO: 实现导出功能
  alert('导出功能开发中...')
}
</script>

<style scoped>
.analysis-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--n-color);
  overflow: hidden;
}

.header-bar {
  flex-shrink: 0;
  background: var(--n-card-color);
  border-bottom: 1px solid var(--n-border-color);
  padding: 16px 24px;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  color: var(--n-primary-color);
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--n-text-color);
  margin: 0;
}

.header-subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.content-inner {
  width: 100%;
  padding: 24px;
  padding-bottom: 48px;
}

.layer-section {
  margin-bottom: 48px;
}

.layer-header {
  margin-bottom: 16px;
}

.layer-subtitle {
  font-size: 14px;
  color: #888;
  margin-top: 4px;
  font-style: italic;
}
.layer-section:last-child {
  margin-bottom: 0;
}
</style>
