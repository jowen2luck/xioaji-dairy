# Markdown 渲染支持文档

## 概述

项目现已集成 Markdown 解析功能，支持在日志正文中使用 Markdown 语法。

## 使用的库

- **marked**: 高性能 Markdown 解析库
- **highlight.js**: 代码高亮库（支持 180+ 编程语言）
- **dompurify**: HTML 安全清理库（防止 XSS 攻击）

## 支持的 Markdown 语法

### 基础格式
```markdown
# 一级标题
## 二级标题
### 三级标题

**粗体** 或 __粗体__
*斜体* 或 _斜体_
~~删除线~~

> 引用块

[链接](https://example.com)
![图片](https://example.com/image.png)
```

### 列表
```markdown
- 项目 1
- 项目 2
  - 嵌套项目
  
1. 有序项目 1
2. 有序项目 2
```

### 代码
```markdown
行内代码：`const x = 1`

代码块：
\`\`\`javascript
function hello() {
  console.log('Hello World')
}
\`\`\`

支持的语言：javascript, python, java, c++, html, css, sql 等...
```

### 表格
```markdown
| 列 1 | 列 2 | 列 3 |
|-----|-----|-----|
| 内容 | 内容 | 内容 |
| 内容 | 内容 | 内容 |
```

### 分割线
```markdown
---
或
***
或
___
```

## 组件使用

### MarkdownRenderer 组件

在任何需要渲染 Markdown 的地方使用：

```vue
<template>
  <MarkdownRenderer :content="markdownText" />
</template>

<script setup>
import MarkdownRenderer from './components/MarkdownRenderer.vue'
</script>
```

**Props:**
- `content` (String, required): Markdown 内容字符串

## 样式定制

MarkdownRenderer 组件内置了美观的样式，支持：

### 亮色主题
- 清爽的排版
- 紫色强调色 (#6366f1)
- 适中的对比度

### 暗色主题
- 自动适应深色模式
- 可读性优化
- 代码块背景自适应

### CSS 变量
```css
--text-main: 主文字颜色
--text-sec: 次要文字颜色
--text-light: 浅色文字
--accent-color: 强调色（默认紫色）
--card-bg: 卡片背景
--card-border: 边框颜色
```

## 已集成位置

1. **EnhancedRecordCard.vue** - AI 增强卡片的正文显示
2. **SimpleRecordCard.vue** - 简化卡片的正文显示

两个组件都通过 `MarkdownRenderer` 自动解析日志内容中的 Markdown 语法。

## 性能考虑

- 解析采用懒加载策略
- 代码高亮仅对包含的语言进行处理
- HTML 内容经过 DOMPurify 清理，防止 XSS
- 渲染结果缓存，避免重复计算

## 安全性

- 所有 HTML 内容都经过 DOMPurify 清理
- 防止 XSS 攻击
- 支持 HTML 标签的白名单配置

## 示例

### 日志内容示例

```markdown
## 今天的工作总结

### 完成的任务
1. 修复了登录页面的 Bug
2. 优化了数据库查询
3. 更新了 API 文档

### 技术栈
- **前端**: Vue 3 + TypeScript
- **后端**: Node.js + Express
- **数据库**: PostgreSQL

### 代码片段

修复的关键代码：

\`\`\`javascript
// 之前的问题代码
const handleLogin = async (user) => {
  const token = await api.login(user)
  // 忘记 return 了！
}

// 修复后
const handleLogin = async (user) => {
  const token = await api.login(user)
  return token
}
\`\`\`

### 心得体会

> 今天学到了一个重要的教训：
> 在处理异步操作时一定要确保正确返回结果！

---

**时间**: 2 小时
**地点**: 办公室
```

## 故障排除

### 问题：Markdown 不能正确渲染
**解决方案**：
1. 检查内容是否包含有效的 Markdown 语法
2. 查看浏览器控制台是否有错误信息
3. 确保 `marked` 库已正确安装

### 问题：代码块没有高亮
**解决方案**：
1. 确保代码块指定了语言类型（如 \`\`\`javascript）
2. 检查 `highlight.js` 是否支持该语言
3. 查看浏览器控制台错误信息

### 问题：样式显示异常
**解决方案**：
1. 检查是否正确应用了 CSS 变量
2. 确保主题切换正常工作
3. 清除浏览器缓存重新加载

## 后续优化方向

1. 支持自定义主题
2. 添加 Markdown 预览功能
3. 支持更多扩展语法（如数学公式、图表）
4. 添加 Markdown 编辑器
