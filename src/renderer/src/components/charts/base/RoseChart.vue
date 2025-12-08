<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useThemeVars } from 'naive-ui'

use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent])

const props = defineProps({
  data: {
    type: Array,
    required: true,
    default: () => []
  }
})

const themeVars = useThemeVars()

const option = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c}小时 ({d}%)'
  },
  legend: {
    top: '5%',
    left: 'center',
    textStyle: { color: themeVars.value.textColor2 }
  },
  series: [
    {
      name: '生活重心',
      type: 'pie',
      radius: ['20%', '70%'],
      roseType: 'area',
      itemStyle: {
        borderRadius: 8,
        borderColor: themeVars.value.cardColor,
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}\n{d}%',
        color: themeVars.value.textColor2
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: props.data.map(item => ({
        value: item.totalDurationHours,
        name: item.dimension
      }))
    }
  ]
}))
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
  min-height: 400px;
}
</style>
