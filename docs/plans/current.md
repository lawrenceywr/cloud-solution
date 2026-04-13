# Current Stage Plan

**Created:** 2026-04-13  
**Phase:** 9 (MCP / External Integrations)  
**Status:** In Progress

> This plan now tracks the first active Phase 9 slice. Phase 8 remains complete and is summarized in `docs/progress-snapshot.md`.

---

## Scope

**In Scope:**
- add internal MarkItDown preprocessing to `extract_document_candidate_facts`
- keep `extract_document_candidate_facts` as the only public entrypoint for this slice
- pass converted markdown into document-assisted extraction as advisory reading input only
- keep original `documentSources` as the provenance anchor and preserve downstream confirmation/validation gates

**Out of Scope:**
- a new public markdown-conversion tool
- broad Phase 9 external inventory / topology integrations
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

---

## Planned File Areas

### Documentation
- `docs/progress-snapshot.md`
- `docs/backlog-active.md`
- `docs/roadmap.md`

### Code
- `src/agents/document-source-markdown.ts`
- `src/agents/document-assisted-extraction-brief.ts`
- `src/agents/document-assisted-extraction.ts`
- `src/features/document-source-markdown.ts`
- `src/features/extract-document-candidate-facts.ts`
- `src/workers/document-assisted-extraction/worker.ts`
- `src/coordinator/subsession-protocol.ts`
- `src/coordinator/subsession-executor.ts`

---

## Verification

- [x] run targeted Bun tests for touched agents, workers, features, and tools
- [x] run targeted Bun tests for touched agents, workers, features, and tools
- [x] run `src/create-tools.test.ts`
- [x] run `src/index.test.ts`
- [x] run `src/scenarios/scenario-acceptance.test.ts`
- [x] run language-server diagnostics on touched files
- [x] manually execute representative tool flows after implementation

### Verification Evidence

- `bun test src/agents/document-source-markdown.test.ts src/features/document-source-markdown.test.ts src/features/extract-document-candidate-facts.test.ts src/create-tools.test.ts src/index.test.ts src/scenarios/scenario-acceptance.test.ts` → passing for the MarkItDown integration slice
- `bun test` → passing (`249 pass / 0 fail` after the MarkItDown integration)
- `bun run typecheck` → passing
- `bun run build` → passing
- manual QA 1: `extract_document_candidate_facts` spawned a markdown-preparation child session and then an extraction child session
- manual QA 2: the markdown-preparation child prompt explicitly requested `markitdown_convert_to_markdown`
- manual QA 3: the extraction child prompt contained converted markdown while the public result still returned `nextAction: draft_topology_model`
