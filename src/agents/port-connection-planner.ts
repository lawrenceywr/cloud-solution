import type { WorkerRuntimeContext } from "../coordinator/types"
import { executeSubsessionProtocol } from "../coordinator/subsession-protocol"
import {
  PlanningDraftAgentOutputSchema,
  type PlanningDraftAgentBrief,
} from "./planning-draft-brief"

const portConnectionPlannerSystemPrompt = [
  "You are the internal device port connection planner child agent for a cloud/data-center solution workflow.",
  "Base your output only on the provided brief JSON.",
  "Produce advisory draft structured input only; never produce final artifact tables.",
  "Keep any generated facts inferred or unresolved and preserve the validated-model trust boundary.",
  "Focus on devices, ports, and links needed for a port connection planning draft.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'port-connection-planner'.",
  "Set output to { structuredInput, planningWarnings }.",
  "Set recommendations to ['draft_topology_model'].",
].join("\n")

function buildPortConnectionPlannerPrompt(brief: PlanningDraftAgentBrief): string {
  return [
    "Port connection planning brief:",
    JSON.stringify(brief, null, 2),
  ].join("\n")
}

export async function runPortConnectionPlannerInChildSession(args: {
  brief: PlanningDraftAgentBrief
  runtime: WorkerRuntimeContext
}) {
  return executeSubsessionProtocol({
    workerId: "port-connection-planner",
    sessionTitle: "Port Connection Planner",
    systemPrompt: portConnectionPlannerSystemPrompt,
    userPrompt: buildPortConnectionPlannerPrompt(args.brief),
    outputSchema: PlanningDraftAgentOutputSchema,
  }, args.runtime)
}
