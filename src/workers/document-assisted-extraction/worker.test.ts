import { describe, expect, test } from "bun:test"

import {
  createScn05DocumentAssistedDraftFixture,
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
} from "../../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../../test-helpers/fake-coordinator-client"
import {
  DocumentAssistedExtractionOutput,
  executeDocumentAssistedExtractionWorker,
  executeDocumentAssistedExtractionWorkerSubsession,
} from "./worker"

describe("document-assisted-extraction worker", () => {
  test("spawns a child session and returns extracted candidate facts", async () => {
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
            workerId: "document-assisted-extraction",
            status: "success",
            output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture(),
            extractionWarnings: ["Diagram did not expose any rack details."],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })

    const result = await executeDocumentAssistedExtractionWorker(
      {
        requirement: createScn05DocumentExtractionInputFixture().requirement,
        documentSources: createScn05DocumentExtractionInputFixture().documentAssist.documentSources,
      },
      createWorkerRuntimeContext(client),
    )

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(DocumentAssistedExtractionOutput.parse(result.output)).toEqual({
      candidateFacts: createScn05ExtractedCandidateFactsFixture(),
      extractionWarnings: ["Diagram did not expose any rack details."],
    })
    expect(result.recommendations).toEqual(["draft_topology_model"])
  })

  test("normalizes a wrong child workerId into a failed extraction protocol result", async () => {
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

    const result = await executeDocumentAssistedExtractionWorkerSubsession(
      {
        requirement: createScn05DocumentExtractionInputFixture().requirement,
        documentSources: createScn05DocumentExtractionInputFixture().documentAssist.documentSources,
      },
      createWorkerRuntimeContext(client),
    )

    expect(result).toEqual({
      success: false,
      result: {
        workerId: "document-assisted-extraction",
        status: "failed",
        output: {},
        recommendations: [],
        errors: [
          "Worker document-assisted-extraction returned unexpected workerId 'different-worker'",
        ],
      },
    })
  })

  test("fails when extracted candidate facts contain confirmed confidence", async () => {
    const extractionOutput = createScn05ExtractedCandidateFactsFixture()
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: {
              ...extractionOutput,
              segments: extractionOutput.segments.map((segment) => ({
                ...segment,
                statusConfidence: "confirmed",
              })),
            },
            extractionWarnings: [],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })

    const result = await executeDocumentAssistedExtractionWorker(
      {
        requirement: createScn05DocumentExtractionInputFixture().requirement,
        documentSources: createScn05DocumentExtractionInputFixture().documentAssist.documentSources,
      },
      createWorkerRuntimeContext(client),
    )

    expect(result.workerId).toBe("document-assisted-extraction")
    expect(result.status).toBe("failed")
    expect(result.errors).toEqual([
      "segment:Document Public Service cannot be marked confirmed by document-assisted extraction.",
    ])
  })
})
