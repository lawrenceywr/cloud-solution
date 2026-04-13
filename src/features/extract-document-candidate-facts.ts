import { z } from "zod"
import path from "node:path"

import type { CloudSolutionConfig } from "../config"
import { SolutionRequirementSchema, SourceReferenceSchema } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { StructuredSolutionInputSchema } from "../normalizers/normalize-structured-solution-input"
import { prepareDocumentSourcesAsMarkdown } from "./document-source-markdown"
import { executeDocumentAssistedExtractionWorkerSubsession } from "../workers/document-assisted-extraction"

const DocumentSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image"]),
})

const ExtractDocumentCandidateFactsInputSchema = z.object({
  requirement: SolutionRequirementSchema,
  documentAssist: z.object({
    documentSources: z.array(DocumentSourceSchema).min(1),
    candidateFacts: StructuredSolutionInputSchema.shape.structuredInput,
  }),
})

function hasSeedCandidateFacts(value: z.infer<typeof StructuredSolutionInputSchema>["structuredInput"]): boolean {
  return value.racks.length > 0
    || value.devices.length > 0
    || value.links.length > 0
    || value.segments.length > 0
    || value.allocations.length > 0
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function normalizeDocumentSourceRefs(args: {
  documentSources: z.infer<typeof DocumentSourceSchema>[]
  rootDirectory: string
}) {
  return args.documentSources.map((sourceRef) => {
    if (path.isAbsolute(sourceRef.ref)) {
      throw new Error("documentSources[].ref must be relative to the current workspace.")
    }

    const resolvedRef = path.resolve(args.rootDirectory, sourceRef.ref)
    const relativeRef = path.relative(args.rootDirectory, resolvedRef)
    if (relativeRef === "" || relativeRef.startsWith("..") || path.isAbsolute(relativeRef)) {
      throw new Error("documentSources[].ref must stay within the current workspace.")
    }

    return {
      ...sourceRef,
      ref: relativeRef,
    }
  })
}

export async function runExtractDocumentCandidateFacts(args: {
  input: unknown
  pluginConfig: CloudSolutionConfig
  runtime: WorkerRuntimeContext
  rootDirectory: string
}) {
  if (!args.pluginConfig.allow_document_assist) {
    throw new Error("Document-assisted drafting is disabled by plugin config.")
  }

  const parsedInput = ExtractDocumentCandidateFactsInputSchema.parse(args.input)
  const normalizedDocumentSources = normalizeDocumentSourceRefs({
    documentSources: parsedInput.documentAssist.documentSources,
    rootDirectory: args.rootDirectory,
  })
  if (hasSeedCandidateFacts(parsedInput.documentAssist.candidateFacts)) {
    throw new Error(
      "extract_document_candidate_facts expects an empty candidate-fact scaffold as input.",
    )
  }

  const markdownPreparation = await prepareDocumentSourcesAsMarkdown({
    documentSources: normalizedDocumentSources,
    runtime: args.runtime,
  })

  const extractionResult = await executeDocumentAssistedExtractionWorkerSubsession(
    {
      requirement: parsedInput.requirement,
      documentSources: normalizedDocumentSources,
      convertedDocuments: markdownPreparation.convertedDocuments,
    },
    args.runtime,
  )

  if (!extractionResult.success) {
    throw new Error(
      extractionResult.result.errors?.join("; ")
        ?? "document-assisted extraction worker failed",
    )
  }

  return {
    requirement: parsedInput.requirement,
    draftInput: {
      requirement: parsedInput.requirement,
      documentAssist: {
        documentSources: normalizedDocumentSources,
        candidateFacts: extractionResult.result.output.candidateFacts,
      },
    },
    extractionWarnings: uniqueStrings([
      ...markdownPreparation.conversionWarnings,
      ...extractionResult.result.output.extractionWarnings,
      ...(extractionResult.result.errors ?? []),
    ]),
    nextAction: "draft_topology_model" as const,
  }
}
