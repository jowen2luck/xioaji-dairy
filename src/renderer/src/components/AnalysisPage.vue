<template>
  <div class="analysis-page h-full p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors">
    <!-- 1. 顶部控制栏 -->
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <n-icon :component="AnalyticsIcon" class="text-primary" />
          全维度数据洞察
        </h1>
        <p class="text-gray-500 text-sm mt-1">基于 {{ stats.summary.totalRecords || 0 }} 条日记生成的 AI 分析报告</p>
      </div>
      <n-space>
        <n-button secondary strong @click="refreshData" :loading="loading">
          <template #icon><n-icon :component="RefreshIcon" /></template>
          刷新数据
        </n-button>
        <n-button type="primary" @click="exportReport">
          <template #icon><n-icon :component="DownloadIcon" /></template>
          导出报告
        </n-button>
      </n-space>
    </div>

    <!-- 2. 核心指标卡片 (KPI) -->
    <n-grid :x-gap="16" :y-gap="16" :cols="4" responsive="screen">
      <!-- 总记录 -->
      <n-gi>
        <n-card hoverable class="kpi-card">
          <n-statistic label="记录总数">
            <template #prefix><n-icon :component="BookIcon" /></template>
            <n-number-animation :from="0" :to="stats.summary.totalRecords || 0" />
            <template #suffix>篇</template>
          </n-statistic>
          <div class="kpi-footer">
            <n-tag size="small" type="success" round bordered :bordered="false">
              AI 增强率 {{ aiCoverage }}%
            </n-tag>
          </div>
        </n-card>
      </n-gi>
      
      <!-- 专注时长 -->
      <n-gi>
        <n-card hoverable class="kpi-card">
          <n-statistic label="专注投入">
            <template #prefix><n-icon :component="TimeIcon" /></template>
            <n-number-animation :from="0" :to="stats.summary.totalDurationHours || 0" :precision="1" />
            <template #suffix>小时</template>
          </n-statistic>
          <div class="kpi-footer text-gray-400">
            日均 {{ ((stats.summary.avgDurationMin || 0)).toFixed(0) }} 分钟
          </div>
        </n-card>
      </n-gi>

      <!-- 平均能量 -->
      <n-gi>
        <n-card hoverable class="kpi-card">
          <n-statistic label="近期能量值">
            <template #prefix><n-icon :component="FlashIcon" :color="energyColor" /></template>
            <span :style="{ color: energyColor }">{{ stats.ai.avgEnergy }}</span>
            <template #suffix><span class="text-xs text-gray-400">/ 10</span></template>
          </n-statistic>
          <n-progress 
            type="line" 
            :percentage="(stats.ai.avgEnergy || 0) * 10" 
            :color="energyColor" 
            :height="4" 
            class="mt-2"
            :show-indicator="false" 
          />
        </n-card>
      </n-gi>

      <!-- 项目数 -->
      <n-gi>
        <n-card hoverable class="kpi-card">
          <n-statistic label="覆盖项目">
            <template #prefix><n-icon :component="ProjectIcon" /></template>
            <n-number-animation :from="0" :to="stats.summary.projectCount || 0" />
            <template #suffix>个</template>
          </n-statistic>
          <div class="kpi-footer text-gray-400 text-xs truncate">
            Top1: {{ stats.projects[0]?.name || '无' }}
          </div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- 3. 趋势分析图表 -->
    <n-grid :x-gap="16" :y-gap="16" :cols="24" class="mt-4">
      <!-- 左侧：能量与情绪趋势 (Line Chart) -->
      <n-gi :span="16">
        <n-card title="生命能量与情绪波动" hoverable class="h-full">
          <template #header-extra>
            <n-radio-group v-model:value="trendPeriod" size="small">
              <n-radio-button value="week">周视图</n-radio-button>
              <n-radio-button value="month">月视图</n-radio-button>
            </n-radio-group>
          </template>
          <div class="h-80">
            <v-chart class="chart" :option="trendChartOption" autoresize />
          </div>
        </n-card>
      </n-gi>

      <!-- 右侧：AI 洞察分布 (Tabs for Charts) -->
      <n-gi :span="8">
        <n-card class="h-full" content-style="padding: 0;">
          <n-tabs type="line" size="large" justify-content="space-evenly" class="h-full">
            
            <!-- Tab 1: 情绪分布 -->
            <n-tab-pane name="mood" tab="情绪色彩">
              <div class="h-80 p-4">
                <v-chart class="chart" :option="moodPieOption" autoresize />
              </div>
            </n-tab-pane>

            <!-- Tab 2: 内容体裁 -->
            <n-tab-pane name="content" tab="内容体裁">
              <div class="h-80 p-4">
                <v-chart class="chart" :option="contentTypeOption" autoresize />
              </div>
            </n-tab-pane>
          </n-tabs>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- 4. 项目与人际网络 -->
    <n-grid :x-gap="16" :y-gap="16" :cols="24" class="mt-4">
      <!-- 项目排行 -->
      <n-gi :span="12">
        <n-card title="项目投入排行榜" hoverable>
          <div class="h-72">
            <v-chart class="chart" :option="projectBarOption" autoresize />
          </div>
        </n-card>
      </n-gi>

      <!-- 人际网络 -->
      <n-gi :span="12">
        <n-card title="高频社交网络" hoverable>
          <template #header-extra>
            <n-tooltip trigger="hover">
              <template #trigger><n-icon :component="InfoIcon" /></template>
              基于 AI 分析的 people_involved 字段
            </n-tooltip>
          </template>
          <div class="h-72 flex flex-wrap gap-2 content-start p-2 overflow-y-auto">
             <n-empty v-if="!stats.network.length" description="暂无社交数据" class="m-auto" />
             <n-tag 
               v-for="(person, index) in stats.network" 
               :key="index"
               :type="index < 3 ? 'primary' : 'default'"
               round
               size="large"
               class="cursor-pointer hover:scale-105 transition-transform"
             >
               {{ person.name }}
               <template #avatar>
                 <n-avatar round size="small" :style="{ backgroundColor: stringToColor(person.name) }">
                   {{ person.name[0] }}
                 </n-avatar>
               </template>
               <span class="ml-1 text-xs opacity-70">{{ person.count }}次</span>
             </n-tag>
          </div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- 5. 智慧胶囊 (金句轮播) -->
    <n-card title="✨ 智慧胶囊" class="mt-4" v-if="stats.wisdom.length">
      <n-carousel autoplay show-arrow dot-type="line" draggable>
        <div v-for="(quote, i) in stats.wisdom" :key="i" class="p-6 text-center bg-primary-50 dark:bg-gray-800 rounded-lg">
          <p class="text-xl font-serif text-gray-700 dark:text-gray-200 italic">
            "{{ quote.content }}"
          </p>
          <div class="mt-4 flex justify-center gap-2">
            <n-tag size="small" :bordered="false">{{ quote.source }}</n-tag>
            <n-tag size="small" type="info" :bordered="false" v-if="quote.tag">{{ quote.tag }}</n-tag>
          </div>
        </div>
      </n-carousel>
    </n-card>

    <div v-if="error" class="text-red-500 mt-4 text-center">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useThemeVars } from 'naive-ui'
