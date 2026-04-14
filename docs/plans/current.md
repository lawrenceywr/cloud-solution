# Current Stage Plan

**Created:** 2026-04-13  
**Completed:** 2026-04-14  
**Phase:** 9 (MCP / External Integrations)  
**Status:** Complete

> This plan now records the completed Phase 9 slice. Phase 8 remains complete and is summarized in `docs/progress-snapshot.md`.

---

## Scope

**In Scope:**
- add internal MarkItDown preprocessing to `extract_document_candidate_facts`
- keep `extract_document_candidate_facts` as the only public entrypoint for this slice
- pass converted markdown into document-assisted extraction as advisory reading input only
- add an optional config-gated MCP advisory source adapter for approved `inventory` / `system` requirement source refs
- keep original `documentSources` as the provenance anchor and preserve downstream confirmation/validation gates

**Out of Scope:**
- a new public markdown-conversion tool
- a broad external-integration platform beyond the landed advisory adapter
- bypassing confirmation, normalization, or validation for converted markdown or extracted facts

---

## Implementation Order

### Phase 9A - Internal MarkItDown Extraction Preprocessing

Goal:
- add a markdown-preparation step before document-assisted extraction without widening the public API

Acceptance:
- [x] `extract_document_candidate_facts` remains the public entrypoint
- [x] markdown preprocessing happens internally before the extraction worker handoff
- [x] converted markdown is advisory only and does not replace original `documentSources`

### Phase 9A Guardrails

Goal:
- preserve the existing trust boundary while adding markdown-based reading help

Acceptance:
- [x] the markdown-preparation child session explicitly requests `markitdown_convert_to_markdown`
- [x] blank markdown outputs fall back to warnings instead of entering extraction
- [x] converted markdown entries whose `sourceRef` is not one of the supplied `documentSources` are dropped
- [x] extraction still cannot emit confirmed facts or off-brief provenance

### Phase 9A Verification Targets

Goal:
- verify the markdown-prep → extraction → draft path under both normal and split-root conditions

Acceptance:
- [x] targeted tests cover tool path, feature path, agent prompt injection, forged-source filtering, blank-markdown fallback, and `directory !== worktree`
- [x] full repo verification passes after the integration

### Phase 9B - Advisory MCP Source Ingestion

Goal:
- add an optional MCP-backed advisory source adapter behind `extract_document_candidate_facts` without widening the public API

Acceptance:
- [x] `extract_document_candidate_facts` remains the public entrypoint
- [x] approved `inventory` / `system` requirement source refs can be retrieved through a configured MCP tool
- [x] external evidence enters the candidate-fact path only as advisory input

### Phase 9B Guardrails

Goal:
- preserve provenance and confirmation semantics while adding narrow external retrieval support

Acceptance:
- [x] advisory external retrieval is optional and disabled unless `document_assist_advisory_source_tool_name` is configured
- [x] extracted facts may cite only supplied `documentSources` or approved advisory external source refs
- [x] draft preparation keeps advisory `inventory` / `system` provenance visible to candidate-fact confirmation
- [x] extraction still cannot emit confirmed facts or off-brief provenance

### Phase 9B Verification Targets

Goal:
- verify config parsing, advisory-source filtering, runtime tool wiring, and draft confirmation behavior for the landed Phase 9 adapter

Acceptance:
- [x] targeted tests cover config parsing, advisory-source filtering, extraction feature/worker validation, tool wiring, and runtime kernel integration
- [x] full repo verification passes after the integration

---

## Planned File Areas

### Documentation
- `docs/progress-snapshot.md`
- `docs/backlog-active.md`
- `docs/roadmap.md`

### Code
- `src/agents/document-source-markdown.ts`
- `src/agents/document-source-advisory-mcp.ts`
- `src/agents/document-assisted-extraction-brief.ts`
- `src/agents/document-assisted-extraction.ts`
- `src/features/document-source-advisory-mcp.ts`
- `src/features/document-source-markdown.ts`
- `src/features/extract-document-candidate-facts.ts`
- `src/normalizers/prepare-draft-solution-input.ts`
- `src/workers/document-assisted-extraction/worker.ts`

---

## Verification

- [x] run targeted Bun tests for touched agents, workers, features, and tools
- [x] run `src/create-tools.test.ts`
- [x] run `src/index.test.ts`
- [x] run language-server diagnostics on touched files
- [x] manually execute representative tool flows after implementation

### Verification Evidence

- `bun test src/agents/document-source-advisory-mcp.test.ts src/features/document-source-advisory-mcp.test.ts src/features/extract-document-candidate-facts.test.ts src/workers/document-assisted-extraction/worker.test.ts src/agents/document-assisted-extraction-brief.test.ts src/normalizers/prepare-draft-solution-input.test.ts src/plugin-config.test.ts src/create-tools.test.ts src/index.test.ts` → passing (`79 pass / 0 fail`)
- `bun test` → passing (`258 pass / 0 fail`)
- `bun run typecheck` → passing
- `bun run build` → passing
- manual QA 1: runtime extraction with `document_assist_advisory_source_tool_name: "query_external_solution_source"` produced an advisory-tool allowlist containing `query_external_solution_source: true`
- manual QA 2: runtime extraction returned `draftInputState: candidate_fact_draft`
- manual QA 3: the resulting candidate facts preserved advisory provenance kinds as `inventory` and `system`
