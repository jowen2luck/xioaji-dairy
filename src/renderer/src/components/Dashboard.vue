<template>
  <div class="dashboard-container">
    <div class="top-row">
      <div class="tabs-wrap">
        <n-tabs type="line" animated v-model:value="activeTab">
          <template #suffix>
            <div class="theme-wrap">
              <ThemeSwitcher />
              <n-button
                text
                style="margin-left: 8px;"
                @click="showSettings = true"
              >
                <template #icon>
                  <n-icon size="20">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64z"/>
                    </svg>
                  </n-icon>
                </template>
              </n-button>
            </div>
          </template>
          
          <n-tab-pane name="dashboard" tab="数据看板">
            <!-- 使用双栏布局组件 -->
            <DataBoardTab ref="dataBoardRef" @data-updated="handleDataUpdated" />
          </n-tab-pane>
          
          <n-tab-pane name="analysis" tab="数据分析">
            <AnalysisPage />
          </n-tab-pane>
          
          <n-tab-pane name="agent" tab="智能助手">
            <AgentWorkbench />
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>

    <!-- 全局设置抽屉 -->
    <GlobalSettings v-model:visible="showSettings" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AnalysisPage from './AnalysisPage.vue'
import AgentWorkbench from './AgentWorkbench.vue'
import DataBoardTab from './DataBoardTab.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import GlobalSettings from './GlobalSettings.vue'

// 状态管理
const activeTab = ref('dashboard')
const dataBoardRef = ref(null)
const showSettings = ref(false)

// 处理数据更新事件
const handleDataUpdated = (data) => {
  console.log('[Dashboard] Data updated:', data?.length, 'records')
}
</script>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 0 16px;
  overflow: hidden;
}

.top-row {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tabs-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tabs-wrap :deep(.n-tabs) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tabs-wrap :deep(.n-tabs-nav) {
  flex-shrink: 0;
}

.tabs-wrap :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tabs-wrap :deep(.n-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.theme-wrap {
  flex: none;
}
</style>