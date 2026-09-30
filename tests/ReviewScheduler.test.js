/**
 * ReviewScheduler Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ReviewScheduler from '../src/main/adapters/jobs/ReviewScheduler.js'

// Mock ReviewService
const mockGenerate = vi.fn()
const mockReviewService = {
  generate: mockGenerate,
}

describe('ReviewScheduler', () => {
  let scheduler

  beforeEach(() => {
    vi.useFakeTimers()
    mockGenerate.mockReset()
    mockGenerate.mockResolvedValue({ artifactId: 'test-artifact', recipe: 'weekly' })
    scheduler = new ReviewScheduler({
      reviewService: mockReviewService,
      intervalMs: 1000, // fast interval for testing
    })
  })

  afterEach(() => {
    scheduler.stop()
    vi.useRealTimers()
  })

  it('should not be running by default', () => {
    expect(scheduler.isRunning).toBe(false)
  })

  it('should start and stop', () => {
    scheduler.start()
    expect(scheduler.isRunning).toBe(true)
    scheduler.stop()
    expect(scheduler.isRunning).toBe(false)
  })

  it('should not start twice', () => {
    scheduler.start()
    const timer = scheduler.timer
    scheduler.start()
    expect(scheduler.timer).toBe(timer) // same timer
  })

  it('should call generate on check after interval', async () => {
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1100)
    expect(mockGenerate).toHaveBeenCalled()
  })

  it('generateNow should call service.generate immediately', async () => {
    const result = await scheduler.generateNow('weekly')
    expect(mockGenerate).toHaveBeenCalledWith({ recipe: 'weekly' })
    expect(result.artifactId).toBe('test-artifact')
  })

  it('generateNow should update lastGenerated', async () => {
    await scheduler.generateNow('monthly')
    expect(scheduler.lastGenerated.monthly).toBeDefined()
    expect(typeof scheduler.lastGenerated.monthly).toBe('number')
  })

  it('getStatus should return current state', () => {
    const status = scheduler.getStatus()
    expect(status.isRunning).toBe(false)
    expect(status.intervalMs).toBe(1000)
    expect(status.lastGenerated).toBeDefined()
  })

  it('should call onReviewGenerated callback', async () => {
    const callback = vi.fn()
    scheduler.onReviewGenerated = callback
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1100)
    expect(callback).toHaveBeenCalled()
  })
})