import { 
  BarChart as AnalyticsIcon, 
  RefreshOutline as RefreshIcon, 
  DownloadOutline as DownloadIcon,
  BookOutline as BookIcon,
  TimeOutline as TimeIcon,
  FlashOutline as FlashIcon,
  FolderOpenOutline as ProjectIcon,
  InformationCircleOutline as InfoIcon
} from '@vicons/ionicons5'

// ECharts 引入
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

// --- 状态定义 ---
const themeVars = useThemeVars()
const loading = ref(false)
const error = ref(null)
const trendPeriod = ref('month') // week | month

// 核心数据存储 (对应 sqlAnalysis.js 的返回结构)
const stats = reactive({
  summary: {},
  projects: [],
  trends: [], // { date, energy, mood }
  moods: [],  // { name, value }
  contentTypes: [],
  network: [],
  wisdom: [],
  ai: { avgEnergy: 0 }
})

// --- 计算属性 ---

const aiCoverage = computed(() => {
  const total = stats.summary.totalRecords || 1
  const aiCount = stats.summary.aiEnhancedCount || 0 // 假设 API 返回了这个
  return ((aiCount / total) * 100).toFixed(1)
})

const energyColor = computed(() => {
  const e = stats.ai.avgEnergy || 0
  if (e >= 7) return themeVars.value.successColor
  if (e >= 4) return themeVars.value.warningColor
  return themeVars.value.errorColor
})

