/**
 * daily-log MCP Server (Target Architecture Compliant)
 * Standard: MCP Specification 2025-03-26
 * Grounded on unified application services (JournalService & AnalysisService)
 */

const readline = require("readline")
const path = require("path")

let journalService = null
let analysisService = null
let inquiryService = null

async function initServices() {
  const { normalizeJournalRecord } = await import("../src/main/domain/contracts.js")
  const JsonJournalRepository = (await import("../src/main/infrastructure/persistence/JsonJournalRepository.js")).default
  const JournalService = (await import("../src/main/application/JournalService.js")).default
  const AnalysisService = (await import("../src/main/application/AnalysisService.js")).default
  const InquiryService = (await import("../src/main/application/InquiryService.js")).default

  function getAppDataPath() {
    const userProfile = process.env.USERPROFILE || process.env.HOME || "."
    return path.join(userProfile, "AppData", "Roaming", "daily_log_vue", "appData.json")
  }

  const repository = new JsonJournalRepository({ getAppDataPath })
  journalService = new JournalService({ repository })
  analysisService = new AnalysisService({ journalService })
  inquiryService = new InquiryService({ journalService, analysisService })
}

// Service Adapter Methods
async function handleMCPCall(action, args = {}) {
  if (!journalService) {
    await initServices()
  }
  try {
    if (action === "health") {
      const records = await journalService.listRecords({})
      return {
        status: "ok",
        totalRecords: records.length,
        version: "1.0.0",
        message: "Unified Analysis Core ready."
      }
    }

    if (action === "list") {
      const scope = {
        dateRange: args.dateRange,
        projects: args.project ? [args.project] : undefined
      }
      const records = await journalService.listRecords(scope)
      const page = args.page || 1
      const pageSize = args.pageSize || 20
      const sliced = records.slice((page - 1) * pageSize, page * pageSize)
      return {
        total: records.length,
        page,
        pageSize,
        items: sliced
      }
    }

    if (action === "search") {
      const scope = args.dateRange ? { dateRange: args.dateRange } : {}
      const evidence = await analysisService.semanticSearch(args.query || "", scope, args.limit || 20)
      return {
        query: args.query,
        count: evidence.length,
        results: evidence
      }
    }

    if (action === "get") {
      const record = await journalService.getRecord(args.id)
      return record || { error: "Record not found", id: args.id }
    }

    if (action === "stats") {
      const scope = args.dateRange ? { dateRange: args.dateRange } : {}
      const metrics = await analysisService.aggregate({}, scope)
      return { metrics }
    }

    if (action === "summaries") {
      const res = await inquiryService.start({
        question: `Summary request for type ${args.type || "weekly"}`,
        scope: {}
      })
      return res
    }

    if (action === "export") {
      const records = await journalService.listRecords(args.dateRange ? { dateRange: args.dateRange } : {})
      return { count: records.length, records }
    }

    return { error: `Unknown tool action: ${action}` }
  } catch (err) {
    return { error: err.message, action }
  }
}

// MCP Server Definition
const SERVER_INFO = {
  name: "daily-log",
  version: "1.0.0",
  description: "Evidence-grounded read-only MCP server for daily_log_vue app."
}

const TOOLS = [
  {
    name: "health",
    description: "Check data availability and system health. Always call first.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "list",
    description: "List diary records with multi-dimensional filtering.",
    inputSchema: {
      type: "object",
      properties: {
        dateRange: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
        project: { type: "string" },
        page: { type: "integer", default: 1 },
        pageSize: { type: "integer", default: 20 }
      }
    }
  },
  {
    name: "search",
    description: "Fuzzy and semantic keyword search on diary content.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        limit: { type: "integer", default: 20 }
      },
      required: ["query"]
    }
  },
  {
    name: "get",
    description: "Get detail of a single record by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Record ID" }
      },
      required: ["id"]
    }
  },
  {
    name: "stats",
    description: "Get summary statistics across all diary records.",
    inputSchema: {
      type: "object",
      properties: {
        dateRange: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } }
      }
    }
  },
  {
    name: "summaries",
    description: "Get AI generated narrative summaries (weekly, monthly, yearly).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["weekly", "monthly", "yearly"] },
        limit: { type: "integer", default: 10 }
      }
    }
  },
  {
    name: "export",
    description: "Export records compatible with summary.",
    inputSchema: {
      type: "object",
      properties: {
        dateRange: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } }
      }
    }
  }
]

// Standard JSON-RPC stdio handler
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})

rl.on("line", async (line) => {
  if (!line.trim()) return
  try {
    const req = JSON.parse(line)
    const { id, method, params } = req

    if (method === "initialize") {
      respond(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO
      })
    } else if (method === "tools/list") {
      respond(id, { tools: TOOLS })
    } else if (method === "tools/call") {
      const { name, arguments: args } = params
      const res = await handleMCPCall(name, args || {})
      respond(id, {
        content: [
          {
            type: "text",
            text: typeof res === "string" ? res : JSON.stringify(res, null, 2)
          }
        ]
      })
    } else {
      respondError(id, -32601, `Method not found: ${method}`)
    }
  } catch (err) {
    respondError(null, -32700, "Parse error")
  }
})

function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result })
  process.stdout.write(msg + "\n")
}

function respondError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })
  process.stdout.write(msg + "\n")
}
