<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { FunnelChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useThemeVars } from 'naive-ui'

use([
  FunnelChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer
])

const props = defineProps({
  data: {
    type: Array,
    required: true,
    // 格式: [{ need, count, percentage }]
  }
})

const themeVars = useThemeVars()

// 马斯洛需求层级配色方案
const needColors = {
  '生理需求': '#f5222d',
  '安全需求': '#fa8c16',
  '社交归属': '#fadb14',
  '尊重认可': '#52c41a',
  '自我实现': '#1677ff'
}

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} 条 ({d}%)',
    backgroundColor: themeVars.value.popoverColor,
    borderColor: themeVars.value.borderColor,
    textStyle: {
      color: themeVars.value.textColor2
    }
  },
  legend: {
    orient: 'vertical',
    right: '5%',
    top: 'center',
    textStyle: {
      color: themeVars.value.textColor2
    }
  },
  series: [
    {
      type: 'funnel',
      left: '10%',
      top: '10%',
      bottom: '10%',
      width: '60%',
      min: 0,
      max: 100,
      minSize: '0%',
      maxSize: '100%',
      sort: 'descending',
      gap: 2,
      label: {
        show: true,
        position: 'inside',
        formatter: '{b}\n{c}条',
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold'
      },
      labelLine: {
        length: 10,
        lineStyle: {
          width: 1,
          type: 'solid'
        }
      },
      itemStyle: {
        borderColor: themeVars.value.cardColor,
        borderWidth: 2
      },
      emphasis: {
        label: {
          fontSize: 16
        }
      },
      data: props.data
        .sort((a, b) => {
          // 按马斯洛层级排序（从下到上）
          const order = ['自我实现', '尊重认可', '社交归属', '安全需求', '生理需求']
          return order.indexOf(a.need) - order.indexOf(b.need)
        })
        .map(item => ({
          value: item.count,
          name: item.need,
          itemStyle: {
            color: needColors[item.need] || themeVars.value.primaryColor
          }
        }))
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