// 生成字符串对应的固定颜色 (用于头像)
const stringToColor = (str) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

// --- 图表配置 (Computed) ---

const trendChartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis' },
  legend: { textStyle: { color: themeVars.value.textColor2 } },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category',
    data: stats.trends.map(i => i.date),
    axisLine: { lineStyle: { color: themeVars.value.borderColor } },
    axisLabel: { color: themeVars.value.textColor2 }
  },
  yAxis: [
    { type: 'value', name: '能量', max: 10, splitLine: { lineStyle: { type: 'dashed', color: themeVars.value.dividerColor } } },
    { type: 'value', name: '心情', max: 10, show: false }
  ],
  series: [
    {
      name: '能量值',
      type: 'line',
      smooth: true,
      data: stats.trends.map(i => i.energy),
      itemStyle: { color: themeVars.value.warningColor },
      areaStyle: { opacity: 0.1, color: themeVars.value.warningColor }
    },
    {
      name: '心情分',
      type: 'line',
      smooth: true,
      data: stats.trends.map(i => i.mood),
      itemStyle: { color: themeVars.value.primaryColor },
      lineStyle: { type: 'dashed' }
    }
  ]
}))

const projectBarOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: { type: 'value', splitLine: { show: false } },
  yAxis: {
    type: 'category',
    data: stats.projects.map(p => p.name).reverse(), // Top 在上
    axisLabel: { color: themeVars.value.textColor2, width: 90, overflow: 'truncate' }
  },
  series: [
    {
      name: '时长(小时)',
      type: 'bar',
      data: stats.projects.map(p => p.totalDurationHours).reverse(),
      itemStyle: { borderRadius: [0, 4, 4, 0], color: themeVars.value.primaryColor },
      label: { show: true, position: 'right', color: themeVars.value.textColor2 }
    }
  ]
}))

const moodPieOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item' },
  series: [
    {
      name: '情绪分布',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: themeVars.value.cardColor,
        borderWidth: 2
      },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: stats.moods
    }
  ]
}))

const contentTypeOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item' },
  series: [
    {
      name: '内容体裁',
      type: 'pie',
      radius: [20, 100],
      roseType: 'area', // 玫瑰图
      itemStyle: { borderRadius: 5 },
      data: stats.contentTypes
    }
  ]
}))

// --- 核心逻辑 ---

