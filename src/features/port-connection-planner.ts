import { buildPlanningDraftAgentBrief } from "../agents"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { runSolutionReviewWorkflow } from "./solution-review-workflow"
import { executePortConnectionPlannerWorker } from "../workers/port-connection-planner"

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export async function runPortConnectionPlanner(args: {
  input: unknown
  runtime: WorkerRuntimeContext
}) {
  const workflow = runSolutionReviewWorkflow({
    input: args.input,
    mode: "review",
  })
  const plannerBrief = buildPlanningDraftAgentBrief({
    agentID: "port_connection_planner",
    sliceInput: workflow.sliceInput,
    validationSummary: workflow.validationSummary,
    reviewSummary: workflow.reviewSummary,
  })
  const workerResult = await executePortConnectionPlannerWorker({
    ...workflow.sliceInput,
    validationIssues: workflow.issues,
    reviewSummary: workflow.reviewSummary,
    context: {
      plannerBrief,
    },
    workerMessages: {},
  }, args.runtime)
  if (workerResult.status === "failed") {
    throw new Error(workerResult.errors?.join("; ") ?? "port-connection planner failed")
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
