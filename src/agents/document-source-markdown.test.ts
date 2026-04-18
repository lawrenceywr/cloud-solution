import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, test } from "bun:test"

import { createScn05DocumentExtractionInputFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runDocumentSourceMarkdownInChildSession } from "./document-source-markdown"

const createdDirectories: string[] = []

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

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
          system: expect.stringMatching(/Spreadsheet or workbook sources, including xlsx[\s\S]*Do not use task, todowrite, read, grep[\s\S]*markdownFile or markdownFileRef/),
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

  test("normalizes completed payloads with markdownFile and object sourceRef warnings into the standard output shape", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const tempDirectory = mkdtempSync(join(tmpdir(), "cloud-solution-doc-source-md-"))
    createdDirectories.push(tempDirectory)
    const markdownDirectory = join(tempDirectory, "converted")
    mkdirSync(markdownDirectory, { recursive: true })
    const markdownFile = join(markdownDirectory, "converted.md")
    writeFileSync(markdownFile, "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")

    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "completed",
          output: {
            convertedDocuments: [
              {
                kind: fixture.documentAssist.documentSources[0].kind,
                sourceRef: fixture.documentAssist.documentSources[0].ref,
                note: fixture.documentAssist.documentSources[0].note,
                markdownFile: "converted/converted.md",
                markdownIncluded: false,
              },
            ],
            conversionWarnings: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                warning: "Inline markdown omitted due to size limits.",
              },
            ],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runDocumentSourceMarkdownInChildSession({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: tempDirectory,
        worktree: tempDirectory,
      }),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.status).toBe("success")
      expect(result.result.output.convertedDocuments).toEqual([
        {
          sourceRef: fixture.documentAssist.documentSources[0],
          markdown: "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |",
        },
      ])
      expect(result.result.output.conversionWarnings).toEqual([
        `${fixture.documentAssist.documentSources[0].ref}: Inline markdown omitted due to size limits.`,
      ])
    }
  })

  test("drops markdown file refs that resolve outside the workspace and tool-output allowlist", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const outsideDirectory = mkdtempSync(join(tmpdir(), "cloud-solution-doc-source-md-outside-"))
    createdDirectories.push(outsideDirectory)
    const outsideMarkdownFile = join(outsideDirectory, "outside.md")
    writeFileSync(outsideMarkdownFile, "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")

    const safeWorktree = mkdtempSync(join(tmpdir(), "cloud-solution-doc-source-md-safe-"))
    createdDirectories.push(safeWorktree)

    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "completed_with_warnings",
          output: {
            convertedDocuments: [
              {
                kind: fixture.documentAssist.documentSources[0].kind,
                sourceRef: fixture.documentAssist.documentSources[0].ref,
                note: fixture.documentAssist.documentSources[0].note,
                markdownFileRef: `file://${outsideMarkdownFile}`,
                markdownIncluded: false,
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runDocumentSourceMarkdownInChildSession({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: safeWorktree,
        worktree: safeWorktree,
      }),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.output.convertedDocuments).toEqual([])
      expect(result.result.output.conversionWarnings).toContain(
        `Dropped converted markdown for ${fixture.documentAssist.documentSources[0].ref} because the referenced markdown file could not be loaded from the current workspace or the OpenCode tool-output directory.`,
      )
    }
  })

  test("loads convertedMarkdownRef responses relative to the current worktree", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const tempDirectory = mkdtempSync(join(tmpdir(), "cloud-solution-doc-source-md-ref-"))
    createdDirectories.push(tempDirectory)
    const markdownDirectory = join(tempDirectory, "converted")
    mkdirSync(markdownDirectory, { recursive: true })
    writeFileSync(join(markdownDirectory, "converted.md"), "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")

    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                convertedMarkdownRef: "converted/converted.md",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runDocumentSourceMarkdownInChildSession({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: tempDirectory,
        worktree: tempDirectory,
      }),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.output.convertedDocuments).toEqual([
        {
          sourceRef: fixture.documentAssist.documentSources[0],
          markdown: "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |",
        },
      ])
    }
  })
})