const refreshData = async () => {
  loading.value = true
  error.value = null
  try {
    // 模拟 IPC 调用，这里你应该替换为真实的 window.electron.ipcRenderer.invoke
    // 我们批量调用 sqlAnalysis 工具的不同 type
    
    // 1. 获取基础统计
    const summaryRes = await runAnalysis('summary')
    stats.summary = summaryRes.data
    stats.summary.aiEnhancedCount = summaryRes.aiEnhancedCount // 补充这个字段

    // 2. 获取项目排行
    const projectRes = await runAnalysis('by_project', { limit: 8 })
    stats.projects = projectRes.data

    // 3. 获取能量趋势 (AI)
    const trendRes = await runAnalysis('energy_trend', { groupBy: trendPeriod.value })
    // 转换数据格式适配图表
    stats.trends = trendRes.data.map(item => ({
      date: item.date_group, // 假设后端返回 date_group
      energy: item.avg_energy,
      mood: item.avg_mood
    }))
    // 计算平均能量
    const totalEnergy = stats.trends.reduce((acc, cur) => acc + (cur.energy || 0), 0)
    stats.ai.avgEnergy = stats.trends.length ? (totalEnergy / stats.trends.length).toFixed(1) : 0

    // 4. 获取情绪分布 (AI)
    const moodRes = await runAnalysis('mood_distribution')
    stats.moods = moodRes.data.map(m => ({ name: m.tag, value: m.count }))

    // 5. 获取内容体裁 (AI)
    const contentRes = await runAnalysis('content_type_ratio')
    stats.contentTypes = contentRes.data.map(c => ({ name: c.type, value: c.count }))

    // 6. 获取人际网络 (AI)
    const peopleRes = await runAnalysis('people_network')
    stats.network = peopleRes.data // 假设返回 [{name: 'Lisa', count: 10}]

    // 7. 获取金句
    const wisdomRes = await runAnalysis('wisdom_archive', { limit: 5 })
    stats.wisdom = wisdomRes.data // 假设返回 [{content: '...', source: '...'}]

  } catch (err) {
    console.error(err)
    error.value = "数据加载失败: " + err.message
  } finally {
    loading.value = false
  }
}

// 模拟 IPC 调用封装 (请替换为真实 IPC)
const runAnalysis = async (type, params = {}) => {
  // TODO: 替换为真实 IPC
  // return await window.electron.ipcRenderer.invoke('tool-execute', 'sql_analysis', { analysisType: type, params })
  
  // 临时：模拟数据返回，方便你直接预览 UI
  return mockDataMap(type, params)
}

// ---------------- 模拟数据 (开发完成后删除) ----------------
const mockDataMap = (type) => {
  return new Promise(resolve => {
    setTimeout(() => {
      const mocks = {
        summary: { data: { totalRecords: 128, totalDurationHours: 340.5, projectCount: 12, avgDurationMin: 45 }, aiEnhancedCount: 98 },
        by_project: { data: [
          { name: 'Vue重构', totalDurationHours: 120 }, { name: '写作练习', totalDurationHours: 80 },
          { name: '健身', totalDurationHours: 60 }, { name: '阅读', totalDurationHours: 40 },
          { name: '家庭时光', totalDurationHours: 20 }, { name: '冥想', totalDurationHours: 10 }
        ]},
        energy_trend: { data: Array.from({length: 7}, (_, i) => ({
          date_group: `11-${20+i}`, avg_energy: 5 + Math.random()*4, avg_mood: 6 + Math.random()*3
        }))},
        mood_distribution: { data: [
          { tag: '充实', count: 40 }, { tag: '焦虑', count: 15 }, 
          { tag: '平静', count: 30 }, { tag: '兴奋', count: 10 }
        ]},
        content_type_ratio: { data: [
          { type: '技术复盘', count: 50 }, { type: '生活随笔', count: 30 }, { type: '创意灵感', count: 10 }
        ]},
        people_network: { data: [
          { name: '张三', count: 15 }, { name: '李四', count: 8 }, { name: '导师', count: 5 }, { name: 'Alice', count: 3 }
        ]},
        wisdom_archive: { data: [
          { content: '保持耐心是痛苦的，但它的果实是甜蜜的。', source: '2023-11-20', tag: '自省' },
          { content: '代码如诗，重构如歌。', source: '2023-11-22', tag: '技术' }
        ]}
      }
      resolve(mocks[type] || { data: [] })
    }, 500)
  })
}

const exportReport = () => {
  // 导出逻辑
  alert('导出功能开发中...')
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.kpi-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.kpi-footer {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart {
  height: 100%;
  min-height: 250px;
  width: 100%;
}

/* 隐藏滚动条但保留功能 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(0,0,0,0.1);
  border-radius: 3px;
}
</style>