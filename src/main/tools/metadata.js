/**
 * MetadataExplorerTool - 元数据探索器
 * 查询数据库中已存在的标签、人物、物品等元数据
 * 作为数据库的"索引目录"，帮助 Agent 了解可用的筛选值
 */

import { Tool, ToolResult } from './base.js'
import { loadAndEnrichData } from '../data/index.js'

export class MetadataExplorerTool extends Tool {
  constructor() {
    super()
    this.name = 'metadata_explorer'
    this.description = `【数据库目录/黄页】查询库中已存在的标准元数据值。

关键作用：
- 在使用 query_records 进行精确筛選前，必须先用此工具确认项目名、人名、标签名的准确写法。
- 例如：用户说\"查查我和导师的记录\"，应先用此工具搜索 people_involved 中包含\"导师\"或\"老师\"的值，确认库里存的是\"张教授\"还是\"导师\"，然后再去 query_records 。

支持的字段：
people_involved | mood_tags | items | locations | projects | content_type`
    
    this.schema = {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          description: '要查询的字段类型',
          enum: ['people_involved', 'mood_tags', 'items', 'locations', 'projects', 'content_type']
        },
        search: {
          type: 'string',
          description: '模糊检索关键词。例如 field=\'people_involved\', search=\'\u8001\' 可找出 \'\u8001\u738b\', \'\u8001\u674e\'\u3002'
        },
        limit: {
          type: 'number',
          description: '返回数量限制，默认10'
        }
      },
      required: ['field']
    }
  }

  async invoke(input) {
    try {
      const { field, search, limit = 10 } = input
      
      console.log(`[MetadataExplorerTool] Exploring field: ${field}, search: ${search || 'all'}`)
      
      // 加载数据
      const data = await loadAndEnrichData()
      
      if (data.length === 0) {
        return new ToolResult(this.name, {
          error: '暂无数据',
          message: '请先导入或创建记录'
        }, true)
      }
      
      // 根据字段类型提取元数据
      let metadata = []
      
      switch (field) {
        case 'people_involved':
          metadata = this.extractPeopleInvolved(data, limit)
          break
        case 'mood_tags':
          metadata = this.extractMoodTags(data)
          break
        case 'items':
          metadata = this.extractItems(data)
          break
        case 'locations':
          metadata = this.extractLocations(data)
          break
        case 'projects':
          metadata = this.extractProjects(data)
          break
        case 'content_type':
          metadata = this.extractContentTypes(data)
          break
        default:
          return new ToolResult(this.name, {
            error: `不支持的字段类型: ${field}`,
            supportedFields: ['people_involved', 'mood_tags', 'items', 'locations', 'projects', 'content_type']
          }, true)
      }
      
      // 应用搜索过滤
      if (search) {
        const searchLower = search.toLowerCase()
        metadata = metadata.filter(item => 
          item.value.toLowerCase().includes(searchLower)
        )
      }
      
      // 应用限制
      const total = metadata.length
      metadata = metadata.slice(0, limit)
      
      return new ToolResult(this.name, {
        field,
        search: search || null,
        total,
        returned: metadata.length,
        metadata,
        hasMore: total > limit
      })
      
    } catch (error) {
      console.error('[MetadataExplorerTool] Error:', error)
      return new ToolResult(this.name, { error: error.message }, true)
    }
  }

  /**
   * 增强版：提取人物及其关联上下文
   */
  extractPeopleInvolved(data, limit = 10) {
    const peopleMap = new Map()
    
    data.forEach(record => {
      const aiMeta = record._ai_meta
      if (!aiMeta || !Array.isArray(aiMeta.people_involved)) return
      
      aiMeta.people_involved.forEach(person => {
        const p = person.trim()
        if (!p) return
        
        if (!peopleMap.has(p)) {
          peopleMap.set(p, { 
            count: 0, 
            projects: new Map(), // 关联项目计数
            moods: new Map()     // 关联情绪计数
          })
        }
        
        const entry = peopleMap.get(p)
        entry.count++
        
        // 统计关联项目
        const proj = record._meta_project || record.project
        if (proj) entry.projects.set(proj, (entry.projects.get(proj) || 0) + 1)
        
        // 统计关联情绪
        if (aiMeta.mood_tags) {
          aiMeta.mood_tags.forEach(m => 
            entry.moods.set(m, (entry.moods.get(m) || 0) + 1)
          )
        }
      })
    })
    
    // 格式化输出
    return Array.from(peopleMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([person, info]) => ({
        value: person,
        count: info.count,
        // 计算 Top 1 关联
        top_project: this.getTopKey(info.projects),
        top_mood: this.getTopKey(info.moods)
      }))
  }

  getTopKey(map) {
    if (map.size === 0) return null
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  /**
   * 提取情绪标签（从 AI 元数据）
   */
  extractMoodTags(data) {
    const moodMap = new Map()
    
    data.forEach(record => {
      const aiMeta = record._ai_meta
      if (aiMeta && Array.isArray(aiMeta.mood_tags)) {
        aiMeta.mood_tags.forEach(tag => {
          if (tag && tag.trim()) {
            const key = tag.trim()
            moodMap.set(key, (moodMap.get(key) || 0) + 1)
          }
        })
      }
    })
    
    return Array.from(moodMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * 提取物品（从 AI 元数据）
   */
  extractItems(data) {
    const itemsMap = new Map()
    
    data.forEach(record => {
      const aiMeta = record._ai_meta
      if (aiMeta && Array.isArray(aiMeta.items)) {
        aiMeta.items.forEach(item => {
          if (item && item.trim()) {
            const key = item.trim()
            itemsMap.set(key, (itemsMap.get(key) || 0) + 1)
          }
        })
      }
    })
    
    return Array.from(itemsMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * 提取地点（从 AI 元数据）
   */
  extractLocations(data) {
    const locationsMap = new Map()
    
    data.forEach(record => {
      const aiMeta = record._ai_meta
      
      // 从 location 字段提取
      if (aiMeta && aiMeta.location && aiMeta.location.trim()) {
        const key = aiMeta.location.trim()
        locationsMap.set(key, (locationsMap.get(key) || 0) + 1)
      }
      
      // 也可以从 items 中提取地点相关（如"办公室"、"咖啡厅"等）
      if (aiMeta && Array.isArray(aiMeta.items)) {
        aiMeta.items.forEach(item => {
          const locationKeywords = ['办公室', '家', '咖啡厅', '图书馆', '学校', '公司', '餐厅']
          if (locationKeywords.some(kw => item.includes(kw))) {
            const key = item.trim()
            locationsMap.set(key, (locationsMap.get(key) || 0) + 1)
          }
        })
      }
    })
    
    return Array.from(locationsMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * 提取项目（从基础元数据）
   */
  extractProjects(data) {
    const projectsMap = new Map()
    
    data.forEach(record => {
      const project = record._meta_project || record.project
      if (project && project.trim() && project !== 'Unknown') {
        const key = project.trim()
        projectsMap.set(key, (projectsMap.get(key) || 0) + 1)
      }
    })
    
    return Array.from(projectsMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * 提取内容类型（从 AI 元数据）
   */
  extractContentTypes(data) {
    const typesMap = new Map()
    
    data.forEach(record => {
      const aiMeta = record._ai_meta
      if (aiMeta && aiMeta.content_type) {
        const key = aiMeta.content_type
        typesMap.set(key, (typesMap.get(key) || 0) + 1)
      }
    })
    
    return Array.from(typesMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }
}
