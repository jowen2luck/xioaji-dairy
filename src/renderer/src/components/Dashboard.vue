<template>
  <div class="dashboard-shell">
    <!-- 左侧可折叠现代侧边栏 -->
    <aside class="app-sidebar" :class="{ 'is-collapsed': isSidebarCollapsed }">
      <!-- 侧边栏头部：品牌与折叠开关 -->
      <div class="sidebar-header">
        <div class="brand-row" v-if="!isSidebarCollapsed">
          <div class="brand-info" title="小鸡日记 - 陪伴你的生活记录者" @click="switchView('explore')">
            <img :src="logoImg" alt="小鸡日记" class="brand-logo-img" />
            <div class="brand-text-group">
              <span class="brand-title">小鸡日记</span>
              <span class="brand-subtitle">记录生活每一刻 ✨</span>
            </div>
          </div>
          <n-tooltip trigger="hover" placement="right">
            <template #trigger>
              <n-button quaternary circle size="small" class="toggle-btn" @click="toggleSidebar">
                <template #icon>
                  <n-icon><ChevronBackOutline /></n-icon>
                </template>
              </n-button>
            </template>
            折叠侧边栏
          </n-tooltip>
        </div>
        <div class="collapsed-brand-row" v-else>
          <n-tooltip trigger="hover" placement="right">
            <template #trigger>
              <div class="collapsed-logo-trigger" @click="toggleSidebar">
                <img :src="logoImg" alt="小鸡日记" class="brand-logo-img collapsed" />
              </div>
            </template>
            展开小鸡日记
          </n-tooltip>
        </div>

        <!-- 新建会话按钮 -->
        <div class="new-chat-wrapper">
          <n-button
            v-if="!isSidebarCollapsed"
            type="primary"
            secondary
            block
            class="new-chat-btn"
            @click="handleNewSession"
          >
            <template #icon>
              <n-icon><AddOutline /></n-icon>
            </template>
            新建对话
          </n-button>
          <n-tooltip v-else trigger="hover" placement="right">
            <template #trigger>
              <n-button
                type="primary"
                secondary
                circle
                size="small"
                class="new-chat-icon-btn"
                @click="handleNewSession"
              >
                <template #icon>
                  <n-icon><AddOutline /></n-icon>
                </template>
              </n-button>
            </template>
            新建对话
          </n-tooltip>
        </div>
      </div>

      <!-- 历史会话列表（展开时为可滚动列表，折叠时为会话图标入口） -->
      <div class="sidebar-session-section" v-if="!isSidebarCollapsed">
        <div class="session-section-header">
          <span class="section-title">历史会话</span>
          <span class="session-count-badge" v-if="sessionsList.length > 0">{{ sessionsList.length }}</span>
        </div>

        <div class="sidebar-session-list">
          <div
            v-for="s in sessionsList"
            :key="s.id"
            :class="['session-item', { active: s.id === currentSessionId && activeTab === 'explore' }]"
            @click="handleSelectSession(s.id)"
          >
            <div class="session-item-content">
              <span class="session-title" :title="s.title">{{ s.title }}</span>
              <span class="session-meta">{{ formatRelativeTime(s.updatedAt) }}</span>
            </div>
            <div class="session-item-actions" @click.stop>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button quaternary circle size="tiny" @click="handleRenameSession(s.id, s.title)">
                    <template #icon><n-icon size="13"><CreateOutline /></n-icon></template>
                  </n-button>
                </template>
                重命名
              </n-tooltip>
              <n-popconfirm @positive-click="handleDeleteSession(s.id)" positive-text="删除" negative-text="取消">
                <template #trigger>
                  <n-button quaternary circle size="tiny" type="error">
                    <template #icon><n-icon size="13"><TrashOutline /></n-icon></template>
                  </n-button>
                </template>
                确定删除该会话？
              </n-popconfirm>
            </div>
          </div>
          <div v-if="sessionsList.length === 0" class="session-empty">
            <span class="empty-text">暂无历史会话</span>
          </div>
        </div>
      </div>
      <div class="sidebar-collapsed-session" v-else>
        <n-tooltip trigger="hover" placement="right">
          <template #trigger>
            <n-button quaternary circle size="small" class="rail-icon-btn" @click="toggleSidebar">
              <template #icon>
                <n-badge :value="sessionsList.length" :max="99" dot>
                  <n-icon><ChatbubblesOutline /></n-icon>
                </n-badge>
              </template>
            </n-button>
          </template>
          历史会话 ({{ sessionsList.length }})
        </n-tooltip>
      </div>

      <!-- 底部固定导航与操作区（功能模块 + 主题/设置），沉底展示 -->
      <div class="sidebar-bottom-group">
        <!-- 次级功能导航区 -->
        <div class="sidebar-nav-section">
          <div class="section-divider" v-if="!isSidebarCollapsed">
            <span>功能模块</span>
          </div>
          <n-divider style="margin: 8px 0" v-else />

          <div class="nav-list">
            <!-- 日记管理 (次级) -->
            <div
              class="nav-item"
              :class="{ active: activeTab === 'journal' }"
              @click="switchView('journal')"
            >
              <n-tooltip trigger="hover" placement="right" :disabled="!isSidebarCollapsed">
                <template #trigger>
                  <div class="nav-item-inner">
                    <n-icon size="18"><BookOutline /></n-icon>
                    <span class="nav-text" v-if="!isSidebarCollapsed">日记管理</span>
                  </div>
                </template>
                📖 日记管理
              </n-tooltip>
            </div>

            <!-- 周期复盘 (次级) -->
            <div
              class="nav-item"
              :class="{ active: activeTab === 'reviews' }"
              @click="switchView('reviews')"
            >
              <n-tooltip trigger="hover" placement="right" :disabled="!isSidebarCollapsed">
                <template #trigger>
                  <div class="nav-item-inner">
                    <n-icon size="18"><CalendarOutline /></n-icon>
                    <span class="nav-text" v-if="!isSidebarCollapsed">周期复盘</span>
                  </div>
                </template>
                📅 周期复盘
              </n-tooltip>
            </div>

            <!-- 深度统计 (次级) -->
            <div
              class="nav-item"
              :class="{ active: activeTab === 'analysis' }"
              @click="switchView('analysis')"
            >
              <n-tooltip trigger="hover" placement="right" :disabled="!isSidebarCollapsed">
                <template #trigger>
                  <div class="nav-item-inner">
                    <n-icon size="18"><BarChartOutline /></n-icon>
                    <span class="nav-text" v-if="!isSidebarCollapsed">深度统计</span>
                  </div>
                </template>
                📊 深度统计
              </n-tooltip>
            </div>
          </div>
        </div>

        <!-- 侧边栏底部：主题切换与设置 -->
        <div class="sidebar-footer">
          <div class="footer-expanded" v-if="!isSidebarCollapsed">
            <ThemeSwitcher />
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <n-button quaternary circle size="small" class="settings-btn" @click="showSettings = true">
                  <template #icon>
                    <n-icon size="18"><SettingsOutline /></n-icon>
                  </template>
                </n-button>
              </template>
              全局设置
            </n-tooltip>
          </div>
          <div class="footer-collapsed" v-else>
            <ThemeSwitcher />
            <n-tooltip trigger="hover" placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" class="settings-btn" @click="showSettings = true">
                  <template #icon>
                    <n-icon size="18"><SettingsOutline /></n-icon>
                  </template>
                </n-button>
              </template>
              全局设置
            </n-tooltip>
          </div>
        </div>
      </div>
    </aside>

    <!-- 右侧主视口内容区 -->
    <main class="app-main">
      <!-- 次级页面顶部轻量导航条（仅在次级页面显示） -->
      <header class="subpage-header" v-if="activeTab !== 'explore'">
        <n-button quaternary size="small" class="back-btn" @click="switchView('explore')">
          <template #icon>
            <n-icon><ChevronBackOutline /></n-icon>
          </template>
          返回智能探索
        </n-button>
        <n-divider vertical />
        <span class="subpage-title">{{ getSubpageTitle(activeTab) }}</span>
      </header>

      <!-- 页面视口主体 -->
      <div class="view-viewport">
        <!-- 1. 智能探索（主视口，默认常驻） -->
        <div class="view-panel" v-show="activeTab === 'explore'">
          <AgentWorkbench
            ref="workbenchRef"
            @sessions-updated="handleSessionsUpdated"
            @toggle-sidebar="toggleSidebar"
          />
        </div>

        <!-- 2. 日记管理（次级） -->
        <div class="view-panel" v-show="activeTab === 'journal'">
          <DataBoardTab ref="dataBoardRef" @data-updated="handleDataUpdated" />
        </div>

        <!-- 3. 周期复盘（次级） -->
        <div class="view-panel" v-show="activeTab === 'reviews'">
          <ChroniclePage />
        </div>

        <!-- 4. 深度统计（次级） -->
        <div class="view-panel" v-show="activeTab === 'analysis'">
          <AnalysisPage />
        </div>
      </div>
    </main>

    <!-- 全局设置抽屉 -->
    <GlobalSettings v-model:visible="showSettings" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import AgentWorkbench from './AgentWorkbench.vue'
