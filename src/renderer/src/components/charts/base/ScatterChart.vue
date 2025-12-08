<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { ScatterChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useThemeVars } from 'naive-ui'
import { quadrantConfig } from '../../../config/chartsConfig.js'

use([
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  CanvasRenderer
])

const props = defineProps({
  data: {
    type: Array,
    required: true,
    // 格式: [{ energy, agency, label, tooltip }]
  }
})

const themeVars = useThemeVars()

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (params) => {
      const data = params.data
      return `
        <div style="font-size: 13px;">
          <div style="font-weight: 600; margin-bottom: 4px;">${data.label || '未知'}</div>
          <div>能量值: ${data.value[0]}</div>
          <div>掌控感: ${data.value[1]}</div>
          ${data.tooltip ? `<div style="margin-top: 4px; color: #888;">${data.tooltip}</div>` : ''}
        </div>
      `
    },
    backgroundColor: themeVars.value.popoverColor,
    borderColor: themeVars.value.borderColor,
    textStyle: {
      color: themeVars.value.textColor2
    }
  },
  grid: {
    left: '10%',
    right: '10%',
    bottom: '10%',
    top: '10%',
    containLabel: true
  },
  xAxis: {
    type: 'value',
    name: '能量值 (Energy)',
    min: quadrantConfig.energyRange.min,
    max: quadrantConfig.energyRange.max,
    splitLine: {
      lineStyle: {
        color: themeVars.value.dividerColor,
        type: 'dashed'
      }
    },
    axisLine: {
      lineStyle: {
        color: themeVars.value.borderColor
      }
    },
    axisLabel: {
      color: themeVars.value.textColor3
    },
    nameTextStyle: {
      color: themeVars.value.textColor2
    }
  },
  yAxis: {
    type: 'value',
    name: '掌控感 (Agency)',
    min: quadrantConfig.agencyRange.min,
    max: quadrantConfig.agencyRange.max,
    splitLine: {
      lineStyle: {
        color: themeVars.value.dividerColor,
        type: 'dashed'
      }
    },
    axisLine: {
      lineStyle: {
        color: themeVars.value.borderColor
      }
    },
    axisLabel: {
      color: themeVars.value.textColor3
    },
    nameTextStyle: {
      color: themeVars.value.textColor2
    }
  },
  // 四象限背景标记
  graphic: [
    // 心流区（右上）
    {
      type: 'rect',
      z: 0,
      shape: {
        x: '50%',
        y: 0,
        width: '50%',
        height: '50%'
      },
      style: {
        fill: 'rgba(82, 196, 26, 0.05)'
      }
    },
    // 松弛区（左上）
    {
      type: 'rect',
      z: 0,
      shape: {
        x: 0,
        y: 0,
        width: '50%',
        height: '50%'
      },
      style: {
        fill: 'rgba(24, 144, 255, 0.05)'
      }
    },
    // 战斗区（右下）
    {
      type: 'rect',
      z: 0,
      shape: {
        x: '50%',
        y: '50%',
        width: '50%',
        height: '50%'
      },
      style: {
        fill: 'rgba(250, 173, 20, 0.05)'
      }
    },
    // 无力区（左下）
    {
      type: 'rect',
      z: 0,
      shape: {
        x: 0,
        y: '50%',
        width: '50%',
        height: '50%'
      },
      style: {
        fill: 'rgba(255, 77, 79, 0.05)'
      }
    }
  ],
  series: [
    {
      type: 'scatter',
      symbolSize: 12,
      data: props.data.map(item => ({
        value: [item.energy, item.agency],
        label: item.label,
        tooltip: item.tooltip,
        itemStyle: {
          color: getQuadrantColor(item.energy, item.agency)
        }
      })),
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      }
    }
  ]
}))

function getQuadrantColor(energy, agency) {
  const energyMid = quadrantConfig.energyMidpoint ?? 5
  const agencyMid = quadrantConfig.agencyMidpoint ?? 0
  
  if (energy >= energyMid && agency >= agencyMid) return quadrantConfig.colors.flow
  if (energy < energyMid && agency >= agencyMid) return quadrantConfig.colors.relax
  if (energy >= energyMid && agency < agencyMid) return quadrantConfig.colors.fight
  return quadrantConfig.colors.helpless
}
</script>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}
</style>
