/**
 * @file QueryPlanner.js
 * @description Generates and validates InquiryPlans from user questions.
 * Supports LLM-assisted generation with rule-based fallback.
 * Implements scope evolution strategies for follow-up questions.
 */

const ALLOWED_OPERATIONS = [
  'exact_query', 'semantic_search', 'aggregate', 'compare', 'timeline'
]

const ALLOWED_SCOPE_FIELDS = [
  'dateRange', 'projects', 'people', 'weekdays', 'recordIds', 'includeInferredMetadata'
]

const PLANNER_SYSTEM_PROMPT = `You are a query planner for a personal journal exploration system.
Your task is to analyze the user's question and produce a structured query plan.

Output ONLY valid JSON in this exact format (no other text):
{
  "normalizedQuestion": "the rewritten standalone question",
  "operations": [
    { "id": "op_1", "type": "exact_query", "input": {}, "dependsOn": [] },
    { "id": "op_2", "type": "aggregate", "input": {}, "dependsOn": ["op_1"] }
  ],
  "scope": {},
  "expectedOutput": "mixed"
}

Allowed operation types:
- exact_query: filter records by scope conditions
- semantic_search: vector/keyword search by concept
- aggregate: COUNT, AVG, SUM computations
- compare: compare two time periods or cohorts
- timeline: time-series trend analysis

Allowed expectedOutput values: mixed, factual, analytical

Rules:
1. If question contains comparison words (比较/对比/compared/vs), include a compare operation
2. If question contains trend words (趋势/变化/trend/over time), include a timeline operation
3. If question contains fuzzy concepts (心情/感觉/回忆), include a semantic_search operation
4. Always include at least one data retrieval operation (exact_query or semantic_search)
5. Do NOT include any text outside the JSON object`

export default class QueryPlanner {
  /**
   * @param {Object} options
   * @param {Object} [options.llmClient] — LLM client with invoke() method
   */
  constructor({ llmClient } = {}) {
    this.llm = llmClient || null
  }

  /**
   * Generate an InquiryPlan from a user question.
   * Tries LLM first, falls back to rule-based plan.
   * @param {string} question
   * @param {Object} [sessionState] — previous session state for context
   * @returns {Promise<InquiryPlan>}
   */
  async generatePlan(question, sessionState = {}) {
    // Try LLM generation if available
    if (this.llm && process.env.NODE_ENV !== 'test') {
      try {
        const raw = await this._llmGenerate(question, sessionState)
        const validated = this.validate(raw)
        if (validated) return validated
      } catch (e) {
        console.warn('[QueryPlanner] LLM plan generation failed, falling back:', e.message)
      }
    }

    // Fallback: rule-based plan
    return this._ruleBasedPlan(question, sessionState)
  }

  /**
   * Validate and sanitize a raw plan object.
   * @param {Object} raw
   * @returns {InquiryPlan|null} null if invalid
   */
  validate(raw) {
    if (!raw || !Array.isArray(raw.operations)) return null

    // Filter to allowed operations only
    const ops = raw.operations.filter(op => ALLOWED_OPERATIONS.includes(op.type))
    if (ops.length === 0) return null

    // Sanitize scope
    const scope = this._sanitizeScope(raw.scope || {})

    return {
      normalizedQuestion: raw.normalizedQuestion || '',
      operations: ops.map((op, i) => ({
        id: op.id || `op_${i}`,
        type: op.type,
        input: op.input || {},
        dependsOn: Array.isArray(op.dependsOn) ? op.dependsOn : []
      })),
      scope,
      expectedOutput: ['mixed', 'factual', 'analytical'].includes(raw.expectedOutput)
        ? raw.expectedOutput
        : 'mixed'
    }
  }

