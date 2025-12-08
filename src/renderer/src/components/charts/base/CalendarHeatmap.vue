<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { HeatmapChart } from 'echarts/charts'
import { TooltipComponent, CalendarComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useThemeVars } from 'naive-ui'
import { heatmapConfig } from '../../../config/chartsConfig.js'

use([CanvasRenderer, HeatmapChart, TooltipComponent, CalendarComponent, VisualMapComponent])

const props = defineProps({
  data: {
    type: Array,
    required: true,
    default: () => []
  },
  year: {
    type: Number,
    default: () => new Date().getFullYear()
  }
})

const themeVars = useThemeVars()

const option = computed(() => {
  const calendarData = props.data.map(item => [
    item.date,
    item.count
  ])
  
  const maxCount = Math.max(...props.data.map(d => d.count), 1)
  
  return {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params) => {
        const item = props.data.find(d => d.date === params.data[0])
        return `${params.data[0]}<br/>记录数: ${params.data[1]}条<br/>深度: ${item?.maxDepth === 'deep' ? '深度思考' : '日常'}`
      }
    },
    visualMap: {
      min: 0,
      max: maxCount,
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      top: 20,
      pieces: heatmapConfig.pieces.map(piece => ({
        ...piece,
        color: piece.color === 'dividerColor' ? themeVars.value.dividerColor : piece.color
      })),
      textStyle: {
        color: themeVars.value.textColor2
      }
    },
    calendar: {
      top: 100,
      left: 30,
      right: 30,
      cellSize: ['auto', 16],
      range: props.year,
      itemStyle: {
        borderWidth: 2,
        borderColor: themeVars.value.cardColor
      },
      yearLabel: { show: true, color: themeVars.value.textColor1 },
      dayLabel: { 
        show: true,
        color: themeVars.value.textColor2,
        nameMap: ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      },
      monthLabel: { 
        show: true,
        color: themeVars.value.textColor2
      },
      splitLine: {
        lineStyle: {
          color: themeVars.value.dividerColor
        }
      }
    },
    series: [{
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: calendarData
    }]
  }
})
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
  min-height: 250px;
}
</style>
