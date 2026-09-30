import { describe, it, expect } from 'vitest'
import { extractPlainText } from '../src/renderer/src/utils/clipboard.js'

describe('Clipboard Utils - extractPlainText', () => {
  it('should return empty string for empty input', () => {
    expect(extractPlainText('')).toBe('')
    expect(extractPlainText(null)).toBe('')
    expect(extractPlainText(undefined)).toBe('')
  })

  it('should preserve plain text as is', () => {
    const text = '今天天气晴朗，散步发现了一只小猫。'
    expect(extractPlainText(text)).toBe(text)
  })

  it('should strip HTML tags and convert paragraphs/breaks into newlines', () => {
    const html = '<p>累累累，躺躺躺</p><p>怎么一回来就有这么大的疲惫感。</p>'
    expect(extractPlainText(html)).toBe('累累累，躺躺躺\n怎么一回来就有这么大的疲惫感。')
  })

  it('should decode HTML entities and handle lists', () => {
    const html = '<p>今日清单&nbsp;&amp;&nbsp;进展：</p><ul><li>第一项 &lt;已完成&gt;</li><li>第二项 &quot;进行中&quot;</li></ul>'
    const result = extractPlainText(html)
    expect(result).toContain('今日清单 & 进展：')
    expect(result).toContain('• 第一项 <已完成>')
    expect(result).toContain('• 第二项 "进行中"')
  })
})
