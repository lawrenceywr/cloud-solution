import { z } from "zod"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import { SolutionRequirementSchema, SourceReferenceSchema } from "../../domain"
import type { RuntimeContext } from "../../plugin/types"
import { runExtractStructuredInputFromTemplates } from "../../features"
import { createExtractStructuredInputFromTemplatesArgs } from "../intake-tool-args"
import { createInternalWorkerRuntimeContext } from "../internal-worker-runtime"

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
      const runtime = context?.client
        ? createInternalWorkerRuntimeContext({
            context,
            toolContext,
          })
        : undefined

      const result = await runExtractStructuredInputFromTemplates({
        input: ExtractStructuredInputFromTemplatesInputSchema.parse(inputArgs),
        pluginConfig,
        runtime,
        rootDirectory: context?.worktree ?? context?.directory ?? process.cwd(),
      })

      return JSON.stringify(result, null, 2)
    },
  })

  return { extract_structured_input_from_templates }
}
