<template>
  <div class="reviews-page">
    <div class="reviews-header">
      <n-h2>Reviews</n-h2>
      <n-space>
        <n-select
          v-model:value="selectedRecipe"
          :options="recipeOptions"
          placeholder="Recipe"
          style="width: 120px"
          size="small"
        />
        <n-button type="primary" size="small" :loading="generating" @click="generateReview">
          Generate Now
        </n-button>
      </n-space>
    </div>

    <div v-if="loading" class="loading-container">
      <n-spin size="medium" />
    </div>

    <div v-else-if="artifacts.length === 0" class="empty-container">
      <n-empty description="No reviews yet. Generate your first review!">
        <template #extra>
          <n-button size="small" @click="generateReview">Generate Weekly Review</n-button>
        </template>
      </n-empty>
    </div>

    <div v-else class="reviews-list">
      <n-card
        v-for="artifact in artifacts"
        :key="artifact.id"
        size="small"
        hoverable
        class="review-card"
        @click="selectArtifact(artifact)"
      >
        <template #header>
          <div class="review-card-header">
            <n-tag :type="recipeTagType(artifact.recipe)" size="small">
              {{ artifact.recipe }}
            </n-tag>
            <span class="review-date">{{ formatDate(artifact.savedAt || artifact.generatedAt) }}</span>
          </div>
        </template>
        <div class="review-preview">
          <n-space :size="16">
            <n-statistic label="Evidence" :value="artifact.evidencePack?.evidence?.length || 0" />
            <n-statistic label="Metrics" :value="artifact.evidencePack?.metrics?.length || 0" />
          </n-space>
        </div>
      </n-card>
    </div>

    <!-- Detail Modal -->
    <n-modal v-model:show="showDetail" preset="card" style="width: 800px; max-height: 80vh">
      <template #header>
        <n-tag :type="recipeTagType(selectedArtifact?.recipe)" size="medium">
          {{ selectedArtifact?.recipe }} Review
        </n-tag>
      </template>
      <div v-if="selectedArtifact" class="review-detail">
        <MarkdownRenderer :content="selectedArtifact.result?.answer" />
        <n-divider />
        <div class="evidence-summary">
          <n-h4>Evidence ({{ selectedArtifact.evidencePack?.evidence?.length || 0 }} entries)</n4>
          <div v-for="ev in (selectedArtifact.evidencePack?.evidence || []).slice(0, 5)" :key="ev.id" class="evidence-line">
            <n-tag size="small">{{ ev.occurredAt?.slice(0, 10) }}</n-tag>
            <span>{{ ev.excerpt }}</span>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { NH2, NCard, NButton, NSelect, NSpin, NEmpty, NSpace, NTag, NStatistic, NDivider, NH4, NModal, useMessage } from 'naive-ui'

const message = useMessage()
const loading = ref(false)
const generating = ref(false)
const artifacts = ref([])
const selectedRecipe = ref('weekly')
const showDetail = ref(false)
const selectedArtifact = ref(null)

const recipeOptions = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
]

function recipeTagType(recipe) {
  const map = { weekly: 'success', monthly: 'info', yearly: 'warning' }
  return map[recipe] || 'default'
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown'
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

async function loadArtifacts() {
  loading.value = true
  try {
    const res = await window.inquiry.reviewList(selectedRecipe.value, 20)
    if (res.success) {
      artifacts.value = res.data || []
    }
  } catch (error) {
    console.error('[ReviewsPage] Load error:', error)
  } finally {
    loading.value = false
  }
}

async function generateReview() {
  generating.value = true
  try {
    const res = await window.inquiry.reviewGenerate(selectedRecipe.value)
    if (res.success) {
      message.success(`${selectedRecipe.value} review generated`)
      await loadArtifacts()
    } else {
      throw new Error(res.error || 'Generation failed')
    }
  } catch (error) {
    message.error(error.message)
  } finally {
    generating.value = false
  }
}

function selectArtifact(artifact) {
  selectedArtifact.value = artifact
  showDetail.value = true
}

onMounted(loadArtifacts)
watch(selectedRecipe, loadArtifacts)
</script>

<style scoped>
.reviews-page { padding: 20px; max-width: 1200px; margin: 0 auto; }
.reviews-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.loading-container, .empty-container { padding: 60px 0; text-align: center; }
.reviews-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.review-card { cursor: pointer; transition: transform 0.2s; }
.review-card:hover { transform: translateY(-2px); }
.review-card-header { display: flex; justify-content: space-between; align-items: center; }
.review-date { font-size: 12px; color: #999; }
.review-preview { margin-top: 8px; }
.review-detail { max-height: 70vh; overflow: auto; }
.evidence-summary { margin-top: 12px; }
.evidence-line { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
</style>
