---
name: projectos
description: Master governance skill for managing project work, verifying evidences, checking status views, and orchestrating ProjectOS / .anchor workflows in AGY and AI agents.
---

# ProjectOS Governance Skill

This skill provides AGY and compatible agents with commands and rules to interact with the `.anchor/` project OS governance system.

## Operating Rules

1. **Status Query**: Always query `.anchor/views/status.md` and `.anchor/charter.json` when asked about project status or next steps.
2. **Work Management**: Create structured designs under `.anchor/work/` for medium and high risk tasks before editing code.
3. **Evidence Requirement**: Never claim a task completed without executing verification tests and saving reports in `.anchor/evidence/`.
4. **Data Isolation**: Daily log data in this repository is strictly read-only.
