export default {
  load_data: {
    summary: '模拟：已加载本地数据，共 128 条记录，涉及 6 个项目',
    sample: [{ shanggexiangmu: '项目A', ganshou: '进展顺利', chixushijian: '1小时20分钟', time: '2025-10-01T10:12:00Z' }]
  },
  analyze_data: {
    summary: {
      totalRecords: 128,
      totalProjects: 6,
      projects: ['项目A','项目B','项目C','项目D','项目E','项目F'],
      dateRange: { start: '2025-09-01', end: '2025-10-31', days: 61 },
      avgDuration: 42,
      recordsWithTime: 120
    },
    projects: [
      { name: '项目A', count: 34, totalDuration: 1460, avgDuration: 43, avgDurationStr: '43分钟' },
      { name: '项目B', count: 25, totalDuration: 980, avgDuration: 39, avgDurationStr: '39分钟' },
      { name: '项目C', count: 18, totalDuration: 820, avgDuration: 46, avgDurationStr: '46分钟' }
    ],
    timeDistribution: {
      hourly: Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? 10 : 4)),
      daily: [ { date: '2025-10-28', count: 6 }, { date: '2025-10-29', count: 4 } ],
      monthly: [ { month: '2025-09', count: 54 }, { month: '2025-10', count: 74 } ]
    },
    emotions: [
      { emotion: '开心', count: 45, percentage: 35.2 },
      { emotion: '平静', count: 40, percentage: 31.3 },
      { emotion: '焦虑', count: 18, percentage: 14.1 }
    ],
    achievements: { totalAchievements: 22, achievementRate: 17.2, achievements: [] },
    insights: ['项目A最活跃，记录数 34 条','情绪以“开心”和“平静”为主','近两月记录量呈上升趋势']
  },
  search_records: {
    summary: '模拟：检索到 10 条相关记录，涉及 3 个项目',
    records: Array.from({ length: 10 }, (_, i) => ({ shanggexiangmu: `项目${['A','B','C'][i%3]}`, ganshou: `样例记录${i+1}`, chixushijian: `${30 + i}分钟`, time: `2025-10-0${(i%9)+1}T09:00:00Z` })),
    projectStats: { '项目A': { count: 4 }, '项目B': { count: 3 }, '项目C': { count: 3 } }
  },
  project_stats: {
    项目A: { count: 34, avgDuration: 43 },
    项目B: { count: 25, avgDuration: 39 },
    项目C: { count: 18, avgDuration: 46 }
  }
}