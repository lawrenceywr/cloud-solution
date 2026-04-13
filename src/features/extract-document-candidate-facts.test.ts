import { describe, expect, test } from "bun:test"

import { loadPluginConfig } from "../plugin-config"
import {
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
} from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runExtractDocumentCandidateFacts } from "./extract-document-candidate-facts"

describe("runExtractDocumentCandidateFacts", () => {
  test("returns a draft-ready extraction envelope through the feature layer", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
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

    const result = await runExtractDocumentCandidateFacts({
      input: createScn05DocumentExtractionInputFixture(),
      pluginConfig,
      runtime: createWorkerRuntimeContext(client),
      rootDirectory: process.cwd(),
    })

    expect(result.nextAction).toBe("draft_topology_model")
    expect(result.draftInput.documentAssist?.candidateFacts).toEqual(createScn05ExtractedCandidateFactsFixture())
    expect(result.extractionWarnings).toEqual(["Diagram did not expose any rack details."])
  })
})
