<template>
  <div class="analysis-container">
    <n-card>
      <div class="header">
        <div class="header-content">
          <h1>数据分析中心</h1>
          <n-button @click="exportData" type="primary">
            <template #icon>
              <n-icon><DownloadOutline /></n-icon>
            </template>
            导出数据
          </n-button>
        </div>
      </div>
    </n-card>
    
    <n-spin v-if="loading" description="正在分析数据...">
      <div class="loading-placeholder" style="height: 200px; display: flex; align-items: center; justify-content: center;">
        <p>请稍候，正在为您生成详细的数据分析报告</p>
      </div>
    </n-spin>
    
    <n-alert v-if="error" type="error" :show-icon="true">
      {{ error }}
    </n-alert>
    
    <div v-if="!loading && !error" id="content">
      <!-- 统计概览 -->
      <n-grid cols="1 s:2 m:3 l:4" responsive="screen" :x-gap="12" :y-gap="12">
        <n-grid-item>
          <n-statistic label="总记录数" :value="analysisReport?.summary?.totalRecords || 0" />
        </n-grid-item>
        <n-grid-item>
          <n-statistic label="项目数量" :value="analysisReport?.summary?.totalProjects || 0" />
        </n-grid-item>
        <n-grid-item>
          <n-statistic label="记录天数" :value="analysisReport?.summary?.dateRange?.days || 0" />
        </n-grid-item>
        <n-grid-item>
          <n-statistic label="平均时长(分钟)" :value="analysisReport?.summary?.avgDuration || 0" />
        </n-grid-item>
      </n-grid>
      
      <!-- 图表区域 -->
      <n-grid cols="1 s:1 m:2 l:2" responsive="screen" :x-gap="12" :y-gap="12">
        <n-grid-item>
          <n-card title="项目分布统计" style="width:100%">
            <canvas ref="projectChart"></canvas>
          </n-card>
        </n-grid-item>
        <n-grid-item>
          <n-card title="时间分布趋势" style="width:100%">
            <canvas ref="timeChart"></canvas>
          </n-card>
        </n-grid-item>
        <n-grid-item>
          <n-card title="情绪分布" style="width:100%">
            <canvas ref="emotionChart"></canvas>
          </n-card>
        </n-grid-item>
        <n-grid-item>
          <n-card title="成就完成情况" style="width:100%">
            <canvas ref="achievementChart"></canvas>
          </n-card>
        </n-grid-item>
      </n-grid>
      
      <!-- 项目详细统计 -->
      <n-card title="项目详细统计" style="margin-top: 20px;">
        <n-list v-if="analysisReport?.projects && analysisReport.projects.length > 0">
          <n-list-item v-for="project in analysisReport?.projects" :key="project.name">
            <n-thing :title="project.name">
              <n-thing description="">
                {{ project.count }}条记录 | 平均时长: {{ project.avgDurationStr }} | 完成率: {{ ((project.count / (analysisReport?.summary?.totalRecords || 1)) * 100).toFixed(1) }}%
              </n-thing>
            </n-thing>
          </n-list-item>
        </n-list>
      </n-card>
      
      <!-- 洞察和建议 -->
      <n-card title="数据洞察" style="margin-top: 20px;">
        <n-list v-if="analysisReport?.insights && analysisReport.insights.length > 0">
          <n-list-item v-for="(insight, index) in analysisReport?.insights" :key="index">
            <n-thing :title="`洞察 ${index + 1}`">
              <n-thing description="">
                {{ insight }}
              </n-thing>
            </n-thing>
          </n-list-item>
        </n-list>
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto'

// 定义响应式数据
const loading = ref(true)
const error = ref(null)
const analysisReport = ref(null)
const projectChart = ref(null)
const timeChart = ref(null)
const emotionChart = ref(null)
const achievementChart = ref(null)

let charts = {}

// 方法
const exportData = async () => {
  try {
    if (window.electron && window.electron.ipcRenderer) {
      const data = await window.electron.ipcRenderer.invoke('load-data')
      if (data && !data.error) {
        const jsonData = JSON.stringify(data, null, 2)
        const result = await window.electron.ipcRenderer.invoke('export-data', jsonData)
        if (result.success) {
          alert('数据导出成功！')
        } else {
          alert('数据导出失败: ' + result.message)
        }
      } else {
        alert('没有数据可供导出。')
      }
    } else {
      console.error('Electron API not available')
    }
  } catch (err) {
    console.error('数据导出失败:', err)
    alert('数据导出失败: ' + err.message)
  }
}

