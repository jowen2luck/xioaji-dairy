/**
 * @file contracts.js
 * @description Normative Data Contracts for Daily Log System
 * Based on TARGET_ARCHITECTURE_AND_IMPLEMENTATION_PLAN.md Section 7 & 8
 */

import { z } from 'zod/v3'

// ===================== Zod Runtime Schemas =====================

export const JournalRecordSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  contentHtml: z.string(),
  contentText: z.string(),
  project: z.string().optional(),
  durationMinutes: z.number().optional(),
  experience: z.string().optional(),
  moodColor: z.string().optional(),
  achievement: z.boolean().optional(),
  source: z.enum(['local', 'import']).optional(),
  revision: z.number().optional(),
})

export const EvidenceRefSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  occurredAt: z.string(),
  field: z.string(),
  excerpt: z.string(),
  relevance: z.number().optional(),
})

export const ComputedMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().optional(),
  operation: z.string(),
  sampleSize: z.number(),
  recordIds: z.array(z.string()).optional(),
  cohortFingerprint: z.string().optional(),
})

export const EvidencePackSchema = z.object({
  id: z.string(),
  schemaVersion: z.string(),
  question: z.string(),
  scope: z.record(z.unknown()),
  evidence: z.array(EvidenceRefSchema),
  metrics: z.array(ComputedMetricSchema),
  comparisons: z.array(z.record(z.unknown())),
  limitations: z.array(z.object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(['info', 'warning'])
  })),
  generatedAt: z.string(),
})

export const InquiryPlanSchema = z.object({
  normalizedQuestion: z.string(),
  operations: z.array(z.object({
    id: z.string(),
    type: z.enum(['exact_query', 'semantic_search', 'aggregate', 'compare', 'timeline']),
    input: z.record(z.unknown()),
    dependsOn: z.array(z.string())
  })),
  scope: z.record(z.unknown()),
  expectedOutput: z.enum(['mixed', 'factual', 'analytical']).optional(),
})

// ===================== Runtime Validation Helpers =====================

export function safeParseEvidencePack(data) {
  const result = EvidencePackSchema.safeParse(data)
  if (!result.success) {
    console.error('[Contracts] EvidencePack validation failed:', result.error.message)
    return { success: false, errors: result.error.issues }
  }
  return { success: true, data: result.data }
}

export function safeParseJournalRecord(data) {
  const result = JournalRecordSchema.safeParse(data)
  if (!result.success) {
    console.error('[Contracts] JournalRecord validation failed:', result.error.message)
    return { success: false, errors: result.error.issues }
  }
  return { success: true, data: result.data }
}

export function safeParseInquiryPlan(data) {
  const result = InquiryPlanSchema.safeParse(data)
  if (!result.success) {
    console.error('[Contracts] InquiryPlan validation failed:', result.error.message)
    return { success: false, errors: result.error.issues }
  }
  return { success: true, data: result.data }
}

// ===================== Normalization Helper =====================

/**
 * Helper to normalize legacy raw diary object to JournalRecord
 * @param {Object} raw
 * @returns {JournalRecord}
 */
export function normalizeJournalRecord(raw) {
  if (!raw) return null
  const contentHtml = raw.ganshou || ''
  // Strip simple HTML tags for plain text if needed
  const contentText = contentHtml.replace(/<[^>]+>/g, '').trim() || (raw.tiyan || '')
  
  return {
    id: String(raw._id || raw.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`),
    occurredAt: raw.time || new Date().toISOString(),
    contentHtml,
    contentText,
    project: raw.shanggexiangmu || raw.project || undefined,
    durationMinutes: typeof raw.chixushijian === 'number' ? raw.chixushijian : (parseFloat(raw.chixushijian) || undefined),
    experience: raw.tiyan || undefined,
    moodColor: raw.xinqing || undefined,
    achievement: Boolean(raw.chengjiu),
    source: raw.source || 'local',
    revision: raw.revision || 1,
    raw
  }
}
