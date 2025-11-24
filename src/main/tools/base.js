/**
 * Tool 基类
 * 遵循 LangChain 1.0 Tool 规范
 */

export class Tool {
  constructor() {
    this.name = ''
    this.description = ''
    this.schema = {}
  }

  /**
   * 工具调用接口
   * @param {Object} input - 输入参数
   * @returns {Promise<ToolResult>} - 执行结果
   */
  async invoke(input) {
    throw new Error('invoke() method must be implemented by subclass')
  }

  /**
   * 获取工具元数据
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema
    }
  }
}

/**
 * Tool 执行结果包装类
 */
export class ToolResult {
  constructor(toolName, data, isError = false) {
    this.toolName = toolName
    this.data = data
    this.isError = isError
    this.timestamp = new Date().toISOString()
  }

  toJSON() {
    return {
      toolName: this.toolName,
      data: this.data,
      isError: this.isError,
      timestamp: this.timestamp
    }
  }
}
