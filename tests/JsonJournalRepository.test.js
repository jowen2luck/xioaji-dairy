/**
 * JsonJournalRepository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import JsonJournalRepository from '../src/main/infrastructure/persistence/JsonJournalRepository.js'

const testFilePath = path.join(tmpdir(), 'journal-repo-test-' + Date.now(), 'appData.json')

describe('JsonJournalRepository', () => {
  let repo

  beforeEach(() => {
    repo = new JsonJournalRepository({ filePath: testFilePath })
  })

  afterEach(() => {
    const dir = path.dirname(testFilePath)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  })

  it('should load empty when file does not exist', async () => {
    const result = await repo.load()
    expect(result).toEqual([])
    expect(repo.isLoaded).toBe(true)
  })

  it('should load records from JSON file', async () => {
    const dir = path.dirname(testFilePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(testFilePath, JSON.stringify([
      { _id: 'r1', time: '2026-07-25 09:00', ganshou: '<p>Hello</p>', shanggexiangmu: '工作' },
      { _id: 'r2', time: '2026-07-24 14:30', ganshou: 'World', shanggexiangmu: '家庭' },
    ]), 'utf-8')

    const result = await repo.load()
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('r1')
    expect(result[0].contentText).toBe('Hello')
  })

  it('should handle malformed JSON gracefully', async () => {
    const dir = path.dirname(testFilePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(testFilePath, 'not json{', 'utf-8')

    const result = await repo.load()
    expect(result).toEqual([])
  })

  it('should get record by ID', async () => {
    await repo.upsert([
      { id: 'r1', occurredAt: '2026-07-25', contentHtml: '<p>Hi</p>', contentText: 'Hi' }
    ])
    const record = await repo.get('r1')
    expect(record).not.toBeNull()
    expect(record.id).toBe('r1')
  })

  it('should return null for missing ID', async () => {
    await repo.load()
    expect(await repo.get('missing')).toBeNull()
  })

  it('should list all records with no scope', async () => {
    await repo.upsert([
      { id: 'r1', occurredAt: '2026-07-25', contentText: 'A' },
      { id: 'r2', occurredAt: '2026-07-24', contentText: 'B' },
    ])
    const records = await repo.list()
    expect(records.length).toBe(2)
  })

  it('should filter by dateRange', async () => {
    await repo.upsert([
      { id: 'r1', occurredAt: '2026-07-25T09:00:00', contentText: 'A' },
      { id: 'r2', occurredAt: '2026-07-20T09:00:00', contentText: 'B' },
    ])
    const records = await repo.list({ dateRange: { start: '2026-07-24', end: '2026-07-26' } })
    expect(records.length).toBe(1)
    expect(records[0].id).toBe('r1')
  })

  it('should filter by projects', async () => {
    await repo.upsert([
      { id: 'r1', occurredAt: '2026-07-25', contentText: 'A', project: '工作' },
      { id: 'r2', occurredAt: '2026-07-24', contentText: 'B', project: '家庭' },
    ])
    const records = await repo.list({ projects: ['工作'] })
    expect(records.length).toBe(1)
    expect(records[0].project).toBe('工作')
  })

  it('should filter by recordIds', async () => {
    await repo.upsert([
      { id: 'r1', occurredAt: '2026-07-25', contentText: 'A' },
      { id: 'r2', occurredAt: '2026-07-24', contentText: 'B' },
      { id: 'r3', occurredAt: '2026-07-23', contentText: 'C' },
    ])
    const records = await repo.list({ recordIds: ['r1', 'r3'] })
    expect(records.length).toBe(2)
  })

  it('should upsert new records', async () => {
    const result = await repo.upsert([
      { id: 'r1', occurredAt: '2026-07-25', contentText: 'A' },
    ])
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
  })

  it('should increment revision on update', async () => {
    await repo.upsert([{ id: 'r1', occurredAt: '2026-07-25', contentText: 'A' }])
    const result = await repo.upsert([{ id: 'r1', occurredAt: '2026-07-25', contentText: 'B' }])
    expect(result.updated).toBe(1)
    const record = await repo.get('r1')
    expect(record.revision).toBe(2)
  })

  it('should update record patch and increment revision', async () => {
    await repo.upsert([{ id: 'r1', occurredAt: '2026-07-25', contentText: 'A' }])
    const updated = await repo.update('r1', { project: '家庭' })
    expect(updated.project).toBe('家庭')
    expect(updated.revision).toBe(2)
  })

  it('should throw on update of missing record', async () => {
    await repo.load()
    await expect(repo.update('missing', { project: 'X' })).rejects.toThrow()
  })

  it('should get revision for a record', async () => {
    await repo.upsert([{ id: 'r1', occurredAt: '2026-07-25', contentText: 'A' }])
    const rev = await repo.getRevision('r1')
    expect(rev).toBe(1)
  })

  it('should flush to disk (file exists with correct content)', async () => {
    await repo.upsert([{ id: 'r1', occurredAt: '2026-07-25', contentText: 'A' }])
    expect(fs.existsSync(testFilePath)).toBe(true)
    const saved = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'))
    expect(saved.length).toBe(1)
    expect(saved[0]._id).toBe('r1')
  })

  it('should strip HTML tags from contentText after load', async () => {
    const dir = path.dirname(testFilePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(testFilePath, JSON.stringify([
      { _id: 'r1', time: '2026-07-25', ganshou: '<p>Hello <strong>World</strong></p>' },
    ]), 'utf-8')
    const result = await repo.load()
    expect(result[0].contentText).toBe('Hello World')
    expect(result[0].contentText).not.toContain('<')
  })
})
