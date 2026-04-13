import { buildPlanningDraftAgentBrief } from "../agents"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { runSolutionReviewWorkflow } from "./solution-review-workflow"
import { executeDevicePortPlanPlannerWorker } from "../workers/device-port-plan-planner"

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export async function runDevicePortPlanPlanner(args: {
  input: unknown
  runtime: WorkerRuntimeContext
}) {
  const workflow = runSolutionReviewWorkflow({
    input: args.input,
    mode: "review",
  })
  const plannerBrief = buildPlanningDraftAgentBrief({
    agentID: "device_port_plan_planner",
    sliceInput: workflow.sliceInput,
    validationSummary: workflow.validationSummary,
    reviewSummary: workflow.reviewSummary,
  })
  const workerResult = await executeDevicePortPlanPlannerWorker({
    ...workflow.sliceInput,
    validationIssues: workflow.issues,
    reviewSummary: workflow.reviewSummary,
    context: {
      plannerBrief,
    },
    workerMessages: {},
  }, args.runtime)
  if (workerResult.status === "failed") {
    throw new Error(workerResult.errors?.join("; ") ?? "device-port-plan planner failed")
  }

  const planningWarnings = (workerResult.output.planningWarnings as string[]) ?? []
  const structuredInput = workerResult.output.structuredInput

  return {
    requirement: workflow.sliceInput.requirement,
    draftInput: {
      requirement: workflow.sliceInput.requirement,
      structuredInput,
    },
    planningWarnings: uniqueStrings([
      ...planningWarnings,
      ...(workerResult.errors ?? []),
    ]),
    nextAction: "draft_topology_model" as const,
  }
}
