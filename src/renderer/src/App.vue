<script setup>
import Dashboard from './components/Dashboard.vue'
import { NConfigProvider, NDialogProvider, NMessageProvider, darkTheme } from 'naive-ui'
import { ref, computed, onMounted } from 'vue'
import { initTheme, getCurrentTheme, setTheme } from './utils/theme.js'

// 初始化主题
initTheme()

const currentTheme = ref('light')

// Naive UI 主题
const theme = computed(() => {
  return currentTheme.value === 'dark' ? darkTheme : null
})

// 监听主题变化
const handleThemeChange = (newTheme) => {
  currentTheme.value = newTheme
  setTheme(newTheme)
}

onMounted(() => {
  currentTheme.value = getCurrentTheme()
  
  // 监听主题切换事件（其他器件程叨）
  window.addEventListener('app-theme-changed', (e) => {
    handleThemeChange(e.detail.theme)
  })
})
</script>

<template>
  <NConfigProvider :theme="theme" class="app-root-provider">
    <NDialogProvider>
      <NMessageProvider>
        <Dashboard />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-root-provider {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: block;
}
</style>
