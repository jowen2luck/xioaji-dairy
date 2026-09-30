import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  BailianPoolManager,
  BAILIAN_MODELS_POOL,
  BAILIAN_AUTO_MODEL_ID
} from './src/main/llm/bailianPool.js'
import { createChatModel } from './src/main/llm/models.js'

async function runTests() {
  console.log('🚀 开始测试百炼模型聚合池机制...\n')

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bailian-pool-test-'))
  console.log(`[Test] 使用临时状态目录: ${tempDir}`)

  const manager = new BailianPoolManager()
  manager.setCustomDataDir(tempDir)

  // 1. 测试候选模型列表顺序
  console.log('--- 测试 1: 模型池顺序验证 ---')
  assert.strictEqual(BAILIAN_MODELS_POOL.length, 15, '应该有15个预置百炼模型')
  assert.strictEqual(BAILIAN_MODELS_POOL[0].id, 'qwen3.7-flash-2026-07-15')
  assert.strictEqual(BAILIAN_MODELS_POOL[1].id, 'qwen3.7-flash')
  assert.strictEqual(BAILIAN_MODELS_POOL[14].id, 'qwen3.8-omni-flash-realtime')

  // 验证按到期时间严格升序
  for (let i = 0; i < BAILIAN_MODELS_POOL.length - 1; i++) {
    const d1 = new Date(BAILIAN_MODELS_POOL[i].expireDate).getTime()
    const d2 = new Date(BAILIAN_MODELS_POOL[i + 1].expireDate).getTime()
    assert.ok(d1 <= d2, `模型顺序不符合到期日升序: ${BAILIAN_MODELS_POOL[i].id} (${BAILIAN_MODELS_POOL[i].expireDate}) vs ${BAILIAN_MODELS_POOL[i+1].id} (${BAILIAN_MODELS_POOL[i+1].expireDate})`)
  }
  console.log('✅ 测试 1 通过: 15个模型严格按到期日升序排列\n')

  // 2. 测试过期检测
  console.log('--- 测试 2: 过期检测机制 ---')
  // 模拟在 2026-10-25（前两个模型已过期：2026-10-23 到期）
  const simDate1 = new Date('2026-10-25T12:00:00+08:00')
  const candidates1 = manager.getActiveCandidates({ now: simDate1 })
  assert.strictEqual(candidates1[0].id, 'deepseek-v4-flash-0731', '前两个过期后，首个有效模型应顺延为 deepseek-v4-flash-0731')
  assert.strictEqual(manager.state.deprecated['qwen3.7-flash-2026-07-15']?.reason, 'expired')
  assert.strictEqual(manager.state.deprecated['qwen3.7-flash']?.reason, 'expired')
  console.log('✅ 测试 2 通过: 模拟时间自动标记过期，首个模型顺利顺延\n')

  // 3. 测试错误识别逻辑
  console.log('--- 测试 3: 废弃错误识别 ---')
  assert.ok(manager.isDeprecatableError(new Error('AllocationQuotaExceeded: your quota has run out')))
  assert.ok(manager.isDeprecatableError(new Error('Arrearage: please pay bill'), 402))
  assert.ok(manager.isDeprecatableError(new Error('ModelNotFound: qwen-xyz not exist'), 404))
  assert.ok(manager.isDeprecatableError(new Error('rate_limit_exceeded (429) quota exceeded'), 429))
  assert.ok(manager.isDeprecatableError(new Error('账号已欠费，额度已用尽')))
  // 瞬时网络错误不应被标记为模型废弃
  assert.ok(!manager.isDeprecatableError(new Error('connect ECONNREFUSED 127.0.0.1:443')))
  assert.ok(!manager.isDeprecatableError(new Error('ETIMEDOUT gateway timeout'), 504))
  console.log('✅ 测试 3 通过: 额度耗尽与模型下线识别精准，瞬时网络故障不误伤\n')

  // 4. 测试额度耗尽废弃与文件持久化
  console.log('--- 测试 4: 额度耗尽标记与持久化恢复 ---')
  manager.resetPool()
  // 初始当前模型
  const initialCurrent = manager.getCurrentModel({ now: new Date('2026-09-23T12:00:00+08:00') })
  assert.strictEqual(initialCurrent.id, 'qwen3.7-flash-2026-07-15')

  // 标记第1个模型额度耗尽
  manager.markDeprecated('qwen3.7-flash-2026-07-15', 'quota_exhausted', '429 AllocationQuotaExceeded')
  const afterQuotaCurrent = manager.getCurrentModel({ now: new Date('2026-09-23T12:00:00+08:00') })
  assert.strictEqual(afterQuotaCurrent.id, 'qwen3.7-flash', '顺延至第2个模型 qwen3.7-flash')

  // 重新实例化 Manager，验证持久化文件恢复
  const manager2 = new BailianPoolManager()
  manager2.setCustomDataDir(tempDir)
  manager2.ensureInitialized()
  assert.strictEqual(manager2.state.deprecated['qwen3.7-flash-2026-07-15']?.reason, 'quota_exhausted')
  const restoredCurrent = manager2.getCurrentModel({ now: new Date('2026-09-23T12:00:00+08:00') })
  assert.strictEqual(restoredCurrent.id, 'qwen3.7-flash', '重启/重新加载后依然顺延至 qwen3.7-flash')
  console.log('✅ 测试 4 通过: 废弃状态成功写入本地 JSON 并在重载后正确顺延\n')

  // 5. 测试多层顺延
  console.log('--- 测试 5: 连续顺延测试 ---')
  manager2.markDeprecated('qwen3.7-flash', 'quota_exhausted', 'AllocationQuotaExceeded')
  const thirdCurrent = manager2.getCurrentModel({ now: new Date('2026-09-23T12:00:00+08:00') })
  assert.strictEqual(thirdCurrent.id, 'deepseek-v4-flash-0731', '连续顺延至第3个模型 deepseek-v4-flash-0731')
  console.log('✅ 测试 5 通过: 连续耗尽连续顺延正常\n')

  // 6. 测试状态重置
  console.log('--- 测试 6: 模型池重置 ---')
  manager2.resetPool()
  const summary = manager2.getPoolSummary()
  assert.strictEqual(summary.deprecatedCount, 0, '重置后废弃数应为0')
  assert.strictEqual(summary.activeCount, 15, '重置后应恢复15个模型')
  console.log('✅ 测试 6 通过: resetPool 正确清空废弃记录\n')

  // 7. 测试 LangChain models.js 解析
  console.log('--- 测试 7: LangChain 模型工厂中的 bailian-auto 解析 ---')
  process.env.DASHSCOPE_API_KEY = 'test_mock_dashscope_key_for_unit_test'
  const chatModel = createChatModel('https://dashscope.aliyuncs.com/compatible-mode/v1', BAILIAN_AUTO_MODEL_ID)
  assert.strictEqual(chatModel.model || chatModel.modelName, 'qwen3.7-flash-2026-07-15', '自动将 bailian-auto 解析为首个可用模型')
  console.log('✅ 测试 7 通过: createChatModel 自动解析 bailian-auto 为可用模型\n')

  // 8. 测试 directOpenAI callOpenAIAPI 耗尽拦截
  console.log('--- 测试 8: callOpenAIAPI 在 bailian-auto 下的耗尽防护 ---')
  const { callOpenAIAPI } = await import('./src/main/llm/directOpenAI.js')
  // 模拟将全局单例模型全部标记耗尽
  const { bailianPoolManager: globalManager } = await import('./src/main/llm/bailianPool.js')
  globalManager.getActiveCandidates().forEach(c => globalManager.markDeprecated(c.id, 'quota_exhausted', 'test'))
  await assert.rejects(
    () => callOpenAIAPI({ baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'bailian-auto', messages: [] }),
    /所有百炼聚合候选模型均已过期或额度耗尽/
  )
  globalManager.resetPool()
  assert.strictEqual(globalManager.getActiveCandidates().length, 15, '全局模型池已成功恢复')
  console.log('✅ 测试 8 通过: callOpenAIAPI 正确拦截并能成功重置\n')

  console.log('🎉 所有百炼模型聚合与顺延测试均全部通过！')
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
