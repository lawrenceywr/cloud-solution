import type { CloudSolutionConfig } from "../config"
import type { SolutionRequirement, SourceReference } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import {
  runDocumentSourceAdvisoryMcpInChildSession,
  type AdvisorySourceEvidence,
} from "../agents/document-source-advisory-mcp"

type AdvisoryRequirementSource = SourceReference & {
  kind: "inventory" | "system"
}

type AdvisoryRequirementContext = Pick<
  SolutionRequirement,
  "id" | "projectName" | "scopeType" | "artifactRequests"
>

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function createSourceRefKey(sourceRef: SourceReference): string {
  return `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`
}

function isAdvisoryRequirementSource(sourceRef: SourceReference): sourceRef is AdvisoryRequirementSource {
  return sourceRef.kind === "inventory" || sourceRef.kind === "system"
}

function buildAdvisoryRequirementContext(
  requirement: SolutionRequirement,
): AdvisoryRequirementContext {
  return {
    id: requirement.id,
    projectName: requirement.projectName,
    scopeType: requirement.scopeType,
    artifactRequests: requirement.artifactRequests,
  }
}

export async function prepareRequirementAdvisorySources(args: {
  requirement: SolutionRequirement
  pluginConfig: CloudSolutionConfig
  runtime: WorkerRuntimeContext
}): Promise<{
  advisorySources: AdvisorySourceEvidence[]
  advisoryWarnings: string[]
}> {
  const toolName = args.pluginConfig.document_assist_advisory_source_tool_name
  if (!toolName) {
    return {
      advisorySources: [],
      advisoryWarnings: [],
    }
  }

  const approvedSourceRefs = args.requirement.sourceRefs.filter(isAdvisoryRequirementSource)
  if (approvedSourceRefs.length === 0) {
    return {
      advisorySources: [],
      advisoryWarnings: [],
    }
  }

  const result = await runDocumentSourceAdvisoryMcpInChildSession({
    requirementContext: buildAdvisoryRequirementContext(args.requirement),
    approvedSourceRefs,
    toolName,
    runtime: args.runtime,
  })

  if (!result.success) {
    return {
      advisorySources: [],
      advisoryWarnings: uniqueStrings(
        result.result.errors ?? [
          "Advisory external-source retrieval failed; extraction will continue with supplied document sources only.",
        ],
      ),
    }
  }

  const allowedSourceKeys = new Set(approvedSourceRefs.map(createSourceRefKey))
  const advisorySources = result.result.output.advisorySources.filter((advisorySource) => {
    return allowedSourceKeys.has(createSourceRefKey(advisorySource.sourceRef))
  })
  const droppedSourceCount = result.result.output.advisorySources.length - advisorySources.length

  return {
    advisorySources,
    advisoryWarnings: uniqueStrings([
      ...result.result.output.advisoryWarnings,
      ...(droppedSourceCount > 0
        ? [
            `Dropped ${droppedSourceCount} advisory external source result(s) whose sourceRef did not match the supplied requirement.sourceRefs.`,
          ]
        : []),
    ]),
  }
}
