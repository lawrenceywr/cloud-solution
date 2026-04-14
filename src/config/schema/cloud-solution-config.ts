import { z } from "zod"

import { ArtifactTypeSchema } from "../../domain"

export const ApprovedDocumentAssistAdvisorySourceToolNames = [
  "query_external_solution_source",
] as const

export const DocumentAssistAdvisorySourceToolNameSchema = z.enum(
  ApprovedDocumentAssistAdvisorySourceToolNames,
)

export type DocumentAssistAdvisorySourceToolName = z.infer<
  typeof DocumentAssistAdvisorySourceToolNameSchema
>

const DefaultArtifactTypes = [
  "device-cabling-table",
  "device-port-plan",
  "device-port-connection-table",
  "ip-allocation-table",
] as const

export const CloudSolutionConfigInputSchema = z.object({
  plugin_name: z.string().optional(),
  disabled_tools: z.array(z.string()).optional(),
  disabled_hooks: z.array(z.string()).optional(),
  allow_document_assist: z.boolean().optional(),
  document_assist_advisory_source_tool_name: DocumentAssistAdvisorySourceToolNameSchema.optional(),
  require_confirmation_for_inferred_facts: z.boolean().optional(),
  default_artifacts: z.array(ArtifactTypeSchema).optional(),
})

export const CloudSolutionConfigSchema = CloudSolutionConfigInputSchema.extend({
  plugin_name: z.string().default("cloud-solution"),
  disabled_tools: z.array(z.string()).default([]),
  disabled_hooks: z.array(z.string()).default([]),
  allow_document_assist: z.boolean().default(true),
  document_assist_advisory_source_tool_name: DocumentAssistAdvisorySourceToolNameSchema.optional(),
  require_confirmation_for_inferred_facts: z.boolean().default(true),
  default_artifacts: z.array(ArtifactTypeSchema).default([...DefaultArtifactTypes]),
})

export type CloudSolutionConfig = z.infer<typeof CloudSolutionConfigSchema>
