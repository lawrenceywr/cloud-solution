import type { SolutionRequirement, SourceReference } from "../domain"
import type { ConvertedDocumentSource } from "./document-source-markdown"

export type DocumentAssistedExtractionAgentBrief = {
  agentID: "document_assisted_extraction"
  goal: string
  requirement: SolutionRequirement
  documentSources: SourceReference[]
  convertedDocuments: ConvertedDocumentSource[]
  guardrails: string[]
}

export function buildDocumentAssistedExtractionAgentBrief(args: {
  requirement: SolutionRequirement
  documentSources: SourceReference[]
  convertedDocuments?: ConvertedDocumentSource[]
}): DocumentAssistedExtractionAgentBrief {
  return {
    agentID: "document_assisted_extraction",
    goal: "Extract grounded candidate facts from the supplied local documents without promoting them to confirmed truth.",
    requirement: args.requirement,
    documentSources: args.documentSources,
    convertedDocuments: args.convertedDocuments ?? [],
    guardrails: [
      "Use only the supplied local document, image, and diagram refs.",
      "Treat converted markdown as advisory reading input only.",
      "Always keep provenance anchored to the original documentSources.",
      "Extract candidate facts only; do not produce confirmed facts.",
      "Every extracted fact must stay grounded in the supplied documentSources.",
      "Return ambiguity and unreadable-source notes as extraction warnings instead of inventing facts.",
    ],
  }
}
