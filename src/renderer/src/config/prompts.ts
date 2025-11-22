import { loadConfig, saveConfig } from './assistant'

export function listPrompts() {
  const cfg = loadConfig()
  return cfg.prompts
}

export function updatePrompts(partial: Partial<ReturnType<typeof listPrompts>>) {
  const current = listPrompts()
  const merged = { ...current, ...partial }
  saveConfig({ prompts: merged })
  return merged
}

export function getPrompt(key: keyof ReturnType<typeof listPrompts>) {
  return listPrompts()[key]
}