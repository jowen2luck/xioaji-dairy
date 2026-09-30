import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseManager } from '../src/main/infrastructure/db/DatabaseManager.js'

describe('DatabaseManager', () => {
  let tempDir
  let dbFilePath
  let dbManager

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-log-db-test-'))
    dbFilePath = path.join(tempDir, 'test_daily_log.db')
    dbManager = new DatabaseManager({ dbPath: dbFilePath })
  })

  afterEach(() => {
    if (dbManager) {
      dbManager.close()
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('should initialize and create tables in Schema V1', () => {
    expect(dbManager.db).toBeDefined()
    expect(dbManager.hasVecExtension).toBe(true)

    // Verify user_profile table exists
    const userProfileCheck = dbManager.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profile'").get()
    expect(userProfileCheck?.name).toBe('user_profile')

    // Verify episodic_memories table exists
    const memoriesCheck = dbManager.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='episodic_memories'").get()
    expect(memoriesCheck?.name).toBe('episodic_memories')

    // Verify vec_memories virtual table exists
    const vecCheck = dbManager.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_memories'").get()
    expect(vecCheck?.name).toBe('vec_memories')
  })

  it('should execute transactions and commit cleanly', () => {
    dbManager.transaction((db) => {
      db.prepare(`
        INSERT INTO user_profile(key, value, category, updated_at) 
        VALUES(?, ?, ?, ?)
      `).run('test_key', 'test_value', 'general', Date.now())
    })

    const record = dbManager.prepare("SELECT * FROM user_profile WHERE key = ?").get('test_key')
    expect(record.value).toBe('test_value')
  })

  it('should rollback transactions on error', () => {
    expect(() => {
      dbManager.transaction((db) => {
        db.prepare(`
          INSERT INTO user_profile(key, value, category, updated_at) 
          VALUES(?, ?, ?, ?)
        `).run('rollback_key', 'should_not_exist', 'general', Date.now())
        throw new Error('Forced transaction failure')
      })
    }).toThrow('Forced transaction failure')

    const record = dbManager.prepare("SELECT * FROM user_profile WHERE key = ?").get('rollback_key')
    expect(record).toBeUndefined()
  })

  it('should support in-memory mode for fast headless testing', () => {
    const memDb = new DatabaseManager({ inMemory: true })
    expect(memDb.hasVecExtension).toBe(true)
    const res = memDb.prepare("SELECT vec_version() as v").get()
    expect(res?.v).toBeDefined()
    memDb.close()
  })
})
