/**
 * InquirySessionStore Tests
 */

import { describe, it, expect } from 'vitest'
import InquirySessionStore from '../src/main/domain/inquiry/InquirySessionStore.js'

describe('InquirySessionStore', () => {
  let store

  beforeEach(() => {
    store = new InquirySessionStore()
  })

  it('should create a new session with unique ID', () => {
    const session = store.createSession('How was my week?', { dateRange: { start: '2026-07-20', end: '2026-07-26' } })
    expect(session.id).toBeDefined()
    expect(session.id.startsWith('sess_')).toBe(true)
    expect(session.goal).toBe('How was my week?')
    expect(session.currentQuestion).toBe('How was my week?')
    expect(session.scope.dateRange.start).toBe('2026-07-20')
    expect(session.evidencePackIds).toEqual([])
  })

  it('should retrieve a session by ID', () => {
    const session = store.createSession('test question')
    const retrieved = store.getSession(session.id)
    expect(retrieved).toEqual(session)
  })

  it('should return null for non-existent session', () => {
    expect(store.getSession('non-existent')).toBeNull()
  })

  it('should update session scope and question', () => {
    const session = store.createSession('initial question')
    const updated = store.updateSession(session.id, 'follow-up question', { projects: ['工作'] })
    expect(updated.currentQuestion).toBe('follow-up question')
    expect(updated.scope.projects).toEqual(['工作'])
  })

  it('should merge scope on update (not replace)', () => {
    const session = store.createSession('q1', { dateRange: { start: '2026-07-20', end: '2026-07-26' } })
    const updated = store.updateSession(session.id, 'q2', { projects: ['家庭'] })
    expect(updated.scope.dateRange.start).toBe('2026-07-20')
    expect(updated.scope.projects).toEqual(['家庭'])
  })

  it('should throw on update of non-existent session', () => {
    expect(() => store.updateSession('bad-id', 'q')).toThrow('Session bad-id not found')
  })

  it('should add evidence pack to session', () => {
    const session = store.createSession('test')
    store.addEvidencePack(session.id, 'pack-001')
    store.addEvidencePack(session.id, 'pack-002')
    const retrieved = store.getSession(session.id)
    expect(retrieved.evidencePackIds).toEqual(['pack-001', 'pack-002'])
  })

  it('should not duplicate evidence pack IDs', () => {
    const session = store.createSession('test')
    store.addEvidencePack(session.id, 'pack-001')
    store.addEvidencePack(session.id, 'pack-001')
    expect(session.evidencePackIds).toEqual(['pack-001'])
  })

  it('should handle addEvidencePack for non-existent session gracefully', () => {
    expect(() => store.addEvidencePack('bad-id', 'pack')).not.toThrow()
  })
})
