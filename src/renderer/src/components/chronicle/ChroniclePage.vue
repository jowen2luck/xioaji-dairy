<template>
  <div class="chronicle-layout">
    <aside class="book-spine">
      <div 
        class="spine-year" 
        :class="{ 'is-selecting': isYearSelectionMode }"
        @click="toggleYearSelection"
        title="Switch Year"
      >
        <span class="year-text">{{ currentYear }}</span>
        <span class="year-indicator">▾</span>
      </div>

      <Transition name="fade-list" mode="out-in">
        <div v-if="isYearSelectionMode" class="spine-years">
          <div 
            v-for="year in availableYears" 
            :key="year"
            class="year-tick"
            :class="{ 'is-active': currentYear === year }"
            @click="selectYear(year)"
          >
            <span class="tick-label">{{ year }}</span>
            <div class="tick-indicator"></div>
          </div>
        </div>

        <div v-else class="spine-months">
          <div 
            v-for="m in 12" 
            :key="m"
            class="month-tick"
            :class="{ 'is-active': currentMonth === m }"
            @click="handleMonthChange(m)"
          >
            <span class="tick-label">{{ getMonthAbbr(m) }}</span>
            <div class="tick-indicator"></div>
          </div>
        </div>
      </Transition>

    </aside>

    <main class="chronicle-main" ref="scrollContainer">
      <n-spin :show="loading">
        <Transition name="fade-chapter" mode="out-in">
          <div :key="currentMonth" class="chapter-container">
            
            <section class="chapter-header">
              <MonthlyDashboard 
                :records="monthlyRecords"
                :month="currentMonth"
                :year="currentYear"
                @select-date="scrollToEntry"
              />
            </section>
            
            <div class="chapter-divider">
              <span class="divider-icon">✦</span>
            </div>

            <section class="chapter-content">
              <div v-if="monthlyRecordsWithSummaries.length === 0" class="empty-month">
                本月无记录
              </div>
              <div v-else class="entries-flow">
                <template v-for="(item, index) in monthlyRecordsWithSummaries" :key="item._id">
                  <!-- 总结卡片 -->
                  <div v-if="item._type === 'summary'" class="entry-wrapper summary-wrapper">
                    <SummaryCard :summary="item" />
                  </div>
                  <!-- 普通日记 -->
                  <div 
                    v-else
                    :id="`entry-${item.time}`" 
                    class="entry-wrapper"
                  >
                    <DiaryPageLayout
                      :record="item"
                      :page-number="getRecordPageNumber(item, index)"
                      :total-pages="monthlyRecords.length"
                    />
                  </div>
                </template>
              </div>
            </section>

          </div>
        </Transition>
      </n-spin>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import MonthlyDashboard from './MonthlyDashboard.vue'
import DiaryPageLayout from './DiaryPageLayout.vue'
import SummaryCard from './SummaryCard.vue'

// State
const loading = ref(false)
const allData = ref([])
const summaries = ref([])
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const scrollContainer = ref(null)
const isYearSelectionMode = ref(false)

// Computed
const availableYears = computed(() => {
  const years = new Set(allData.value.map(record => {
    return record._meta_year || new Date(record.time).getFullYear()
  }))
  years.add(new Date().getFullYear()) // Ensure current year exists
  return Array.from(years).sort((a, b) => b - a)
})

const monthlyRecords = computed(() => {
  return allData.value
    .filter(record => {
      const year = record._meta_year || new Date(record.time).getFullYear()
      const month = record._meta_month || new Date(record.time).getMonth() + 1
      return year === currentYear.value && month === currentMonth.value
    })
    .sort((a, b) => new Date(a.time) - new Date(b.time))
})

// 将总结插入到记录流中
const monthlyRecordsWithSummaries = computed(() => {
  const records = [...monthlyRecords.value]
  
  // 获取该月的周总结
  const weeklySummaries = summaries.value.filter(s => 
    s._summary_type === 'weekly' &&
    s._summary_period?.year === currentYear.value &&
    s._summary_period?.month === currentMonth.value
  ).sort((a, b) => a._summary_period.week - b._summary_period.week)
  
  // 获取该月的月总结
  const monthlySummary = summaries.value.find(s =>
    s._summary_type === 'monthly' &&
    s._summary_period?.year === currentYear.value &&
    s._summary_period?.month === currentMonth.value
  )
  
  // 构建最终列表：记录 + 周总结（按周插入）+ 月总结（末尾）
  const result = []
  let currentWeek = 0
  
  for (const record of records) {
    const recordDate = new Date(record.time)
    const recordWeek = getWeekNumber(recordDate)
    
    // 如果进入新的一周，先插入上一周的总结
    if (recordWeek > currentWeek && currentWeek > 0) {
      const weekSummary = weeklySummaries.find(s => s._summary_period.week === currentWeek)
      if (weekSummary) {
        result.push(weekSummary)
      }
    }
    
    currentWeek = recordWeek
    result.push(record)
  }
  
  // 插入最后一周的总结
  if (currentWeek > 0) {
    const lastWeekSummary = weeklySummaries.find(s => s._summary_period.week === currentWeek)
    if (lastWeekSummary) {
      result.push(lastWeekSummary)
    }
  }
  
  // 最后插入月总结
  if (monthlySummary) {
    result.push(monthlySummary)
  }
  
  return result
})

