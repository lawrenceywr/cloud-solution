import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

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

const ConvertedDocumentPreviewSchema = z.object({
  sourceRef: z.union([DocumentSourceSchema, z.string()]).optional(),
  kind: z.enum(["document", "diagram", "image"]).optional(),
  ref: z.string().optional(),
  note: z.string().optional(),
  markdown: z.string().trim().min(1).optional(),
  markdownLines: z.array(z.string()).default([]),
  previewLines: z.array(z.string()).default([]),
  markdownRef: z.string().optional(),
  convertedMarkdownRef: z.string().optional(),
  markdownFile: z.string().optional(),
  markdownFileRef: z.string().optional(),
  fullMarkdownFileRef: z.string().optional(),
  markdownIncluded: z.boolean().optional(),
})

const ConversionWarningSchema = z.union([
  z.string(),
  z.object({
    ref: z.string().optional(),
    sourceRef: z.union([DocumentSourceSchema, z.string()]).optional(),
    warning: z.string(),
  }),
])

function normalizeConversionWarning(entry: z.infer<typeof ConversionWarningSchema>): string {
  if (typeof entry === "string") {
    return entry
  }

  const ref = entry.ref
    ?? (typeof entry.sourceRef === "string" ? entry.sourceRef : entry.sourceRef?.ref)
  return ref ? `${ref}: ${entry.warning}` : entry.warning
}

function loadMarkdownFromReference(ref: string | undefined): string | undefined {
  if (!ref) {
    return undefined
  }

  const filePath = ref.startsWith("file://") ? fileURLToPath(ref) : ref
  if (!existsSync(filePath)) {
    return undefined
  }

  const markdown = readFileSync(filePath, "utf8").trim()
  return markdown.length > 0 ? markdown : undefined
}

function isPathInsideRoot(args: { root: string; target: string }): boolean {
  const relativeTarget = path.relative(args.root, args.target)
  return relativeTarget === "" || (!relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget))
}

function getOpencodeToolOutputDirectory(): string {
  const dataDirectory = process.env.XDG_DATA_HOME
    ? path.resolve(process.env.XDG_DATA_HOME)
    : path.join(homedir(), ".local", "share")

  return path.join(dataDirectory, "opencode", "tool-output")
}

function resolveAllowedMarkdownReference(args: {
  ref: string
  worktree: string
}): string | undefined {
  const resolvedPath = args.ref.startsWith("file://")
    ? fileURLToPath(args.ref)
    : path.isAbsolute(args.ref)
      ? args.ref
      : path.resolve(args.worktree, args.ref)

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    return undefined
  }

  const canonicalTarget = realpathSync(resolvedPath)
  const allowedRoots = [realpathSync(args.worktree)]
  const toolOutputDirectory = getOpencodeToolOutputDirectory()
  if (existsSync(toolOutputDirectory)) {
    allowedRoots.push(realpathSync(toolOutputDirectory))
  }

  return allowedRoots.some((root) => isPathInsideRoot({ root, target: canonicalTarget }))
    ? canonicalTarget
    : undefined
}

function normalizeSourceRef(
  entry: z.infer<typeof ConvertedDocumentPreviewSchema>,
): z.infer<typeof DocumentSourceSchema> | undefined {
  if (entry.sourceRef && typeof entry.sourceRef !== "string") {
    return entry.sourceRef
  }

  const ref = typeof entry.sourceRef === "string" ? entry.sourceRef : entry.ref
  if (!entry.kind || !ref) {
    return undefined
  }

  return {
    kind: entry.kind,
    ref,
    note: entry.note,
  }
}

