<template>
  <div class="workbench">
    <div class="workbench-layout">
      <!-- 左侧：对话区 -->
      <div class="chat-section">
        <n-card class="panel">
          <template #header>
            <div class="chat-header">
              <div class="header-left">
                <div class="current-session-title" :title="currentSessionTitle">
                  <span class="title-text">{{ currentSessionTitle }}</span>
                  <n-button quaternary circle size="tiny" class="rename-btn" @click="startRenameSession(currentSessionId, currentSessionTitle)">
                    <template #icon><n-icon size="12"><EditIcon /></n-icon></template>
                  </n-button>
                </div>
              </div>
              <div class="header-right">
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-badge :value="activeMemosCount" :max="99" :show="activeMemosCount > 0">
                      <n-button 
                        quaternary 
                        circle 
                        size="small" 
                        aria-label="小鸡便签盒" 
                        @click="openMemoDrawer"
                      >
                        <template #icon><n-icon size="16"><BookmarkIcon /></n-icon></template>
                      </n-button>
                    </n-badge>
                  </template>
                  小鸡便签盒 ({{ activeMemosCount }} 条待归档)
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-badge :value="episodicMemoriesCount" :max="99" :show="episodicMemoriesCount > 0" type="info">
                      <n-button 
                        quaternary 
                        circle 
                        size="small" 
                        aria-label="小鸡认知画布" 
                        @click="openMemoryDrawer"
                      >
                        <template #icon><n-icon size="16"><BrainIcon /></n-icon></template>
                      </n-button>
                    </n-badge>
                  </template>
                  小鸡认知画布 ({{ episodicMemoriesCount }} 条长效记忆)
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button quaternary circle size="small" aria-label="记一笔" @click="openCreateDrawer">
                      <template #icon><n-icon size="16"><PlusIcon /></n-icon></template>
                    </n-button>
                  </template>
                  记一笔日记
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button 
                      quaternary 
                      circle
                      size="small" 
                      :type="showReActPanel ? 'primary' : 'default'"
                      aria-label="思维链"
                      @click="showReActPanel = !showReActPanel"
                    >
                      <template #icon><n-icon size="16"><SparklesIcon /></n-icon></template>
                    </n-button>
                  </template>
                  {{ showReActPanel ? '收起右侧思维链' : '展开右侧思维链' }}
                </n-tooltip>
              </div>
            </div>
          </template>
          <div class="chat-content">
            <div class="messages" ref="messagesRef" :class="{ 'visible': isLayoutReady }">
              <!-- 小鸡手账工作台欢迎区 (仅在无消息时展示) -->
              <div v-if="messages.length === 0" class="hero-welcome-card">
                <div class="hero-avatar-wrapper">
                  <img :src="logoImg" alt="小鸡" class="hero-avatar-img" />
                  <span class="hero-online-status"></span>
                </div>
                <h2 class="hero-title">你好呀！我是小鸡 🐥</h2>
                <p class="hero-subtitle">你的智能手账与生活记录小助手。今天过得怎么样？随时告诉我，我来帮你整理成精美日记～</p>
                <div class="prompt-chips-grid">
                  <div
                    v-for="(chip, idx) in promptChips"
                    :key="idx"
                    class="prompt-chip-card"
                    @click="handleApplyChip(chip.text)"
                  >
                    <span class="chip-icon">{{ chip.icon }}</span>
                    <div class="chip-content">
                      <span class="chip-label">{{ chip.label }}</span>
                      <span class="chip-text">{{ chip.text }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-for="(m, i) in messages" :key="i" :class="['bubble', m.sender]">
                <div v-if="m.sender === 'agent'" class="bubble-header agent-header">
                  <img :src="logoImg" class="bubble-agent-avatar" alt="小鸡" />
                  <span class="bubble-agent-name">小鸡</span>
                  <span class="bubble-agent-tag">智能助手</span>
                </div>
                <div v-else class="bubble-header user-header">
                  <span class="bubble-user-name">我</span>
                </div>
                <div class="bubble-content">
                  <MarkdownRenderer v-if="m.sender === 'agent'" :content="m.content" />
                  <div v-else v-html="m.content"></div>

                  <!-- 便签暂存微标签 (轻量低认知负担) -->
                  <div v-if="m.memos && m.memos.length > 0" class="memo-pills-container">
                    <div 
                      v-for="memo in m.memos" 
                      :key="memo.id" 
                      class="memo-pill" 
                      @click="openMemoDrawer"
                      title="点击查看小鸡便签盒"
                    >
                      <n-icon size="13" class="memo-pill-icon"><BookmarkIcon /></n-icon>
                      <span class="memo-pill-topic">已收录便签：《{{ memo.topic }}》</span>
                      <span class="memo-pill-hint">查看便签盒 ›</span>
                    </div>
                  </div>

                  <!-- 新建/关联日记记录的卡片预览 -->
                  <div v-if="m.records && m.records.length > 0" class="journal-records-container">
                    <div v-for="rec in m.records" :key="rec._id" class="record-preview-card">
                      <div class="preview-card-header">
                        <div class="preview-project-badge">
                          <span class="dot"></span>
                          <span class="project-name">{{ rec.shanggexiangmu || '日常' }}</span>
                          <span v-if="rec.chixushijian && rec.chixushijian !== '未知时长'" class="duration-badge">
                            · {{ rec.chixushijian }}
                          </span>
                        </div>
                        <div class="preview-time">{{ rec.time }}</div>
                      </div>
                      <div class="preview-card-body" v-html="formatPreviewContent(rec.ganshou || rec.content)"></div>
                      <div class="preview-card-footer">
                        <span class="preview-status-tip" :class="{ 'is-revoked': rec.revoked }">
                          <n-icon size="13"><CheckmarkIcon v-if="!rec.revoked" /><CloseIcon v-else /></n-icon>
                          {{ rec.revoked ? '已撤回删除' : '已记入日记库' }}
                        </span>
                        <div class="preview-card-actions" v-if="!rec.revoked">
                          <n-button size="tiny" secondary type="primary" class="preview-edit-btn" @click="openEditDrawer(rec)">
                            <template #icon><n-icon size="12"><EditIcon /></n-icon></template>
                            编辑日记
                          </n-button>
                          <n-popconfirm @positive-click="undoRecord(rec)" positive-text="确认撤回" negative-text="取消">
                            <template #trigger>
                              <n-button size="tiny" secondary type="error" class="preview-undo-btn">
                                撤销记录
                              </n-button>
                            </template>
                            确定要撤回并从日记库中删除这条记录吗？
                          </n-popconfirm>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="bubble-footer">
                  <span class="time">{{ formatTime(m.time) }}</span>
                  <div class="bubble-actions">
                    <!-- 复制按钮 -->
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <n-button 
                          quaternary 
                          circle 
                          size="tiny" 
                          class="action-btn"
                          @click="copyToClipboard(m.content)"
                        >
                          <template #icon>
                            <n-icon size="14"><CopyIcon /></n-icon>
                          </template>
                        </n-button>
                      </template>
                      复制
                    </n-tooltip>
                    <n-tooltip v-if="m.sender === 'agent' && hasImage(m.content)" trigger="hover">
                      <template #trigger>
                        <n-button
                          quaternary
                          circle
                          size="tiny"
                          class="action-btn"
                          @click="saveImageFromMessage(m.content)"
                        >
                          <template #icon>
                            <n-icon size="14"><SaveIcon /></n-icon>
                          </template>
                        </n-button>
                      </template>
                      保存图片
                    </n-tooltip>
                    <!-- 思维记录切换按钮 -->
                    <n-tooltip v-if="m.reactIndex !== undefined" trigger="hover">
                      <template #trigger>
                        <n-button 
                          quaternary
                          circle
                          size="tiny"
                          class="action-btn"
                          aria-label="思维"
                          @click="scrollToReactStep(m.reactIndex, m.conversationId)"
                        >
                          <template #icon>
                            <n-icon size="14"><BrainIcon /></n-icon>
                          </template>
                        </n-button>
                      </template>
                      查看思维记录
                    </n-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <div class="chat-input-wrapper">
              <n-input
                v-model:value="input"
                type="textarea"
                :disabled="sending"
                placeholder="告诉小鸡今天发生了什么，或者让我帮你查查历史日记吧～ (Enter 发送，Shift + Enter 换行)"
                :autosize="{ minRows: 1, maxRows: 6 }"
                class="chat-textarea"
                @keydown="handleKeyDown"
              />
              <n-button
                v-if="sending"
                type="error"
                size="large"
                class="chat-send-btn stop-btn"
                @click="stopGeneration"
              >
                停止
              </n-button>
              <n-button
                v-else
                type="primary"
                size="large"
                class="chat-send-btn"
                :disabled="!input.trim()"
                @click="send"
              >
                发送
              </n-button>
            </div>
          </template>
        </n-card>
      </div>

      <!-- 右侧：思维记录面板（可折叠） -->
      <div class="sidebar-section" v-show="showReActPanel">
        <ReActPanel :steps="reactSteps" @close="showReActPanel = false" />
      </div>
    </div>

    <!-- 会话管理抽屉 -->
    <n-drawer v-model:show="showSessionDrawer" :width="330" placement="left">
      <n-drawer-content title="会话管理" closable>
        <div class="session-drawer-content">
          <div class="drawer-actions">
            <n-button type="primary" block @click="createNewSession">
              <template #icon><n-icon><PlusIcon /></n-icon></template>
              新建对话
            </n-button>
          </div>
          <div class="session-list">
            <div 
              v-for="s in sessions" 
              :key="s.id" 
              :class="['session-item', { active: s.id === currentSessionId }]"
              @click="switchSession(s.id)"
            >
              <div class="session-item-main">
                <div class="session-item-title-row">
                  <span class="session-item-title">{{ s.title }}</span>
                  <n-tag size="tiny" :bordered="false" round type="info">{{ s.messageCount || 0 }} 条</n-tag>
                </div>
                <div class="session-item-preview">{{ s.lastMessagePreview || '暂无对话' }}</div>
                <div class="session-item-meta">{{ formatRelativeTime(s.updatedAt) }}</div>
              </div>
              <div class="session-item-actions" @click.stop>
                <n-button quaternary circle size="tiny" @click="startRenameSession(s.id, s.title)">
                  <template #icon><n-icon size="13"><EditIcon /></n-icon></template>
                </n-button>
                <n-popconfirm @positive-click="deleteSession(s.id)" positive-text="删除" negative-text="取消">
                  <template #trigger>
                    <n-button quaternary circle size="tiny" type="error">
                      <template #icon><n-icon size="13"><TrashIcon /></n-icon></template>
                    </n-button>
                  </template>
                  确定要删除此会话吗？
                </n-popconfirm>
              </div>
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>

    <!-- 会话重命名弹窗 -->
    <n-modal
      v-model:show="showRenameModal"
      preset="dialog"
      title="重命名会话"
      positive-text="确认"
      negative-text="取消"
      @positive-click="confirmRenameSession"
    >
      <n-input
        v-model:value="renameInput"
        placeholder="输入新的会话标题"
        @keypress.enter="confirmRenameSession"
        autofocus
      />
    </n-modal>

    <!-- 统一日记编辑/新建抽屉 -->
    <JournalEditorDrawer
      v-model:show="showJournalDrawer"
      :record="drawerRecord"
      @saved="handleJournalSaved"
    />

    <!-- 小鸡便签盒抽屉 -->
    <n-drawer v-model:show="showMemoDrawer" :width="460" placement="right">
      <n-drawer-content closable>
        <template #header>
          <div class="memo-drawer-header">
            <span class="memo-header-title">小鸡便签盒 📝</span>
            <n-tag size="small" :bordered="false" round :type="activeMemosCount > 0 ? 'warning' : 'default'">
              {{ activeMemosCount }} 条待归档
            </n-tag>
          </div>
        </template>

        <div class="memo-drawer-body">
          <!-- 顶部快捷操作栏 -->
          <div class="memo-drawer-toolbar">
            <n-radio-group v-model:value="memoFilterStatus" size="small">
              <n-radio-button value="active">待整理 ({{ activeMemosCount }})</n-radio-button>
              <n-radio-button value="merged">已归档</n-radio-button>
              <n-radio-button value="all">全部</n-radio-button>
            </n-radio-group>

            <n-button 
              type="primary" 
              size="small" 
              :disabled="activeMemosCount === 0" 
              :loading="isMergingMemos"
              @click="mergeActiveMemos"
            >
              <template #icon><n-icon><CheckmarkIcon /></n-icon></template>
              一键合并为今日日记
            </n-button>
          </div>

          <!-- 便签列表 -->
          <div class="memo-list-container">
            <div v-if="filteredMemos.length === 0" class="memo-empty-state">
              <div class="empty-icon">🍃</div>
              <div class="empty-text">当前暂无便签</div>
              <div class="empty-sub">和小鸡自然倾诉生活或吐槽心事，小鸡会自动为你把生活火花收集在此～</div>
            </div>

            <div v-for="memo in filteredMemos" :key="memo.id" class="memo-card-item">
              <div class="memo-card-header">
                <div class="memo-topic-wrap">
                  <span class="memo-topic-tag">{{ memo.topic }}</span>
                  <span class="memo-project-badge">{{ memo.project || '生活' }}</span>
                </div>
                <div class="memo-status-wrap">
                  <n-tag v-if="memo.status === 'active'" size="tiny" type="warning" round :bordered="false">待归档</n-tag>
                  <n-tag v-else-if="memo.status === 'merged'" size="tiny" type="success" round :bordered="false">已入日记</n-tag>
                  <span class="memo-date">{{ memo.date }}</span>
                </div>
              </div>

              <div class="memo-card-content">
                {{ memo.content }}
              </div>

              <div v-if="memo.quotes && memo.quotes.length > 0" class="memo-quotes-box">
                <div class="quote-title">💬 原话摘录：</div>
                <div v-for="(q, qIdx) in memo.quotes" :key="qIdx" class="quote-item">
                  “{{ q }}”
                </div>
              </div>

              <div class="memo-card-footer">
                <div class="memo-time-meta">
                  更新于 {{ formatRelativeTime(memo.updatedAt || memo.createdAt) }}
                </div>
                <div class="memo-actions">
                  <n-button 
                    v-if="memo.status === 'active'" 
                    size="tiny" 
                    secondary 
                    type="primary"
                    @click="convertSingleMemo(memo.id)"
                  >
                    存为单篇日记
                  </n-button>
                  <n-popconfirm @positive-click="deleteMemo(memo.id)" positive-text="删除" negative-text="取消">
                    <template #trigger>
                      <n-button size="tiny" quaternary type="error">
                        删除
                      </n-button>
                    </template>
                    确定要从便签盒中删除此便签吗？
                  </n-popconfirm>
                </div>
              </div>
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>

    <!-- 小鸡心智与认知画布抽屉 -->
    <CognitiveCanvasDrawer
      v-model="showMemoryDrawer"
      ref="memoryDrawerRef"
      @memory-changed="updateMemoryCount"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed, h } from 'vue'
