import { describe, expect, test } from "bun:test"

import {
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
} from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { buildDocumentAssistedExtractionAgentBrief } from "./document-assisted-extraction-brief"
import { runDocumentAssistedExtractionInChildSession } from "./document-assisted-extraction"

describe("runDocumentAssistedExtractionInChildSession", () => {
  test("returns typed extraction output from a valid child session", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const brief = buildDocumentAssistedExtractionAgentBrief({
      requirement: fixture.requirement,
      documentSources: fixture.documentAssist.documentSources,
      convertedDocuments: [
        {
          sourceRef: fixture.documentAssist.documentSources[0],
          markdown: "# Converted design\n\nConverted markdown content.",
        },
      ],
    })
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture(),
            extractionWarnings: [],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })

    const result = await runDocumentAssistedExtractionInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(JSON.stringify(promptCalls[0])).toContain("Converted markdown content.")
    expect(JSON.stringify(promptCalls[0])).toContain("convertedDocuments")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.output.candidateFacts).toEqual(createScn05ExtractedCandidateFactsFixture())
    }
  })

  test("fails when the child session returns the wrong worker id", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const brief = buildDocumentAssistedExtractionAgentBrief({
      requirement: fixture.requirement,
      documentSources: fixture.documentAssist.documentSources,
      convertedDocuments: [],
    })
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "different-worker",
          status: "success",
          output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture(),
            extractionWarnings: [],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })

    const result = await runDocumentAssistedExtractionInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.result.errors).toEqual([
        "Worker document-assisted-extraction returned unexpected workerId 'different-worker'",
      ])
    }
  })
})
