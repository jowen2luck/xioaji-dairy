/**
 * 图表配置中心
 * 集中管理各图表的阈值、颜色、展示条件等配置
 */

// ============== 共振分析配置 ==============
export const resonanceConfig = {
  // 能量阈值：用于判断赋能者/消耗者
  boosterThreshold: 6,      // 平均能量 >= 此值为赋能者
  drainerThreshold: 4,      // 平均能量 <= 此值为消耗者
  minOccurrences: 2,        // 最少出现次数才纳入统计
  topN: 5,                  // 榜单展示数量
  
  // 颜色配置
  colors: {
    booster: '#52c41a',
    drainer: '#ff4d4f'
  }
}

// ============== 四象限状态配置 ==============
export const quadrantConfig = {
  // 能量/掌控感分界线（固定值）
  // 如果设为 null，则使用动态中位数
  energyMidpoint: null,     // null 表示使用动态中位数，或设为固定值如 5.5
  agencyMidpoint: null,     // null 表示使用动态中位数，或设为固定值如 0
  
  // 数据范围
  energyRange: { min: 0, max: 10 },
  agencyRange: { min: -5, max: 5 },
  
  // 四象限颜色
  colors: {
    flow: '#52c41a',       // 心流区（高能量+高掌控）- 绿色
    relax: '#1890ff',      // 松弛区（低能量+高掌控）- 蓝色
    fight: '#faad14',      // 战斗区（高能量+低掌控）- 橙色
    helpless: '#ff4d4f'    // 无力区（低能量+低掌控）- 红色
  },
  
  // 象限名称
  labels: {
    flow: '心流区',
    relax: '松弛区',
    fight: '战斗区',
    helpless: '无力区'
  }
}

// ============== 热力图配置 ==============
export const heatmapConfig = {
  // 记录频率分级（GitHub风格绿色）
  pieces: [
    { min: 0, max: 0, label: '无', color: 'dividerColor' },   // 特殊标记，运行时替换为主题色
    { min: 1, max: 2, label: '1-2', color: '#0e4429' },
    { min: 3, max: 5, label: '3-5', color: '#006d32' },
    { min: 6, max: 10, label: '6-10', color: '#26a641' },
    { min: 11, label: '10+', color: '#39d353' }
  ]
}

// ============== 能量气象站配置 ==============
export const energyWeatherConfig = {
  // 生理状态阈值
  physicalStateMinDisplay: 5,    // 至少达到多少百分比才显示

  // 情绪价值分类
  emotionCategories: {
    positive: { label: '积极', color: '#52c41a' },
    neutral: { label: '中性', color: '#faad14' },
    negative: { label: '消极', color: '#ff4d4f' }
  }
}

// ============== 需求金字塔配置 ==============
export const pyramidConfig = {
  // 马斯洛需求层级（从底层到顶层）
  standardLevels: [
    '生理需求',
    '安全需求',
    '爱与归属',
    '尊重与认可',
    '自我实现'
  ],
  
  // 层级颜色（从底层到顶层渐变）
  colors: [
    '#ff7875',  // 生理需求 - 红
    '#ffa940',  // 安全需求 - 橙
    '#ffd666',  // 爱与归属 - 黄
    '#95de64',  // 尊重与认可 - 绿
    '#5cdbd3'   // 自我实现 - 青
  ]
}

// ============== 时空锚点配置 ==============
export const temporalAnchorConfig = {
  // 时间取向分类
  orientations: {
    past: {
      label: '过去取向',
      color: '#8c8c8c',
      icon: 'history'
    },
    present: {
      label: '当下取向',
      color: '#52c41a',
      icon: 'today'
    },
    future: {
      label: '未来取向',
      color: '#1890ff',
      icon: 'future'
    }
  }
}

// ============== 因果链路配置 ==============
export const causalityConfig = {
  // 情绪类型
  emotionTypes: ['焦虑', '愤怒', '悲伤', '喜悦', '平静'],
  
  // 默认选中的情绪
  defaultEmotion: '焦虑'
}

// ============== 通用图表配置 ==============
export const commonConfig = {
  // 数据加载配置
  defaultLimit: 500,          // 默认加载记录数
  maxLimit: 1000,             // 最大加载记录数
  
  // 动画配置
  animationDuration: 300,
  
  // 空状态配置
  emptyText: '暂无数据'
}

export default {
  resonance: resonanceConfig,
  quadrant: quadrantConfig,
  heatmap: heatmapConfig,
  energyWeather: energyWeatherConfig,
  pyramid: pyramidConfig,
  temporalAnchor: temporalAnchorConfig,
  causality: causalityConfig,
  common: commonConfig
}

const SETTINGS_KEY = 'charts'
const LS_KEY = 'charts-config'

export function getDefaultChartsConfig() {
  return {
    resonance: resonanceConfig,
    quadrant: quadrantConfig,
    heatmap: heatmapConfig,
    energyWeather: energyWeatherConfig,
    pyramid: pyramidConfig,
    temporalAnchor: temporalAnchorConfig,
    causality: causalityConfig,
    common: commonConfig
  }
}

export function loadChartsConfig() {
  const ipc = globalThis?.electron?.ipcRenderer

  const readFromFile = () => {
    try {
      if (!ipc?.sendSync) return null
      return ipc.sendSync('settings:get-sync', SETTINGS_KEY)
    } catch {
      return null
    }
  }

  const tryMigrateFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (ipc?.sendSync) {
        ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: parsed })
        localStorage.removeItem(LS_KEY)
      }
      return parsed
    } catch {
      return null
    }
  }

  try {
    const persisted = readFromFile() ?? tryMigrateFromLocalStorage()
    if (persisted) {
      const parsed = persisted || {}
      return {
        resonance: { ...resonanceConfig, ...(parsed.resonance || {}) },
        quadrant: { ...quadrantConfig, ...(parsed.quadrant || {}) },
        heatmap: { ...heatmapConfig, ...(parsed.heatmap || {}) },
        energyWeather: { ...energyWeatherConfig, ...(parsed.energyWeather || {}) },
        pyramid: { ...pyramidConfig, ...(parsed.pyramid || {}) },
        temporalAnchor: { ...temporalAnchorConfig, ...(parsed.temporalAnchor || {}) },
        causality: { ...causalityConfig, ...(parsed.causality || {}) },
        common: { ...commonConfig, ...(parsed.common || {}) }
      }
    }
  } catch (e) {
    console.warn('加载图表配置失败，使用默认配置', e)
  }
  return getDefaultChartsConfig()
}

export function saveChartsConfig(config) {
  const ipc = globalThis?.electron?.ipcRenderer
  let plainConfig = config
  try {
    // 移除 Vue 的 Proxy 代理，避免触发 "An object could not be cloned." 错误
    plainConfig = JSON.parse(JSON.stringify(config))
  } catch (e) {
    console.warn('转换为普通对象失败:', e)
  }
  
  try {
    if (ipc?.sendSync) {
      ipc.sendSync('settings:set-sync', { key: SETTINGS_KEY, value: plainConfig })
      return
    }
  } catch (e) {
    console.error('保存图表配置失败', e)
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(plainConfig))
  } catch (e) {
    console.error('保存图表配置失败', e)
  }
}
