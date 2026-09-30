import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteJournalRepository } from '../src/main/infrastructure/persistence/SqliteJournalRepository.js'
import { SqlService } from '../src/main/data/SqlService.js'

describe('SqlServiceNative - 原生 SQLite 与高性能内存统计分析', () => {
  let tempDir
  let dbManager
  let journalRepo
  let sqlService

  const sampleData = [
    {
      _id: 'rec_1',
      time: '2026-07-01 09:30:00',
      shanggexiangmu: '科研',
      chixushijian: '60m',
      _meta_project: '科研',
      _meta_duration_min: 60,
      _meta_time_range: '上午',
      _meta_is_weekend: 0,
      _meta_year: 2026,
      _meta_month: 7,
      _meta_mood_score: 0.8
    },
    {
      _id: 'rec_2',
      time: '2026-07-01 14:00:00',
      shanggexiangmu: '工作',
      chixushijian: '120m',
      _meta_project: '工作',
      _meta_duration_min: 120,
      _meta_time_range: '下午',
      _meta_is_weekend: 0,
      _meta_year: 2026,
      _meta_month: 7,
      _meta_mood_score: 0.6
    },
    {
      _id: 'rec_3',
      time: '2026-07-04 20:00:00',
      shanggexiangmu: '生活',
      chixushijian: '30m',
      _meta_project: '生活',
      _meta_duration_min: 30,
      _meta_time_range: '晚上',
      _meta_is_weekend: 1,
      _meta_year: 2026,
      _meta_month: 7,
      _meta_mood_score: 0.9
    }
  ]

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-service-test-'))
    const dbPath = path.join(tempDir, 'analytics.db')
    dbManager = new DatabaseManager({ dbPath })
    journalRepo = new SqliteJournalRepository({ dbManager })
    sqlService = new SqlService({ dbManager })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should compute getStatsSummary accurately without AlaSQL', () => {
    const summary = sqlService.getStatsSummary(sampleData)

    expect(summary.totalRecords).toBe(3)
    expect(summary.projectCount).toBe(3) // 科研, 工作, 生活
    expect(summary.totalDurationHours).toBe(3.5) // (60 + 120 + 30) / 60 = 210 / 60 = 3.5
    expect(summary.avgDurationMin).toBe(70) // 210 / 3 = 70
    expect(summary.dateRange.start).toBe('2026-07-01 09:30:00')
    expect(summary.dateRange.end).toBe('2026-07-04 20:00:00')
  })

  it('should analyze by dimension correctly', () => {
    const byProject = sqlService.analyzeByDimension(sampleData, '_meta_project', 5)

    expect(byProject.length).toBe(3)
    const work = byProject.find(p => p.name === '工作')
    expect(work).toBeDefined()
    expect(work.totalDurationHours).toBe(2)
    expect(work.avgMoodScore).toBe(0.6)
  })

  it('should analyze time range distribution with proper natural ordering', () => {
    const timeDist = sqlService.analyzeTimeDistribution(sampleData)

    expect(timeDist.length).toBe(3)
    expect(timeDist[0].timeRange).toBe('上午')
    expect(timeDist[1].timeRange).toBe('下午')
    expect(timeDist[2].timeRange).toBe('晚上')
  })

  it('should analyze weekday vs weekend contrast', () => {
    const contrast = sqlService.analyzeWeekdayVsWeekend(sampleData)

    expect(contrast.length).toBe(2)
    const weekday = contrast.find(c => c.type === '工作日')
    const weekend = contrast.find(c => c.type === '周末')

    expect(weekday.count).toBe(2)
    expect(weekend.count).toBe(1)
    expect(weekend.totalDurationHours).toBe(0.5)
  })

  it('should analyze mood trend by monthly period', () => {
    const trend = sqlService.analyzeMoodTrend(sampleData)

    expect(trend.length).toBe(1)
    expect(trend[0].period).toBe('2026-07')
    expect(trend[0].count).toBe(3)
    // (0.8 + 0.6 + 0.9) / 3 = 2.3 / 3 ≈ 0.77
    expect(trend[0].avgMoodScore).toBe(0.77)
  })

  it('should execute direct querySql on SQLite journals table', () => {
    journalRepo.saveJournals([
      {
        _id: 'rec_sql_1',
        time: '2026-07-10 10:00:00',
        shanggexiangmu: 'AI架构',
        chixushijian: '2h',
        ganshou: 'Native SQLite 统计引擎落地'
      },
      {
        _id: 'rec_sql_2',
        time: '2026-07-11 11:00:00',
        shanggexiangmu: 'AI架构',
        chixushijian: '1h',
        ganshou: '编写自动化测试用例'
      }
    ])

    const rows = sqlService.querySql(`
      SELECT project, COUNT(*) as count, SUM(duration_min) as totalMin
      FROM journals
      WHERE is_deleted = 0
      GROUP BY project
    `)

    expect(rows.length).toBe(1)
    expect(rows[0].project).toBe('AI架构')
    expect(rows[0].count).toBe(2)
    expect(rows[0].totalMin).toBe(180) // 120 + 60
  })
})
