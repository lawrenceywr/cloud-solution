import { z } from "zod"

import type { SolutionRequirement, SourceReference } from "../../domain"
import { SourceReferenceSchema } from "../../domain"
import type { WorkerResult, WorkerRuntimeContext } from "../../coordinator/types"
import {
  buildDocumentAssistedExtractionAgentBrief,
  DocumentAssistedExtractionOutputSchema,
  runDocumentAssistedExtractionInChildSession,
} from "../../agents"
import type { AdvisorySourceEvidence } from "../../agents/document-source-advisory-mcp"
import type { ConvertedDocumentSource } from "../../agents/document-source-markdown"
import type { SubsessionProtocolResult } from "../../coordinator/subsession-protocol"
import { StructuredSolutionInputSchema } from "../../normalizers/normalize-structured-solution-input"

const ExtractionSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image", "inventory", "system"]),
})

const ExtractedCandidateFactsSchema = StructuredSolutionInputSchema.shape.structuredInput

export type DocumentAssistedExtractionInput = {
  requirement: SolutionRequirement
  documentSources: SourceReference[]
  convertedDocuments?: ConvertedDocumentSource[]
  advisorySources?: AdvisorySourceEvidence[]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function uniqueSourceRefs(sourceRefs: SourceReference[]): SourceReference[] {
  const entries = new Map<string, SourceReference>()

  for (const sourceRef of sourceRefs) {
    const key = `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`
    if (!entries.has(key)) {
      entries.set(key, sourceRef)
    }
  }

  return [...entries.values()]
}

function validateExtractedCandidateFacts(args: {
  candidateFacts: z.infer<typeof ExtractedCandidateFactsSchema>
  allowedSourceRefs: SourceReference[]
}): string[] {
  const allowedSourceKeys = new Set(
    args.allowedSourceRefs.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`),
  )
  const errors: string[] = []

  const validateSourceRefs = (entityRef: string, sourceRefs: SourceReference[]) => {
    if (sourceRefs.length === 0) {
      errors.push(`${entityRef} must include at least one extraction sourceRef.`)
      return
    }

    for (const sourceRef of sourceRefs) {
      const key = `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`
      if (!allowedSourceKeys.has(key)) {
        errors.push(`${entityRef} includes a sourceRef outside the supplied extraction sources.`)
      }
      if (!ExtractionSourceSchema.safeParse(sourceRef).success) {
        errors.push(`${entityRef} includes a non-advisory sourceRef kind.`)
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
  const result = await runDocumentAssistedExtractionInChildSession({
    brief: buildDocumentAssistedExtractionAgentBrief({
      requirement: input.requirement,
      documentSources: input.documentSources,
      convertedDocuments: input.convertedDocuments,
      advisorySources: input.advisorySources,
    }),
    runtime,
  })

  if (!result.success) {
    return result
  }

  const validationErrors = validateExtractedCandidateFacts({
    candidateFacts: result.result.output.candidateFacts,
    allowedSourceRefs: uniqueSourceRefs([
      ...input.documentSources,
      ...(input.advisorySources ?? []).map((advisorySource) => advisorySource.sourceRef),
    ]),
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
