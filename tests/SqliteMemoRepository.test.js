import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteMemoRepository } from '../src/main/infrastructure/persistence/SqliteMemoRepository.js'

describe('SqliteMemoRepository', () => {
  let tempDir
  let dbManager
  let repo

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-memo-repo-test-'))
    const dbPath = path.join(tempDir, 'memos.db')
    dbManager = new DatabaseManager({ dbPath })
    repo = new SqliteMemoRepository({ dbManager })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should initialize with empty memos', () => {
    const list = repo.listMemos()
    expect(list).toEqual([])
  })

  it('should create new memo and query it', () => {
    const { memo, isNew } = repo.upsertMemo({
      topic: '下午骑行',
      project: '生活',
      content: '今天天气晴朗，环湖骑行了15公里。',
      quotes: ['环湖骑行了15公里']
    })

    expect(isNew).toBe(true)
    expect(memo.id).toMatch(/^memo_/)
    expect(memo.topic).toBe('下午骑行')
    expect(memo.project).toBe('生活')
    expect(memo.status).toBe('active')
    expect(memo.quotes).toContain('环湖骑行了15公里')

    const fetched = repo.getMemo(memo.id)
    expect(fetched.id).toBe(memo.id)
    expect(fetched.content).toBe('今天天气晴朗，环湖骑行了15公里。')
  })

  it('should naturally append and merge content when upserting same topic on same date', () => {
    const today = '2026-09-24'
    const { memo: m1 } = repo.upsertMemo({
      topic: '需求变动',
      project: '工作',
      content: '早会宣布产品原型调整。',
      quotes: ['产品原型调整'],
      date: today
    })

    const { memo: m2, isNew } = repo.upsertMemo({
      topic: '需求变动',
      project: '工作',
      content: '下午确认了技术方案影响面，还好改动不大。',
      quotes: ['改动不大'],
      date: today
    })

    expect(isNew).toBe(false)
    expect(m2.id).toBe(m1.id)
    expect(m2.content).toContain('早会宣布产品原型调整。')
    expect(m2.content).toContain('下午确认了技术方案影响面')
    expect(m2.quotes.length).toBe(2)

    const list = repo.listMemos()
    expect(list.length).toBe(1)
  })

  it('should update memo status and targetRecordId', () => {
    const { memo } = repo.upsertMemo({
      topic: '归档测试',
      project: '生活',
      content: '准备转日记'
    })

    const updated = repo.updateMemoStatus(memo.id, 'merged', 'rec_1001')
    expect(updated).toBe(true)

    const fetched = repo.getMemo(memo.id)
    expect(fetched.status).toBe('merged')
    expect(fetched.targetRecordId).toBe('rec_1001')
  })

  it('should batch update memos status in a single transaction', () => {
    const { memo: m1 } = repo.upsertMemo({ topic: '批量1', content: '内容1' })
    const { memo: m2 } = repo.upsertMemo({ topic: '批量2', content: '内容2' })

    const count = repo.batchUpdateMemosStatus([m1.id, m2.id], 'merged', 'rec_merged_all')
    expect(count).toBe(2)

    const activeList = repo.listMemos({ status: 'active' })
    expect(activeList.length).toBe(0)

    const mergedList = repo.listMemos({ status: 'merged' })
    expect(mergedList.length).toBe(2)
  })

  it('should delete a memo', () => {
    const { memo } = repo.upsertMemo({ topic: '待删除', content: '临时便签' })
    expect(repo.listMemos().length).toBe(1)

    const deleted = repo.deleteMemo(memo.id)
    expect(deleted).toBe(true)
    expect(repo.listMemos().length).toBe(0)
  })

  it('should auto-migrate legacy memos.json and create backup file', () => {
    const legacyPath = path.join(tempDir, 'legacy-memos.json')
    const legacyMemos = [
      {
        id: 'memo_legacy_01',
        topic: '旧便签话题',
        project: '生活',
        date: '2026-09-01',
        content: '这是旧版本的便签正文',
        quotes: ['旧版本的便签'],
        status: 'active',
        targetRecordId: null,
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z'
      }
    ]
    fs.writeFileSync(legacyPath, JSON.stringify(legacyMemos), 'utf-8')

    const migDbPath = path.join(tempDir, 'migrated_memos.db')
    const migDbManager = new DatabaseManager({ dbPath: migDbPath })
    const migRepo = new SqliteMemoRepository({
      dbManager: migDbManager,
      legacyJsonPath: legacyPath
    })

    // 验证备份文件产生
    const bakPath = path.join(tempDir, 'memos.bak.json')
    expect(fs.existsSync(bakPath)).toBe(true)

    // 验证数据正确迁入
    const list = migRepo.listMemos()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('memo_legacy_01')
    expect(list[0].topic).toBe('旧便签话题')
    expect(list[0].quotes).toEqual(['旧版本的便签'])

    migDbManager.close()
  })

  it('should automatically deduplicate and merge when topic words are inverted', () => {
    const today = '2026-09-26'
    const { memo: m1, isNew: isNew1 } = repo.upsertMemo({
      topic: '中秋节的无力感与逻辑闭环',
      project: '心情',
      content: '昨天是中秋节，没吃到月饼有些失落。今天下午突然陷入巨大的悲伤，瘫在床上连手指都动不了。',
      date: today
    })
    expect(isNew1).toBe(true)

    // 第二次调用，标题语序颠倒，正文高度相似
    const { memo: m2, isNew: isNew2 } = repo.upsertMemo({
      topic: '逻辑闭环与中秋节的无力感',
      project: '心情',
      content: '昨天是中秋节，没吃到月饼有些失落。今天原本打算出门，结果下午突然陷入巨大的悲伤，整个人瘫在床上，连站起来的力气都没有。',
      date: today
    })

    expect(isNew2).toBe(false)
    expect(m2.id).toBe(m1.id)
    // 确保正文保留了更丰富更长的一版，而不是把整篇故事拼接两次
    expect(m2.content).toContain('连站起来的力气都没有')
    expect(m2.content.indexOf('昨天是中秋节')).toBe(m2.content.lastIndexOf('昨天是中秋节')) // 只出现了一次，没有全文重复粘贴！
    expect(repo.listMemos().length).toBe(1)
  })

  it('should deduplicate and merge when content overlap is high (>= 65%) even if topic differs', () => {
    const today = '2026-09-26'
    const { memo: m1 } = repo.upsertMemo({
      topic: '中秋感悟',
      project: '生活',
      content: '回望这一切，发现形成了一个诡异的逻辑闭环：焦虑—无力—退缩—转移—焦虑增加—情绪崩溃绝望—恢复—继续焦虑。症结在于没有把焦虑转化为行动，而是通过证明自己做不到来逃避。',
      date: today
    })

    const { memo: m2, isNew } = repo.upsertMemo({
      topic: '心理机制反思',
      project: '生活',
      content: '回望这一切，发现形成了一个诡异的逻辑闭环：焦虑—无力—退缩—转移—焦虑增加—情绪崩溃绝望—恢复—继续焦虑。症结在于没有把焦虑转化为行动。意识到这可能与配得感有关。',
      date: today
    })

    expect(isNew).toBe(false)
    expect(m2.id).toBe(m1.id)
    expect(repo.listMemos().length).toBe(1)
  })

  it('should cleanly create two separate memos when topics and contents are genuinely distinct', () => {
    const today = '2026-09-26'
    // 便签 1：客观事实与行动经历
    const { memo: m1, isNew: isNew1 } = repo.upsertMemo({
      topic: '中秋节的行动困境',
      project: '生活',
      content: '昨天中秋节没吃到月饼，今天下午原本打算出门，结果瘫在床上动弹不得，只能一直刷手机转移注意力。',
      date: today
    })

    // 便签 2：独立抽离的深度心理机制分析（正文互斥，不抄录流水账）
    const { memo: m2, isNew: isNew2 } = repo.upsertMemo({
      topic: '心理机制的逻辑闭环',
      project: '心情',
      content: '我觉察到了潜意识的逃避机制：焦虑—无力—退缩—转移。通过证明自己无能来合理化退缩，根源在于心底对未知的恐惧与配得感不足。',
      date: today
    })

    expect(isNew1).toBe(true)
    expect(isNew2).toBe(true)
    expect(m1.id).not.toBe(m2.id)
    expect(repo.listMemos().length).toBe(2)
  })
})