import { useMessage } from 'naive-ui'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '@renderer/config/assistant'
import ReActPanel from './ReActPanel.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import JournalEditorDrawer from './journal/JournalEditorDrawer.vue'
import CognitiveCanvasDrawer from './CognitiveCanvasDrawer.vue'
import logoImg from '../assets/logo.png'

const message = useMessage()
const emit = defineEmits(['sessions-updated', 'toggle-sidebar'])

const handleToggleSessionList = () => {
  emit('toggle-sidebar')
}
const readSetting = (key) => {
  try {
    if (!ipc?.sendSync) return null
    return ipc.sendSync('settings:get-sync', key)
  } catch {
    return null
  }
}

const writeSetting = (key, value) => {
  try {
    if (!ipc?.sendSync) return false
    return ipc.sendSync('settings:set-sync', { key, value }) === true
  } catch {
    return false
  }
}

const loadJsonSetting = (key) => {
  const fromFile = readSetting(key)
  if (fromFile !== null && fromFile !== undefined) return fromFile
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (writeSetting(key, parsed)) localStorage.removeItem(key)
    return parsed
  } catch {
    return null
  }
}

const saveJsonSetting = (key, value) => {
  if (writeSetting(key, value)) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// 思维/大脑图标 (真实 Brain 图标)
const BrainIcon = { 
  render: () => h('svg', { 
    xmlns: 'http://www.w3.org/2000/svg', 
    viewBox: '0 0 24 24', 
    innerHTML: '<path fill="currentColor" d="M12 3a4 4 0 0 0-4 4c0 .37.05.73.15 1.07A4.5 4.5 0 0 0 5 12.5a4.5 4.5 0 0 0 3.2 4.32A3.5 3.5 0 0 0 11 20h2a3.5 3.5 0 0 0 2.8-3.18A4.5 4.5 0 0 0 19 12.5a4.5 4.5 0 0 0-3.15-4.43c.1-.34.15-.7.15-1.07a4 4 0 0 0-4-4m-1 3a2 2 0 0 1 2 0v2h-2zm-3.5 5a2.5 2.5 0 0 1 2.5-2.5h1v3h-3.41c-.06-.16-.09-.33-.09-.5m8 0c0 .17-.03.34-.09.5H12v-3h1a2.5 2.5 0 0 1 2.5 2.5M10 14h4v2h-4zm1 4v-1h2v1a1.5 1.5 0 0 1-1.5 1.5A1.5 1.5 0 0 1 11 18"/>' 
  }) 
}

// 思维链图标
const SparklesIcon = {
  render: () => h('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    innerHTML: '<path fill="currentColor" d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>'
  })
}

