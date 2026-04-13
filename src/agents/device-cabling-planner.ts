import type { WorkerRuntimeContext } from "../coordinator/types"
import { executeSubsessionProtocol } from "../coordinator/subsession-protocol"
import {
  PlanningDraftAgentOutputSchema,
  type PlanningDraftAgentBrief,
} from "./planning-draft-brief"

const deviceCablingPlannerSystemPrompt = [
  "You are the internal device cabling planner child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "Produce advisory draft structured input only; never produce final artifact tables.",
  "Keep any generated facts inferred or unresolved and preserve the validated-model trust boundary.",
  "Focus on racks, devices, ports, and links needed for a device cabling planning draft.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'device-cabling-planner'.",
  "Set output to { structuredInput, planningWarnings }.",
  "Set recommendations to ['draft_topology_model'].",
].join("\n")

function buildDeviceCablingPlannerPrompt(brief: PlanningDraftAgentBrief): string {
  return [
    "Device cabling planning brief:",
    JSON.stringify(brief, null, 2),
  ].join("\n")
}

export async function runDeviceCablingPlannerInChildSession(args: {
  brief: PlanningDraftAgentBrief
  runtime: WorkerRuntimeContext
}) {
  return executeSubsessionProtocol({
    workerId: "device-cabling-planner",
    sessionTitle: "Device Cabling Planner",
    systemPrompt: deviceCablingPlannerSystemPrompt,
    userPrompt: buildDeviceCablingPlannerPrompt(args.brief),
    outputSchema: PlanningDraftAgentOutputSchema,
  }, args.runtime)
}