function normalizeConvertedDocument(args: {
  entry: z.infer<typeof ConvertedDocumentSourceSchema> | z.infer<typeof ConvertedDocumentPreviewSchema>
  warnings: string[]
  worktree: string
}): z.infer<typeof ConvertedDocumentSourceSchema> | undefined {
  const previewEntry: z.infer<typeof ConvertedDocumentPreviewSchema> | undefined =
    "markdownLines" in args.entry
    || "previewLines" in args.entry
    || "markdownRef" in args.entry
    || "convertedMarkdownRef" in args.entry
    || "markdownFile" in args.entry
    || "markdownFileRef" in args.entry
    || "fullMarkdownFileRef" in args.entry
    || "kind" in args.entry
    || ("sourceRef" in args.entry && typeof args.entry.sourceRef === "string")
      ? (args.entry as z.infer<typeof ConvertedDocumentPreviewSchema>)
      : undefined

  const sourceRef = previewEntry
    ? normalizeSourceRef(previewEntry)
    : (args.entry as z.infer<typeof ConvertedDocumentSourceSchema>).sourceRef
  if (!sourceRef) {
    args.warnings.push(
      "Dropped converted markdown result because the worker did not return a usable sourceRef.",
    )
    return undefined
  }

  const markdown = args.entry.markdown
    ?? (previewEntry && previewEntry.markdownLines.length > 0
      ? previewEntry.markdownLines.join("\n").trim()
      : undefined)
    ?? loadMarkdownFromReference(
      previewEntry?.markdownRef
        ? resolveAllowedMarkdownReference({ ref: previewEntry.markdownRef, worktree: args.worktree })
        : undefined,
    )
    ?? loadMarkdownFromReference(
      previewEntry?.convertedMarkdownRef
        ? resolveAllowedMarkdownReference({ ref: previewEntry.convertedMarkdownRef, worktree: args.worktree })
        : undefined,
    )
    ?? loadMarkdownFromReference(
      previewEntry?.markdownFile
        ? resolveAllowedMarkdownReference({ ref: previewEntry.markdownFile, worktree: args.worktree })
        : undefined,
    )
    ?? loadMarkdownFromReference(
      previewEntry?.markdownFileRef
        ? resolveAllowedMarkdownReference({ ref: previewEntry.markdownFileRef, worktree: args.worktree })
        : undefined,
    )
    ?? loadMarkdownFromReference(
      previewEntry?.fullMarkdownFileRef
        ? resolveAllowedMarkdownReference({ ref: previewEntry.fullMarkdownFileRef, worktree: args.worktree })
        : undefined,
    )

  if (!markdown) {
    if (previewEntry && previewEntry.previewLines.length > 0) {
      args.warnings.push(
        `Dropped converted markdown for ${sourceRef.ref} because the worker returned only preview lines without a full markdown body or markdownRef.`,
      )
    } else if (
      previewEntry
      && (previewEntry.markdownRef || previewEntry.convertedMarkdownRef || previewEntry.markdownFile || previewEntry.markdownFileRef || previewEntry.fullMarkdownFileRef)
    ) {
      args.warnings.push(
        `Dropped converted markdown for ${sourceRef.ref} because the referenced markdown file could not be loaded from the current workspace or the OpenCode tool-output directory.`,
      )
    } else if (previewEntry?.markdownIncluded === false) {
      args.warnings.push(
        `Dropped converted markdown for ${sourceRef.ref} because the worker reported markdownIncluded=false without providing a usable markdownRef.`,
      )
    } else {
      args.warnings.push(
        `Dropped converted markdown for ${sourceRef.ref} because the worker did not return a usable markdown body.`,
      )
    }

    return undefined
  }

  return {
    sourceRef,
    markdown,
  }
}

export const DocumentSourceMarkdownOutputSchema = z.object({
  convertedDocuments: z.array(ConvertedDocumentSourceSchema).default([]),
  conversionWarnings: z.array(z.string()).default([]),
})

const RawDocumentSourceMarkdownOutputSchema = z.object({
  convertedDocuments: z.array(z.union([ConvertedDocumentSourceSchema, ConvertedDocumentPreviewSchema])).default([]),
  conversionWarnings: z.array(ConversionWarningSchema).default([]),
})

export type ConvertedDocumentSource = z.infer<typeof ConvertedDocumentSourceSchema>

function normalizeDocumentSourceMarkdownOutput(args: {
  output: z.infer<typeof RawDocumentSourceMarkdownOutputSchema>
  worktree: string
}): z.infer<typeof DocumentSourceMarkdownOutputSchema> {
  const normalizationWarnings: string[] = []
  const convertedDocuments = args.output.convertedDocuments.flatMap((entry) => {
    const normalized = normalizeConvertedDocument({
      entry,
      warnings: normalizationWarnings,
      worktree: args.worktree,
    })
    return normalized ? [normalized] : []
  })

  return {
    convertedDocuments,
    conversionWarnings: [
      ...args.output.conversionWarnings.map(normalizeConversionWarning),
      ...normalizationWarnings,
    ],
  }
}

const documentSourceMarkdownSystemPrompt = [
  "You are the internal document-to-markdown preparation child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "For each supplied local sourceRef, attempt to use the MarkItDown conversion tool when it is available.",
  "Spreadsheet or workbook sources, including xlsx, should stay as workbook-derived markdown instead of being paraphrased.",
  "The preferred tool name is 'markitdown_convert_to_markdown'.",
  "Do not use task, todowrite, read, grep, or any tool other than MarkItDown for this worker.",
  "Do not delegate, do not start background work, and do not continue the session after the MarkItDown call.",
  "If a workbook conversion is too large to inline safely, return the preserved file reference immediately using markdownFile or markdownFileRef instead of reading it back yourself.",
  "If a conversion warning needs provenance, include it as ref or sourceRef and warning only; do not add extra narration.",
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
  const result = await executeSubsessionProtocol({
    workerId: "document-source-markdown",
    sessionTitle: "Document Source Markdown",
    systemPrompt: documentSourceMarkdownSystemPrompt,
    userPrompt: buildDocumentSourceMarkdownPrompt({
      documentSources: args.documentSources,
    }),
    tools: {
      markitdown_convert_to_markdown: true,
    },
    outputSchema: RawDocumentSourceMarkdownOutputSchema,
  }, args.runtime)

  if (!result.success) {
    return result
  }

  return {
    success: true,
    result: {
      ...result.result,
      output: normalizeDocumentSourceMarkdownOutput({
        output: result.result.output,
        worktree: args.runtime.worktree,
      }),
    },
  }
}
