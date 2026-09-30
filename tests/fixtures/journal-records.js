/**
 * Sanitized fixtures for contract and analysis tests
 */

export const fixtureRecords = [
  {
    id: 'fixture-001',
    occurredAt: '2026-07-25T09:00:00',
    contentHtml: '<p>今天和妈妈一起吃了早饭，感觉很温暖。</p>',
    contentText: '今天和妈妈一起吃了早饭，感觉很温暖。',
    project: '家庭',
    durationMinutes: 90,
    experience: '温暖',
    moodColor: '#FFD700',
    achievement: true,
    source: 'local',
    revision: 1,
  },
  {
    id: 'fixture-002',
    occurredAt: '2026-07-24T14:30:00',
    contentHtml: '<p>项目会议很顺利，讨论了新功能开发。</p>',
    contentText: '项目会议很顺利，讨论了新功能开发。',
    project: '工作',
    durationMinutes: 120,
    experience: '顺利',
    moodColor: '#90EE90',
    achievement: false,
    source: 'local',
    revision: 1,
  },
  {
    id: 'fixture-003',
    occurredAt: '2026-07-23T20:00:00',
    contentHtml: '<p>有点焦虑，明天有重要汇报。</p>',
    contentText: '有点焦虑，明天有重要汇报。',
    project: '工作',
    durationMinutes: 30,
    experience: '焦虑',
    moodColor: '#87CEEB',
    achievement: false,
    source: 'local',
    revision: 1,
  },
]

export const fixtureScope = {
  dateRange: { start: '2026-07-20T00:00:00', end: '2026-07-26T23:59:59' },
}

export const fixtureEmptyScope = {}

export function makeOverlappingRecords(count = 50) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bulk-${String(i).padStart(3, '0')}`,
    occurredAt: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00`,
    contentHtml: `<p>Bulk record ${i} content with some repetitive text for search testing.</p>`,
    contentText: `Bulk record ${i} content with some repetitive text for search testing.`,
    project: i % 2 === 0 ? '工作' : '生活',
    durationMinutes: 30 + (i % 120),
    experience: '常规',
    moodColor: '#FFFFFF',
    achievement: i % 3 === 0,
    source: 'local',
    revision: 1,
  }))
}
