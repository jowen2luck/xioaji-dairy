import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { CreateRecordTool } from '../src/main/tools/createRecord.js'
import { getToolRegistry } from '../src/main/tools/registry.js'

describe('CreateRecordTool & Registry', () => {
  it('should be registered in toolRegistry', () => {
    const registry = getToolRegistry()
    const tool = registry.get('create_record')
    expect(tool).toBeDefined()
    expect(tool.name).toBe('create_record')
    expect(tool.schema).toBeDefined()
    expect(tool.schema.required).toContain('content')
  })

  it('should fail when content is empty', async () => {
    const tool = new CreateRecordTool()
    const result = await tool.invoke({ content: '' })
    expect(result.isError).toBe(true)
    expect(result.data.error).toContain('不能为空')
  })

  it('should create valid record object with defaults and call saveData', async () => {
    const tool = new CreateRecordTool()
    const result = await tool.invoke({
      content: '今天完成了小鸡工具改造和单一日记抽屉入口联调',
      project: '科研开发',
      duration: '45m'
    })

    expect(result.isError).toBe(false)
    expect(result.data.success).toBe(true)
    expect(result.data.record).toBeDefined()
    expect(result.data.record._id).toMatch(/^rec_/)
    expect(result.data.record.shanggexiangmu).toBe('科研开发')
    expect(result.data.record.chixushijian).toBe('45m')
    expect(result.data.record.time).toBeDefined()
  })

  it('should support update_record in registry and invoke', async () => {
    const { UpdateRecordTool } = await import('../src/main/tools/updateRecord.js')
    const registry = getToolRegistry()
    const toolFromReg = registry.get('update_record')
    expect(toolFromReg).toBeDefined()
    expect(toolFromReg.name).toBe('update_record')

    const updateTool = new UpdateRecordTool()
    const emptyRes = await updateTool.invoke({})
    expect(emptyRes.isError).toBe(true)
    expect(emptyRes.data.error).toContain('必须指定要修改的日记记录 ID')
  })

  it('should support delete_record in registry and invoke', async () => {
    const { DeleteRecordTool } = await import('../src/main/tools/deleteRecord.js')
    const registry = getToolRegistry()
    const toolFromReg = registry.get('delete_record')
    expect(toolFromReg).toBeDefined()
    expect(toolFromReg.name).toBe('delete_record')

    const deleteTool = new DeleteRecordTool()
    const emptyRes = await deleteTool.invoke({})
    expect(emptyRes.isError).toBe(true)
    expect(emptyRes.data.error).toContain('必须指定要删除或撤销的日记记录 ID')
  })
})
