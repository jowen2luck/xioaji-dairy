/**
 * DatabaseManager - 本地 SQLite 统一数据库连接管理器
 * 
 * 职责：
 * 1. 采用 Node 22+ 原生 node:sqlite (DatabaseSync) 提供单例数据库连接
 * 2. 启用 WAL (Write-Ahead Log) 模式，解决桌面端并发读写锁竞争
 * 3. 动态加载 sqlite-vec 向量扩展，为智能体长效记忆提供端侧硬件加速向量检索
 * 4. 自动化 Schema 迁移与健全性校验 (Schema V1)
 * 5. 安全事务 (Transaction) 包裹与优雅退出保护 (Shutdown & Checkpoint)
 */

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import * as sqliteVec from 'sqlite-vec'

let dbManagerInstance = null

export class DatabaseManager {
  /**
   * @param {Object} options
   * @param {string} [options.dbPath] - 数据库文件路径，默认存放在 userData/daily_log.db 或当前缓存目录
   * @param {boolean} [options.inMemory=false] - 是否为纯内存数据库（用于单元测试）
   */
  constructor({ dbPath = null, inMemory = false } = {}) {
    this.inMemory = inMemory
    this.dbPath = inMemory ? ':memory:' : (dbPath || this._resolveDefaultDbPath())
    this.db = null
    this.hasVecExtension = false
    this._initialized = false

    this._init()
  }

  _resolveDefaultDbPath() {
    try {
      let appModule = null
      try {
        appModule = require('electron')?.app
      } catch {}
      if (appModule && typeof appModule.getPath === 'function') {
        return path.join(appModule.getPath('userData'), 'daily_log.db')
      }
    } catch {}
    return path.join(process.cwd(), '.cache', 'daily_log.db')
  }

