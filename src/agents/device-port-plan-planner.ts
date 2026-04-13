import type { WorkerRuntimeContext } from "../coordinator/types"
import { executeSubsessionProtocol } from "../coordinator/subsession-protocol"
import {
  PlanningDraftAgentOutputSchema,
  type PlanningDraftAgentBrief,
} from "./planning-draft-brief"

const devicePortPlanPlannerSystemPrompt = [
  "You are the internal device port plan planner child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "Produce advisory draft structured input only; never produce final artifact tables.",
  "Keep any generated facts inferred or unresolved and preserve the validated-model trust boundary.",
  "Focus on devices and ports needed for a device port plan draft.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'device-port-plan-planner'.",
  "Set output to { structuredInput, planningWarnings }.",
  "Set recommendations to ['draft_topology_model'].",
].join("\n")

function buildDevicePortPlanPlannerPrompt(brief: PlanningDraftAgentBrief): string {
  return [
    "Device port plan brief:",
    JSON.stringify(brief, null, 2),
  ].join("\n")
}

export async function runDevicePortPlanPlannerInChildSession(args: {
  brief: PlanningDraftAgentBrief
  runtime: WorkerRuntimeContext
}) {
  return executeSubsessionProtocol({
    workerId: "device-port-plan-planner",
    sessionTitle: "Device Port Plan Planner",
    systemPrompt: devicePortPlanPlannerSystemPrompt,
    userPrompt: buildDevicePortPlanPlannerPrompt(args.brief),
    outputSchema: PlanningDraftAgentOutputSchema,
  }, args.runtime)
}
