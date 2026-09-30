import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'
import { SqliteMemoRepository } from '../src/main/infrastructure/persistence/SqliteMemoRepository.js'
import { MemoManager } from '../src/main/memo/memoManager.js'
import * as DataModule from '../src/main/data/index.js'

describe('AtomicMemoTransaction - 阶段 2.3 便签转日记原子事务与回滚保障', () => {
  let tempDir
  let dbManager
  let sqliteRepo
  let memoManager

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-memo-test-'))
    const dbPath = path.join(tempDir, 'atomic_memos.db')
    dbManager = new DatabaseManager({ dbPath })
    sqliteRepo = new SqliteMemoRepository({ dbManager })
    memoManager = new MemoManager({
      sqliteRepo,
      storagePath: path.join(tempDir, 'memos.json')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('单条便签转换成功：日记落盘且 SQLite 便签状态原子置为 merged 并关联 targetRecordId', async () => {
    // 模拟底层 saveData 成功
    const saveSpy = vi.spyOn(DataModule, 'saveData').mockResolvedValue({ success: true, count: 1 })

    const { memo } = memoManager.upsertMemo({
      topic: '单条转换测试',
      project: '生活',
      content: '今天完成了便签模块的 SQLite 升级'
    })

    const convertRes = await memoManager.convertToRecord(memo.id)
    expect(convertRes.success).toBe(true)
    expect(convertRes.record).toBeDefined()
    expect(saveSpy).toHaveBeenCalledTimes(1)

    // 验证 SQLite 中该便签状态原子更新为 merged
    const updatedInDb = sqliteRepo.getMemo(memo.id)
    expect(updatedInDb.status).toBe('merged')
    expect(updatedInDb.targetRecordId).toBe(convertRes.record._id)

    // 活跃列表中不再包含该便签
    const activeList = memoManager.listMemos({ status: 'active' })
    expect(activeList.length).toBe(0)
  })

  it('单条便签转换失败（存储底座报错）：便签保持 active 状态，绝无脏数据残留', async () => {
    // 模拟底层存储异常（例如磁盘满或 JSON 损坏）
    vi.spyOn(DataModule, 'saveData').mockResolvedValue({ error: 'Disk quota exceeded' })

    const { memo } = memoManager.upsertMemo({
      topic: '失败回滚测试',
      project: '生活',
      content: '这条内容在转换失败时不应该被置为 merged'
    })

    // 执行转换应抛出异常
    await expect(memoManager.convertToRecord(memo.id)).rejects.toThrow('转换日记失败: Disk quota exceeded')

    // 验证 SQLite 中的便签依然完好无损处于 active
    const inDb = sqliteRepo.getMemo(memo.id)
    expect(inDb.status).toBe('active')
    expect(inDb.targetRecordId).toBeNull()

    const activeList = memoManager.listMemos({ status: 'active' })
    expect(activeList.length).toBe(1)
  })

  it('多条便签合并成功：日记落盘且所有便签在单事务中批量置为 merged', async () => {
    const saveSpy = vi.spyOn(DataModule, 'saveData').mockResolvedValue({ success: true, count: 1 })

    const { memo: m1 } = memoManager.upsertMemo({ topic: '早晨', content: '晨跑5公里' })
    const { memo: m2 } = memoManager.upsertMemo({ topic: '中午', content: '与同事聚餐聊了技术架构' })
    const { memo: m3 } = memoManager.upsertMemo({ topic: '晚上', content: '整理了一天的工作成果' })

    const mergeRes = await memoManager.mergeToRecord([m1.id, m2.id, m3.id], {
      project: '日常生活'
    })

    expect(mergeRes.success).toBe(true)
    expect(mergeRes.mergedCount).toBe(3)
    expect(saveSpy).toHaveBeenCalledTimes(1)

    // 验证 3 条便签全部原子置为 merged 且指向同一个日记 ID
    const recordId = mergeRes.record._id
    const dbM1 = sqliteRepo.getMemo(m1.id)
    const dbM2 = sqliteRepo.getMemo(m2.id)
    const dbM3 = sqliteRepo.getMemo(m3.id)

    expect(dbM1.status).toBe('merged')
    expect(dbM1.targetRecordId).toBe(recordId)
    expect(dbM2.status).toBe('merged')
    expect(dbM2.targetRecordId).toBe(recordId)
    expect(dbM3.status).toBe('merged')
    expect(dbM3.targetRecordId).toBe(recordId)

    expect(memoManager.listMemos({ status: 'active' }).length).toBe(0)
  })

  it('多条便签合并失败（底层异常）：全部便签完整回滚保持 active，不留半成品', async () => {
    vi.spyOn(DataModule, 'saveData').mockRejectedValue(new Error('IO Write Error'))

    const { memo: m1 } = memoManager.upsertMemo({ topic: '早晨', content: '晨跑5公里' })
    const { memo: m2 } = memoManager.upsertMemo({ topic: '中午', content: '与同事聚餐' })

    await expect(memoManager.mergeToRecord([m1.id, m2.id])).rejects.toThrow('IO Write Error')

    // 验证状态均未改变
    const dbM1 = sqliteRepo.getMemo(m1.id)
    const dbM2 = sqliteRepo.getMemo(m2.id)

    expect(dbM1.status).toBe('active')
    expect(dbM1.targetRecordId).toBeNull()
    expect(dbM2.status).toBe('active')
    expect(dbM2.targetRecordId).toBeNull()

    expect(memoManager.listMemos({ status: 'active' }).length).toBe(2)
  })
})
