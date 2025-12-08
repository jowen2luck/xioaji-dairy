<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useThemeVars } from 'naive-ui'
import 'echarts-wordcloud'

use([CanvasRenderer, TooltipComponent])

const props = defineProps({
  data: {
    type: Array,
    required: true,
    default: () => []
  },
  title: {
    type: String,
    default: ''
  }
})

const themeVars = useThemeVars()

const option = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    show: true,
    formatter: '{b}: {c}次'
  },
  series: [{
    type: 'wordCloud',
    shape: 'circle',
    left: 'center',
    top: 'center',
    width: '100%',
    height: '100%',
    sizeRange: [14, 40],
    rotationRange: [-45, 45],
    rotationStep: 45,
    gridSize: 8,
    drawOutOfBound: false,
    layoutAnimation: true,
    textStyle: {
      fontFamily: 'sans-serif',
      fontWeight: 'normal',
      color: () => {
        // 随机颜色，但符合主题
        const colors = [
          themeVars.value.primaryColor,
          themeVars.value.infoColor,
          themeVars.value.successColor,
          themeVars.value.warningColor,
          themeVars.value.errorColor
        ]
        return colors[Math.floor(Math.random() * colors.length)]
      }
    },
    emphasis: {
      focus: 'self',
      textStyle: {
        textShadowBlur: 10,
        textShadowColor: themeVars.value.primaryColorHover
      }
    },
    data: props.data.map(item => ({
      name: item.word,
      value: item.count
    }))
  }]
}))
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>
