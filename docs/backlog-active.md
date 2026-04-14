# Active Backlog

**Last Updated:** 2026-04-14

---

## Active

_No active backlog items._

---

## Completed (Reference Only)

### BL-027 - MCP / External System Integrations

- **Goal:** add optional external integrations for inventory/topology sources
- **Depends on:** BL-026 (completed; extraction path stabilized further by evidence reconciliation and planner-boundary cleanup)
- **Acceptance:**
  - ✅ a configured MCP advisory source tool can be invoked through the extraction path
  - ✅ external data enters candidate-fact path (never confirmed directly)
  - ✅ integration is optional and configurable
- **Status:** Complete
- **Completed slice:** internal MarkItDown preprocessing plus a config-gated MCP advisory source adapter behind `extract_document_candidate_facts`

All BL-001 through BL-026 are complete. See `docs/backlog-archive.md` for historical details.

Phase 8 agent-boundary cleanup, formal extraction-agent split, planner-advisory slices, and the narrow Phase 9 advisory MCP ingestion path are complete on the branch.

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
