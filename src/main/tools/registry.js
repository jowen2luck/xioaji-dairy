/**
 * 工具注册表
 * 管理所有可用的工具实例
 */

import { SearchRecordsTool } from './searchRecords.js'
import { QueryRecordsTool } from './queryRecords.js'
import { SqlAnalysisTool } from './sqlAnalysis.js'
import { CalendarResolverTool } from './calendar.js'
import { MetadataExplorerTool } from './metadata.js'
import { InsightAnalystTool } from './insight.js'

export class ToolRegistry {
  constructor() {
    this.tools = new Map()
    this.registerDefaultTools()
  }

  registerDefaultTools() {
    // 核心查询工具
    this.register(new SearchRecordsTool())
    this.register(new QueryRecordsTool())
    
    // 统计和分析工具
    this.register(new SqlAnalysisTool())
    this.register(new InsightAnalystTool())
    
    // 辅助工具
    this.register(new CalendarResolverTool())
    this.register(new MetadataExplorerTool())
    
    console.log('[ToolRegistry] Registered default tools:', Array.from(this.tools.keys()))
  }

  register(tool) {
    if (!tool.name) {
      throw new Error('Tool must have a name')
    }
    this.tools.set(tool.name, tool)
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`)
  }

  getTool(name) {
    return this.tools.get(name)
  }

  // 添加 get 别名方法，与 AgentExecutor 中的调用保持一致
  get(name) {
    return this.tools.get(name)
  }

  getAllTools() {
    return Array.from(this.tools.values())
  }

  // 添加 getAll 别名方法
  getAll() {
    return this.getAllTools()
  }

  // 添加工具调用方法
  async invokeTool(name, args) {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool '${name}' not found`)
    }
    return await tool.invoke(args)
  }

  getToolMetadata() {
    return this.getAllTools().map(tool => tool.getMetadata())
  }
}

// 单例实例
let registryInstance = null

export function getToolRegistry() {
  if (!registryInstance) {
    registryInstance = new ToolRegistry()
  }
  return registryInstance
}
