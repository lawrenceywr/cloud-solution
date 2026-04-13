# Active Backlog

**Last Updated:** 2026-04-13

---

## Active

### BL-027 - MCP / External System Integrations

- **Goal:** add optional external integrations for inventory/topology sources
- **Depends on:** BL-026 (completed; extraction path stabilized further by evidence reconciliation and planner-boundary cleanup)
- **Acceptance:**
  - MCP server can receive extraction requests
  - external data enters candidate-fact path (never confirmed directly)
  - integration is optional and configurable
- **Status:** In Progress
- **Current slice:** internal MarkItDown preprocessing now exists behind `extract_document_candidate_facts`; broader MCP / external-source integration remains pending

---

## Completed (Reference Only)

All BL-001 through BL-026 are complete. See `docs/backlog-archive.md` for historical details.

Phase 8 agent-boundary cleanup, formal extraction-agent split, and planner-advisory slices are complete on the branch; Phase 9 has now started with internal MarkItDown preprocessing on the document-assisted extraction path.

**MVP Done Criteria:** ✅ Satisfied

- ✅ 4 artifact types generating from validated model data
- ✅ SCN-01 to SCN-06 scenario coverage
- ✅ Normalization, validation, and confirmation gating
- ✅ Review/export workflow with multi-worker orchestration
- ✅ Front-door intake tools

---

## Notes

- Keep this file lean - move completed items to archive
- New backlog items should follow existing format (Goal, Depends on, Acceptance, Status)
- Only add items with clear acceptance criteria and dependencies
