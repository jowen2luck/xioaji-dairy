import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteJournalRepository, parseDurationMinutes } from '../src/main/infrastructure/persistence/SqliteJournalRepository.js'

describe('SqliteJournalRepository', () => {
  let tempDir
  let dbManager
  let repo

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-repo-test-'))
    const dbPath = path.join(tempDir, 'journals.db')
    dbManager = new DatabaseManager({ dbPath })
    repo = new SqliteJournalRepository({ dbManager })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should parse duration minutes correctly across formats', () => {
    expect(parseDurationMinutes('30m')).toBe(30)
    expect(parseDurationMinutes('1h')).toBe(60)
    expect(parseDurationMinutes('1.5h')).toBe(90)
    expect(parseDurationMinutes('1h20m')).toBe(80)
    expect(parseDurationMinutes(45)).toBe(45)
    expect(parseDurationMinutes('')).toBe(0)
    expect(parseDurationMinutes(null)).toBe(0)
  })

  it('should initialize with empty records', () => {
    const list = repo.listJournals()
    expect(list).toEqual([])
    expect(repo.countJournals()).toBe(0)
  })

  it('should save and list journals with query filters', () => {
    const records = [
      {
        _id: 'rec_01',
        time: '2026-07-25 09:00:00',
        shanggexiangmu: '科研工作',
        chixushijian: '1h30m',
        ganshou: '阅读论文并梳理了相关工作的对比表格'
      },
      {
        _id: 'rec_02',
        time: '2026-07-26 15:00:00',
        shanggexiangmu: '日常生活',
        chixushijian: '45m',
        ganshou: '下午去超市采购了一周的食材'
      }
    ]

    const saveRes = repo.saveJournals(records)
    expect(saveRes.success).toBe(true)
    expect(saveRes.count).toBe(2)
    expect(repo.countJournals()).toBe(2)

    // 查询单条
    const single = repo.getJournal('rec_01')
    expect(single).toBeDefined()
    expect(single.shanggexiangmu).toBe('科研工作')
    expect(single.ganshou).toContain('阅读论文')

    // 按项目筛选
    const workList = repo.listJournals({ project: '科研工作' })
    expect(workList.length).toBe(1)
    expect(workList[0]._id).toBe('rec_01')

    // 按日期区间筛选
    const dateList = repo.listJournals({
      dateRange: { start: '2026-07-26', end: '2026-07-27' }
    })
    expect(dateList.length).toBe(1)
    expect(dateList[0]._id).toBe('rec_02')
  })

  it('should update journal record and AI metadata', () => {
    repo.saveJournals([
      {
        _id: 'rec_update_test',
        time: '2026-07-27 10:00:00',
        shanggexiangmu: '工作',
        chixushijian: '30m',
        ganshou: '初稿编写'
      }
    ])

    const updateRes = repo.updateJournal('rec_update_test', {
      ganshou: '初稿已完成并送审',
      chixushijian: '1h'
    }, {
      summary: '工作初稿完成',
      mood_tags: ['充实', '轻松'],
      energy_level: 8
    })

    expect(updateRes.success).toBe(true)
    expect(updateRes.record.ganshou).toBe('初稿已完成并送审')
    expect(updateRes.record._ai_meta).toBeDefined()
    expect(updateRes.record._ai_meta.summary).toBe('工作初稿完成')
    expect(updateRes.record._ai_meta.mood_tags).toEqual(['充实', '轻松'])
    expect(updateRes.record._ai_meta.energy_level).toBe(8)
  })

  it('should delete a journal record cleanly', () => {
    repo.saveJournals([
      {
        _id: 'rec_del',
        time: '2026-07-28 12:00:00',
        shanggexiangmu: '生活',
        ganshou: '临时记录'
      }
    ])
    expect(repo.countJournals()).toBe(1)

    const delRes = repo.deleteJournal('rec_del')
    expect(delRes.success).toBe(true)
    expect(repo.countJournals()).toBe(0)
    expect(repo.getJournal('rec_del')).toBeNull()
  })

  it('should auto-migrate legacy appData.json and create backup file', () => {
    const legacyPath = path.join(tempDir, 'legacy_appData.json')
    const legacyData = [
      {
        _id: 'rec_legacy_001',
        time: '2026-06-15 18:00:00',
        shanggexiangmu: '系统开发',
        chixushijian: '2h',
        ganshou: '历史遗留日记数据内容',
        tiyan: '顺畅',
        xinqing: 'blue'
      }
    ]
    fs.writeFileSync(legacyPath, JSON.stringify(legacyData), 'utf-8')

    const migDbPath = path.join(tempDir, 'migrated_journals.db')
    const migDbManager = new DatabaseManager({ dbPath: migDbPath })
    const migRepo = new SqliteJournalRepository({
      dbManager: migDbManager,
      legacyJsonPath: legacyPath
    })

    // 验证生成了物理备份
    const bakPath = path.join(tempDir, 'appData.bak.json')
    expect(fs.existsSync(bakPath)).toBe(true)

    // 验证日记正确迁入 SQLite
    const list = migRepo.listJournals()
    expect(list.length).toBe(1)
    expect(list[0]._id).toBe('rec_legacy_001')
    expect(list[0].shanggexiangmu).toBe('系统开发')
    // 验证额外字段无损保全
    expect(list[0].tiyan).toBe('顺畅')
    expect(list[0].xinqing).toBe('blue')

    migDbManager.close()
  })
})