  /**
   * Evolve scope for follow-up questions.
   * @param {Object} previousScope
   * @param {'reuse'|'narrow'|'extend'|'replace'} strategy
   * @param {Object} patch
   * @returns {Object} new scope
   */
  evolveScope(previousScope, strategy, patch) {
    switch (strategy) {
      case 'narrow':
        // Narrow the scope (add more filters)
        return { ...previousScope, ...patch }
      case 'extend':
        // Extend the scope (remove some filters, add others)
        return { ...previousScope, ...patch }
      case 'replace':
        // Completely replace the scope
        return { ...patch }
      case 'reuse':
      default:
        // Reuse the previous scope as-is
        return { ...previousScope }
    }
  }

  /**
   * Detect the scope evolution strategy from a follow-up question.
   * @param {string} question
   * @param {Object} patch
   * @returns {'reuse'|'narrow'|'extend'|'replace'}
   */
  detectScopeStrategy(question, patch) {
    const q = question.toLowerCase()
    if (q.includes('只') || q.includes('仅') || q.includes('only') || q.includes('just')) {
      return 'narrow'
    }
    if (q.includes('换成') || q.includes('改') || q.includes('instead') || q.includes('rather')) {
      return 'replace'
    }
    if (q.includes('扩大') || q.includes('更多') || q.includes('expand') || q.includes('broader')) {
      return 'extend'
    }
    if (Object.keys(patch).length > 0) {
      return 'narrow'
    }
    return 'reuse'
  }

  // ===================== Private Methods =====================

  async _llmGenerate(question, sessionState) {
    const prompt = this._buildPlannerPrompt(question, sessionState)
    const response = await this.llm.invoke([
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ])
    return this._parseJSON(response)
  }

  _buildPlannerPrompt(question, sessionState) {
    let contextInfo = ''
    if (sessionState?.scope && Object.keys(sessionState.scope).length > 0) {
      contextInfo = `\n\nCurrent session scope: ${JSON.stringify(sessionState.scope)}`
    }
    if (sessionState?.currentQuestion) {
      contextInfo += `\n\nPrevious question: "${sessionState.currentQuestion}"`
    }
    return `User question: "${question}"${contextInfo}`
  }

  _parseJSON(response) {
    let text = typeof response === 'string' ? response : (response.content || response.text || '')
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) text = jsonMatch[1]
    // Try to find JSON object
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) text = objMatch[0]
    return JSON.parse(text)
  }

  _ruleBasedPlan(question, sessionState) {
    const q = question.toLowerCase()
    const ops = []

    // Always start with exact_query for scope filtering
    ops.push({ id: 'op_1', type: 'exact_query', input: {}, dependsOn: [] })

    // Detect comparison intent
    if (q.includes('比较') || q.includes('对比') || q.includes('compared') || q.includes('vs') || q.includes('difference')) {
      ops.push({ id: 'op_2', type: 'compare', input: {}, dependsOn: ['op_1'] })
    }
    // Detect trend/timeline intent
    else if (q.includes('趋势') || q.includes('变化') || q.includes('trend') || q.includes('over time') || q.includes('走势')) {
      ops.push({ id: 'op_2', type: 'timeline', input: {}, dependsOn: ['op_1'] })
    }
    // Default: aggregate
    else {
      ops.push({ id: 'op_2', type: 'aggregate', input: {}, dependsOn: ['op_1'] })
    }

    // Detect fuzzy/semantic intent → add semantic_search at the beginning
    if (q.includes('心情') || q.includes('感觉') || q.includes('回忆') || q.includes('想起') ||
        q.includes('开心') || q.includes('难过') || q.includes('焦虑') || q.includes('兴奋')) {
      ops.unshift({ id: 'op_0', type: 'semantic_search', input: { query: question }, dependsOn: [] })
    }

    return {
      normalizedQuestion: question,
      operations: ops,
      scope: sessionState?.scope || {},
      expectedOutput: 'mixed'
    }
  }

  _sanitizeScope(scope) {
    const clean = {}
    for (const key of ALLOWED_SCOPE_FIELDS) {
      if (scope[key] !== undefined) clean[key] = scope[key]
    }
    return clean
  }
}
