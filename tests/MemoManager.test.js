import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(process.cwd())
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('../src/main/data/index.js', () => ({
  saveData: vi.fn().mockResolvedValue({ success: true, count: 1 })
}))

vi.mock('../src/main/tools/searchRecords.js', () => ({
  clearVectorCache: vi.fn(),
  SearchRecordsTool: class {
    constructor() {
      this.name = 'search_records'
    }
  }
}))

import { MemoManager, sanitizeMemoContent } from '../src/main/memo/memoManager.js'
import { ManageMemoTool } from '../src/main/tools/manageMemo.js'
import { getToolRegistry } from '../src/main/tools/registry.js'
import { getSkillRegistry } from '../src/main/agent/skills/index.js'

describe('MemoManager and ManageMemoTool', () => {
  let tempDir
  let memoFilePath
  let memoManager

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-memo-test-'))
    memoFilePath = path.join(tempDir, 'memos.json')
    memoManager = new MemoManager({ storagePath: memoFilePath })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should initialize with empty memos', () => {
    const list = memoManager.listMemos()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBe(0)
  })

  it('should create a new memo via upsertMemo', () => {
    const { memo, isNew } = memoManager.upsertMemo({
      topic: '下午骑行',
      project: '生活',
      content: '今天下午天气很好，一路向北骑了20公里，沿途看见了很漂亮的晚霞。',
      quotes: ['一路向北骑了20公里']
    })

    expect(memo).toBeDefined()
    expect(isNew).toBe(true)
    expect(memo.id).toMatch(/^memo_/)
    expect(memo.topic).toBe('下午骑行')
    expect(memo.project).toBe('生活')
    expect(memo.status).toBe('active')
    expect(memo.quotes).toContain('一路向北骑了20公里')

    const list = memoManager.listMemos({ status: 'active' })
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(memo.id)
  })

  it('should automatically append and merge into existing memo on same topic and date', () => {
    const { memo: memo1 } = memoManager.upsertMemo({
      topic: '项目吐槽',
      project: '工作',
      content: '今天需求又变了，产品经理突然加了三个新交互。',
      quotes: ['需求又变了']
    })

    const { memo: memo2, isNew } = memoManager.upsertMemo({
      topic: '项目吐槽',
      project: '工作',
      content: '不过跟前端同学对了一下，发现能复用原来的组件，稍微轻松了点。',
      quotes: ['能复用原来的组件']
    })

    expect(isNew).toBe(false)
    expect(memo2.id).toBe(memo1.id)
    expect(memo2.content).toContain('今天需求又变了')
    expect(memo2.content).toContain('不过跟前端同学对了一下')
    expect(memo2.quotes.length).toBe(2)

    const list = memoManager.listMemos()
    expect(list.length).toBe(1)
  })

  it('should delete a memo successfully', () => {
    const { memo } = memoManager.upsertMemo({
      topic: '临时速记',
      content: '测试删除'
    })
    expect(memoManager.listMemos().length).toBe(1)

    const deleted = memoManager.deleteMemo(memo.id)
    expect(deleted).toBe(true)
    expect(memoManager.listMemos().length).toBe(0)
  })

  it('should convert a single memo to a journal record', async () => {
    const { memo } = memoManager.upsertMemo({
      topic: '骑行复盘',
      project: '运动',
      content: '今天骑行整体节奏保持得不错，心率也稳定。'
    })

    const result = await memoManager.convertToRecord(memo.id)
    expect(result.success).toBe(true)
    expect(result.record).toBeDefined()
    expect(result.record.shanggexiangmu).toBe('运动')
    expect(result.record.ganshou).toBe('今天骑行整体节奏保持得不错，心率也稳定。')

    const updatedMemo = memoManager.getMemo(memo.id)
    expect(updatedMemo.status).toBe('merged')
    expect(updatedMemo.targetRecordId).toBe(result.record._id)
  })

  it('should merge multiple memos into a single comprehensive journal record', async () => {
    const { memo: memo1 } = memoManager.upsertMemo({
      topic: '早起慢跑',
      project: '生活',
      content: '早上七点起来跑了三公里，呼吸新鲜空气。'
    })

    const { memo: memo2 } = memoManager.upsertMemo({
      topic: '下午读书',
      project: '阅读',
      content: '下午读了《被讨厌的勇气》，对课题分离有了更深的理解。'
    })

    const result = await memoManager.mergeToRecord([memo1.id, memo2.id])
    expect(result.success).toBe(true)
    expect(result.mergedCount).toBe(2)
    expect(result.record.ganshou).toContain('【早起慢跑】')
    expect(result.record.ganshou).toContain('【下午读书】')

    const list = memoManager.listMemos({ status: 'active' })
    expect(list.length).toBe(0)
    const mergedList = memoManager.listMemos({ status: 'merged' })
    expect(mergedList.length).toBe(2)
  })

  it('should register ManageMemoTool in ToolRegistry', () => {
    const registry = getToolRegistry()
    const tool = registry.get('manage_memo')
    expect(tool).toBeDefined()
    expect(tool.name).toBe('manage_memo')
    expect(tool.schema).toBeDefined()
  })

  it('should invoke ManageMemoTool to upsert and merge memos', async () => {
    const tool = new ManageMemoTool({ memoManager })

    const upsertRes = await tool.invoke({
      action: 'upsert',
      topic: '工具测试',
      project: '开发',
      content: '测试通过 ManageMemoTool 写入便签',
      quotes: ['测试通过 ManageMemoTool']
    })

    expect(upsertRes.isError).toBe(false)
    expect(upsertRes.data.action).toBe('upsert')
    expect(upsertRes.data.memo).toBeDefined()
    const memoId = upsertRes.data.memo.id

    const mergeRes = await tool.invoke({
      action: 'merge_to_diary',
      memoIds: [memoId]
    })

    expect(mergeRes.isError).toBe(false)
    expect(mergeRes.data.action).toBe('merge_to_diary')
    expect(mergeRes.data.record).toBeDefined()
  })

  it('should sanitize content to remove third-person reporting phrases like "用户说了："', () => {
    expect(sanitizeMemoContent('用户说了：今天十点才起，下午随性往北骑车。')).toBe('今天十点才起，下午随性往北骑车。')
    expect(sanitizeMemoContent('用户表示: 晚上吃了牛肉面，味道很赞。')).toBe('晚上吃了牛肉面，味道很赞。')
    expect(sanitizeMemoContent('用户提到：今天开会压力有点大。')).toBe('今天开会压力有点大。')
    expect(sanitizeMemoContent('TA说：今天天气真好。')).toBe('今天天气真好。')
    expect(sanitizeMemoContent('“今天心情舒畅多了”')).toBe('今天心情舒畅多了')
  })

  it('should automatically sanitize content during upsertMemo and mergeToRecord', async () => {
    const { memo } = memoManager.upsertMemo({
      topic: '晚霞骑行',
      content: '用户说了：下午随性往北骑了20公里，沿途看见了很漂亮的晚霞。',
      quotes: ['用户说了：看见了很漂亮的晚霞']
    })

    expect(memo.content).toBe('下午随性往北骑了20公里，沿途看见了很漂亮的晚霞。')
    expect(memo.quotes[0]).toBe('看见了很漂亮的晚霞')

    const mergeRes = await memoManager.mergeToRecord([memo.id], {
      content: '用户表示：今天虽然十点才起，但下午骑行20公里看见了晚霞，很充实。'
    })

    expect(mergeRes.record.ganshou).toBe('今天虽然十点才起，但下午骑行20公里看见了晚霞，很充实。')
  })

  it('should render structured skills prompt from SkillRegistry', () => {
    const registry = getSkillRegistry()
    expect(registry).toBeDefined()
    expect(registry.get('memo_diary')).toBeDefined()
    expect(registry.get('diary_analysis')).toBeDefined()
    expect(registry.get('core_memory')).toBeDefined()

    const prompt = registry.renderSkillsPrompt({ enabledTools: ['manage_memo', 'query_records'] })
    expect(prompt).toContain('小鸡专属技能组')
    expect(prompt).toContain('第一人称日记视角')
    expect(prompt).toContain('数据事实性')
  })

  it('should deduplicate inverted topics and high-overlap content in json fallback', () => {
    const today = '2026-09-26'
    const { memo: m1, isNew: isNew1 } = memoManager.upsertMemo({
      topic: '中秋节的无力感与逻辑闭环',
      project: '心情',
      content: '昨天是中秋节，没吃到月饼有些失落。今天原本打算出门，结果下午突然陷入巨大的悲伤，瘫在床上动弹不得。',
      date: today
    })
    expect(isNew1).toBe(true)

    const { memo: m2, isNew: isNew2 } = memoManager.upsertMemo({
      topic: '逻辑闭环与中秋节的无力感',
      project: '心情',
      content: '昨天是中秋节，没吃到月饼有些失落。今天原本打算出门，结果下午突然陷入巨大的悲伤，整个人瘫在床上，连站起来的力气都没有。',
      date: today
    })
    expect(isNew2).toBe(false)
    expect(m2.id).toBe(m1.id)
    expect(memoManager.listMemos().length).toBe(1)
  })
})

