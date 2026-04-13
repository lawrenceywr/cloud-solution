import { describe, expect, test } from "bun:test"

import { createScn05DocumentExtractionInputFixture } from "../scenarios/fixtures"
import { buildDocumentAssistedExtractionAgentBrief } from "./document-assisted-extraction-brief"

describe("buildDocumentAssistedExtractionAgentBrief", () => {
  test("packages requirement, document sources, and extraction guardrails", () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const brief = buildDocumentAssistedExtractionAgentBrief({
      requirement: fixture.requirement,
      documentSources: fixture.documentAssist.documentSources,
      convertedDocuments: [
        {
          sourceRef: fixture.documentAssist.documentSources[0],
          markdown: "# Converted design\n\nPlanner-facing markdown.",
        },
      ],
    })

    expect(brief.agentID).toBe("document_assisted_extraction")
    expect(brief.requirement.id).toBe(fixture.requirement.id)
    expect(brief.documentSources).toEqual(fixture.documentAssist.documentSources)
    expect(brief.convertedDocuments).toEqual([
      {
        sourceRef: fixture.documentAssist.documentSources[0],
        markdown: "# Converted design\n\nPlanner-facing markdown.",
      },
    ])
    expect(brief.guardrails.some((item) => item.includes("confirmed"))).toBe(true)
    expect(brief.guardrails.some((item) => item.includes("provenance"))).toBe(true)
  })
})
