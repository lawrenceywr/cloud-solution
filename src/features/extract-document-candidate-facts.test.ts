import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadPluginConfig } from "../plugin-config"
import {
  createPhase09AdvisorySourcesFixture,
  createPhase09DocumentExtractionInputFixture,
  createPhase09ExtractedCandidateFactsFixture,
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
} from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runExtractDocumentCandidateFacts } from "./extract-document-candidate-facts"

const createdDirectories: string[] = []

function writeDocumentFixtureFiles(directory: string): void {
  const fixtureDirectory = join(directory, "fixtures")
  mkdirSync(fixtureDirectory, { recursive: true })
  writeFileSync(join(fixtureDirectory, "scn-05-supporting-design.pdf"), "SCN-05 supporting design")
  writeFileSync(
    join(fixtureDirectory, "scn-05-topology-diagram.drawio"),
    "<mxfile host=\"app.diagrams.net\"><diagram id=\"scn-05\">placeholder</diagram></mxfile>",
  )
}

function createTempWorkspace(): string {
  const directory = mkdtempSync(join(tmpdir(), "cloud-solution-extract-"))
  writeDocumentFixtureFiles(directory)
  createdDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

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
    const worktree = createTempWorkspace()
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
        worktree,
      }),
      rootDirectory: worktree,
    })

    expect(createCalls).toEqual([
      expect.objectContaining({
        query: expect.objectContaining({
          directory: worktree,
        }),
      }),
      expect.objectContaining({
        query: expect.objectContaining({
          directory: worktree,
        }),
      }),
    ])
    expect(promptCalls).toEqual([
      expect.objectContaining({
        query: expect.objectContaining({
          directory: worktree,
        }),
      }),
      expect.objectContaining({
        query: expect.objectContaining({
          directory: worktree,
        }),
      }),
    ])
  })

  test("rejects document sources that resolve outside the workspace through a symlink", async () => {
    const workspace = createTempWorkspace()
    const outsideDirectory = createTempWorkspace()
    const outsideFile = join(outsideDirectory, "outside-workspace.pdf")
    const symlinkRef = "fixtures/symlinked-outside.pdf"

    writeFileSync(outsideFile, "outside workspace")
    symlinkSync(outsideFile, join(workspace, symlinkRef))

    await expect(
      runExtractDocumentCandidateFacts({
        input: {
          ...createScn05DocumentExtractionInputFixture(),
          documentAssist: {
            ...createScn05DocumentExtractionInputFixture().documentAssist,
            documentSources: [
              {
                kind: "document",
                ref: symlinkRef,
                note: "Symlinked outside workspace",
              },
            ],
          },
        },
        pluginConfig: loadPluginConfig(process.cwd()),
        runtime: createWorkerRuntimeContext(createFakeCoordinatorClient().client),
        rootDirectory: workspace,
      }),
    ).rejects.toThrow("documentSources[].ref must not resolve outside the current workspace.")
  })

  test("adds configured advisory external-source retrieval before extraction", async () => {
    const pluginConfig = {
      ...loadPluginConfig(process.cwd()),
      document_assist_advisory_source_tool_name: "query_external_solution_source" as const,
    }
    const fixture = createPhase09DocumentExtractionInputFixture()
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                markdown: "# Supporting network design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
        JSON.stringify({
          workerId: "document-source-advisory-mcp",
          status: "success",
          output: {
            advisorySources: createPhase09AdvisorySourcesFixture(),
            advisoryWarnings: ["Topology system had no additional rack data."],
          },
          recommendations: [],
        }),
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createPhase09ExtractedCandidateFactsFixture(),
            extractionWarnings: ["External source omitted rack placement details."],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })

    const result = await runExtractDocumentCandidateFacts({
      input: fixture,
      pluginConfig,
      runtime: createWorkerRuntimeContext(client),
      rootDirectory: process.cwd(),
    })

    expect(createCalls).toHaveLength(3)
    expect(promptCalls).toHaveLength(3)
    expect(promptCalls[1]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          tools: expect.objectContaining({
            query_external_solution_source: true,
          }),
        }),
      }),
    )
    expect(result.draftInput.documentAssist?.candidateFacts).toEqual(
      createPhase09ExtractedCandidateFactsFixture(),
    )
    expect(result.extractionWarnings).toEqual([
      "Topology system had no additional rack data.",
      "External source omitted rack placement details.",
    ])
  })
})
