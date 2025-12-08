<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
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
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer
])

const props = defineProps({
  data: {
    type: Array,
    required: true,
    // 格式: [{ period, energy, focus }]
  },
  title: {
    type: String,
    default: ''
  }
})

const themeVars = useThemeVars()

const option = computed(() => ({
  title: props.title ? {
    text: props.title,
    left: 'center',
    textStyle: {
      color: themeVars.value.textColor2,
      fontSize: 14
    }
  } : undefined,
  tooltip: {
    trigger: 'axis',
    backgroundColor: themeVars.value.popoverColor,
    borderColor: themeVars.value.borderColor,
    textStyle: {
      color: themeVars.value.textColor2
    }
  },
  legend: {
    data: ['能量值', '专注度'],
    bottom: 0,
    textStyle: {
      color: themeVars.value.textColor2
    }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '10%',
    top: props.title ? '15%' : '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: props.data.map(item => item.period),
    axisLine: {
      lineStyle: {
        color: themeVars.value.borderColor
      }
    },
    axisLabel: {
      color: themeVars.value.textColor3
    }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 10,
    axisLine: {
      lineStyle: {
        color: themeVars.value.borderColor
      }
    },
    axisLabel: {
      color: themeVars.value.textColor3
    },
    splitLine: {
      lineStyle: {
        color: themeVars.value.dividerColor
      }
    }
  },
  series: [
    {
      name: '能量值',
      type: 'line',
      smooth: true,
      data: props.data.map(item => item.energy),
      lineStyle: {
        width: 3,
        color: themeVars.value.warningColor
      },
      itemStyle: {
        color: themeVars.value.warningColor
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0,
            color: themeVars.value.warningColor + '40'
          }, {
            offset: 1,
            color: themeVars.value.warningColor + '10'
          }]
        }
      }
    },
    {
      name: '专注度',
      type: 'line',
      smooth: true,
      data: props.data.map(item => item.focus),
      lineStyle: {
        width: 3,
        color: themeVars.value.infoColor
      },
      itemStyle: {
        color: themeVars.value.infoColor
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0,
            color: themeVars.value.infoColor + '40'
          }, {
            offset: 1,
            color: themeVars.value.infoColor + '10'
          }]
        }
      }
    }
  ]
}))
</script>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}
</style>
