# Active Backlog

**Last Updated:** 2026-04-23

---

## Active

### BL-029 - Real Template Physical Completion

- **Goal:** close the remaining physical completeness gaps in real-template runs now that workbook-driven rack, port, and power import foundations are landed
- **Depends on:** BL-028 (completed) plus the post-roadmap template-import slices already landed on `dev`
- **Acceptance:**
  - deterministic workbook import covers the remaining high-value physical facts still missing from current real-template quality runs
  - project-bound rack power / non-standard rack-U confirmations are explicit inputs rather than hidden assumptions
  - real-template quality runs retain workbook-derived ports and power while reducing importer-caused physical blockers
- **Status:** In Progress
- **Current slice landed:** workbook-driven structured import, project-bound port placement, device power import, rack defaults, and real-bundle alias disambiguation for firewall / SDN gateway / TOR are complete; workbook-derived plane-type conflicts now surface as structured pending-confirmation items across draft / review / export, and direct physical artifact tools now block when those unresolved conflicts remain. Remaining work is reducing the larger non-confirmed physical blocker set that still survives real-template quality runs.

---

## Completed (Reference Only)

### BL-028 - Guarded Export Readiness and Hook Hardening

- **Goal:** harden export/runtime gating with pre-execution hooks and lock the behavior into a canonical acceptance scenario
- **Depends on:** BL-027 (completed; the advisory MCP extraction path is stable enough to gate more aggressively before export)
- **Acceptance:**
  - ✅ the four suggested first hook modules now exist and are wired through the runtime hook chain
  - ✅ low-confidence or incomplete export attempts do not reach `export_ready`
  - ✅ `SCN-07` proves low-confidence rejection, incomplete export rejection, and clean export success
- **Status:** Complete
- **Completed slice:** shared review/export state reuse for hooks plus SCN-07 guarded export acceptance coverage

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

Phase 8 agent-boundary cleanup, formal extraction-agent split, planner-advisory slices, the narrow Phase 9 advisory MCP ingestion path, and the post-roadmap guardrail hardening slice are complete on the branch.

**MVP Done Criteria:** ✅ Satisfied

- ✅ 5 artifact types generating from validated model data
- ✅ SCN-01 to SCN-08 scenario coverage
- ✅ Normalization, validation, and confirmation gating
- ✅ Review/export workflow with multi-worker orchestration
- ✅ Front-door intake tools

---

## Notes

- Keep this file lean - move completed items to archive
- New backlog items should follow existing format (Goal, Depends on, Acceptance, Status)
- Only add items with clear acceptance criteria and dependencies
