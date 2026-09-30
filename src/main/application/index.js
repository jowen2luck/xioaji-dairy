/**
 * @file index.js
 * @description Central Application Factory for Daily Log Target Architecture Services.
 */

import path from 'node:path'
import { app } from 'electron'
import JsonJournalRepository from '../infrastructure/persistence/JsonJournalRepository.js'
import ArtifactRepository from '../infrastructure/persistence/ArtifactRepository.js'
import LocalVectorSearchAdapter from '../infrastructure/retrieval/LocalVectorSearchAdapter.js'
import JournalService from './JournalService.js'
import AnalysisService from './AnalysisService.js'
import InquiryService from './InquiryService.js'
import ReviewService from './ReviewService.js'

let journalRepoInstance = null
let journalServiceInstance = null
let analysisServiceInstance = null
let inquiryServiceInstance = null
let reviewServiceInstance = null
let vectorSearchAdapterInstance = null
let artifactRepoInstance = null

function getAppDataPath() {
  const userDataDir = app ? app.getPath('userData') : process.cwd()
  return path.join(userDataDir, 'appData.json')
}

function getCacheDir() {
  const userDataDir = app ? app.getPath('userData') : process.cwd()
  return path.join(userDataDir, '.cache')
}

export function getJournalRepository() {
  if (!journalRepoInstance) {
    journalRepoInstance = new JsonJournalRepository({ getAppDataPath })
  }
  return journalRepoInstance
}

export function getVectorSearchAdapter() {
  if (!vectorSearchAdapterInstance) {
    vectorSearchAdapterInstance = new LocalVectorSearchAdapter({ cacheDir: getCacheDir() })
  }
  return vectorSearchAdapterInstance
}

export function getArtifactRepository() {
  if (!artifactRepoInstance) {
    artifactRepoInstance = new ArtifactRepository({ getStoragePath: app ? () => app.getPath('userData') : () => process.cwd() })
  }
  return artifactRepoInstance
}

export function getJournalService() {
  if (!journalServiceInstance) {
    journalServiceInstance = new JournalService({
      repository: getJournalRepository(),
      onInvalidate: (affectedIds) => {
        console.log('[JournalService] Invalidate cache for records:', affectedIds)
      }
    })
  }
  return journalServiceInstance
}

export function getAnalysisService() {
  if (!analysisServiceInstance) {
    analysisServiceInstance = new AnalysisService({
      journalService: getJournalService(),
      vectorSearchAdapter: getVectorSearchAdapter()
    })
  }
  return analysisServiceInstance
}

export function getInquiryService() {
  if (!inquiryServiceInstance) {
    inquiryServiceInstance = new InquiryService({
      journalService: getJournalService(),
      analysisService: getAnalysisService()
    })
  }
  return inquiryServiceInstance
}

export function getReviewService() {
  if (!reviewServiceInstance) {
    reviewServiceInstance = new ReviewService({
      analysisService: getAnalysisService(),
      artifactRepository: getArtifactRepository()
    })
  }
  return reviewServiceInstance
}
