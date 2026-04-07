import { z } from "zod"

import type { SolutionRequirement, SourceReference } from "../../domain"
import { SourceReferenceSchema } from "../../domain"
import type { WorkerResult, WorkerRuntimeContext } from "../../coordinator/types"
import {
  executeSubsessionProtocol,
  type SubsessionProtocolResult,
} from "../../coordinator/subsession-protocol"
import { StructuredSolutionInputSchema } from "../../normalizers/normalize-structured-solution-input"

const DocumentSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image"]),
})

const ExtractedCandidateFactsSchema = StructuredSolutionInputSchema.shape.structuredInput

const DocumentAssistedExtractionOutputSchema = z.object({
  candidateFacts: ExtractedCandidateFactsSchema,
  extractionWarnings: z.array(z.string()).default([]),
})

export type DocumentAssistedExtractionInput = {
  requirement: SolutionRequirement
  documentSources: SourceReference[]
}

function buildExtractionPrompt(input: DocumentAssistedExtractionInput): string {
  return [
    "Requirement:",
    JSON.stringify(input.requirement, null, 2),
    "",
    "Document sources:",
    JSON.stringify(input.documentSources, null, 2),
  ].join("\n")
}

const extractionSystemPrompt = [
  "You are the internal document-assisted extraction child agent for a cloud/data-center solution workflow.",
  "Inspect only the provided local document, image, or diagram sources by their ref paths.",
  "Extract only grounded candidate facts into racks, devices, links, segments, and allocations.",
  "Every extracted fact must include at least one sourceRef copied from the provided documentSources.",
  "Never mark an extracted fact as confirmed. Use only inferred or unresolved confidence.",
  "Do not invent facts that are not grounded in the supplied sources.",
  "Put ambiguity, unreadable files, or uncertain interpretation notes into extractionWarnings.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'document-assisted-extraction'.",
  "Set output to { candidateFacts, extractionWarnings }.",
  "Set recommendations to ['draft_topology_model'].",
].join("\n")

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function validateExtractedCandidateFacts(args: {
  candidateFacts: z.infer<typeof ExtractedCandidateFactsSchema>
  documentSources: SourceReference[]
}): string[] {
  const allowedSourceKeys = new Set(
    args.documentSources.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`),
  )
  const errors: string[] = []

  const validateSourceRefs = (entityRef: string, sourceRefs: SourceReference[]) => {
    if (sourceRefs.length === 0) {
      errors.push(`${entityRef} must include at least one document sourceRef.`)
      return
    }

    for (const sourceRef of sourceRefs) {
      const key = `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`
      if (!allowedSourceKeys.has(key)) {
        errors.push(`${entityRef} includes a sourceRef outside the supplied documentSources.`)
      }
      if (!DocumentSourceSchema.safeParse(sourceRef).success) {
        errors.push(`${entityRef} includes a non-document sourceRef kind.`)
      }
    }
  }

  const validateStatus = (entityRef: string, statusConfidence: string) => {
    if (statusConfidence === "confirmed") {
      errors.push(`${entityRef} cannot be marked confirmed by document-assisted extraction.`)
    }
  }

  args.candidateFacts.racks.forEach((rack) => {
    const entityRef = `rack:${rack.id ?? rack.name}`
    validateStatus(entityRef, rack.statusConfidence)
    validateSourceRefs(entityRef, rack.sourceRefs)
  })

  args.candidateFacts.devices.forEach((device) => {
    const entityRef = `device:${device.id ?? device.name}`
    validateStatus(entityRef, device.statusConfidence)
    validateSourceRefs(entityRef, device.sourceRefs)
    device.ports.forEach((port) => {
      const portEntityRef = `port:${port.id ?? `${device.name}:${port.name}`}`
      validateStatus(portEntityRef, port.statusConfidence)
      validateSourceRefs(portEntityRef, port.sourceRefs)
    })
  })

  args.candidateFacts.links.forEach((link) => {
    const entityRef = `link:${link.id ?? `${link.endpointA.deviceName}:${link.endpointA.portName}-${link.endpointB.deviceName}:${link.endpointB.portName}`}`
    validateStatus(entityRef, link.statusConfidence)
    validateSourceRefs(entityRef, link.sourceRefs)
  })

  args.candidateFacts.segments.forEach((segment) => {
    const entityRef = `segment:${segment.id ?? segment.name}`
    validateStatus(entityRef, segment.statusConfidence)
    validateSourceRefs(entityRef, segment.sourceRefs)
  })

  args.candidateFacts.allocations.forEach((allocation) => {
    const entityRef = `allocation:${allocation.id ?? `${allocation.segmentName}:${allocation.ipAddress}`}`
    validateStatus(entityRef, allocation.statusConfidence)
    validateSourceRefs(entityRef, allocation.sourceRefs)
  })

  return uniqueStrings(errors)
}

export async function executeDocumentAssistedExtractionWorkerSubsession(
  input: DocumentAssistedExtractionInput,
  runtime: WorkerRuntimeContext,
): Promise<SubsessionProtocolResult<typeof DocumentAssistedExtractionOutputSchema>> {
  const result = await executeSubsessionProtocol({
    workerId: "document-assisted-extraction",
    sessionTitle: "Document Assisted Extraction",
    systemPrompt: extractionSystemPrompt,
    userPrompt: buildExtractionPrompt(input),
    outputSchema: DocumentAssistedExtractionOutputSchema,
  }, runtime)

  if (!result.success) {
    return result
  }

  const validationErrors = validateExtractedCandidateFacts({
    candidateFacts: result.result.output.candidateFacts,
    documentSources: input.documentSources,
  })
  if (validationErrors.length === 0) {
    return result
  }

  return {
    success: false,
    result: {
      workerId: "document-assisted-extraction",
      status: "failed",
      output: {},
      recommendations: [],
      errors: validationErrors,
    },
  }
}

export async function executeDocumentAssistedExtractionWorker(
  input: DocumentAssistedExtractionInput,
  runtime: WorkerRuntimeContext,
): Promise<WorkerResult> {
  const result = await executeDocumentAssistedExtractionWorkerSubsession(input, runtime)
  return result.result
}

export const DocumentAssistedExtractionOutput = DocumentAssistedExtractionOutputSchema

export default executeDocumentAssistedExtractionWorker
