import type { SolutionRequirement, SourceReference } from "../domain"
import type { AdvisorySourceEvidence } from "./document-source-advisory-mcp"
import type { ConvertedDocumentSource } from "./document-source-markdown"

export type DocumentAssistedExtractionAgentBrief = {
  agentID: "document_assisted_extraction"
  goal: string
  requirement: SolutionRequirement
  documentSources: SourceReference[]
  convertedDocuments: ConvertedDocumentSource[]
  advisorySources: AdvisorySourceEvidence[]
  guardrails: string[]
}

export function buildDocumentAssistedExtractionAgentBrief(args: {
  requirement: SolutionRequirement
  documentSources: SourceReference[]
  convertedDocuments?: ConvertedDocumentSource[]
  advisorySources?: AdvisorySourceEvidence[]
}): DocumentAssistedExtractionAgentBrief {
  return {
    agentID: "document_assisted_extraction",
    goal: "Extract grounded candidate facts from the supplied local documents and approved advisory external sources without promoting them to confirmed truth.",
    requirement: args.requirement,
    documentSources: args.documentSources,
    convertedDocuments: args.convertedDocuments ?? [],
    advisorySources: args.advisorySources ?? [],
    guardrails: [
      "Use only the supplied local document, image, and diagram refs plus any approved advisory external source refs.",
      "Treat converted markdown as advisory reading input only.",
      "Treat advisory external source summaries as advisory reading input only.",
      "Always keep provenance anchored to the original supplied sourceRefs.",
      "Extract candidate facts only; do not produce confirmed facts.",
      "Every extracted fact must stay grounded in the supplied documentSources or approved advisory external sourceRefs.",
      "Return ambiguity and unreadable-source notes as extraction warnings instead of inventing facts.",
    ],
  }
}
