import { describe, it, expect, beforeEach } from 'vitest'
import { BM25Index, reciprocalRankFusion } from '../src/main/infrastructure/retrieval/bm25.js'

describe('BM25Index', () => {
  let index

  beforeEach(() => {
    index = new BM25Index()
  })

  it('should tokenize Chinese text properly without punctuation', () => {
    const tokens = index.tokenize('今天和老张在五道口喝了咖啡，感觉很放松！')
    expect(tokens).toContain('老张')
    expect(tokens).toContain('五')
    expect(tokens).toContain('道口')
    expect(tokens).toContain('咖啡')
    expect(tokens).toContain('放松')
    expect(tokens).not.toContain('，')
    expect(tokens).not.toContain('！')
  })

  it('should add documents and search with accurate ranking', () => {
    index.addDocument('doc1', '今天去咖啡馆写代码，喝了一杯美式咖啡，效率很高。', { id: 'doc1' })
    index.addDocument('doc2', '晚上在健身房跑步，出了一身汗，感觉很畅快。', { id: 'doc2' })
    index.addDocument('doc3', '下午和朋友在五道口喝咖啡聊职业规划，然后去看了电影。', { id: 'doc3' })

    const results = index.search('咖啡 电影')
    expect(results.length).toBeGreaterThan(0)
    // doc3 既有咖啡又有电影，应该排在第一位
    expect(results[0].id).toBe('doc3')
    expect(results[0].snippet).toContain('咖啡')
  })

  it('should extract snippet containing query keywords', () => {
    const text = '早上起床吃了包子。中午开例会讨论需求。下午三点和老王在楼下麦当劳吃了汉堡顺便聊了技术架构方案。晚上回家看书。'
    const snippet = index.extractSnippet(text, ['麦当劳', '汉堡'], 60)
    expect(snippet).toContain('麦当劳')
  })

  it('should support reciprocal rank fusion', () => {
    const list1 = [
      { id: 'docA', score: 0.9 },
      { id: 'docB', score: 0.8 },
      { id: 'docC', score: 0.7 }
    ]
    const list2 = [
      { id: 'docB', score: 10.5 },
      { id: 'docD', score: 9.0 },
      { id: 'docA', score: 5.0 }
    ]

    const fused = reciprocalRankFusion([list1, list2])
    // docB 在 list1 排第 2，在 list2 排第 1，综合 RRF 分应该最高
    expect(fused[0].id).toBe('docB')
  })
})