// 展开/折叠右侧思维链面板 (默认收起，最大化主体空间)
const showReActPanel = ref(false)

// 复制图标
const CopyIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H9V4h10v12zM5 6H3v14c0 1.1.9 2 2 2h14v-2H5V6z"/>' }) }

const SaveIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7zm-5 16a3 3 0 1 1 0-6a3 3 0 0 1 0 6m3-10H5V5h10z"/>' }) }

// 会话与操作图标
const ListIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>' }) }
const PlusIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>' }) }
const EditIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>' }) }
const TrashIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>' }) }
const BookmarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3l7 3V5c0-1.1-.9-2-2-2z"/>' }) }
const CheckmarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' }) }
const CloseIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', innerHTML: '<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' }) }

// 小鸡认知画布状态
const showMemoryDrawer = ref(false)
const memoryDrawerRef = ref(null)
const episodicMemoriesCount = ref(0)
let unsubscribeMemoryEvolved = null

const updateMemoryCount = async () => {
  try {
    if (window.assistant?.coreMemory?.listEpisodic) {
      const list = await window.assistant.coreMemory.listEpisodic()
      episodicMemoriesCount.value = Array.isArray(list) ? list.length : 0
    }
  } catch {}
}

const openMemoryDrawer = () => {
  showMemoryDrawer.value = true
  memoryDrawerRef.value?.loadMemories()
}

const messages = ref([])
const input = ref('')
const messagesRef = ref(null)
const welcomeTime = ref(new Date())
const sending = ref(false)

// 小鸡日记灵感记录胶囊
const promptChips = [
  { icon: '📝', label: '记一笔', text: '帮我记一笔：今天下午完成了小鸡日记的风格重塑，心情很充实！' },
  { icon: '🔍', label: '查日记', text: '帮我回顾一下最近一周的工作与学习日记' },
  { icon: '📊', label: '状态分析', text: '根据我最近的日记，帮我分析一下最近的情绪与精力状态' },
  { icon: '💡', label: '灵光一现', text: '我刚才有个新灵感，帮我提炼并记入日记...' }
]

const handleApplyChip = (chipText) => {
  input.value = chipText
}

// 会话管理状态
const sessions = ref([])
const currentSessionId = ref('')
const currentSessionTitle = computed(() => {
  const s = sessions.value.find(item => item.id === currentSessionId.value)
  return s?.title || '新对话'
})
const showSessionDrawer = ref(false)
const showRenameModal = ref(false)
const renameInput = ref('')
const renameSessionId = ref('')

// 统一日记编辑/新建抽屉状态
const showJournalDrawer = ref(false)
const drawerRecord = ref(null)
const currentTurnRecords = ref([])

// 便签盒管理状态
const showMemoDrawer = ref(false)
const memosList = ref([])
const memoFilterStatus = ref('active')
const isMergingMemos = ref(false)
const currentTurnMemos = ref([])

const activeMemosCount = computed(() => {
  return memosList.value.filter(m => m.status === 'active').length
})

const filteredMemos = computed(() => {
  if (memoFilterStatus.value === 'all') return memosList.value
  return memosList.value.filter(m => m.status === memoFilterStatus.value)
})

const todayActiveMemos = computed(() => {
  const todayStr = new Date().toISOString().slice(0, 10)
  return memosList.value.filter(m => m.status === 'active' && (!m.date || m.date === todayStr))
})

const loadMemos = async () => {
  try {
    if (window.assistant?.memos?.list) {
      const list = await window.assistant.memos.list()
      if (Array.isArray(list)) {
        memosList.value = list
      }
    }
  } catch (err) {
    console.warn('[AgentWorkbench] Failed to load memos:', err)
  }
}

const openMemoDrawer = async () => {
  await loadMemos()
  showMemoDrawer.value = true
}

const mergeActiveMemos = async () => {
  try {
    isMergingMemos.value = true
    const activeMemos = memosList.value.filter(m => m.status === 'active')
    if (activeMemos.length === 0) {
      message.info('当前没有待归档的便签')
      return
    }
    const res = await window.assistant?.memos?.mergeToRecord(activeMemos.map(m => m.id))
    if (res?.success) {
      message.success(`已将 ${res.mergedCount} 条便签合并存入今日日记！`)
      await loadMemos()
      window.dispatchEvent(new CustomEvent('journal-data-updated', { detail: { record: res.record } }))
    } else {
      message.error('合并便签失败: ' + (res?.error || '未知错误'))
    }
  } catch (err) {
    message.error('合并便签异常: ' + (err?.message || '未知错误'))
  } finally {
    isMergingMemos.value = false
  }
}

const convertSingleMemo = async (memoId) => {
  try {
    const res = await window.assistant?.memos?.convertToRecord(memoId)
    if (res?.success) {
      message.success('已转为正式日记！')
      await loadMemos()
      window.dispatchEvent(new CustomEvent('journal-data-updated', { detail: { record: res.record } }))
    } else {
      message.error('转换失败: ' + (res?.error || '未知错误'))
    }
  } catch (err) {
    message.error('转换异常: ' + (err?.message || '未知错误'))
  }
}

const deleteMemo = async (memoId) => {
  try {
    const res = await window.assistant?.memos?.delete(memoId)
    if (res) {
      message.success('便签已删除')
      await loadMemos()
    }
  } catch (err) {
    message.error('删除便签失败: ' + (err?.message || '未知错误'))
  }
}

