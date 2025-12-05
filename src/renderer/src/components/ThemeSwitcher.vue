<template>
  <n-switch v-model:value="isDark" size="medium" @update:value="onToggle">
    <template #checked>
      🌙
    </template>
    <template #unchecked>
      ☀️
    </template>
  </n-switch>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { setTheme, getCurrentTheme } from '../utils/theme.js'

const isDark = ref(false)

onMounted(() => {
  isDark.value = getCurrentTheme() === 'dark'
})

function onToggle(val) {
  const newTheme = val ? 'dark' : 'light'
  setTheme(newTheme)
  // 輸出事件以便父件监听
  window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { theme: newTheme } }))
}
</script>

<style scoped>
.n-switch {
  margin-right: 8px;
}
</style>