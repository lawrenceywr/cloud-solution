import { describe, expect, test } from "bun:test"

import { createScn05DocumentExtractionInputFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { prepareDocumentSourcesAsMarkdown } from "./document-source-markdown"

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
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.convertedDocuments).toEqual([])
    expect(result.conversionWarnings).toEqual([
      "Worker document-source-markdown returned unexpected workerId 'wrong-worker'",
    ])
  })

  test("falls back to warnings when converted markdown is blank after trimming", async () => {
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
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.convertedDocuments).toEqual([])
    expect(result.conversionWarnings).toEqual([
      "Worker document-source-markdown returned invalid output result",
    ])
  })
})
