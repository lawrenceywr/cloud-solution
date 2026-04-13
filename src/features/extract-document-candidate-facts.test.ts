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
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: createScn05DocumentExtractionInputFixture().documentAssist.documentSources[0],
                markdown: "# Supporting network design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: ["Skipped MarkItDown conversion for the draw.io diagram source."],
          },
          recommendations: [],
        }),
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
    expect(createCalls).toHaveLength(2)
    expect(promptCalls).toHaveLength(2)
    expect(result.draftInput.documentAssist?.candidateFacts).toEqual(createScn05ExtractedCandidateFactsFixture())
    expect(result.extractionWarnings).toEqual([
      "Skipped MarkItDown conversion for the draw.io diagram source.",
      "Diagram did not expose any rack details.",
    ])
  })

  test("uses worktree as the end-to-end root for markdown prep and extraction child sessions", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: createScn05DocumentExtractionInputFixture().documentAssist.documentSources[0],
                markdown: "# Supporting network design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
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

    await runExtractDocumentCandidateFacts({
      input: createScn05DocumentExtractionInputFixture(),
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: "/tmp/original-directory",
        worktree: "/tmp/extraction-worktree",
      }),
      rootDirectory: "/tmp/extraction-worktree",
    })

    expect(createCalls).toEqual([
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/extraction-worktree",
        }),
      }),
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/extraction-worktree",
        }),
      }),
    ])
    expect(promptCalls).toEqual([
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/extraction-worktree",
        }),
      }),
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/extraction-worktree",
        }),
      }),
    ])
  })
})
