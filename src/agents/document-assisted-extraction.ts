import { z } from "zod"

import type { WorkerRuntimeContext } from "../coordinator/types"
import {
  executeSubsessionProtocol,
  type SubsessionProtocolResult,
} from "../coordinator/subsession-protocol"
import { StructuredSolutionInputSchema } from "../normalizers/normalize-structured-solution-input"
import type { DocumentAssistedExtractionAgentBrief } from "./document-assisted-extraction-brief"

const ExtractedCandidateFactsSchema = StructuredSolutionInputSchema.shape.structuredInput

export const DocumentAssistedExtractionOutputSchema = z.object({
  candidateFacts: ExtractedCandidateFactsSchema,
  extractionWarnings: z.array(z.string()).default([]),
})

const documentAssistedExtractionSystemPrompt = [
  "You are the internal document-assisted extraction child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "Inspect only the provided local document, image, or diagram refs.",
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

function buildDocumentAssistedExtractionPrompt(
  brief: DocumentAssistedExtractionAgentBrief,
): string {
  return [
    "Document-assisted extraction brief:",
    JSON.stringify(brief, null, 2),
  ].join("\n")
}

export async function runDocumentAssistedExtractionInChildSession(args: {
  brief: DocumentAssistedExtractionAgentBrief
  runtime: WorkerRuntimeContext
}): Promise<SubsessionProtocolResult<typeof DocumentAssistedExtractionOutputSchema>> {
  return executeSubsessionProtocol({
    workerId: "document-assisted-extraction",
    sessionTitle: "Document Assisted Extraction",
    systemPrompt: documentAssistedExtractionSystemPrompt,
    userPrompt: buildDocumentAssistedExtractionPrompt(args.brief),
    outputSchema: DocumentAssistedExtractionOutputSchema,
  }, args.runtime)
}
