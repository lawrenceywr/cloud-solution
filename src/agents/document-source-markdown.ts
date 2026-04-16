import { z } from "zod"

import type { WorkerRuntimeContext } from "../coordinator/types"
import {
  executeSubsessionProtocol,
  type SubsessionProtocolResult,
} from "../coordinator/subsession-protocol"
import { SourceReferenceSchema } from "../domain"

const DocumentSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image"]),
})

export const ConvertedDocumentSourceSchema = z.object({
  sourceRef: DocumentSourceSchema,
  markdown: z.string().trim().min(1),
})

export const DocumentSourceMarkdownOutputSchema = z.object({
  convertedDocuments: z.array(ConvertedDocumentSourceSchema).default([]),
  conversionWarnings: z.array(z.string()).default([]),
})

export type ConvertedDocumentSource = z.infer<typeof ConvertedDocumentSourceSchema>

const documentSourceMarkdownSystemPrompt = [
  "You are the internal document-to-markdown preparation child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "For each supplied local sourceRef, attempt to use the MarkItDown conversion tool when it is available.",
  "Spreadsheet or workbook sources, including xlsx, should stay as workbook-derived markdown instead of being paraphrased.",
  "The preferred tool name is 'markitdown_convert_to_markdown'.",
  "If a source cannot be converted, is unsupported, or the tool is unavailable, do not invent markdown; add a conversion warning instead.",
  "Only return markdown that is grounded in the supplied sourceRef.",
  "Keep the original sourceRef unchanged so downstream provenance still points to the original local file.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'document-source-markdown'.",
  "Set output to { convertedDocuments, conversionWarnings }.",
  "Set recommendations to [].",
].join("\n")

function isSpreadsheetSourceRef(ref: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(ref)
}

function buildDocumentSourceMarkdownPrompt(args: {
  documentSources: Array<z.infer<typeof DocumentSourceSchema>>
}): string {
  const workbookGuardrails = args.documentSources.some((source) => isSpreadsheetSourceRef(source.ref))
    ? [
        "For workbook sources, preserve the converted sheet boundaries exactly as returned by MarkItDown.",
        "Keep sheet headings such as '## SheetName' and maintain workbook sheet order in the markdown.",
      ]
    : []

  return [
    "Convert the following local document/image/diagram sources into markdown when possible:",
    JSON.stringify({
      documentSources: args.documentSources,
      guardrails: [
        "Converted markdown is advisory extraction input only.",
        "Do not summarize beyond the converted content.",
        "Return one convertedDocuments entry per successfully converted source.",
        ...workbookGuardrails,
      ],
    }, null, 2),
  ].join("\n")
}

export async function runDocumentSourceMarkdownInChildSession(args: {
  documentSources: Array<z.infer<typeof DocumentSourceSchema>>
  runtime: WorkerRuntimeContext
}): Promise<SubsessionProtocolResult<typeof DocumentSourceMarkdownOutputSchema>> {
  return executeSubsessionProtocol({
    workerId: "document-source-markdown",
    sessionTitle: "Document Source Markdown",
    systemPrompt: documentSourceMarkdownSystemPrompt,
    userPrompt: buildDocumentSourceMarkdownPrompt({
      documentSources: args.documentSources,
    }),
    tools: {
      markitdown_convert_to_markdown: true,
    },
    outputSchema: DocumentSourceMarkdownOutputSchema,
  }, args.runtime)
}
