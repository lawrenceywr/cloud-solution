import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path, { join, relative } from "node:path"

import { afterEach, describe, expect, test } from "bun:test"

import { createScn05DocumentExtractionInputFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { prepareDocumentSourcesAsMarkdown } from "./document-source-markdown"

const createdDirectories: string[] = []

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("prepareDocumentSourcesAsMarkdown", () => {
  test("drops converted markdown entries whose sourceRef does not match the supplied documentSources", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                markdown: "# Valid converted markdown",
              },
              {
                sourceRef: {
                  kind: "document",
                  ref: "forged-source.pdf",
                  note: "Forged",
                },
                markdown: "# Forged converted markdown",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client),
      worktree: process.cwd(),
    })

    expect(result.convertedDocuments).toEqual([
      {
        sourceRef: fixture.documentAssist.documentSources[0],
        markdown: "# Valid converted markdown",
      },
    ])
    expect(result.conversionWarnings).toEqual([
      "Dropped 1 converted markdown result(s) whose sourceRef did not match the supplied documentSources.",
    ])
  })

  test("falls back to warnings when markdown preprocessing fails", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const workspace = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-no-bundle-"))
    createdDirectories.push(workspace)
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "wrong-worker",
          status: "success",
          output: {},
          recommendations: [],
        }),
      ],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      worktree: workspace,
    })

    expect(result.convertedDocuments).toEqual([])
    expect(result.conversionWarnings).toEqual([
      "Worker document-source-markdown returned unexpected workerId 'wrong-worker'",
    ])
  })

  test("recovers markdown from a deterministic converted-markdown bundle when child-session preprocessing fails", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const workspace = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-bundle-"))
    createdDirectories.push(workspace)

    const bundleDirectory = join(workspace, "test", "converted-markdown")
    mkdirSync(bundleDirectory, { recursive: true })
    const markdownFile = join(bundleDirectory, "supporting-design.md")
    writeFileSync(markdownFile, "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")
    writeFileSync(join(bundleDirectory, "convertedDocuments.json"), JSON.stringify({
      convertedDocuments: [
        {
          kind: fixture.documentAssist.documentSources[0].kind,
          ref: fixture.documentAssist.documentSources[0].ref,
          note: fixture.documentAssist.documentSources[0].note,
          markdownRef: "test/converted-markdown/supporting-design.md",
        },
      ],
    }, null, 2))

    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "wrong-worker",
          status: "success",
          output: {},
          recommendations: [],
        }),
      ],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: [
        {
          ...fixture.documentAssist.documentSources[0],
          note: "Different note from the manifest",
        },
      ],
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      worktree: workspace,
    })

    expect(result.convertedDocuments).toEqual([
      {
        sourceRef: {
          ...fixture.documentAssist.documentSources[0],
          note: "Different note from the manifest",
        },
        markdown: "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n",
      },
    ])
    expect(result.conversionWarnings).toEqual([
      "Used the deterministic converted-markdown bundle for workbook preprocessing.",
    ])
  })

  test("prefers a complete deterministic converted-markdown bundle before spawning a child session", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const workspace = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-bundle-first-"))
    createdDirectories.push(workspace)

    const bundleDirectory = join(workspace, "test", "converted-markdown")
    mkdirSync(bundleDirectory, { recursive: true })
    const markdownPaths = [
      join(bundleDirectory, "supporting-design.md"),
      join(bundleDirectory, "rack-layout.md"),
      join(bundleDirectory, "port-plan.md"),
    ]
    writeFileSync(markdownPaths[0], "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")
    writeFileSync(markdownPaths[1], "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-b | tor-b |\n")
    writeFileSync(markdownPaths[2], "## Sheet1\n\n| Port | Use |\n| --- | --- |\n| eth0 | business |\n")
    writeFileSync(join(bundleDirectory, "convertedDocuments.json"), JSON.stringify({
      convertedDocuments: fixture.documentAssist.documentSources.map((sourceRef, index) => ({
        kind: sourceRef.kind,
        ref: sourceRef.ref,
        note: sourceRef.note,
        markdownRef: relative(workspace, markdownPaths[index]!),
      })),
    }, null, 2))

    const {
      client,
      createCalls,
      promptCalls,
    } = createFakeCoordinatorClient({
      promptTexts: ["this should never be used"],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      worktree: workspace,
    })

    expect(createCalls).toHaveLength(0)
    expect(promptCalls).toHaveLength(0)
    expect(result.convertedDocuments.map((document) => document.sourceRef.ref)).toEqual(
      fixture.documentAssist.documentSources.map((sourceRef) => sourceRef.ref),
    )
    expect(result.conversionWarnings).toEqual([
      "Used the deterministic converted-markdown bundle for workbook preprocessing.",
    ])
  })

  test("uses the explicit worktree for bundle detection even when runtime.worktree points elsewhere", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const workspace = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-bundle-root-"))
    createdDirectories.push(workspace)

    const bundleDirectory = join(workspace, "test", "converted-markdown")
    mkdirSync(bundleDirectory, { recursive: true })
    const markdownPaths = [
      join(bundleDirectory, "supporting-design.md"),
      join(bundleDirectory, "rack-layout.md"),
      join(bundleDirectory, "port-plan.md"),
    ]
    writeFileSync(markdownPaths[0], "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")
    writeFileSync(markdownPaths[1], "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-b | tor-b |\n")
    writeFileSync(markdownPaths[2], "## Sheet1\n\n| Port | Use |\n| --- | --- |\n| eth0 | business |\n")
    writeFileSync(join(bundleDirectory, "convertedDocuments.json"), JSON.stringify({
      convertedDocuments: fixture.documentAssist.documentSources.map((sourceRef, index) => ({
        kind: sourceRef.kind,
        ref: sourceRef.ref,
        note: sourceRef.note,
        markdownRef: relative(workspace, markdownPaths[index]!),
      })),
    }, null, 2))

    const unrelatedRuntimeRoot = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-other-root-"))
    createdDirectories.push(unrelatedRuntimeRoot)

    const {
      client,
      createCalls,
      promptCalls,
    } = createFakeCoordinatorClient({
      promptTexts: ["this should never be used"],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: unrelatedRuntimeRoot,
        worktree: unrelatedRuntimeRoot,
      }),
      worktree: workspace,
    })

    expect(createCalls).toHaveLength(0)
    expect(promptCalls).toHaveLength(0)
    expect(result.convertedDocuments.map((document) => document.sourceRef.ref)).toEqual(
      fixture.documentAssist.documentSources.map((sourceRef) => sourceRef.ref),
    )
    expect(result.conversionWarnings).toEqual([
      "Used the deterministic converted-markdown bundle for workbook preprocessing.",
    ])
  })

  test("loads a packaged deterministic bundle from dist/runtime-assets when test assets are absent", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const workspace = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-dist-bundle-"))
    createdDirectories.push(workspace)

    const bundleDirectory = join(workspace, "dist", "runtime-assets", "converted-markdown")
    mkdirSync(bundleDirectory, { recursive: true })
    const markdownPaths = [
      join(bundleDirectory, "supporting-design.md"),
      join(bundleDirectory, "rack-layout.md"),
      join(bundleDirectory, "port-plan.md"),
    ]
    writeFileSync(markdownPaths[0], "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |\n")
    writeFileSync(markdownPaths[1], "## Sheet1\n\n| Rack | Device |\n| --- | --- |\n| rack-b | tor-b |\n")
    writeFileSync(markdownPaths[2], "## Sheet1\n\n| Port | Use |\n| --- | --- |\n| eth0 | business |\n")
    writeFileSync(join(bundleDirectory, "convertedDocuments.json"), JSON.stringify({
      convertedDocuments: fixture.documentAssist.documentSources.map((sourceRef, index) => ({
        kind: sourceRef.kind,
        ref: sourceRef.ref,
        note: sourceRef.note,
        markdownRef: `test/converted-markdown/${path.basename(markdownPaths[index]!)}`,
      })),
    }, null, 2))

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: fixture.documentAssist.documentSources,
      worktree: workspace,
    })

    expect(result.convertedDocuments.map((document) => document.sourceRef.ref)).toEqual(
      fixture.documentAssist.documentSources.map((sourceRef) => sourceRef.ref),
    )
    expect(result.conversionWarnings).toEqual([
      "Used the deterministic converted-markdown bundle for workbook preprocessing.",
    ])
  })

  test("falls back to warnings when converted markdown is blank after trimming", async () => {
    const fixture = createScn05DocumentExtractionInputFixture()
    const workspace = mkdtempSync(join(tmpdir(), "cloud-solution-doc-md-blank-"))
    createdDirectories.push(workspace)
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                markdown: "   \n\t  ",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: fixture.documentAssist.documentSources,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      worktree: workspace,
    })

    expect(result.convertedDocuments).toEqual([])
    expect(result.conversionWarnings).toEqual([
      "Worker document-source-markdown returned invalid output result",
    ])
  })

  test("preserves multi-sheet xlsx markdown boundaries from MarkItDown", async () => {
    const workbookSource = {
      kind: "document" as const,
      ref: "fixtures/high-reliability-template.xlsx",
      note: "Workbook template",
    }
    const workbookMarkdown = [
      "## Rack Layout",
      "",
      "| Rack | Device |",
      "| --- | --- |",
      "| rack-a | tor-a |",
      "",
      "## Cabling",
      "",
      "| Cable | A | B |",
      "| --- | --- | --- |",
      "| CAB-001 | tor-a | server-a |",
    ].join("\n")
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: workbookSource,
                markdown: workbookMarkdown,
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: [workbookSource],
      runtime: createWorkerRuntimeContext(client),
      worktree: process.cwd(),
    })

    expect(result.convertedDocuments).toEqual([
      {
        sourceRef: workbookSource,
        markdown: workbookMarkdown,
      },
    ])
    expect(result.conversionWarnings).toEqual([])
  })

  test("drops converted workbook markdown when sheet boundaries are missing", async () => {
    const workbookSource = {
      kind: "document" as const,
      ref: "fixtures/high-reliability-template.xlsx",
      note: "Workbook template",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: workbookSource,
                markdown: "| Rack | Device |\n| --- | --- |\n| rack-a | tor-a |",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await prepareDocumentSourcesAsMarkdown({
      documentSources: [workbookSource],
      runtime: createWorkerRuntimeContext(client),
      worktree: process.cwd(),
    })

    expect(result.convertedDocuments).toEqual([])
    expect(result.conversionWarnings).toEqual([
      "Dropped converted workbook markdown for fixtures/high-reliability-template.xlsx because no sheet boundaries like '## SheetName' were preserved.",
    ])
  })
})
