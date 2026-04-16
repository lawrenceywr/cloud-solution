import { z } from "zod"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import { SolutionRequirementSchema, SourceReferenceSchema } from "../../domain"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import type { RuntimeContext } from "../../plugin/types"
import { runExtractStructuredInputFromTemplates } from "../../features"
import { createExtractStructuredInputFromTemplatesArgs } from "../intake-tool-args"

const TemplateSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image"]),
})

const ExtractStructuredInputFromTemplatesInputSchema = z.object({
  requirement: SolutionRequirementSchema,
  documentSources: z.array(TemplateSourceSchema).min(1),
})

export function createExtractStructuredInputFromTemplatesTools(args: {
  pluginConfig: CloudSolutionConfig
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const { pluginConfig, context } = args

  const extract_structured_input_from_templates: ToolDefinition = tool({
    description:
      "Deterministically convert real workbook templates into structuredInput that can feed draft_topology_model.",
    args: createExtractStructuredInputFromTemplatesArgs(),
    execute: async (inputArgs, toolContext) => {
      if (!context?.client) {
        throw new Error(
          "extract_structured_input_from_templates requires a plugin runtime client to spawn the internal markdown preparation worker",
        )
      }
      const runtime: WorkerRuntimeContext = {
        client: context.client,
        parentSessionID: toolContext.sessionID,
        agent: toolContext.agent,
        directory: context.directory,
        worktree: context.worktree ?? context.directory,
        abort: toolContext.abort,
      }

      const result = await runExtractStructuredInputFromTemplates({
        input: ExtractStructuredInputFromTemplatesInputSchema.parse(inputArgs),
        pluginConfig,
        runtime,
        rootDirectory: context.worktree ?? context.directory,
      })

      return JSON.stringify(result, null, 2)
    },
  })

  return { extract_structured_input_from_templates }
}
