import { describe, expect, test } from "bun:test"

import { createScn05DocumentExtractionInputFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runDocumentSourceMarkdownInChildSession } from "./document-source-markdown"

describe("runDocumentSourceMarkdownInChildSession", () => {
  test("returns converted markdown blocks from a valid child session", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                markdown: "# Converted design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: ["Skipped non-convertible source."],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runDocumentSourceMarkdownInChildSession({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: "/tmp/original-directory",
        worktree: "/tmp/markitdown-worktree",
      }),
    })

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(createCalls[0]).toEqual(
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/markitdown-worktree",
        }),
      }),
    )
    expect(promptCalls[0]).toEqual(
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/markitdown-worktree",
        }),
        body: expect.objectContaining({
          tools: expect.objectContaining({
            markitdown_convert_to_markdown: true,
          }),
        }),
      }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.output.convertedDocuments[0]?.sourceRef).toEqual(
        fixture.documentAssist.documentSources[0],
      )
      expect(result.result.output.conversionWarnings).toEqual([
        "Skipped non-convertible source.",
      ])
    }
  })

  test("adds workbook guardrails when xlsx sources are converted", async () => {
    const workbookSource = {
      kind: "document" as const,
      ref: "fixtures/high-reliability-template.xlsx",
      note: "Workbook template",
    }
    const { client, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: workbookSource,
                markdown: "## Rack Layout\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n\n## Cabling\n\n| Cable | A | B |\n| --- | --- | --- |\n| CAB-001 | tor-a | server-a |",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runDocumentSourceMarkdownInChildSession({
      documentSources: [workbookSource],
      runtime: createWorkerRuntimeContext(client),
    })

    expect(promptCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          system: expect.stringContaining("Spreadsheet or workbook sources, including xlsx"),
          parts: [
            expect.objectContaining({
              text: expect.stringContaining("preserve the converted sheet boundaries exactly"),
            }),
          ],
        }),
      }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.output.convertedDocuments[0]?.markdown).toContain("## Rack Layout")
      expect(result.result.output.convertedDocuments[0]?.markdown).toContain("## Cabling")
    }
  })
})
