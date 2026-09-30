<template>
  <div class="explore-page">
    <div class="explore-layout">
      <!-- Left: Q&A Area -->
      <div class="qa-area">
        <div class="scope-bar">
          <ScopeDisplay :scope="currentScope" />
        </div>

        <div class="messages">
          <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
            <div v-if="msg.role === 'user'" class="user-message">{{ msg.content }}</div>
            <div v-else class="assistant-message">
              <MarkdownRenderer v-if="msg.result" :content="msg.result.answer" />
              <!-- Evidence-driven stat cards from EvidencePack metrics -->
              <StatCard
                v-if="msg.result?.evidencePackId && currentMetrics.length > 0"
                :metrics="currentMetrics"
              />
              <div v-if="msg.result?.followUps?.length" class="followups">
                <FollowUpSuggestions
                  :suggestions="msg.result.followUps"
                  @select="askQuestion"
                />
              </div>
            </div>
          </div>
          <div v-if="loading" class="loading-indicator">
            <n-spin size="small" />
            <span>Exploring...</span>
          </div>
        </div>

        <div class="input-area">
          <n-input
            v-model:value="question"
            type="textarea"
            placeholder="Ask about your journal... (e.g. 'How was my mood this week?')"
            :autosize="{ minRows: 1, maxRows: 4 }"
            @keydown.enter.excel="handleAsk"
          />
          <n-button type="primary" :loading="loading" @click="handleAsk">
            Ask
          </n-button>
        </div>
      </div>

      <!-- Right: Evidence Panel -->
      <div class="evidence-area">
        <EvidencePanel :evidence="currentEvidence" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { NInput, NButton, NSpin, useMessage } from 'naive-ui'
import MarkdownRenderer from '../../components/MarkdownRenderer.vue'
import ScopeDisplay from './ScopeDisplay.vue'
import EvidencePanel from './EvidencePanel.vue'
import FollowUpSuggestions from './FollowUpSuggestions.vue'
import StatCard from './StatCard.vue'

const message = useMessage()
const question = ref('')
const loading = ref(false)
const messages = ref([])
const currentSessionId = ref(null)
const currentScope = ref({})
const currentEvidence = ref([])
const currentMetrics = ref([])

async function handleAsk() {
  const q = question.value.trim()
  if (!q || loading.value) return

  loading.value = true
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: q,
  })

  try {
    let result
    if (!currentSessionId.value) {
      // Start new inquiry
      const res = await window.inquiry.inquiryStart(q, currentScope.value)
      if (res.success && res.data) {
        currentSessionId.value = res.data.sessionId
        result = res.data
      } else {
        throw new Error(res.error || 'Failed to start inquiry')
      }
    } else {
      // Follow-up
      const res = await window.inquiry.inquiryFollowUp(currentSessionId.value, q, {})
      if (res.success && res.data) {
        result = res.data
      } else {
        throw new Error(res.error || 'Failed to follow up')
      }
    }

    // Update evidence and metrics from EvidencePack
    if (result.evidencePackId) {
      const packRes = await window.inquiry.inquiryGetEvidencePack(result.evidencePackId)
      if (packRes.success && packRes.data) {
        currentEvidence.value = packRes.data.evidence || []
        currentMetrics.value = packRes.data.metrics || []
      }
    }

    messages.value.push({
      id: Date.now() + 1,
      role: 'assistant',
      content: result.answer,
      result,
    })

    question.value = ''
  } catch (error) {
    message.error(error.message || 'Exploration failed')
    messages.value.push({
      id: Date.now() + 1,
      role: 'assistant',
      content: `Error: ${error.message}`,
    })
  } finally {
    loading.value = false
  }
}

async function askQuestion(suggestion) {
  question.value = suggestion
  await handleAsk()
}
</script>

<style scoped>
.explore-page { height: 100vh; display: flex; flex-direction: column; }
.explore-layout { display: flex; flex: 1; overflow: hidden; }
.qa-area { flex: 2; display: flex; flex-direction: column; padding: 16px; }
.evidence-area { flex: 1; border-left: 1px solid #eee; overflow: auto; }
.scope-bar { margin-bottom: 8px; }
.messages { flex: 1; overflow: auto; margin-bottom: 12px; }
.message { margin-bottom: 12px; }
.user-message {
  background: #2080f0;
  color: white;
  padding: 8px 12px;
  border-radius: 8px 8px 0 8px;
  max-width: 80%;
  margin-left: auto;
}
.assistant-message { max-width: 90%; }
.followups { margin-top: 8px; }
.loading-indicator { display: flex; align-items: center; gap: 8px; color: #999; }
.input-area { display: flex; gap: 8px; align-items: flex-end; }
</style>
