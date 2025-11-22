<script setup>
import Dashboard from './components/Dashboard.vue'
import { NConfigProvider, darkTheme, useOsTheme } from 'naive-ui'
import { ref, computed } from 'vue'
import { initTheme, getCurrentTheme } from './utils/theme.js'

// 初始化主题
initTheme()

const osThemeRef = useOsTheme()
const theme = computed(() => {
  const currentTheme = getCurrentTheme()
  return currentTheme === 'dark' ? darkTheme : null
})
</script>

<template>
  <NConfigProvider :theme="theme">
    <Dashboard />
  </NConfigProvider>
</template>

<style scoped>
</style>