// 获取记录所属的周数 (ISO 周)
const getWeekNumber = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

// 计算普通记录的页码（排除总结）
const getRecordPageNumber = (record, index) => {
  let pageNum = 0
  for (let i = 0; i <= index; i++) {
    if (monthlyRecordsWithSummaries.value[i]._type !== 'summary') {
      pageNum++
    }
  }
  return pageNum
}

const monthName = computed(() => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return months[currentMonth.value - 1]
})

// Methods
const toggleYearSelection = () => {
  isYearSelectionMode.value = !isYearSelectionMode.value
}

const selectYear = (year) => {
  if (currentYear.value === year) {
    isYearSelectionMode.value = false
    return
  }
  currentYear.value = year
  isYearSelectionMode.value = false
}

const handleMonthChange = (month) => {
  if (currentMonth.value === month) return
  currentMonth.value = month
  
  // Force scroll to top when switching months
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })
}

const getMonthAbbr = (month) => {
  const abbrs = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return abbrs[month - 1]
}

const scrollToEntry = (time) => {
  nextTick(() => {
    const el = document.getElementById(`entry-${time}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

const loadData = async () => {
  if (!window.electron?.ipcRenderer) return
  
  try {
    loading.value = true
    
    // 并行加载日记数据和总结数据
    const [data, summaryData] = await Promise.all([
      window.electron.ipcRenderer.invoke('etl:get-enriched-data'),
      window.electron.ipcRenderer.invoke('summary:get-all')
    ])
    
    if (data && !data.error) {
      allData.value = data
    }
    
    if (summaryData && !summaryData.error && Array.isArray(summaryData)) {
      summaries.value = summaryData
      console.log(`[ChroniclePage] Loaded ${summaryData.length} summaries`)
    }
  } catch (error) {
    console.error('[ChroniclePage] Failed to load data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.chronicle-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-parchment, #fdfbf7);
  color: var(--text-ink, #2c3e50);
  font-family: 'Lato', sans-serif;
}

/* === 书脊侧栏 === */
.book-spine {
  width: 72px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  user-select: none;
}

.spine-year {
  margin-bottom: 40px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: opacity 0.2s;
}

.spine-year:hover {
  opacity: 0.8;
}

.year-indicator {
  font-size: 12px;
  color: var(--accent-gold, #c8ae7d);
  transition: transform 0.3s ease;
  height: 12px;
  line-height: 12px;
}

.spine-year.is-selecting .year-indicator {
  transform: rotate(180deg);
}

.year-text {
  writing-mode: vertical-rl;
  font-family: 'Playfair Display', serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 4px;
  color: var(--accent-gold, #c8ae7d);
  transform: rotate(180deg);
}

.spine-months,
.spine-years {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}

.month-tick,
.year-tick {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted, #9ca3af);
  transition: all 0.3s ease;
}

.month-tick:hover,
.year-tick:hover {
  color: var(--text-main, #374151);
}

.tick-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.month-tick.is-active,
.year-tick.is-active {
  color: var(--text-ink, #1f2937);
}

.tick-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: var(--accent-gold, #c8ae7d);
  transition: height 0.3s ease;
}

.month-tick.is-active .tick-indicator,
.year-tick.is-active .tick-indicator {
  height: 20px;
}

/* 列表切换动画 */
.fade-list-enter-active,
.fade-list-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-list-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.fade-list-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.spine-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  transition: all 0.2s;
}

.view-btn:hover {
  background: rgba(0,0,0,0.03);
  color: var(--text-main, #374151);
}

.view-btn.active {
  background: var(--text-ink, #2c3e50);
  color: #fff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.chronicle-main {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: 0;
}

.chapter-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 60px 40px 100px;
}

.chapter-header {
  margin-bottom: 0;
}

/* 装饰分割线 */
.chapter-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 60px 0;
  color: var(--accent-gold, #c8ae7d);
  opacity: 0.6;
}

.chapter-divider::before,
.chapter-divider::after {
  content: "";
  height: 1px;
  width: 100px;
  background: currentColor;
  margin: 0 16px;
}

.divider-icon {
  font-size: 20px;
}

.chapter-content {
  margin-top: 0;
}

.empty-month {
  text-align: center;
  padding: 100px;
  font-family: 'Playfair Display', serif;
  font-style: italic;
  color: var(--text-muted, #9ca3af);
  font-size: 16px;
}

.entries-flow {
  display: flex;
  flex-direction: column;
  gap: 60px;
}

.entry-wrapper {
  scroll-margin-top: 80px;
}

/* 章节切换动画 */
.fade-chapter-enter-active,
.fade-chapter-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.fade-chapter-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-chapter-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
