import { z } from "zod"

import type { WorkerResult, WorkerRuntimeContext } from "../coordinator/types"
import { executeSubsessionProtocol } from "../coordinator/subsession-protocol"
import type { SolutionReviewAgentBrief } from "./solution-review-brief"

export type SolutionReviewAgentResponse = {
  agentID: "solution_review_assistant"
  orchestrationState: SolutionReviewAgentBrief["orchestrationState"]
  nextAction: SolutionReviewAgentBrief["nextAction"]
  response: string
  checklist: string[]
}

export type SolutionReviewAssistantExecutionResult = {
  finalResponse: string
  nextActions: string[]
  warnings?: string[]
}

const solutionReviewAssistantOutputSchema = z.object({
  finalResponse: z.string(),
  nextActions: z.array(z.string()),
})

const solutionReviewAssistantSystemPrompt = [
  "You are the internal solution review assistant child agent for a cloud/data-center solution workflow.",
  "Base your answer only on the provided brief JSON.",
  "Do not invent facts, artifacts, blockers, links, racks, ports, or allocations.",
  "Respect the brief guardrails exactly.",
  "Return exactly one JSON object and nothing else.",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
  "Set workerId to 'solution-review-assistant'.",
  "Set output to { finalResponse, nextActions } where finalResponse is a concise orchestrator-facing summary and nextActions is a concrete list of follow-up items grounded in the brief.",
  "Set recommendations to the same array as output.nextActions.",
].join("\n")

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function buildConfirmationPacketActions(brief: SolutionReviewAgentBrief): string[] {
  return brief.confirmationPackets.flatMap((packet) => [
    packet.requiredDecision,
    ...(packet.suggestedAction ? [packet.suggestedAction] : []),
  ])
}

function buildSolutionReviewAssistantPrompt(
  brief: SolutionReviewAgentBrief,
): string {
  return [
    "Solution review brief:",
    JSON.stringify(brief, null, 2),
  ].join("\n")
}

function buildDeterministicExecutionResult(
  brief: SolutionReviewAgentBrief,
  warnings?: string[],
): SolutionReviewAssistantExecutionResult {
  const response = runSolutionReviewAssistant(brief)

  return {
    finalResponse: response.response,
    nextActions: uniqueStrings(response.checklist),
    ...(warnings && warnings.length > 0
      ? {
          warnings: uniqueStrings(warnings),
        }
      : {}),
  }
}

function getAssistantFallbackWarnings(result: WorkerResult): string[] {
  if (
    result.errors?.length === 1
    && result.errors[0] === "Worker solution-review-assistant returned invalid output result"
  ) {
    return [
      "Solution review assistant child session returned invalid output; used deterministic fallback instead.",
    ]
  }

  return result.errors && result.errors.length > 0
    ? result.errors
    : [
        "Solution review assistant child session returned invalid output; used deterministic fallback instead.",
      ]
}

function buildAssistantExecutionResult(
  result: WorkerResult & {
    output: z.infer<typeof solutionReviewAssistantOutputSchema>
  },
): SolutionReviewAssistantExecutionResult {
  return {
    finalResponse: result.output.finalResponse,
    nextActions: uniqueStrings(result.output.nextActions),
    ...(result.errors && result.errors.length > 0
      ? {
          warnings: uniqueStrings(result.errors),
        }
      : {}),
  }
}

export function runSolutionReviewAssistant(
  brief: SolutionReviewAgentBrief,
): SolutionReviewAgentResponse {
  const confirmationPacketActions = buildConfirmationPacketActions(brief)

  switch (brief.orchestrationState) {
    case "blocked":
      return {
        agentID: brief.agentID,
        orchestrationState: brief.orchestrationState,
        nextAction: brief.nextAction,
        response: "Blocking validation issues must be resolved before review or export can continue.",
        checklist: uniqueStrings(
          brief.blockedItems.length > 0
            ? [...brief.blockedItems, ...confirmationPacketActions]
            : [
                "Inspect validation blockers before retrying the workflow.",
                ...confirmationPacketActions,
              ],
        ),
      }
    case "review_required":
      return {
        agentID: brief.agentID,
        orchestrationState: brief.orchestrationState,
        nextAction: brief.nextAction,
        response: "Review the listed assumptions and unresolved items before approving export.",
        checklist: uniqueStrings(
          brief.reviewItems.length > 0 || confirmationPacketActions.length > 0
            ? [...confirmationPacketActions, ...brief.reviewItems]
            : ["Inspect the review summary before approving export."],
        ),
      }
    case "export_ready":
      return {
        agentID: brief.agentID,
        orchestrationState: brief.orchestrationState,
        nextAction: brief.nextAction,
        response: "The workflow is export-ready; use the bundled artifacts as the final reviewed output.",
        checklist: brief.exportArtifactNames.length > 0
          ? brief.exportArtifactNames
          : ["Inspect the export bundle contents before delivery."],
      }
    case "failed":
      return {
        agentID: brief.agentID,
        orchestrationState: brief.orchestrationState,
        nextAction: brief.nextAction,
        response: "The workflow failed before producing a usable result; inspect the failure details before retrying.",
        checklist: brief.blockedItems.length > 0
          ? brief.blockedItems
          : ["Inspect the orchestration failure details before retrying."],
      }
    case "queued":
    case "running":
      return {
        agentID: brief.agentID,
        orchestrationState: brief.orchestrationState,
        nextAction: brief.nextAction,
        response: "Wait for the workflow to reach a terminal state before acting on the result.",
        checklist: ["Do not act on queued or running workflow state."],
      }
  }
}

export async function runSolutionReviewAssistantInChildSession(args: {
  brief: SolutionReviewAgentBrief
  runtime: WorkerRuntimeContext
}): Promise<SolutionReviewAssistantExecutionResult> {
  const result = await executeSubsessionProtocol({
    workerId: "solution-review-assistant",
    sessionTitle: "Solution Review Assistant",
    systemPrompt: solutionReviewAssistantSystemPrompt,
    userPrompt: buildSolutionReviewAssistantPrompt(args.brief),
    outputSchema: solutionReviewAssistantOutputSchema,
  }, args.runtime)

  if (!result.success) {
    return buildDeterministicExecutionResult(
      args.brief,
      getAssistantFallbackWarnings(result.result),
    )
  }

  return buildAssistantExecutionResult(result.result)
}