import DataBoardTab from './DataBoardTab.vue'
import ChroniclePage from './chronicle/ChroniclePage.vue'
import AnalysisPage from './AnalysisPage.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import GlobalSettings from './GlobalSettings.vue'
import logoImg from '../assets/logo.png'

// 图标引用
import {
  AddOutline,
  ChatbubblesOutline,
  SearchOutline,
  BookOutline,
  CalendarOutline,
  BarChartOutline,
  SettingsOutline,
  ChevronBackOutline,
  MenuOutline,
  CreateOutline,
  TrashOutline
} from '@vicons/ionicons5'

// 视图与侧边栏状态管理
const activeTab = ref('explore')
const isSidebarCollapsed = ref(false)
const showSettings = ref(false)

// 会话数据状态
const sessionsList = ref([])
const currentSessionId = ref('')

// 组件 Ref 引用
const workbenchRef = ref(null)
const dataBoardRef = ref(null)

// 切换侧边栏折叠/展开
const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

// 切换主/次级视图
const switchView = (viewName) => {
  activeTab.value = viewName
  if (viewName === 'journal') {
    dataBoardRef.value?.refreshDataSilently?.()
  }
}

// 监听视图切换，进入日记管理时自动拉取最新数据
watch(activeTab, (newTab) => {
  if (newTab === 'journal') {
    dataBoardRef.value?.refreshDataSilently?.()
  }
})

