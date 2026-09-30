/**
 * @file ReviewScheduler.js
 * @description Periodic review scheduler. Generates weekly/monthly/yearly review artifacts
 * on a timer and persists them via ReviewService.
 *
 * In production Electron apps, this would be driven by app lifecycle events
 * (resume, idle OS wake) or OS-level scheduling. Here we provide a simple
 * interval-based scheduler for demonstration.
 */

import { getReviewService } from '../../application/index.js'

const INTERVALS = {
  weekly: 7 * 24 * 3600 * 1000,   // 7 days
  monthly: 30 * 24 * 3600 * 1000,  // 30 days
  yearly: 365 * 24 * 3600 * 1000,  // 365 days
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check every hour

export default class ReviewScheduler {
  constructor({ reviewService, intervalMs = CHECK_INTERVAL_MS } = {}) {
    this.reviewService = reviewService || null
    this.intervalMs = intervalMs
    this.timer = null
    this.lastGenerated = { weekly: null, monthly: null, yearly: null }
    this.isRunning = false
    this.onReviewGenerated = null // callback(artifact)
  }

  getReviewService() {
    if (!this.reviewService) {
      this.reviewService = getReviewService()
    }
    return this.reviewService
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.timer = setInterval(() => this._checkAndGenerate(), this.intervalMs)
    console.log('[ReviewScheduler] Started, checking every', this.intervalMs / 3600000, 'hours')
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.isRunning = false
    console.log('[ReviewScheduler] Stopped')
  }

  async _checkAndGenerate() {
    const now = Date.now()
    const service = this.getReviewService()

    for (const [recipe, interval] of Object.entries(INTERVALS)) {
      const last = this.lastGenerated[recipe]
      if (!last || (now - last) >= interval) {
        try {
          console.log(`[ReviewScheduler] Generating ${recipe} review...`)
          const artifact = await service.generate({ recipe })
          this.lastGenerated[recipe] = now
          if (typeof this.onReviewGenerated === 'function') {
            this.onReviewGenerated(artifact)
          }
        } catch (error) {
          console.error(`[ReviewScheduler] Failed to generate ${recipe} review:`, error.message)
        }
      }
    }
  }

  async generateNow(recipe = 'weekly') {
    const service = this.getReviewService()
    const artifact = await service.generate({ recipe })
    this.lastGenerated[recipe] = Date.now()
    return artifact
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      lastGenerated: { ...this.lastGenerated }
    }
  }
}
