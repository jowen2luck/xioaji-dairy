import fs from 'fs'
import path from 'path'

const toolFiles = [
  'createRecord.js',
  'updateRecord.js',
  'deleteRecord.js',
  'manageMemo.js',
  'searchRecords.js',
  'queryRecords.js',
  'getRecordDetail.js',
  'sqlAnalysis.js',
  'insight.js',
  'calendar.js',
  'metadata.js',
  'coreMemory.js'
]

const toolsDir = 'd:/Pcode/play/_apps/daily_log_vue/src/main/tools'
const allTools = []

for (const f of toolFiles) {
  const content = fs.readFileSync(path.join(toolsDir, f), 'utf-8')
  
  // 提取 this.name
  const nameMatch = content.match(/this\.name\s*=\s*['"]([^'"]+)['"]/)
  const name = nameMatch ? nameMatch[1] : f.replace('.js', '')

  // 提取 this.description
  let desc = ''
  const descBacktick = content.match(/this\.description\s*=\s*`([^`]+)`/)
  if (descBacktick) {
    desc = descBacktick[1]
  } else {
    const descQuote = content.match(/this\.description\s*=\s*['"]([^'"]+)['"]/)
    if (descQuote) desc = descQuote[1]
  }

  // 提取 this.schema = { ... }
  const schemaIndex = content.indexOf('this.schema = {')
  let schema = { type: 'object', properties: {} }
  if (schemaIndex !== -1) {
    // 找到匹配的大括号
    let braceCount = 0
    let startIndex = content.indexOf('{', schemaIndex)
    let endIndex = -1
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') braceCount++
      else if (content[i] === '}') {
        braceCount--
        if (braceCount === 0) {
          endIndex = i
          break
        }
      }
    }
    if (endIndex !== -1) {
      const schemaStr = content.slice(startIndex, endIndex + 1)
      try {
        // 使用 Function 动态求值
        schema = new Function(`return (${schemaStr})`)()
      } catch (e) {
        console.warn(`Failed to eval schema for ${f}:`, e.message)
      }
    }
  }

  allTools.push({
    type: 'function',
    function: {
      name,
      description: desc,
      parameters: schema
    }
  })
}

console.log('Parsed tools count:', allTools.length)
fs.writeFileSync('C:/Users/31239/.gemini/antigravity/brain/950bda69-eeee-44cc-8a60-88aa41048e85/scratch/all_parsed_tools.json', JSON.stringify(allTools, null, 2))
console.log('Saved all_parsed_tools.json')