// 监听全局与主进程数据变更通知
const handleGlobalJournalUpdate = () => {
  dataBoardRef.value?.refreshDataSilently?.()
}

onMounted(() => {
  window.addEventListener('journal-data-updated', handleGlobalJournalUpdate)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('journal:data-changed', handleGlobalJournalUpdate)
  }
})

onUnmounted(() => {
  window.removeEventListener('journal-data-updated', handleGlobalJournalUpdate)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.removeListener('journal:data-changed', handleGlobalJournalUpdate)
  }
})

// 获取次级页面标题
const getSubpageTitle = (tab) => {
  switch (tab) {
    case 'journal':
      return '📖 日记管理'
    case 'reviews':
      return '📅 周期复盘'
    case 'analysis':
      return '📊 深度统计'
    default:
      return ''
  }
}

// 格式化相对时间
const formatRelativeTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    const diff = Date.now() - new Date(timeStr).getTime()
    if (diff < 0) return '刚刚'
    const minutes = Math.floor(diff / (1000 * 60))
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}天前`
    return new Date(timeStr).toLocaleDateString('zh-CN')
  } catch {
    return ''
  }
}

// 同步会话列表更新
const handleSessionsUpdated = (payload) => {
  if (Array.isArray(payload?.sessions)) {
    sessionsList.value = payload.sessions
  }
  if (payload?.currentSessionId) {
    currentSessionId.value = payload.currentSessionId
  }
}

// 点击选择历史会话
const handleSelectSession = (id) => {
  // 确保处于智能探索工作台
  if (activeTab.value !== 'explore') {
    activeTab.value = 'explore'
  }
  currentSessionId.value = id
  if (workbenchRef.value?.switchSession) {
    workbenchRef.value.switchSession(id)
  }
}

// 点击新建会话
const handleNewSession = () => {
  if (activeTab.value !== 'explore') {
    activeTab.value = 'explore'
  }
  if (workbenchRef.value?.createNewSession) {
    workbenchRef.value.createNewSession()
  }
}

// 重命名会话
const handleRenameSession = (id, currentTitle) => {
  if (workbenchRef.value?.startRenameSession) {
    workbenchRef.value.startRenameSession(id, currentTitle)
  }
}

// 删除会话
const handleDeleteSession = (id) => {
  if (workbenchRef.value?.deleteSession) {
    workbenchRef.value.deleteSession(id)
  }
}

// 处理数据更新事件
const handleDataUpdated = (data) => {
  console.log('[Dashboard] Data updated:', data?.length, 'records')
}

// 初始化加载会话数据
onMounted(async () => {
  try {
    if (window.assistant?.sessions?.list) {
      const list = await window.assistant.sessions.list()
      if (Array.isArray(list)) {
        sessionsList.value = list
        if (list.length > 0 && !currentSessionId.value) {
          currentSessionId.value = list[0].id
        }
      }
    }
  } catch (err) {
    console.warn('[Dashboard] Failed to init sessions list:', err)
  }
})
</script>

<style scoped>
/* 整个应用主容器：全屏视口自适应，统一外边距 Padding */
.dashboard-shell {
  display: flex;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding: 8px 10px 10px 10px;
  gap: 10px;
  overflow: hidden;
  background: var(--bg-parchment, #FDF9F3);
  color: var(--text-charcoal, #3A3B3C);
}

/* 左侧现代侧边栏：独立卡片结构，具备与右侧对称的Padding、圆角与边框，适度缩小释放主体空间 */
.app-sidebar {
  width: 210px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px solid var(--border-subtle, rgba(200, 174, 125, 0.35));
  background: var(--bg-parchment-soft, rgba(245, 240, 232, 0.75));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(10px);
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  z-index: 50;
}

.app-sidebar.is-collapsed {
  width: 58px;
}

/* 侧边栏头部 */
.sidebar-header {
  padding: 10px 8px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.brand-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 2px;
  border-radius: 8px;
  transition: all 0.2s ease;
  min-width: 0;
}

.brand-info:hover {
  background: var(--n-color-embedded, rgba(140, 140, 160, 0.08));
}

.brand-logo-img {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  object-fit: cover;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.brand-info:hover .brand-logo-img {
  transform: scale(1.06) rotate(3deg);
}

.brand-logo-img.collapsed {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
}

.collapsed-logo-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.collapsed-logo-trigger:hover {
  transform: scale(1.08);
}

.brand-text-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: var(--n-text-color, #2c3e50);
  line-height: 1.2;
  white-space: nowrap;
}

.brand-subtitle {
  font-size: 9.5px;
  color: var(--n-text-color-3, #999);
  line-height: 1.2;
  margin-top: 2px;
  white-space: nowrap;
}

.collapsed-brand-row {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px 0;
}

.new-chat-wrapper {
  display: flex;
  justify-content: center;
}

.new-chat-btn {
  font-weight: 600;
  border-radius: 8px;
  height: 34px;
  font-size: 13px;
}

.new-chat-icon-btn {
  width: 34px;
  height: 34px;
}

/* 历史会话列表区 */
.sidebar-session-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 4px 6px 6px 6px;
  overflow: hidden;
}

.session-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px;
}

.section-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted, #8A7A6A);
}

.session-count-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-parchment-mute, rgba(255, 255, 255, 0.08));
  color: var(--text-muted, rgba(200, 190, 170, 0.6));
  font-weight: 600;
}

.sidebar-session-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 2px;
}

.sidebar-session-list::-webkit-scrollbar {
  width: 4px;
}

.sidebar-session-list::-webkit-scrollbar-thumb {
  background: var(--border-subtle, rgba(200, 174, 125, 0.35));
  border-radius: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border: 1px solid transparent;
}

.session-item:hover {
  background: var(--bg-parchment-mute, rgba(237, 232, 224, 0.7));
}

.session-item.active {
  background: var(--bg-parchment-mute, rgba(200, 174, 125, 0.12));
  border-color: var(--accent-gold, #C8AE7D);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.session-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-charcoal, #3A3B3C);
}

.session-item.active .session-title {
  font-weight: 600;
  color: var(--text-sepia, #5A4A3C);
}

.session-meta {
  font-size: 10px;
  color: var(--text-muted, #8A7A6A);
}

.session-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-item-actions {
  opacity: 1;
}

.session-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
  color: var(--text-muted, #8A7A6A);
  font-size: 12px;
}

.sidebar-collapsed-session {
  display: flex;
  justify-content: center;
  padding: 6px 0;
}

/* 底部固定导航与操作群组：自动沉底 */
.sidebar-bottom-group {
  margin-top: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* 次级功能导航区 */
.sidebar-nav-section {
  flex-shrink: 0;
  padding: 4px 6px;
  border-top: 1px solid var(--border-subtle, rgba(200, 174, 125, 0.25));
}

.section-divider {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-muted, #8A7A6A);
  padding: 3px 4px;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border: 1px solid transparent;
}

.nav-item:hover {
  background: var(--bg-parchment-mute, rgba(237, 232, 224, 0.7));
}

.nav-item.active {
  background: var(--bg-parchment-mute, rgba(200, 174, 125, 0.12));
  border-color: var(--accent-gold, #C8AE7D);
  color: var(--accent-gold, #C8AE7D);
  font-weight: 600;
}

.nav-item-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.app-sidebar.is-collapsed .nav-item-inner {
  justify-content: center;
  padding: 8px 0;
}

.nav-text {
  font-size: 12.5px;
}

/* 侧边栏底部 */
.sidebar-footer {
  padding: 6px 8px;
  border-top: 1px solid var(--border-subtle, rgba(200, 174, 125, 0.25));
  flex-shrink: 0;
  background: inherit;
}

.footer-expanded {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.footer-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

/* 右侧主视口内容区 */
.app-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  border-radius: 12px;
}

/* 次级页面顶部轻量返回条 */
.subpage-header {
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--bg-parchment-soft, rgba(245, 240, 232, 0.8));
  border: 1px solid var(--border-subtle, rgba(200, 174, 125, 0.35));
  border-bottom: none;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  z-index: 40;
}

.back-btn {
  font-size: 13px;
  font-weight: 500;
}

.subpage-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sepia, #5A4A3C);
}

/* 视图面板视口 */
.view-viewport {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.view-panel {
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
}
</style>
