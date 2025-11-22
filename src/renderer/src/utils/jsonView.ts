import { TEMPLATES, TemplateSpec } from '../config/templates'

function isPlainObject(v: any) { return Object.prototype.toString.call(v) === '[object Object]' }

export function isJSONText(str: string) {
  if (typeof str !== 'string') return false
  const s = str.trim()
  return s.startsWith('{') || s.startsWith('[')
}

export function safeParse(str: string): any {
  try { return JSON.parse(str) } catch { return str }
}

export type RenderKind = 'text' | 'object' | 'array'

export type ObjectViewItem = { key: string, label: string, value: any }
export type ObjectView = { kind: 'object', items: ObjectViewItem[] }

export type ArrayView = { kind: 'array', columns: string[], rows: Record<string, any>[] }

export type TextView = { kind: 'text', text: string }

export type AnyView = ObjectView | ArrayView | TextView

function applyTemplateForObject(obj: Record<string, any>, tpl?: TemplateSpec): ObjectView {
  const keys = Object.keys(obj)
  const order = tpl?.order?.length ? tpl.order : keys
  const hidden = new Set(tpl?.hidden || [])
  const labelMap = tpl?.labelMap || {}
  const items: ObjectViewItem[] = []
  for (const k of order) {
    if (!keys.includes(k) || hidden.has(k)) continue
    items.push({ key: k, label: labelMap[k] || k, value: obj[k] })
  }
  // 追加未列出的键
  for (const k of keys) {
    if (hidden.has(k)) continue
    if (order.includes?.(k)) continue
    items.push({ key: k, label: labelMap[k] || k, value: obj[k] })
  }
  return { kind: 'object', items }
}

function inferColumns(rows: Record<string, any>[], tpl?: TemplateSpec): string[] {
  const set = new Set<string>()
  rows.forEach(r => Object.keys(r || {}).forEach(k => set.add(k)))
  const all = Array.from(set)
  if (tpl?.order?.length) {
    const ordered = tpl.order.filter(k => set.has(k))
    const rest = all.filter(k => !tpl.order!.includes(k))
    return [...ordered, ...rest]
  }
  return all
}

export function toView(value: any, toolName?: string): AnyView {
  const tpl = toolName ? TEMPLATES[toolName] : undefined
  if (typeof value === 'string') {
    if (isJSONText(value)) {
      const parsed = safeParse(value)
      return toView(parsed, toolName)
    }
    return { kind: 'text', text: value }
  }
  if (Array.isArray(value)) {
    const rows = value.filter(isPlainObject)
    if (rows.length === value.length && rows.length > 0) {
      const columns = inferColumns(rows, tpl)
      return { kind: 'array', columns, rows }
    }
    // 原始值数组
    return { kind: 'array', columns: ['value'], rows: value.map(v => ({ value: v })) }
  }
  if (isPlainObject(value)) {
    return applyTemplateForObject(value as Record<string, any>, tpl)
  }
  return { kind: 'text', text: String(value) }
}