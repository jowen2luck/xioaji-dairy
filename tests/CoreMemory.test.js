import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { CoreMemoryManager } from '../src/main/agent/memory/coreMemory.js'

describe('CoreMemoryManager', () => {
  let tempDir
  let memoryFilePath
  let memoryManager

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-memory-test-'))
    memoryFilePath = path.join(tempDir, 'core-memory.json')
    memoryManager = new CoreMemoryManager({ storagePath: memoryFilePath })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should initialize with default structure', () => {
    const memory = memoryManager.getMemory()
    expect(memory.user_profile).toBeDefined()
    expect(memory.key_entities).toBeDefined()
    expect(memory.current_focus).toBeDefined()
    expect(memory.preferences).toBeDefined()
  })

  it('should render a structured prompt block', () => {
    const prompt = memoryManager.getPromptBlock()
    expect(prompt).toContain('<core_memory>')
    expect(prompt).toContain('</core_memory>')
    expect(prompt).toContain('用户画像')
  })

  it('should update a specific memory section and persist', () => {
    const success = memoryManager.updateSection('current_focus', '正在攻关Agent Harness架构重构')
    expect(success).toBe(true)

    // Verify in-memory
    const memory = memoryManager.getMemory()
    expect(memory.current_focus).toBe('正在攻关Agent Harness架构重构')

    // Verify on disk with new instance
    const freshManager = new CoreMemoryManager({ storagePath: memoryFilePath })
    expect(freshManager.getMemory().current_focus).toBe('正在攻关Agent Harness架构重构')
  })

  it('should reject invalid section names', () => {
    const success = memoryManager.updateSection('invalid_key', 'some content')
    expect(success).toBe(false)
  })

  it('should support renderPrompt method matching getPromptBlock', () => {
    expect(typeof memoryManager.renderPrompt).toBe('function')
    const prompt = memoryManager.renderPrompt()
    expect(prompt).toBe(memoryManager.getPromptBlock())
    expect(prompt).toContain('<core_memory>')
  })

  it('should support user and agent aliases and keep them synchronized', () => {
    // Updating 'user' updates 'user_profile' as well
    const userOk = memoryManager.updateSection('user', '新的用户画像与个性偏好')
    expect(userOk).toBe(true)
    const memAfterUser = memoryManager.getMemory()
    expect(memAfterUser.user).toBe('新的用户画像与个性偏好')
    expect(memAfterUser.user_profile).toBe('新的用户画像与个性偏好')

    // Updating 'agent' updates 'preferences' as well
    const agentOk = memoryManager.updateSection('agent', '新的助手准则设定')
    expect(agentOk).toBe(true)
    const memAfterAgent = memoryManager.getMemory()
    expect(memAfterAgent.agent).toBe('新的助手准则设定')
    expect(memAfterAgent.preferences).toBe('新的助手准则设定')
  })
})
