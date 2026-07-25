const fs = require('fs')
const path = 'd:\\Pcode\\play\\daily_log_vue\\src\\renderer\\src\\components\\DataBoardTab.vue'

let content = fs.readFileSync(path, 'utf8')

// 1. Add button
content = content.replace(
  '<n-text depth="3">{{ summaryMessage }}</n-text>\n                </n-space>',
  '<n-text depth="3">{{ summaryMessage }}</n-text>\n                  <n-button size="small" type="error" ghost @click="abortSummaryGeneration">\n                    停止生成\n                  </n-button>\n                </n-space>'
)

// 2. Add abortSummaryGeneration
content = content.replace(
  'summaryMessage.value = \'\'\n  }\n}\n\n// 总结事件处理',
  `summaryMessage.value = ''\n  }\n}\n\nconst abortSummaryGeneration = async () => {\n  try {\n    console.log('[DataBoardTab] Aborting summary generation...')\n    if (window.electron && window.electron.ipcRenderer) {\n      await window.electron.ipcRenderer.invoke('summary:abort-generate')\n    }\n    summaryProcessing.value = false\n    summaryMessage.value = '总结生成已取消'\n    showMessage('总结生成已取消', 'info')\n  } catch (error) {\n    console.error('取消总结失败:', error)\n  }\n}\n\n// 总结事件处理`
)

fs.writeFileSync(path, content)
console.log('Patched DataBoardTab.vue.')
