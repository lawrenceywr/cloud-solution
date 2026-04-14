import { z } from "zod"

import type { SolutionRequirement } from "../domain"
import { SourceReferenceSchema } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import type { DocumentAssistAdvisorySourceToolName } from "../config/schema/cloud-solution-config"
import {
  executeSubsessionProtocol,
  type SubsessionProtocolResult,
} from "../coordinator/subsession-protocol"

const AdvisorySourceRefSchema = SourceReferenceSchema.extend({
  kind: z.enum(["inventory", "system"]),
})

export const AdvisorySourceEvidenceSchema = z.object({
  sourceRef: AdvisorySourceRefSchema,
  advisoryText: z.string().trim().min(1),
})

export const DocumentSourceAdvisoryMcpOutputSchema = z.object({
  advisorySources: z.array(AdvisorySourceEvidenceSchema).default([]),
  advisoryWarnings: z.array(z.string()).default([]),
})

export type AdvisorySourceEvidence = z.infer<typeof AdvisorySourceEvidenceSchema>

type AdvisoryRequirementContext = Pick<
  SolutionRequirement,
  "id" | "projectName" | "scopeType" | "artifactRequests"
>

const documentSourceAdvisoryMcpSystemPrompt = [
  "You are the internal advisory external-source ingestion child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "Use only the allowed MCP tool named in the brief when it is available.",
  "Gather concise advisory extraction context for the supplied inventory/system sourceRefs.",
  "Keep every returned sourceRef unchanged so downstream provenance still points to the original approved source.",
  "Treat all external evidence as advisory only; do not return structured candidate facts or confirmed truth.",
  "If a source cannot be retrieved, is unsupported, or the MCP tool is unavailable, add an advisory warning instead of inventing evidence.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'document-source-advisory-mcp'.",
  "Set output to { advisorySources, advisoryWarnings }.",
  "Set recommendations to [].",
].join("\n")

function buildDocumentSourceAdvisoryMcpPrompt(args: {
  requirementContext: AdvisoryRequirementContext
  approvedSourceRefs: Array<z.infer<typeof AdvisorySourceRefSchema>>
  toolName: DocumentAssistAdvisorySourceToolName
}): string {
  return [
    "Gather advisory extraction context for the following approved external sources:",
    JSON.stringify({
      requirementContext: args.requirementContext,
      approvedSourceRefs: args.approvedSourceRefs,
      allowedToolName: args.toolName,
      guardrails: [
        "Return one advisorySources entry per successfully retrieved approved source.",
        "Keep advisoryText concise and grounded in the retrieved external evidence.",
        "Do not promote external evidence to confirmed facts.",
      ],
    }, null, 2),
  ].join("\n")
}

export async function runDocumentSourceAdvisoryMcpInChildSession(args: {
  requirementContext: AdvisoryRequirementContext
  approvedSourceRefs: Array<z.infer<typeof AdvisorySourceRefSchema>>
  toolName: DocumentAssistAdvisorySourceToolName
  runtime: WorkerRuntimeContext
}): Promise<SubsessionProtocolResult<typeof DocumentSourceAdvisoryMcpOutputSchema>> {
  return executeSubsessionProtocol({
    workerId: "document-source-advisory-mcp",
    sessionTitle: "Document Source Advisory MCP",
    systemPrompt: documentSourceAdvisoryMcpSystemPrompt,
    userPrompt: buildDocumentSourceAdvisoryMcpPrompt({
      requirementContext: args.requirementContext,
      approvedSourceRefs: args.approvedSourceRefs,
      toolName: args.toolName,
    }),
    tools: {
      [args.toolName]: true,
    },
    outputSchema: DocumentSourceAdvisoryMcpOutputSchema,
  }, args.runtime)
}
