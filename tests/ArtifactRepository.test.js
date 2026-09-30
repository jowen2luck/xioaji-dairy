/**
 * ArtifactRepository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import ArtifactRepository from '../src/main/infrastructure/persistence/ArtifactRepository.js'

const testStorageDir = path.join(tmpdir(), 'artifact-repo-test-' + Date.now())

describe('ArtifactRepository', () => {
  let repo

  beforeEach(() => {
    repo = new ArtifactRepository({ getStoragePath: () => testStorageDir })
  })

  afterEach(() => {
    try { fs.rmSync(testStorageDir, { recursive: true, force: true }) } catch {}
  })

  it('should save an artifact with generated ID', () => {
    const saved = repo.save({ type: 'review/weekly', recipe: 'weekly', data: 'test' })
    expect(saved.id).toBeDefined()
    expect(saved.type).toBe('review/weekly')
    expect(saved.savedAt).toBeDefined()
  })

  it('should use provided ID if given', () => {
    const saved = repo.save({ id: 'custom-id', type: 'test' })
    expect(saved.id).toBe('custom-id')
  })

  it('should retrieve artifact by ID', () => {
    const saved = repo.save({ type: 'test', data: 'hello' })
    const retrieved = repo.getById(saved.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved.type).toBe('test')
    expect(retrieved.data).toBe('hello')
  })

  it('should return null for non-existent ID', () => {
    expect(repo.getById('non-existent')).toBeNull()
  })

  it('should list all artifacts sorted newest first', () => {
    repo.save({ type: 'test', data: 'first' })
    repo.save({ type: 'test', data: 'second' })
    repo.save({ type: 'test', data: 'third' })
    const list = repo.list()
    expect(list.length).toBe(3)
    expect(list[0].data).toBe('third')
  })

  it('should filter by type', () => {
    repo.save({ type: 'review/weekly', recipe: 'weekly' })
    repo.save({ type: 'review/monthly', recipe: 'monthly' })
    repo.save({ type: 'exploration', data: 'x' })
    const weekly = repo.list({ type: 'review/weekly' })
    expect(weekly.length).toBe(1)
    expect(weekly[0].recipe).toBe('weekly')
  })

  it('should limit results', () => {
    for (let i = 0; i < 10; i++) repo.save({ type: 'test', data: `item-${i}` })
    const list = repo.list({ limit: 3 })
    expect(list.length).toBe(3)
  })

  it('should delete artifact by ID', () => {
    const saved = repo.save({ type: 'test', data: 'delete-me' })
    expect(repo.delete(saved.id)).toBe(true)
    expect(repo.getById(saved.id)).toBeNull()
  })

  it('should clear all artifacts', () => {
    repo.save({ type: 'test', data: 'a' })
    repo.save({ type: 'test', data: 'b' })
    repo.clearAll()
    expect(repo.list()).toEqual([])
  })

  it('should create storage directory on first save', () => {
    expect(fs.existsSync(testStorageDir)).toBe(false)
    repo.save({ type: 'test' })
    expect(fs.existsSync(testStorageDir)).toBe(true)
  })

  it('should persist to disk (file exists)', () => {
    const saved = repo.save({ type: 'test', data: 'persisted' })
    const filePath = path.join(testStorageDir, 'artifacts', `${saved.id}.json`)
    expect(fs.existsSync(filePath)).toBe(true)
  })
})
