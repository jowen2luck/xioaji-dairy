<script setup>
import Dashboard from './components/Dashboard.vue'
import { NConfigProvider, darkTheme } from 'naive-ui'
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
  // 监听 localStorage 变化
  const handleStorageChange = () => {
    const savedTheme = localStorage.getItem('app-theme')
    if (savedTheme) {
      currentTheme.value = savedTheme
    }
  }
  window.addEventListener('storage', handleStorageChange)
  
  // 监听主题切换事件（其他器件程叨）
  window.addEventListener('app-theme-changed', (e) => {
    handleThemeChange(e.detail.theme)
  })
})
</script>

<template>
  <NConfigProvider :theme="theme">
    <Dashboard />
  </NConfigProvider>
</template>

<style scoped>
</style>
