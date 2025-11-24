/**
 * 工具注册表
 * 管理所有可用的工具实例
 */

import { SearchRecordsTool } from './searchRecords.js'
import { QueryRecordsTool } from './queryRecords.js'
import { SqlAnalysisTool } from './sqlAnalysis.js'

export class ToolRegistry {
  constructor() {
    this.tools = new Map()
    this.registerDefaultTools()
  }

  registerDefaultTools() {
    this.register(new SearchRecordsTool())
    this.register(new QueryRecordsTool())
    this.register(new SqlAnalysisTool())
    
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

  getAllTools() {
    return Array.from(this.tools.values())
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
