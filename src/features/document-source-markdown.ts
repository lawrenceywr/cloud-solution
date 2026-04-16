import type { SourceReference } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import {
  runDocumentSourceMarkdownInChildSession,
  type ConvertedDocumentSource,
} from "../agents/document-source-markdown"

type DocumentSource = SourceReference & {
  kind: "document" | "diagram" | "image"
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function isSpreadsheetSource(ref: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(ref)
}

function hasWorkbookSheetBoundaries(markdown: string): boolean {
  return /^##\s+\S+/m.test(markdown)
}

export async function prepareDocumentSourcesAsMarkdown(args: {
  documentSources: DocumentSource[]
  runtime: WorkerRuntimeContext
}): Promise<{
  convertedDocuments: ConvertedDocumentSource[]
  conversionWarnings: string[]
}> {
  const result = await runDocumentSourceMarkdownInChildSession({
    documentSources: args.documentSources,
    runtime: args.runtime,
  })

  if (!result.success) {
    return {
      convertedDocuments: [],
      conversionWarnings: uniqueStrings(
        result.result.errors ?? [
          "MarkItDown preprocessing failed; extraction will continue with original document sources only.",
        ],
      ),
    }
  }

  const allowedSourceKeys = new Set(
    args.documentSources.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`),
  )
  const convertedDocuments = result.result.output.convertedDocuments.filter((document) => {
    const key = `${document.sourceRef.kind}:${document.sourceRef.ref}:${document.sourceRef.note ?? ""}`
    return allowedSourceKeys.has(key)
  })
  const droppedDocumentCount = result.result.output.convertedDocuments.length - convertedDocuments.length
  const workbookBoundaryWarnings: string[] = []
  const validatedDocuments = convertedDocuments.filter((document) => {
    if (!isSpreadsheetSource(document.sourceRef.ref) || hasWorkbookSheetBoundaries(document.markdown)) {
      return true
    }

    workbookBoundaryWarnings.push(
      `Dropped converted workbook markdown for ${document.sourceRef.ref} because no sheet boundaries like '## SheetName' were preserved.`,
    )
    return false
  })

  return {
    convertedDocuments: validatedDocuments,
    conversionWarnings: uniqueStrings([
      ...result.result.output.conversionWarnings,
      ...workbookBoundaryWarnings,
      ...(droppedDocumentCount > 0
        ? [
            `Dropped ${droppedDocumentCount} converted markdown result(s) whose sourceRef did not match the supplied documentSources.`,
          ]
        : []),
    ]),
  }
}
