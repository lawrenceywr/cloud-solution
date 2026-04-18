import { z } from "zod"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import { SolutionRequirementSchema, SourceReferenceSchema } from "../../domain"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import { StructuredSolutionInputSchema } from "../../normalizers/normalize-structured-solution-input"
import type { RuntimeContext } from "../../plugin/types"
import { runExtractDocumentCandidateFacts } from "../../features"
import { createExtractDocumentCandidateFactsArgs } from "../intake-tool-args"
import { createInternalWorkerRuntimeContext } from "../internal-worker-runtime"

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

export function createExtractDocumentCandidateFactsTools(args: {
  pluginConfig: CloudSolutionConfig
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const { pluginConfig, context } = args

  const extract_document_candidate_facts: ToolDefinition = tool({
    description:
      "Extract document/image/diagram-backed candidate facts into a draft input that feeds directly into draft_topology_model.",
    args: createExtractDocumentCandidateFactsArgs(),
    execute: async (inputArgs, toolContext) => {
      if (!context?.client) {
        throw new Error(
          "extract_document_candidate_facts requires a plugin runtime client to spawn the internal extraction worker",
        )
      }
      const runtime: WorkerRuntimeContext = createInternalWorkerRuntimeContext({
        context,
        toolContext,
      })

      const result = await runExtractDocumentCandidateFacts({
        input: ExtractDocumentCandidateFactsInputSchema.parse(inputArgs),
        pluginConfig,
        runtime,
        rootDirectory: context.worktree ?? context.directory,
      })

      return JSON.stringify(result, null, 2)
    },
  })

  return { extract_document_candidate_facts }
}