// 相对时间格式化
const formatRelativeTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    const diff = Date.now() - new Date(timeStr).getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}天前`
    return new Date(timeStr).toLocaleDateString('zh-CN')
  } catch {
    return ''
  }
}

// 会话加载与初始化
const loadSessions = async () => {
  try {
    if (window.assistant?.sessions?.list) {
      let list = await window.assistant.sessions.list()
      if (!list || list.length === 0) {
        const legacyConv = loadJsonSetting('assistant-conversation')
        const legacyReacts = loadJsonSetting('assistant-reacts')
        if (Array.isArray(legacyConv) && legacyConv.length > 0) {
          await window.assistant.sessions.migrateLegacy(legacyConv, legacyReacts || {})
          list = await window.assistant.sessions.list()
        } else {
          const defaultSession = await window.assistant.sessions.create({ title: '新对话' })
          list = [defaultSession]
        }
      }
      sessions.value = list || []

      if (!currentSessionId.value || !sessions.value.some(s => s.id === currentSessionId.value)) {
        if (sessions.value.length > 0) {
          await switchSession(sessions.value[0].id)
        }
      }
      emit('sessions-updated', { sessions: sessions.value, currentSessionId: currentSessionId.value })
    }
  } catch (err) {
    console.error('加载会话列表失败:', err)
  }
}

// 切换会话
const switchSession = async (id) => {
  try {
    if (!window.assistant?.sessions?.get) return
    const session = await window.assistant.sessions.get(id)
    if (!session) return
    currentSessionId.value = session.id
    messages.value = Array.isArray(session.messages) ? session.messages : []
    conversationReacts.value = session.reacts || {}

    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg?.conversationId && conversationReacts.value[lastMsg.conversationId]) {
      reactSteps.value = conversationReacts.value[lastMsg.conversationId]
    } else {
      reactSteps.value = []
    }

    emit('sessions-updated', { sessions: sessions.value, currentSessionId: currentSessionId.value })
    showSessionDrawer.value = false
    await scrollToBottom()
  } catch (err) {
    console.error('切换会话失败:', err)
  }
}

// 新建会话
const createNewSession = async () => {
  try {
    if (!window.assistant?.sessions?.create) return
    const newSession = await window.assistant.sessions.create({ title: '新对话' })
    await loadSessions()
    await switchSession(newSession.id)
    showSessionDrawer.value = false
    message.success('已开启新会话')
  } catch (err) {
    message.error('创建会话失败: ' + (err?.message || '未知错误'))
  }
}

// 删除会话
const deleteSession = async (id) => {
  try {
    if (!window.assistant?.sessions?.delete) return
    await window.assistant.sessions.delete(id)
    message.success('会话已删除')
    await loadSessions()
    if (currentSessionId.value === id) {
      if (sessions.value.length > 0) {
        await switchSession(sessions.value[0].id)
      } else {
        await createNewSession()
      }
    }
  } catch (err) {
    message.error('删除会话失败: ' + (err?.message || '未知错误'))
  }
}

// 重命名会话
const startRenameSession = (id, currentTitle) => {
  renameSessionId.value = id
  renameInput.value = currentTitle || ''
  showRenameModal.value = true
}

const confirmRenameSession = async () => {
  const newTitle = renameInput.value?.trim()
  if (!newTitle) {
    message.warning('标题不能为空')
    return
  }
  try {
    await window.assistant?.sessions?.rename(renameSessionId.value, newTitle)
    await loadSessions()
    showRenameModal.value = false
    message.success('会话标题已更新')
  } catch (err) {
    message.error('修改标题失败: ' + (err?.message || '未知错误'))
  }
}

// 统一日记编辑/新建抽屉处理函数
const openCreateDrawer = () => {
  drawerRecord.value = null
  showJournalDrawer.value = true
}

const openEditDrawer = (rec) => {
  drawerRecord.value = { ...rec }
  showJournalDrawer.value = true
}

const handleJournalSaved = (savedRecord) => {
  if (!savedRecord || !savedRecord._id) return
  let found = false
  for (const msg of messages.value) {
    if (msg.records && Array.isArray(msg.records)) {
      const idx = msg.records.findIndex(r => r._id === savedRecord._id)
      if (idx !== -1) {
        msg.records[idx] = { ...savedRecord }
        found = true
      }
    }
  }

  // 若为主动新增且尚未在气泡展示，追加一条带预览卡片的助手消息
  if (!found && !drawerRecord.value) {
    messages.value.push({
      content: `已为你记录入库：【${savedRecord.shanggexiangmu || '日常'}】`,
      sender: 'agent',
      time: new Date().toISOString(),
      conversationId: currentConversationId.value,
      records: [{ ...savedRecord }]
    })
    scrollToBottom()
  }

  saveJsonSetting('assistant-conversation', messages.value)
  if (currentSessionId.value) {
    try {
      window.assistant?.sessions?.save({
        id: currentSessionId.value,
        messages: JSON.parse(JSON.stringify(messages.value)),
        reacts: JSON.parse(JSON.stringify(conversationReacts.value))
      })
    } catch {}
  }
}

// 监听跨组件数据变更事件，同步更新对话中的日记卡片
const handleExternalJournalUpdate = (e) => {
  loadMemos()
  const { record } = e.detail || {}
  if (record && record._id) {
    for (const msg of messages.value) {
      if (msg.records && Array.isArray(msg.records)) {
        const idx = msg.records.findIndex(r => r._id === record._id)
        if (idx !== -1) {
          msg.records[idx] = { ...record }
        }
      }
    }
    saveJsonSetting('assistant-conversation', messages.value)
  }
}

// ReAct 思维链面板状态（常驻显示）
const reactSteps = ref([])

// 历史对话的思维记录缓存（每次对话的思维记录）
const conversationReacts = ref({})

// 布局就绪状态 - 用于控制透明度，实现无闪烁滚动
const isLayoutReady = ref(false)
const currentRequestId = ref(null)
const currentConversationId = ref(null)
const streamIndex = ref(null)
let unsubscribeAssistantEvents = null

// 自动滚动到底部
const scrollToBottom = async (smooth = false) => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// 从全局设置加载配置
const c0 = loadConfig()
const defaultToolsList = ['create_record', 'manage_memo', 'search_records', 'query_records', 'sql_analysis']
const enabledTools = ref(c0.enabledTools ? Array.from(new Set([...c0.enabledTools, 'manage_memo'])) : defaultToolsList)
const TOOL_LABELS = { 
  create_record: '新建日记',
  manage_memo: '便签管理',
  search_records: '综合检索',
  query_records: '条件筛选',
  sql_analysis: '统计分析'
}

// 滚动到指定的思维步骤（支持切换历史对话）
const scrollToReactStep = (stepIndex, conversationId) => {
  showReActPanel.value = true
  // 如果指定了对话ID，先切换思维记录
  if (conversationId && conversationReacts.value[conversationId]) {
    reactSteps.value = conversationReacts.value[conversationId]
  }
  // 发送事件通知 ReActPanel 展开指定步骤
  const event = new CustomEvent('expand-react-step', { detail: { stepIndex } })
  window.dispatchEvent(event)
}

// 添加思维步骤到面板
const addReActStep = (step) => {
  reactSteps.value.push({
    ...step,
    time: new Date()
  })
}

// 清空思维步骤
const clearReActSteps = () => {
  reactSteps.value = []
}

// 保存当前对话的思维记录
const saveCurrentReacts = (conversationId) => {
  if (conversationId && reactSteps.value.length > 0) {
    conversationReacts.value[conversationId] = [...reactSteps.value]
    saveJsonSetting('assistant-reacts', conversationReacts.value)
  }
}

// 监听全局设置更新
const handleSettingsUpdate = (event) => {
  const { assistant } = event.detail || {}
  if (assistant) {
    enabledTools.value = assistant.enabledTools || enabledTools.value
  }
}

onMounted(async () => {
  // 监听设置更新事件与跨组件数据更新事件
  window.addEventListener('settings-updated', handleSettingsUpdate)
  window.addEventListener('journal-data-updated', handleExternalJournalUpdate)

  // 初始化小鸡长效记忆数量与自进化事件监听
  updateMemoryCount()
  if (typeof window.assistant?.coreMemory?.onEvolved === 'function') {
    unsubscribeMemoryEvolved = window.assistant.coreMemory.onEvolved((payload) => {
      const fact = payload?.memory?.content || '新的生活认知'
      message.info(`🌱 小鸡记住了：${fact}`, { duration: 4500 })
      updateMemoryCount()
    })
  }
  if (typeof window.assistant?.onEvent === 'function') {
    unsubscribeAssistantEvents = window.assistant.onEvent(async (payload) => {
      const reqId = currentRequestId.value
      if (!payload || !reqId || payload.requestId !== reqId) return

      const removeLoadingStep = () => {
        for (let i = reactSteps.value.length - 1; i >= 0; i--) {
          const action = reactSteps.value[i]?.action || reactSteps.value[i]?.type
          if (action === 'loading') {
            reactSteps.value.splice(i, 1)
            break
          }
        }
      }

      const { type, data } = payload
      if (type === 'step' && data?.step) {
        removeLoadingStep()
        const step = data.step
        addReActStep({
          ...step,
          type: step.action,
          time: new Date(step.timestamp || Date.now())
        })

        // 检查小鸡工具调用中是否包含新建日记记录或便签
        if (step.action === 'tool_calls' && Array.isArray(step.results)) {
          for (const res of step.results) {
            if (res.name === 'create_record' && res.success && res.result?.data?.record) {
              const rec = res.result.data.record
              if (!currentTurnRecords.value.some(r => r._id === rec._id)) {
                currentTurnRecords.value.push(rec)
                // 广播全局数据更新事件，通知日记管理、复盘等组件刷新
                window.dispatchEvent(
                  new CustomEvent('journal-data-updated', {
                    detail: { record: rec }
                  })
                )
              }
            }
            if (res.name === 'manage_memo' && res.success) {
              const data = res.result?.data
              if (data?.action === 'upsert' && data.memo) {
                if (!currentTurnMemos.value.some(m => m.id === data.memo.id)) {
                  currentTurnMemos.value.push(data.memo)
                }
                loadMemos()
              } else if (data?.action === 'merge_to_diary' && data.record) {
                if (!currentTurnRecords.value.some(r => r._id === data.record._id)) {
                  currentTurnRecords.value.push(data.record)
                  window.dispatchEvent(
                    new CustomEvent('journal-data-updated', {
                      detail: { record: data.record }
                    })
                  )
                }
                loadMemos()
              }
            }
          }
        }

        if (step.action === 'final_answer' && streamIndex.value !== null) {
          const idx = streamIndex.value
          if (messages.value[idx]) {
            messages.value[idx].reactIndex = reactSteps.value.length - 1
            messages.value[idx].conversationId = currentConversationId.value
            if (currentTurnRecords.value.length > 0) {
              messages.value[idx].records = [...currentTurnRecords.value]
            }
            if (currentTurnMemos.value.length > 0) {
              messages.value[idx].memos = [...currentTurnMemos.value]
            }
            saveJsonSetting('assistant-conversation', messages.value)
          }
        }

        await scrollToBottom()
        return
      }

      if (type === 'final_start') {
        removeLoadingStep()
        if (streamIndex.value === null) {
          const idx = messages.value.length
          streamIndex.value = idx
          messages.value.push({
            content: '',
            sender: 'agent',
            time: new Date().toISOString(),
            isStreaming: true,
            conversationId: currentConversationId.value,
            records: currentTurnRecords.value.length > 0 ? [...currentTurnRecords.value] : undefined,
            memos: currentTurnMemos.value.length > 0 ? [...currentTurnMemos.value] : undefined
          })
          await scrollToBottom()
        }
        return
      }

      if (type === 'final_delta') {
        if (streamIndex.value === null) return
        const idx = streamIndex.value
        if (!messages.value[idx]) return
        messages.value[idx].content += data?.delta || ''
        if (currentTurnRecords.value.length > 0 && (!messages.value[idx].records || messages.value[idx].records.length === 0)) {
          messages.value[idx].records = [...currentTurnRecords.value]
        }
        if (currentTurnMemos.value.length > 0 && (!messages.value[idx].memos || messages.value[idx].memos.length === 0)) {
          messages.value[idx].memos = [...currentTurnMemos.value]
        }
        await scrollToBottom()
        return
      }

      if (type === 'final_end') {
        if (streamIndex.value === null) return
        const idx = streamIndex.value
        if (messages.value[idx]) {
          messages.value[idx].isStreaming = false
          if (currentTurnRecords.value.length > 0) {
            messages.value[idx].records = [...currentTurnRecords.value]
          }
          if (currentTurnMemos.value.length > 0) {
            messages.value[idx].memos = [...currentTurnMemos.value]
          }
        }
        currentTurnRecords.value = []
        currentTurnMemos.value = []
        saveJsonSetting('assistant-conversation', messages.value)
        if (currentSessionId.value) {
          try {
            window.assistant?.sessions?.save({
              id: currentSessionId.value,
              messages: JSON.parse(JSON.stringify(messages.value)),
              reacts: JSON.parse(JSON.stringify(conversationReacts.value))
            })
            loadSessions()
          } catch {}
        }
        await scrollToBottom()
        return
      }

      if (type === 'error') {
        removeLoadingStep()
        const msg = data?.message || '执行失败'
        addReActStep({ type: 'error', action: 'error', reasoning: msg, timestamp: new Date().toISOString() })
        messages.value.push({ content: msg, sender: 'agent', time: new Date().toISOString(), conversationId: currentConversationId.value })
        saveJsonSetting('assistant-conversation', messages.value)
        await scrollToBottom()
      }
    })
  }
  
  // 加载会话列表与当前激活会话
  await loadSessions()
  await loadMemos()
  
  // 【无闪烁滚动方案】
  // 1. 等待 DOM 渲染完成
  await nextTick()
  
  // 2. 瞬间滚动到底部（无动画，用户看不到）
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
  
  // 3. 使用 requestAnimationFrame 确保在下一帧渲染时才显示内容
  // 避免用户看到滚动跳跃过程
  requestAnimationFrame(() => {
    isLayoutReady.value = true
  })
})

onUnmounted(() => {
  window.removeEventListener('settings-updated', handleSettingsUpdate)
  window.removeEventListener('journal-data-updated', handleExternalJournalUpdate)
  try {
    if (typeof unsubscribeAssistantEvents === 'function') {
      unsubscribeAssistantEvents()
    }
  } catch {}
  try {
    if (typeof unsubscribeMemoryEvolved === 'function') {
      unsubscribeMemoryEvolved()
    }
  } catch {}
})

const formatTime = (t) => {
  try {
    const d = t instanceof Date ? t : new Date(t)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('zh-CN')
  } catch { return '' }
}

const isImageModel = (model) => {
  const m = String(model || '').toLowerCase()
  return m.includes('pro-image') || /(^|-)image($|-)/.test(m)
}

async function send() {
  if (sending.value) return
  const text = input.value.trim()
  if (!text) return

  // 从全局配置加载
  const config = loadConfig()
  const isImage = isImageModel(config.selectedModel)

  console.log('[send] input', text)
  sending.value = true

  try {
    // 生成对话ID
    const conversationId = `conv_${Date.now()}`
    const requestId = crypto?.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
    currentConversationId.value = conversationId
    currentRequestId.value = requestId
    streamIndex.value = null
    currentTurnRecords.value = []
    currentTurnMemos.value = []
    
    messages.value.push({ content: text, sender: 'user', time: new Date().toISOString(), reactIndex: 0, conversationId })
    input.value = ''
    await scrollToBottom()
    
    // 清空并初始化思维链
    clearReActSteps()
    
    // 推送：用户输入
    addReActStep({ 
      type: 'user_query', 
      action: 'user_query',
      query: text,
      timestamp: new Date().toISOString()
    })
    
    // 推送:加载中(思考状态)
    addReActStep({ 
      type: 'loading', 
      action: 'loading',
      detail: '正在思考',
      timestamp: new Date().toISOString()
    })
    
    const now = new Date()
    const nowStr = now.toLocaleString('zh-CN', { hour12: false })
    const hour = now.getHours()
    let period = '下午'
    if (hour >= 5 && hour < 9) period = '早晨'
    else if (hour >= 9 && hour < 12) period = '上午'
    else if (hour >= 12 && hour < 14) period = '中午'
    else if (hour >= 14 && hour < 18) period = '下午'
    else if (hour >= 18 && hour < 22) period = '傍晚'
    else period = '深夜'

    const sysinfo = `\n【系统信息】当前时间：${nowStr} (${period})；时区：UTC+8；语言：中文。\n【特别提醒】：当前所处时段为【${period}】，严禁时空混淆，白天切勿当成夜晚！`
    
    // 构建完整的消息历史，包括之前的对话
    const messagesPayload = [
      { role: 'system', content: `${config.prompts.chatSystem}${sysinfo}` }
    ]
    
    // 添加消息记录（包含刚加入 messages.value 的当前最新提问）
    messages.value.forEach(msg => {
      if (!msg.content || typeof msg.content !== 'string') return
      const trimmed = msg.content.trim()
      if (trimmed.startsWith('<pre>') || trimmed.startsWith('LLM 调用失败') || trimmed.includes('"success": false')) {
        return
      }
      messagesPayload.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
        time: msg.time
      })
    })
    
    console.log('[AgentWorkbench] Sending message history with', messagesPayload.length, 'messages')

    const tools = enabledTools.value.map(name => ({ type: 'function', function: { name } }))
    console.log('[send] enabledTools', enabledTools.value)
    
    let result
    try {
      let requestConfig = { 
        sessionId: currentSessionId.value,
        messages: messagesPayload, 
        model: config.selectedModel, 
        baseURL: config.selectedBaseURL, 
        tools: isImage ? [] : tools,
        userQuery: text,
        requestId,
        conversationId,
        config: { 
          temperature: config.temperature, 
          top_p: config.top_p 
        },
        mock: false,
        intentModel: config.intentModel,
        disableTools: isImage ? true : undefined,
        extraBody: isImage ? { size: '1024x1024' } : undefined,
      }
      console.log('[assistant:chat] request', requestConfig)
      
      result = await window.assistant?.chat?.(requestConfig)
      console.log('[assistant:chat] result', result)
    } catch (e) {
      console.log('[assistant:chat] exception', e)
      // 移除加载状态，推送错误
      for (let i = reactSteps.value.length - 1; i >= 0; i--) {
        const action = reactSteps.value[i]?.action || reactSteps.value[i]?.type
        if (action === 'loading') {
          reactSteps.value.splice(i, 1)
          break
        }
      }
      addReActStep({ 
        type: 'error', 
        action: 'error',
        reasoning: `调用异常：${e?.message || '未知错误'}`,
        timestamp: new Date().toISOString()
      })
      const errDetail = escapeHTML(JSON.stringify({ name: e?.name, message: e?.message }, null, 2))
      messages.value.push({ content: `<pre>${errDetail}</pre>`, sender: 'agent', time: new Date().toISOString() })
      await scrollToBottom()
      return
    }

    // 移除加载状态
    for (let i = reactSteps.value.length - 1; i >= 0; i--) {
      const action = reactSteps.value[i]?.action || reactSteps.value[i]?.type
      if (action === 'loading') {
        reactSteps.value.splice(i, 1)
        break
      }
    }

    if (result?.success) {
      // 检查并在必要时补充本轮工具调用的新建记录与便签
      const stateSteps = result.data?.state?.steps || []
      for (const s of stateSteps) {
        if (s.action === 'tool_calls' && Array.isArray(s.results)) {
          for (const res of s.results) {
            if (res.name === 'create_record' && res.success && res.result?.data?.record) {
              const rec = res.result.data.record
              if (!currentTurnRecords.value.some(r => r._id === rec._id)) {
                currentTurnRecords.value.push(rec)
              }
            }
            if (res.name === 'manage_memo' && res.success) {
              const data = res.result?.data
              if (data?.action === 'upsert' && data.memo) {
                if (!currentTurnMemos.value.some(m => m.id === data.memo.id)) {
                  currentTurnMemos.value.push(data.memo)
                }
              } else if (data?.action === 'merge_to_diary' && data.record) {
                if (!currentTurnRecords.value.some(r => r._id === data.record._id)) {
                  currentTurnRecords.value.push(data.record)
                }
              }
            }
          }
        }
      }
      await loadMemos()

      // 获取最终答案
      const finalAnswer = result.data?.content
      
      if (finalAnswer) {
        console.log('[ReAct] Final answer received, length:', finalAnswer.length)
        if (streamIndex.value === null) {
          messages.value.push({
            content: finalAnswer,
            sender: 'agent',
            time: new Date().toISOString(),
            conversationId,
            records: currentTurnRecords.value.length > 0 ? [...currentTurnRecords.value] : undefined,
            memos: currentTurnMemos.value.length > 0 ? [...currentTurnMemos.value] : undefined,
            reactIndex: reactSteps.value.length > 0 ? reactSteps.value.length - 1 : undefined
          })
        } else if (messages.value[streamIndex.value]) {
          if (currentTurnRecords.value.length > 0) {
            messages.value[streamIndex.value].records = [...currentTurnRecords.value]
          }
          if (currentTurnMemos.value.length > 0) {
            messages.value[streamIndex.value].memos = [...currentTurnMemos.value]
          }
        }
        currentTurnRecords.value = []
        currentTurnMemos.value = []
        saveCurrentReacts(conversationId)
        saveJsonSetting('assistant-conversation', messages.value)
        if (currentSessionId.value) {
          try {
            await window.assistant?.sessions?.save({
              id: currentSessionId.value,
              messages: JSON.parse(JSON.stringify(messages.value)),
              reacts: JSON.parse(JSON.stringify(conversationReacts.value))
            })
            await loadSessions()
          } catch (saveErr) {
            console.warn('[AgentWorkbench] Failed to save session:', saveErr)
          }
        }
        await scrollToBottom()
        return
      }
      
      // 向后兼容：如果没有 finalAnswer 但有工具结果
      const toolSteps = stateSteps.filter(step => step.action === 'tool_calls')
      const allToolResults = []
      toolSteps.forEach(step => {
        if (step.results && Array.isArray(step.results)) {
          allToolResults.push(...step.results)
        }
      })
      
      if (allToolResults.length === 0) {
        const msg = '未执行任何工具或未返回结果。'
        addReActStep({ 
          type: 'error', 
          action: 'error',
          reasoning: msg,
          timestamp: new Date().toISOString()
        })
        messages.value.push({ content: msg, sender: 'agent', time: new Date().toISOString() })
        await scrollToBottom()
        return
      }
      
      // 旧模式：需要手动综合工具结果
      const toolPayload = allToolResults.map(t => ({ name: t.name, result: t.result }))
      const synthMessages = [
        { role: 'system', content: `${config.prompts.chatSystem}${sysinfo}。请基于下列工具输出，按照系统提示词回答用户的问题。` },
        { role: 'user', content: `用户问题：${text}\n工具输出：\n${JSON.stringify(toolPayload, null, 2)}` }
      ]
      const streamIdx = messages.value.length
      messages.value.push({ content: '', sender: 'agent', time: new Date().toISOString(), isStreaming: true })
      
      let synth
      try {
        synth = await window.assistant?.chat?.({
          messages: synthMessages,
          model: config.selectedModel,
          baseURL: config.selectedBaseURL,
          tools: [],
          userQuery: '',
          config: { temperature: config.temperature, top_p: config.top_p },
          mock: false,
          intentModel: config.intentModel,
          disableTools: true
        })
      } catch (e) {
        const msg = `生成阶段失败：${e?.message || '未知错误'}`
        messages.value[streamIdx] = { content: msg, sender: 'agent', time: new Date().toISOString() }
        await scrollToBottom()
        return
      }
      
      const final = synth?.data?.content || synth?.data?.raw?.choices?.[0]?.message?.content
      if (!final) {
        const msg = '模型未生成最终回答'
        messages.value[streamIdx] = { content: msg, sender: 'agent', time: new Date().toISOString() }
        await scrollToBottom()
        return
      }
      
      await streamMessageContent(streamIdx, final, 40, 50)
      messages.value[streamIdx].isStreaming = false
      saveJsonSetting('assistant-conversation', messages.value)
      await scrollToBottom()
    } else {
      const errorMsg = result?.error?.message || result?.error || '服务调用遇到未知错误'
      addReActStep({ 
        type: 'error', 
        action: 'error',
        reasoning: `调用失败：${errorMsg}`,
        timestamp: new Date().toISOString()
      })
      messages.value.push({ 
        content: `⚠️ **调用出现异常**：${errorMsg}\n\n*提示：此报错信息已自动隔离，不会影响后续对话。*`, 
        sender: 'agent', 
        time: new Date().toISOString() 
      })
      saveJsonSetting('assistant-conversation', messages.value)
      await scrollToBottom()
    }
  } catch (outerErr) {
    console.error('[send] Fatal error in send flow:', outerErr)
  } finally {
    sending.value = false
  }
}

// 中断 / 停止生成当前请求
const stopGeneration = async () => {
  const reqId = currentRequestId.value
  console.log('[AgentWorkbench] User requested abort for:', reqId)
  if (reqId && typeof window.assistant?.abort === 'function') {
    try {
      await window.assistant.abort({ requestId: reqId })
    } catch (e) {
      console.warn('[AgentWorkbench] Failed to call assistant.abort:', e)
    }
  }

  sending.value = false

  // 移除加载状态
  for (let i = reactSteps.value.length - 1; i >= 0; i--) {
    const action = reactSteps.value[i]?.action || reactSteps.value[i]?.type
    if (action === 'loading') {
      reactSteps.value.splice(i, 1)
      break
    }
  }

  addReActStep({
    type: 'aborted',
    action: 'aborted',
    reasoning: '用户手动中止了本次生成',
    timestamp: new Date().toISOString()
  })

  // 如果最后一条助手消息为空或处于流式，补全提示
  const lastMsg = messages.value[messages.value.length - 1]
  if (lastMsg && lastMsg.sender === 'agent' && lastMsg.isStreaming) {
    lastMsg.isStreaming = false
    lastMsg.content = (lastMsg.content || '') + '\n\n*(已手动停止生成)*'
  }

  message.info('已停止生成')
  await scrollToBottom()
}

// 撤销/删除已创建的单条日记
const undoRecord = async (rec) => {
  if (!rec || !rec._id) return
  try {
    const res = await window.assistant?.deleteRecord?.(rec._id)
    if (res && res.success !== false) {
      rec.revoked = true
      message.success('已成功撤回并删除该条日记')
      saveJsonSetting('assistant-conversation', messages.value)
      // 触发跨组件事件通知日记列表刷新
      window.dispatchEvent(new CustomEvent('journal-data-updated'))
    } else {
      message.error(`撤销失败: ${res?.error || '未知错误'}`)
    }
  } catch (e) {
    message.error(`撤销异常: ${e.message}`)
  }
}

async function invoke(name) {
  clearReActSteps()
  addReActStep({ type: 'tool_calls', action: 'tool_calls', tools: [{ name }], timestamp: new Date().toISOString() })
  const res = await window.assistant?.invokeTool?.(name, {})
  if (res?.success) {
    addReActStep({ 
      type: 'tool_calls', 
      action: 'tool_calls', 
      reasoning: '工具调用完成',
      results: [{ name, result: res.data, success: true }],
      timestamp: new Date().toISOString()
    })
    messages.value.push({ content: '工具调用完成', sender: 'agent', time: new Date() })
    saveJsonSetting('assistant-conversation', messages.value)
  } else {
    addReActStep({ type: 'error', action: 'error', reasoning: `失败：${res?.error}`, timestamp: new Date().toISOString() })
    messages.value.push({ content: `失败：${res?.error}`, sender: 'agent', time: new Date() })
    saveJsonSetting('assistant-conversation', messages.value)
  }
}

function escapeHTML(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) }

// 复制到剪贴板
const copyToClipboard = async (content) => {
  try {
    // 移除 HTML 标签，提取纯文本
    const div = document.createElement('div')
    div.innerHTML = content
    const plainText = div.textContent || div.innerText || ''
    
    // 使用 Clipboard API 复制
    await navigator.clipboard.writeText(plainText)
    console.log('已复制到剪贴板')
    message.success('已复制到剪贴板')
  } catch (err) {
    console.error('复制失败:', err)
    // 降级方案：使用 execCommand
    try {
      const textarea = document.createElement('textarea')
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      console.log('已复制到剪贴板（降级方案）')
      message.success('已复制到剪贴板')
    } catch (fallbackErr) {
      console.error('复制失败（降级方案也失败）:', fallbackErr)
      message.error('复制失败，请重试')
    }
  }
}

const extractImageSrc = (text) => {
  const s = String(text || '')
  const md = s.match(/!\[[^\]]*?\]\((.*?)\)/)
  if (md && md[1]) return md[1].trim()
  const data = s.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/)
  if (data) return data[0]
  const url = s.match(/https?:\/\/[^\s)\"']+/)
  if (url) return url[0]
  return null
}

const hasImage = (content) => !!extractImageSrc(content)

const saveImageFromMessage = async (content) => {
  try {
    const src = extractImageSrc(content)
    if (!src) {
      message.error('未识别到图片')
      return
    }
    const res = await window.assistant?.saveImage?.({ src })
    if (res?.success && res?.filePath) {
      message.success(`已保存：${res.filePath}`)
      return
    }
    if (res?.canceled) {
      return
    }
    message.error(res?.error?.message || '保存失败')
  } catch (e) {
    message.error(e?.message || '保存失败')
  }
}

function handleKeyDown(e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // Shift + Enter: 允许默认换行行为
      return
    }
    // 普通 Enter: 阻止换行并触发发送
    e.preventDefault()
    if (!sending.value && input.value?.trim()) {
      send()
    }
  }
}

function formatThoughts(thoughts) {
  if (!thoughts) return ''
  return String(thoughts).replace(/\n/g, '<br>')
}

function formatPreviewContent(content) {
  if (!content) return ''
  const str = String(content).trim()
  if (/<(p|div|h[1-6]|ul|ol|blockquote)[\s>]/i.test(str)) {
    return str
  }
  return str.replace(/\n/g, '<br>')
}

/**
 * 流式渲染消息内容
 * @param {number} index - 消息索引
 * @param {string} text - 完整文本
 * @param {number} chunkSize - 每次渲染的字符数
 * @param {number} interval - 渲染间隔(毫秒)
 */
async function streamMessageContent(index, text, chunkSize = 80, interval = 60) {
  return new Promise((resolve) => {
    let cursor = 0
    const timer = setInterval(async () => {
      cursor = Math.min(text.length, cursor + chunkSize)
      messages.value[index].content = text.slice(0, cursor)
      await scrollToBottom()
      if (cursor >= text.length) { clearInterval(timer); resolve(null) }
    }, interval)
  })
}

defineExpose({
  loadSessions,
  switchSession,
  createNewSession,
  deleteSession,
  startRenameSession,
  sessions,
  currentSessionId,
  currentSessionTitle
})
</script>

<style scoped>
/* --- 1. 整体布局容器 --- */
.workbench {
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
}

.workbench-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 10px;
}

/* 左侧对话区 */
.chat-section {
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 右侧思维记录面板（常驻，精简宽度） */
.sidebar-section {
  width: 270px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
}

.sidebar-section :deep(.react-panel) {
  flex: 1;
  height: 100%;
  min-height: 0;
}

/* --- 2. 卡片样式 --- */
.panel {
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-card-bg);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-subtle, rgba(200, 174, 125, 0.35));
}

:deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.n-card__footer) {
  flex-shrink: 0;
  margin-top: auto;
  padding: 10px 14px;
  background: var(--bg-parchment-soft, rgba(0, 0, 0, 0.02));
  border-top: 1px solid var(--border-subtle, rgba(200, 174, 125, 0.2));
}

/* --- 3. 聊天结构 --- */
.chat-content {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 12px;
  /* 无闪烁滚动方案 - 默认隐藏 */
  opacity: 0;
  transition: opacity 0.2s ease-in;
}

.messages.visible {
  /* 布局就绪后显示 */
  opacity: 1;
}

/* --- 小鸡手账工作台欢迎区 Hero Welcome Card --- */
.hero-welcome-card {
  margin: 32px auto 20px auto;
  max-width: 680px;
  width: 100%;
  box-sizing: border-box;
  background: var(--color-card-bg, #ffffff);
  border: 1px solid var(--color-border, rgba(220, 226, 235, 0.6));
  border-radius: 20px;
  padding: 28px 24px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(12px);
  animation: fadeInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-avatar-wrapper {
  position: relative;
  width: 72px;
  height: 72px;
  margin: 0 auto 16px auto;
}

.hero-avatar-img {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(245, 166, 35, 0.28);
  object-fit: cover;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hero-avatar-wrapper:hover .hero-avatar-img {
  transform: scale(1.08) rotate(4deg);
}

.hero-online-status {
  position: absolute;
  bottom: 0px;
  right: 0px;
  width: 15px;
  height: 15px;
  background: #18a058;
  border: 3px solid var(--color-card-bg, #fff);
  border-radius: 50%;
}

.hero-title {
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
  letter-spacing: -0.3px;
}

.hero-subtitle {
  margin: 0 auto 24px auto;
  font-size: 13.5px;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.6;
  max-width: 500px;
}

.prompt-chips-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  text-align: left;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 680px) {
  .prompt-chips-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.prompt-chip-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-background-soft, rgba(243, 244, 246, 0.6));
  border: 1px solid var(--color-border, rgba(229, 231, 235, 0.8));
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.prompt-chip-card:hover {
  background: var(--color-bubble-agent, rgba(254, 249, 231, 0.8));
  border-color: #f5a623;
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(245, 166, 35, 0.15);
}

.chip-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.chip-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.chip-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #374151);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-text {
  font-size: 11.5px;
  color: var(--color-text-secondary, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

/* 气泡头部标识 */
.bubble-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
}

.bubble-header.user-header {
  justify-content: flex-end;
}

.bubble-agent-avatar {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  object-fit: cover;
}

.bubble-agent-name {
  font-weight: 600;
  color: #d97706;
}

.bubble-agent-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(245, 166, 35, 0.18);
  color: #b45309;
}

.bubble-user-name {
  font-size: 11px;
  opacity: 0.7;
  color: var(--color-text, #374151);
}

/* --- 4. 气泡 --- */
.bubble {
  max-width: 80%;
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  position: relative;
}

.bubble.agent {
  background: var(--color-bubble-agent);
  color: #2f3b52;
  border-top-left-radius: 4px;
}

.bubble.user {
  background: var(--color-bubble-user);
  color: #0b3419;
  margin-left: auto;
  border-top-right-radius: 4px;
}

.bubble-content {
  word-break: break-word;
  color: var(--color-text);
}

.time {
  font-size: 11px;
  opacity: 0.7;
  color: var(--color-text);
}

/* 气泡底部 */
.bubble-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  gap: 8px;
}

/* 气泡操作按钮组 */
.bubble-actions {
  display: flex;
  gap: 4px;
}

/* 操作按钮 */
.action-btn {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.action-btn:hover {
  opacity: 1;
}

.bubble:hover .action-btn {
  opacity: 0.8;
}

.thought-btn {
  border-radius: 999px;
  padding: 0 10px;
  height: 22px;
  font-weight: 600;
  letter-spacing: 0.5px;
  opacity: 0.9;
  background: linear-gradient(135deg, rgba(94, 129, 244, 0.18), rgba(30, 211, 198, 0.14));
  border: 1px solid rgba(94, 129, 244, 0.25);
  transition: transform 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
}

.thought-btn:hover {
  opacity: 1;
  transform: translateY(-1px);
  border-color: rgba(94, 129, 244, 0.45);
}

.bubble:hover .thought-btn {
  opacity: 1;
}

/* --- 5. 顶部会话工具栏 --- */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 2px 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.current-session-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 14px;
  max-width: 280px;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-btn {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.rename-btn:hover {
  opacity: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* --- 6. 会话列表抽屉 --- */
.session-drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.drawer-actions {
  flex-shrink: 0;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--n-border-color, rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--n-color, #fff);
}

.session-item:hover {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.04);
}

.session-item.active {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.08);
  font-weight: 500;
}

.session-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.session-item-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item-preview {
  font-size: 11px;
  opacity: 0.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item-meta {
  font-size: 10px;
  opacity: 0.45;
}

.session-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
  opacity: 0.7;
}

.session-item:hover .session-item-actions {
  opacity: 1;
}

.core-memory-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 日记记录预览卡片 */
.journal-records-container {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-preview-card {
  background: var(--color-background-soft, rgba(125, 125, 125, 0.08));
  border: 1px solid var(--color-border, rgba(140, 140, 160, 0.2));
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(8px);
  transition: all 0.25s ease;
}

.record-preview-card:hover {
  border-color: var(--color-button-primary, #2080f0);
}

.preview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.preview-project-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-button-primary, #2080f0);
  background: rgba(32, 128, 240, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid rgba(32, 128, 240, 0.18);
}

.preview-project-badge .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.preview-project-badge .duration-badge {
  font-size: 11px;
  font-weight: normal;
  opacity: 0.85;
}

.preview-time {
  font-size: 11px;
  color: var(--color-text-light, var(--n-text-color-3, #888));
}

.preview-card-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text, inherit);
  margin-bottom: 8px;
  padding: 8px 10px;
  background: rgba(125, 125, 125, 0.06);
  border: 1px solid rgba(125, 125, 125, 0.1);
  border-radius: 6px;
  word-break: break-word;
}

.preview-card-body :deep(p) {
  margin: 0 0 4px 0;
}

.preview-card-body :deep(p:last-child) {
  margin-bottom: 0;
}

.preview-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preview-status-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-success, #18a058);
}

.preview-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.preview-status-tip.is-revoked {
  color: var(--n-text-color-3, #999);
  text-decoration: line-through;
}

.preview-edit-btn,
.preview-undo-btn {
  font-size: 11px;
  padding: 0 8px;
}

/* 消息发送多行自适应输入框 */
.chat-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  width: 100%;
}

.chat-textarea {
  flex: 1;
}

.chat-textarea :deep(textarea) {
  max-height: 160px;
  line-height: 1.5;
  padding: 8px 12px;
  resize: none;
  font-family: inherit;
}

.chat-send-btn {
  height: 40px;
  min-width: 68px;
  flex-shrink: 0;
  border-radius: 6px;
  margin-bottom: 1px;
}

/* 便签暂存微标签 (轻量低认知负担) */
.memo-pills-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.memo-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: fit-content;
  padding: 4px 10px;
  background: rgba(240, 160, 32, 0.1);
  border: 1px dashed rgba(240, 160, 32, 0.4);
  border-radius: 14px;
  font-size: 12px;
  color: var(--n-text-color-2, #d97706);
  cursor: pointer;
  transition: all 0.2s ease;
}

.memo-pill:hover {
  background: rgba(240, 160, 32, 0.18);
  border-color: rgba(240, 160, 32, 0.7);
  transform: translateY(-1px);
}

.memo-pill-icon {
  color: #f0a020;
  flex-shrink: 0;
}

.memo-pill-topic {
  font-weight: 500;
}

.memo-pill-hint {
  font-size: 11px;
  opacity: 0.75;
  margin-left: 2px;
}

/* 便签盒抽屉样式 */
.memo-drawer-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.memo-header-title {
  font-size: 16px;
  font-weight: 600;
}

.memo-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.memo-drawer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--n-border-color, rgba(125, 125, 125, 0.15));
}

.memo-list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 150px);
  padding-right: 4px;
}

.memo-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: var(--n-text-color-3, #888);
}

.memo-empty-state .empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.memo-empty-state .empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
}

.memo-empty-state .empty-sub {
  font-size: 12px;
  max-width: 280px;
  line-height: 1.5;
  opacity: 0.8;
}

.memo-card-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--n-color-embedded, rgba(125, 125, 125, 0.05));
  border: 1px solid var(--n-border-color, rgba(125, 125, 125, 0.15));
  border-radius: 8px;
  transition: all 0.2s ease;
}

.memo-card-item:hover {
  border-color: rgba(240, 160, 32, 0.5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.memo-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.memo-topic-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.memo-topic-tag {
  font-size: 13px;
  font-weight: 600;
  color: var(--n-text-color, inherit);
}

.memo-project-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(125, 125, 125, 0.1);
  color: var(--n-text-color-2, #666);
}

.memo-status-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.memo-date {
  font-size: 11px;
  color: var(--n-text-color-3, #999);
}

.memo-card-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--n-text-color-1, inherit);
  white-space: pre-wrap;
  word-break: break-word;
}

.memo-quotes-box {
  padding: 6px 10px;
  background: rgba(240, 160, 32, 0.06);
  border-left: 3px solid #f0a020;
  border-radius: 0 4px 4px 0;
  font-size: 12px;
}

.memo-quotes-box .quote-title {
  font-size: 11px;
  color: #d97706;
  margin-bottom: 2px;
}

.memo-quotes-box .quote-item {
  font-style: italic;
  color: var(--n-text-color-2, #666);
  line-height: 1.4;
}

.memo-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed rgba(125, 125, 125, 0.1);
}

.memo-time-meta {
  font-size: 11px;
  color: var(--n-text-color-3, #999);
}

.memo-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 今日便签切片流预览栏 */
.today-memos-bar {
  margin-bottom: 8px;
  padding: 8px 12px;
  background: var(--color-background-soft, rgba(125, 125, 125, 0.05));
  border: 1px solid var(--color-border, rgba(140, 140, 160, 0.15));
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.today-memos-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.today-memos-bar-header .bar-title {
  font-weight: 600;
  color: #10b981;
}

.today-memos-bar-header .bar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.today-memos-bar-header .bar-divider {
  opacity: 0.3;
}

.today-memos-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.today-memo-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 3px 8px;
  background: var(--color-background, rgba(255, 255, 255, 0.7));
  border: 1px solid var(--color-border, rgba(140, 140, 160, 0.2));
  border-radius: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.today-memo-chip:hover {
  border-color: #10b981;
  transform: translateY(-1px);
}

.today-memo-chip .chip-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.today-memo-chip .chip-topic {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.today-memo-chip .chip-preview {
  font-size: 11px;
  opacity: 0.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .sidebar-section {
    width: 240px;
  }
}

@media (max-width: 768px) {
  .workbench-layout {
    flex-direction: column;
  }
  
  .sidebar-section {
    width: 100%;
    height: 250px;
  }
}
</style>
