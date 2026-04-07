import { describe, expect, test } from "bun:test"

import {
  createScn05DocumentAssistedDraftFixture,
  createScn05PromotedDocumentAssistFixture,
} from "../scenarios/fixtures"
import { prepareDraftSolutionInput } from "./prepare-draft-solution-input"

describe("prepareDraftSolutionInput", () => {
  test("builds candidate facts from document-assisted drafts", () => {
    const result = prepareDraftSolutionInput({
      input: createScn05DocumentAssistedDraftFixture(),
      allowDocumentAssist: true,
    })

    expect(result.inputState).toBe("candidate_fact_draft")
    expect(result.candidateFacts).toEqual([
      expect.objectContaining({
        entityRef: "allocation:allocation-document-public-service-10-50-0-10",
        statusConfidence: "unresolved",
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        entityRef: "segment:segment-document-public-service",
        statusConfidence: "inferred",
        requiresConfirmation: true,
      }),
    ])
    expect(result.normalizedInput.segments[0]?.sourceRefs).toEqual([
      {
        kind: "document",
        ref: "fixtures/scn-05-supporting-design.pdf",
        note: "Supporting network design PDF",
      },
      {
        kind: "diagram",
        ref: "fixtures/scn-05-topology-diagram.drawio",
        note: "Attached topology diagram",
      },
    ])
  })

  test("applies explicit confirmations deterministically", () => {
    const result = prepareDraftSolutionInput({
      input: createScn05PromotedDocumentAssistFixture(),
      allowDocumentAssist: true,
    })

    expect(result.inputState).toBe("confirmed_slice")
    expect(result.normalizedInput.segments[0]?.statusConfidence).toBe("confirmed")
    expect(result.normalizedInput.allocations[0]?.statusConfidence).toBe("confirmed")
    expect(result.confirmationSummary).toEqual({
      requestedEntityRefs: [
        "allocation:allocation-document-public-service-10-50-0-10",
        "segment:segment-document-public-service",
      ],
      confirmedEntityRefs: [
        "allocation:allocation-document-public-service-10-50-0-10",
        "segment:segment-document-public-service",
      ],
      pendingEntityRefs: [],
      missingEntityRefs: [],
    })
  })
})