  _init() {
    if (this._initialized && this.db) return

    if (!this.inMemory) {
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }

    try {
      // allowExtension: true 是 Node.js node:sqlite 允许加载动态扩展的安全选项
      this.db = new DatabaseSync(this.dbPath, { allowExtension: true })

      // 1. 配置高并发与高性能 PRAGMA 参数
      if (!this.inMemory) {
        this.db.exec(`
          PRAGMA journal_mode = WAL;
          PRAGMA synchronous = NORMAL;
        `)
      }
      this.db.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
      `)

      // 2. 加载 sqlite-vec 扩展
      try {
        this.db.enableLoadExtension(true)
        sqliteVec.load(this.db)
        const versionRes = this.db.prepare('SELECT vec_version() as version').get()
        this.hasVecExtension = true
        console.log('[DatabaseManager] sqlite-vec loaded successfully, version:', versionRes?.version)
      } catch (vecErr) {
        console.warn('[DatabaseManager] Warning: failed to load sqlite-vec extension. Fallback to CPU-based vector search.', vecErr.message)
        this.hasVecExtension = false
      }

      // 3. 执行建表脚本 (Schema V1)
      this._applySchemaV1()

      this._initialized = true
      console.log(`[DatabaseManager] Database initialized at: ${this.dbPath} (inMemory: ${this.inMemory})`)
    } catch (err) {
      console.error('[DatabaseManager] Fatal: Database initialization failed:', err)
      throw err
    }
  }

  /**
   * 应用第一期统一数据库 Schema
   */
  _applySchemaV1() {
    // 1. 结构化画像与偏好表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        updated_at INTEGER NOT NULL
      );
    `)

    // 2. 情节记忆事实表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodic_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT,
        category TEXT DEFAULT 'fact',
        confidence REAL DEFAULT 1.0,
        is_valid INTEGER DEFAULT 1,
        invalidated_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_valid_source 
      ON episodic_memories(is_valid, source_type);
    `)

    // 3. sqlite-vec 向量虚表 (384维，对应 bge-small-zh 模型)
    if (this.hasVecExtension) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
            memory_id TEXT PRIMARY KEY,
            embedding float[384]
          );
        `)
      } catch (e) {
        console.warn('[DatabaseManager] Failed to create vec_memories virtual table:', e.message)
      }
    }

    // 4. 会话与消息表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        context_summary TEXT,
        reacts_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        react_steps TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session 
      ON chat_messages(session_id, created_at ASC);
    `)

    // 5. 便签表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        topic TEXT DEFAULT '生活随想',
        project TEXT DEFAULT '生活',
        date TEXT,
        quotes TEXT,
        status TEXT DEFAULT 'active',
        target_record_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memos_status_date
      ON memos(status, date);
    `)

    // 6. 正式日记与 AI 分析元数据表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS journals (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        project TEXT DEFAULT '日常',
        occurred_at TEXT NOT NULL,
        duration_min INTEGER DEFAULT 0,
        duration_str TEXT,
        is_deleted INTEGER DEFAULT 0,
        raw_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_journals_occurred 
      ON journals(occurred_at DESC);

      CREATE INDEX IF NOT EXISTS idx_journals_project 
      ON journals(project);

      CREATE TABLE IF NOT EXISTS journal_ai_meta (
        journal_id TEXT PRIMARY KEY REFERENCES journals(id) ON DELETE CASCADE,
        summary TEXT,
        mood_tags TEXT,
        energy_level INTEGER,
        people_involved TEXT,
        items TEXT,
        key_quotes TEXT,
        updated_at INTEGER NOT NULL
      );
    `)

    // 针对历史已有表执行平滑增列补齐
    this._ensureColumn('chat_sessions', 'reacts_json', 'TEXT')
    this._ensureColumn('memos', 'project', "TEXT DEFAULT '生活'")
    this._ensureColumn('memos', 'date', 'TEXT')
    this._ensureColumn('memos', 'quotes', 'TEXT')
    this._ensureColumn('memos', 'target_record_id', 'TEXT')
    this._ensureColumn('journals', 'raw_json', 'TEXT')
    this._ensureColumn('journals', 'duration_str', 'TEXT')
  }

  _ensureColumn(tableName, colName, colDef) {
    try {
      const cols = this.db.prepare(`PRAGMA table_info(${tableName})`).all()
      if (!cols.some(c => c.name === colName)) {
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef}`)
      }
    } catch {}
  }

  /**
   * 事务执行器
   * @param {Function} callback - 包含具体操作的回调函数
   * @returns {*} callback 执行结果
   */
  transaction(callback) {
    this.db.exec('BEGIN TRANSACTION')
    try {
      const result = callback(this.db)
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch (rbErr) {
        console.error('[DatabaseManager] Rollback failed:', rbErr)
      }
      throw error
    }
  }

  /**
   * 准备预编译语句
   * @param {string} sql
   */
  prepare(sql) {
    return this.db.prepare(sql)
  }

  /**
   * 执行原生 SQL 脚本
   * @param {string} sql
   */
  exec(sql) {
    return this.db.exec(sql)
  }

  /**
   * 触发 WAL checkpoint 归档
   */
  checkpoint() {
    if (!this.inMemory && this.db) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
      } catch (e) {
        console.warn('[DatabaseManager] WAL checkpoint warning:', e.message)
      }
    }
  }

  /**
   * 安全断开连接并落盘
   */
  close() {
    if (this.db) {
      try {
        this.checkpoint()
        this.db.close()
        this.db = null
        this._initialized = false
        console.log('[DatabaseManager] Database closed cleanly.')
      } catch (e) {
        console.error('[DatabaseManager] Error closing database:', e)
      }
    }
  }
}

/**
 * 获取全局单例 DatabaseManager
 * @param {Object} [options]
 * @returns {DatabaseManager}
 */
export function getDatabaseManager(options = {}) {
  if (!dbManagerInstance) {
    dbManagerInstance = new DatabaseManager(options)
  }
  return dbManagerInstance
}

/**
 * 重置单例（主要用于测试）
 */
export function resetDatabaseManager() {
  if (dbManagerInstance) {
    dbManagerInstance.close()
    dbManagerInstance = null
  }
}
