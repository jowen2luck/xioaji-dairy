/**
 * @file ArtifactRepository.js
 * @description Persists review artifacts and exploration results as JSON files.
 * Provides simple CRUD for artifacts with safe writes and listing.
 */

import fs from 'node:fs'
import path from 'node:path'

export default class ArtifactRepository {
  /**
   * @param {Object} options
   * @param {Function} options.getStoragePath — returns directory for artifact storage
   * @param {string} [options.subDir='artifacts'] — subdirectory name
   */
  constructor({ getStoragePath, subDir = 'artifacts' } = {}) {
    this.getStoragePath = getStoragePath
    this.subDir = subDir
    this._cache = new Map()
  }

  /**
   * Get the full storage directory path.
   * @returns {string}
   */
  getStorageDir() {
    const basePath = this.getStoragePath()
    return path.join(basePath, this.subDir)
  }

  /**
   * Ensure storage directory exists.
   */
  _ensureDir() {
    const dir = this.getStorageDir()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  /**
   * Save an artifact. Returns the saved artifact with metadata.
   * @param {Object} artifact
   * @returns {Object} saved artifact
   */
  save(artifact) {
    const dir = this._ensureDir()
    const id = artifact.id || `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const timestamp = new Date().toISOString()

    const stored = {
      ...artifact,
      id,
      savedAt: timestamp,
      _version: 1,
    }

    const filePath = path.join(dir, `${id}.json`)

    // Atomic write
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(stored, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)

    // Update cache
    this._cache.set(id, stored)

    console.log(`[ArtifactRepository] Saved artifact: ${id}`)
    return stored
  }

  /**
   * Get artifact by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    // Check cache first
    if (this._cache.has(id)) return this._cache.get(id)

    const filePath = path.join(this.getStorageDir(), `${id}.json`)
    if (!fs.existsSync(filePath)) return null

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      this._cache.set(id, data)
      return data
    } catch {
      return null
    }
  }

  /**
   * List all artifacts, optionally filtered by type.
   * @param {Object} [filter]
   * @param {string} [filter.type] — artifact type (e.g. 'review/weekly')
   * @param {number} [filter.limit]
   * @returns {Array<Object>}
   */
  list({ type, limit } = {}) {
    const dir = this.getStorageDir()
    if (!fs.existsSync(dir)) return []

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    let artifacts = []

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
        artifacts.push(data)
      } catch {
        // skip corrupted files
      }
    }

    // Sort newest first
    artifacts.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))

    // Apply type filter
    if (type) {
      artifacts = artifacts.filter(a => a.type === type || a.recipe === type)
    }

    // Apply limit
    if (limit && limit > 0) {
      artifacts = artifacts.slice(0, limit)
    }

    return artifacts
  }

  /**
   * Delete an artifact by ID.
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const filePath = path.join(this.getStorageDir(), `${id}.json`)
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      this._cache.delete(id)
      return true
    } catch {
      return false
    }
  }

  /**
   * Clear all artifacts.
   */
  clearAll() {
    const dir = this.getStorageDir()
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
      for (const file of files) {
        fs.unlinkSync(path.join(dir, file))
      }
    }
    this._cache.clear()
  }
}