const initializeAnalysis = async () => {
  try {
    loading.value = true
    error.value = null
    
    // 加载数据
    if (window.electron && window.electron.ipcRenderer) {
      const data = await window.electron.ipcRenderer.invoke('load-data')
      if (!data || data.error) {
        error.value = '数据加载失败: ' + (data ? data.error : '未知错误')
        return
      }
      
      if (data.length === 0) {
        error.value = '暂无数据可供分析，请先导入数据'
        return
      }
      
      // 进行数据分析
      const result = await window.electron.ipcRenderer.invoke('analyze-data', data)
      if (result.success) {
        analysisReport.value = result.data
        await nextTick()
        displayCharts()
      } else {
        error.value = '数据分析失败: ' + result.error
      }
    } else {
      console.error('Electron API not available')
    }
  } catch (err) {
    error.value = '初始化分析时出错: ' + err.message
    console.error('Error during initializeAnalysis:', err)
  } finally {
    loading.value = false
  }
}

const displayCharts = () => {
  // 销毁已有的图表
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy()
  })
  
  // 显示新图表
  displayProjectChart()
  displayTimeChart()
  displayEmotionChart()
  displayAchievementChart()
}

const displayProjectChart = () => {
  if (!projectChart.value || !analysisReport.value) return
  
  const projects = analysisReport.value.projects
  const ctx = projectChart.value.getContext('2d')
  
  charts.project = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: projects.map(p => p.name),
      datasets: [{
        label: '记录数量',
        data: projects.map(p => p.count),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  })
}

const displayTimeChart = () => {
  if (!timeChart.value || !analysisReport.value) return
  
  const ctx = timeChart.value.getContext('2d')
  const timeDist = analysisReport.value.timeDistribution
  
  charts.time = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({length: 24}, (_, i) => `${i}:00`),
      datasets: [{
        label: '记录分布',
        data: timeDist.hourly,
        fill: false,
        borderColor: 'rgba(75, 192, 192, 1)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  })
}

const displayEmotionChart = () => {
  if (!emotionChart.value || !analysisReport.value) return
  
  const ctx = emotionChart.value.getContext('2d')
  const emotions = analysisReport.value.emotions
  
  charts.emotion = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: emotions.map(e => e.emotion),
      datasets: [{
        data: emotions.map(e => e.count),
        backgroundColor: [
          'rgba(255, 99, 132, 0.6)',
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 205, 86, 0.6)',
          'rgba(75, 192, 192, 0.6)',
          'rgba(153, 102, 255, 0.6)',
          'rgba(255, 159, 64, 0.6)',
          'rgba(199, 199, 199, 0.6)'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  })
}

const displayAchievementChart = () => {
  if (!achievementChart.value || !analysisReport.value) return
  
  const ctx = achievementChart.value.getContext('2d')
  const achievements = analysisReport.value.achievements
  const allData = analysisReport.value.summary.totalRecords
  
  charts.achievement = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['总记录', '成就完成'],
      datasets: [{
        label: '数量',
        data: [allData, achievements.totalAchievements],
        backgroundColor: [
          'rgba(255, 159, 64, 0.6)',
          'rgba(75, 192, 192, 0.6)'
        ],
        borderColor: [
          'rgba(255, 159, 64, 1)',
          'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  })
}

// 生命周期
onMounted(() => {
  initializeAnalysis()
})

// 监听窗口大小变化
watch(() => analysisReport.value, () => {
  if (analysisReport.value) {
    nextTick(() => {
      displayCharts()
    })
  }
})
</script>

<style scoped>
.analysis-container {
  width: 100%;
}
.analysis-container canvas { width: 100% !important; height: 320px !important; }
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 20px;
}

.header {
  background-color: var(--color-card-bg);
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-btn {
  padding: 10px 20px;
  border: 1px solid #dee2e6;
  background-color: #ffffff;
  color: #343a40;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

.nav-btn:hover {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background-color: var(--color-card-bg);
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  text-align: center;
}

.stat-number {
  font-size: 2.5em;
  font-weight: bold;
  color: #007bff;
  margin-bottom: 5px;
}

.stat-label {
  color: #6c757d;
  font-size: 14px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.chart-container {
  background-color: #ffffff;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.chart-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #343a40;
}

.project-stats {
  margin-top: 20px;
}

.project-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #dee2e6;
}

.project-item:last-child {
  border-bottom: none;
}

.project-name {
  font-weight: 500;
}

.project-stats-info {
  color: #6c757d;
  font-size: 14px;
}

.insights-section {
  background-color: #ffffff;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  margin-top: 20px;
}

.insights-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #343a40;
}

.insight-item {
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 10px;
  border-left: 4px solid #17a2b8;
}

.loading, .error {
  text-align: center;
  padding: 40px;
  font-size: 18px;
}

.loading {
  color: #007bff;
}

.error {
  background-color: #dc3545;
  color: white;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}
</style>