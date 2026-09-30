/**
 * 剪贴板与纯文本处理工具
 */

/**
 * 提取并清洗 HTML/富文本内容为纯文本格式
 * @param {string} content - 原始日记内容（可能包含 HTML 标签）
 * @returns {string} 干净的纯文本
 */
export function extractPlainText(content) {
  if (!content) return ''
  let text = String(content)

  // 如果包含 HTML 标签，先将常见换行标签转为真实换行
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<li\s*[\/]?>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      // 去除其余所有 HTML 标签
      .replace(/<[^>]+>/g, '')
      // 转义常用 HTML 实体
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }

  // 整理多余连续空行，保持段落自然
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 将文本安全写入系统剪贴板（标准 API 优先，降级兼容 execCommand）
 * @param {string} text - 待复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyTextToClipboard(text) {
  if (!text) return false

  // 1. 优先使用现代化 navigator.clipboard API
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    console.warn('[Clipboard] navigator.clipboard.writeText failed, fallback to execCommand:', err)
  }

  // 2. 降级方案：创建不可见的 textarea 执行 execCommand('copy')
  try {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '0'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textarea)
      return successful
    }
  } catch (e) {
    console.error('[Clipboard] Both clipboard API and execCommand failed:', e)
  }

  return false
}
