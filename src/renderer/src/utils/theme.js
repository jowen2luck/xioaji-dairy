// 主题管理工具
import { ref } from 'vue'

// 定义主题选项
const themes = {
  dark: {
    name: 'dark',
    variables: {
      '--color-background': '#1b1b1f',
      '--color-background-soft': '#222222',
      '--color-background-mute': '#282828',
      '--color-text': 'rgba(255, 255, 245, 0.86)',
      '--color-text-secondary': 'rgba(235, 235, 245, 0.6)',
      '--color-border': '#32363f',
      '--color-card-bg': '#222222',
      '--color-button-primary': '#1890ff',
      '--color-button-primary-hover': '#40a9ff',
      '--color-button-primary-pressed': '#096dd9',
      '--color-success': '#52c41a',
      '--color-warning': '#faad14',
      '--color-error': '#ff4d4f',
      '--color-bubble-agent': '#1f1d1dff',
      '--color-bubble-user': '#2e3f2dff',
    }
  },
  light: {
    name: 'light',
    variables: {
      '--color-background': '#f8f9fa',
      '--color-background-soft': '#ffffff',
      '--color-background-mute': '#f2f2f2',
      '--color-text': '#212529',
      '--color-text-secondary': '#495057',
      '--color-border': '#dee2e6',
      '--color-card-bg': '#ffffff',
      '--color-button-primary': '#0d6efd',
      '--color-button-primary-hover': '#0b5ed7',
      '--color-button-primary-pressed': '#0a58ca',
      '--color-success': '#198754',
      '--color-warning': '#ffc107',
      '--color-error': '#dc3545',
      '--color-bubble-agent': '#e4e7e5ff',
      '--color-bubble-user': '#5f8b6eff',
    }
  }
}

// 当前主题
const currentTheme = ref(themes.custom)

// 应用主题到文档根元素
function applyTheme(theme) {
  const root = document.documentElement
  
  // 清除之前的主题变量
  Object.keys(themes).forEach(themeName => {
    const themeVars = themes[themeName].variables
    Object.keys(themeVars).forEach(varName => {
      root.style.removeProperty(varName)
    })
  })
  
  // 设置新主题变量
  Object.entries(theme.variables).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
  
  // 更新body背景
  if (theme.name === 'custom') {
    document.body.style.background = 'var(--color-background)'
    document.body.style.backgroundSize = 'cover'
  } else {
    document.body.style.background = 'var(--color-background)'
    document.body.style.backgroundSize = 'auto'
  }
}

// 切换主题
function setTheme(themeName) {
  const theme = themes[themeName]
  if (theme) {
    currentTheme.value = theme
    applyTheme(theme)
    localStorage.setItem('app-theme', themeName)
  }
}

// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem('app-theme')
  const themeName = savedTheme && themes[savedTheme] ? savedTheme : 'light'
  setTheme(themeName)
}

// 获取当前主题
function getCurrentTheme() {
  return currentTheme.value.name
}

// 获取所有主题选项
function getAvailableThemes() {
  return Object.keys(themes).map(key => ({
    name: themes[key].name,
    displayName: key === 'dark' ? '深色' : '浅色'
  }))
}

export {
  initTheme,
  setTheme,
  getCurrentTheme,
  getAvailableThemes,
  themes
}