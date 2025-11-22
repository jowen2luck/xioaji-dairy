import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

// 引入Naive UI
import naive from 'naive-ui'

// 添加F12按键监听以打开开发者工具
document.addEventListener('keydown', (event) => {
  if (event.key === 'F12') {
    // 通过preload脚本暴露的API打开开发者工具
    window.api.openDevTools()
  }
})

createApp(App).use(naive).mount('#app')