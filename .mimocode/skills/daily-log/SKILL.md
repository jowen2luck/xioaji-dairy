---
name: daily-log
description: Use when the user asks about their diary, journal entries, daily logs, personal records, mood tracking, emotion analysis, energy levels, project time tracking, or wants to query/search/analyze their daily life data from the daily_log_vue app. Also use when another agent (like summary/AIAE) needs diary data as input.
---

# Daily Log Data Adapter

The `daily-log` tool provides read-only access to the diary data stored by the daily_log_vue Electron app. It serves as a data source for agents and the summary (AIAE) pipeline.

## Data location

Data files are stored in the Electron app's userData directory:
- `appData.json` — raw diary records
- `ai_meta_index.json` — AI-enriched metadata cache (Five-Layer Model)
- `summaries.json` — generated weekly/monthly/yearly summaries

## Operating rules

1. This tool is **read-only**. Agents cannot create, update, or delete diary records through this tool.
2. Always call `health` first to verify data is available before querying.
3. **Retrieval Principle**: User-entered tags (like `shanggexiangmu` or `xinqing`) may be missing or arbitrary. The retrieval engine automatically prioritizes **User Raw Text** + **AI-Enriched Metadata (`_ai_meta`)** with seamless fallback logic. Agents do not need to worry about missing user tags causing zero results.
4. Use `list` for structured queries with filters (date, project, mood, energy, people).
5. Use `search` for fuzzy/semantic content lookup (pass keywords, not full sentences).
6. Use `get` when you have a specific record ID.
7. Use `stats` for high-level overview (project distribution, mood trends, time patterns).
8. Use `summaries` to access generated narrative summaries (weekly/monthly/yearly).
9. Use `export` to get data in a format compatible with the summary (AIAE) DiaryConnector.

## Tool payloads

The `daily-log` tool accepts an `action` and a JSON string in `payload`.

- Health check: no payload needed
- List records: `{"dateRange":{"start":"2026-07-01","end":"2026-07-31"},"project":"工作","pageSize":20,"page":1}`
- List with AI filters: `{"moodTags":["焦虑"],"minEnergy":5,"people":"导师"}`
- Search: `{"query":"海边 烧烤","limit":10}`
- Get record: set `id` to the record ID
- Stats: `{"dateRange":{"start":"2026-01-01"}}` (optional filters)
- Summaries: `{"type":"weekly","limit":5}`
- Export: `{"dateRange":{"start":"2026-07-01","end":"2026-07-31"}}`

## Available filter dimensions

| Filter | Type | Description |
|---|---|---|
| `dateRange` | `{start, end}` | ISO date range |
| `project` | string | Project name (substring match) |
| `weekday` | string | 周一/周二/.../周日 |
| `isWeekend` | boolean | Weekend filter |
| `timeRange` | string | 上午/中午/下午/晚上/深夜 |
| `durationMin` / `durationMax` | number | Duration in minutes |
| `moodTags` | string[] | AI mood tags (OR logic) |
| `minEnergy` / `maxEnergy` | number | Energy level 1-10 |
| `people` | string | People involved (substring match) |
| `keywordsAll` | string[] | All keywords must match (AND) |
| `keywordsAny` | string[] | Any keyword must match (OR) |

## Response shape

Lead with a human-readable summary of what was found. Include record count, time range covered, and any notable patterns. Hide raw JSON unless the user asks for it.

For `export` results, note that the output is compatible with `summary.DiaryConnector` — it can be passed directly as input to the AIAE pipeline.
