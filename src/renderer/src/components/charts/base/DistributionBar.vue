<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useThemeVars } from 'naive-ui'

use([
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer
])

const props = defineProps({
  data: {
    type: Object,
    required: true,
    // 格式: { past: { count, percentage }, present: {...}, future: {...} }
  }
})

const themeVars = useThemeVars()

const option = computed(() => {
  const categories = ['Past', 'Present', 'Future']
  const labels = ['过去', '当下', '未来']
  const colors = {
    Past: '#597ef7',      // 蓝色 - 回望
    Present: '#73d13d',   // 绿色 - 心流
    Future: '#ff7a45'     // 橙色 - 焦虑/规划
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params) => {
        const item = params[0]
        const category = categories[item.dataIndex]
        const data = props.data[category.toLowerCase()]
        return `${item.name}<br/>数量: ${data.count} 条<br/>占比: ${data.percentage}%`
      },
      backgroundColor: themeVars.value.popoverColor,
      borderColor: themeVars.value.borderColor,
      textStyle: {
        color: themeVars.value.textColor2
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        formatter: '{value}%',
        color: themeVars.value.textColor3
      },
      axisLine: {
        lineStyle: {
          color: themeVars.value.borderColor
        }
      },
      splitLine: {
        lineStyle: {
          color: themeVars.value.dividerColor
        }
      }
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: {
        lineStyle: {
          color: themeVars.value.borderColor
        }
      },
      axisLabel: {
        color: themeVars.value.textColor2,
        fontSize: 14
      }
    },
    series: [
      {
        type: 'bar',
        data: categories.map((cat, index) => ({
          value: props.data[cat.toLowerCase()].percentage,
          itemStyle: {
            color: colors[cat]
          }
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (params) => {
            const category = categories[params.dataIndex]
            const data = props.data[category.toLowerCase()]
            return `${data.count}条 (${data.percentage}%)`
          },
          color: themeVars.value.textColor2
        },
        barWidth: '60%'
      }
    ]
  }
})
</script>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}
</style>
