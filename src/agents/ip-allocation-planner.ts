import type { WorkerRuntimeContext } from "../coordinator/types"
import { executeSubsessionProtocol } from "../coordinator/subsession-protocol"
import {
  PlanningDraftAgentOutputSchema,
  type PlanningDraftAgentBrief,
} from "./planning-draft-brief"

const ipAllocationPlannerSystemPrompt = [
  "You are the internal IP allocation planner child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "Produce advisory draft structured input only; never produce final artifact tables.",
  "Keep any generated facts inferred or unresolved and preserve the validated-model trust boundary.",
  "Focus on segments and allocations needed for an IP allocation planning draft.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'ip-allocation-planner'.",
  "Set output to { structuredInput, planningWarnings }.",
  "Set recommendations to ['draft_topology_model'].",
].join("\n")

function buildIpAllocationPlannerPrompt(brief: PlanningDraftAgentBrief): string {
  return [
    "IP allocation planning brief:",
    JSON.stringify(brief, null, 2),
  ].join("\n")
}

export async function runIpAllocationPlannerInChildSession(args: {
  brief: PlanningDraftAgentBrief
  runtime: WorkerRuntimeContext
}) {
  return executeSubsessionProtocol({
    workerId: "ip-allocation-planner",
    sessionTitle: "IP Allocation Planner",
    systemPrompt: ipAllocationPlannerSystemPrompt,
    userPrompt: buildIpAllocationPlannerPrompt(args.brief),
    outputSchema: PlanningDraftAgentOutputSchema,
  }, args.runtime)
}
