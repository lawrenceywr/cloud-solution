import { z } from "zod"

import { runSolutionReviewAssistantInChildSession } from "../../agents"
import type { WorkerInput, WorkerResult, WorkerRuntimeContext } from "../../coordinator/types"

const SolutionReviewAgentBriefSchema = z.object({
  agentID: z.literal("solution_review_assistant"),
  orchestrationState: z.enum(["queued", "running", "blocked", "review_required", "export_ready", "failed"]),
  workflowState: z.enum(["blocked", "review_required", "export_ready"]).optional(),
  goal: z.string(),
  nextAction: z.enum(["resolve_blockers", "review_assumptions", "export_bundle", "inspect_failure"]),
  summary: z.string(),
  blockedItems: z.array(z.string()),
  reviewItems: z.array(z.string()),
  exportArtifactNames: z.array(z.string()),
  guardrails: z.array(z.string()),
})

const SolutionReviewAssistantWorkerContextSchema = z.object({
  agentBrief: SolutionReviewAgentBriefSchema,
})

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export async function executeSolutionReviewAssistantWorker(
  input: WorkerInput,
  runtime: WorkerRuntimeContext,
): Promise<WorkerResult> {
  const parsedContext = SolutionReviewAssistantWorkerContextSchema.safeParse(input.context ?? {})
  if (!parsedContext.success) {
    return {
      workerId: "solution-review-assistant",
      status: "failed",
      output: {},
      recommendations: [],
      errors: ["Solution review assistant worker requires context.agentBrief."],
    }
  }

  const clarificationWorkerResult = input.workerMessages["requirements-clarification"]
  const executionResult = await runSolutionReviewAssistantInChildSession({
    brief: parsedContext.data.agentBrief,
    runtime,
  })
  const warnings = uniqueStrings([
    ...(clarificationWorkerResult?.status === "failed"
      ? ["Requirements clarification worker failed before assistant execution."]
      : []),
    ...(executionResult.warnings ?? []),
  ])

  return {
    workerId: "solution-review-assistant",
    status: warnings.length > 0 ? "partial" : "success",
    output: {
      finalResponse: executionResult.finalResponse,
      nextActions: executionResult.nextActions,
    },
    recommendations: uniqueStrings([
      ...(clarificationWorkerResult?.recommendations ?? []),
      ...executionResult.nextActions,
    ]),
    ...(warnings.length > 0
      ? {
          errors: warnings,
        }
      : {}),
  }
}

export default executeSolutionReviewAssistantWorker
