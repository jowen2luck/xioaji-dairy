<template>
  <n-drawer v-model:show="showDrawer" :width="460" placement="right">
    <n-drawer-content title="小鸡心智与认知画布" closable>
      <template #header>
        <div class="drawer-header-wrap">
          <span class="drawer-title">🌱 小鸡心智与认知画布</span>
          <n-tag size="small" type="primary" round :bordered="false">
            {{ memories.length }} 条长效记忆
          </n-tag>
        </div>
      </template>

      <div class="canvas-container">
        <!-- 导语与说明 -->
        <n-alert type="info" :show-icon="false" class="canvas-intro">
          这是小鸡在日常倾诉与对话中自动提炼出的关于您的生活事实与认知。每一条记忆都有据可查，您可在此随时修正或删除错误认知。
        </n-alert>

        <!-- 搜索与操作栏 -->
        <div class="canvas-search-bar">
          <n-input
            v-model:value="searchKeyword"
            placeholder="搜索小鸡记下的事实..."
            clearable
            size="small"
          >
            <template #prefix>🔍</template>
          </n-input>
          <n-button size="small" quaternary @click="loadMemories">
            刷新
          </n-button>
        </div>

        <!-- 记忆卡片流 -->
        <div v-if="loading" class="canvas-loading">
          <n-spin size="medium" />
        </div>

        <div v-else-if="filteredMemories.length === 0" class="canvas-empty">
          <div class="empty-icon">🍃</div>
          <div class="empty-text">暂无相关认知记录</div>
          <div class="empty-sub">和小鸡多聊聊天，小鸡会在对话自然空闲时沉淀深层记忆～</div>
        </div>

        <div v-else class="canvas-list">
          <div v-for="item in filteredMemories" :key="item.id" class="memory-card">
            <div class="memory-card-header">
              <div class="memory-meta">
                <n-tag :type="getCategoryTagType(item.category)" size="tiny" round :bordered="false">
                  {{ formatCategory(item.category) }}
                </n-tag>
                <span class="memory-time">{{ formatTime(item.createdAt) }}</span>
              </div>
              <div class="memory-ops">
                <n-button 
                  v-if="editingId !== item.id"
                  size="tiny" 
                  quaternary 
                  @click="startEdit(item)"
                >
                  编辑
                </n-button>
                <n-popconfirm @positive-click="deleteMemory(item.id)" positive-text="遗忘" negative-text="取消">
                  <template #trigger>
                    <n-button size="tiny" quaternary type="error">
                      遗忘
                    </n-button>
                  </template>
                  确认让小鸡彻底遗忘这条事实吗？
                </n-popconfirm>
              </div>
            </div>

            <!-- 卡片主体：展示模式或编辑模式 -->
            <div v-if="editingId === item.id" class="memory-edit-mode">
              <n-input
                v-model:value="editContent"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                size="small"
              />
              <div class="edit-actions">
                <n-button size="tiny" type="primary" @click="saveEdit(item.id)">保存修正</n-button>
                <n-button size="tiny" quaternary @click="cancelEdit">取消</n-button>
              </div>
            </div>
            <div v-else class="memory-card-content" @dblclick="startEdit(item)" title="双击可直接更正">
              {{ item.content }}
            </div>
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'memory-changed'])

const message = useMessage()
const showDrawer = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const memories = ref([])
const loading = ref(false)
const searchKeyword = ref('')
const editingId = ref(null)
const editContent = ref('')

const loadMemories = async () => {
  if (!window.assistant?.coreMemory?.listEpisodic) return
  loading.value = true
  try {
    const list = await window.assistant.coreMemory.listEpisodic()
    memories.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载小鸡心智记忆失败:', e)
  } finally {
    loading.value = false
  }
}

const filteredMemories = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return memories.value
  return memories.value.filter(m => 
    String(m.content || '').toLowerCase().includes(kw) ||
    String(m.category || '').toLowerCase().includes(kw)
  )
})

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${date} ${hour}:${min}`
}

const formatCategory = (cat) => {
  switch (cat) {
    case 'habit': return '习惯'
    case 'preference': return '偏好'
    case 'relation': return '人际'
    default: return '事实'
  }
}

const getCategoryTagType = (cat) => {
  switch (cat) {
    case 'habit': return 'warning'
    case 'preference': return 'info'
    case 'relation': return 'success'
    default: return 'default'
  }
}

const deleteMemory = async (id) => {
  try {
    const success = await window.assistant?.coreMemory?.invalidateEpisodic(id, 'user_deleted')
    if (success) {
      memories.value = memories.value.filter(m => m.id !== id)
      message.success('小鸡已遗忘此条事实')
      emit('memory-changed')
    } else {
      message.error('删除失败')
    }
  } catch (err) {
    message.error('操作异常: ' + err.message)
  }
}

const startEdit = (item) => {
  editingId.value = item.id
  editContent.value = item.content
}

const cancelEdit = () => {
  editingId.value = null
  editContent.value = ''
}

const saveEdit = async (id) => {
  const text = editContent.value.trim()
  if (!text) {
    message.warning('记忆内容不能为空')
    return
  }
  try {
    const success = await window.assistant?.coreMemory?.editEpisodic(id, text)
    if (success) {
      const idx = memories.value.findIndex(m => m.id === id)
      if (idx !== -1) {
        memories.value[idx].content = text
      }
      message.success('已修正小鸡的认知')
      cancelEdit()
      emit('memory-changed')
    } else {
      message.error('更新失败')
    }
  } catch (err) {
    message.error('保存异常: ' + err.message)
  }
}

onMounted(() => {
  loadMemories()
})

defineExpose({
  loadMemories
})
</script>

<style scoped>
.drawer-header-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-title {
  font-weight: 600;
  font-size: 15px;
}

.canvas-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.canvas-intro {
  font-size: 12px;
  line-height: 1.6;
}

.canvas-search-bar {
  display: flex;
  gap: 8px;
}

.canvas-loading, .canvas-empty {
  padding: 40px 0;
  text-align: center;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-text {
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.empty-sub {
  font-size: 12px;
  color: #999;
}

.canvas-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.memory-card {
  border: 1px solid var(--n-border-color, #e0e0e0);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--n-card-color, #fafafa);
  transition: all 0.2s ease;
}

.memory-card:hover {
  border-color: #f5a623;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.memory-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.memory-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.memory-time {
  font-size: 11px;
  color: #999;
}

.memory-ops {
  display: flex;
  gap: 4px;
}

.memory-card-content {
  font-size: 13px;
  line-height: 1.5;
  color: #333;
  cursor: pointer;
}

.memory-edit-mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
