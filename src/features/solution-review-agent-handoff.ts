import { z } from "zod"

import type { CloudSolutionConfig } from "../config"
import {
  runCoordinatorDispatcher,
  type WorkerDefinition,
  type WorkerResult,
  type WorkerRuntimeContext,
} from "../coordinator"
import {
  buildSolutionReviewAgentBrief,
  runSolutionReviewAssistant,
  runSolutionReviewAssistantInChildSession,
  type SolutionReviewAgentBrief,
  type SolutionReviewAssistantExecutionResult,
  type SolutionReviewAgentResponse,
} from "../agents"
import type {
  BackgroundSolutionReviewNextAction,
  BackgroundSolutionReviewWorkflowResult,
  BackgroundSolutionReviewWorkflowState,
} from "./background-solution-review-workflow"
import {
  assessClarificationQuestions,
  type ClarificationSummary,
} from "../workers/requirements-clarification/question-templates"
import { executeClarificationWorker } from "../workers/requirements-clarification/worker"
import { ClarificationWorkerOutputSchema } from "../workers/requirements-clarification/types"
import { executeSolutionReviewAssistantWorker } from "../workers/solution-review-assistant/worker"
import {
  runSolutionReviewWorkflow,
  type SolutionReviewWorkflowResult,
  type SolutionReviewWorkflowState,
} from "./solution-review-workflow"

export type SolutionReviewAgentHandoff = BackgroundSolutionReviewWorkflowResult & {
  clarificationSummary: ClarificationSummary
  agentBrief: SolutionReviewAgentBrief
  agentResponse: SolutionReviewAgentResponse
  workersInvoked: string[]
  executionOrder: string[]
  finalResponse: string
  nextActions: string[]
  warnings?: string[]
}

const SolutionReviewAssistantWorkerOutputSchema = z.object({
  finalResponse: z.string(),
  nextActions: z.array(z.string()),
})

const emptyClarificationSummary: ClarificationSummary = {
  missingFields: [],
  clarificationQuestions: [],
  blockingQuestions: [],
  nonBlockingQuestions: [],
  suggestions: [],
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function formatClarificationItem(question: ClarificationSummary["clarificationQuestions"][number]): string {
  return `${question.field}: ${question.question}`
}

function getClarificationFallbackActions(
  clarificationSummary: ClarificationSummary,
): string[] {
  if (clarificationSummary.clarificationQuestions.length === 0) {
    return []
  }

  return uniqueStrings([
    "请补充以下信息后再继续方案评审",
    ...clarificationSummary.suggestions,
  ])
}

function getClarificationFallbackWarnings(errors?: string[]): string[] {
  if (
    errors?.length === 1
    && errors[0] === "Worker requirements-clarification returned invalid output result"
  ) {
    return [
      "Requirements clarification child session returned invalid output; used deterministic clarification summary instead.",
    ]
  }

  return errors && errors.length > 0
    ? errors
    : [
        "Requirements clarification child session returned invalid output; used deterministic clarification summary instead.",
      ]
}

function buildReviewWorkflowWorkers(): WorkerDefinition[] {
  return [
    {
      id: "requirements-clarification",
      name: "Requirements Clarification",
      description: "Analyzes the current slice and returns clarification questions when needed.",
      triggerCondition: () => true,
      priority: 100,
      dependencies: [],
      execute: executeClarificationWorker,
    },
    {
      id: "solution-review-assistant",
      name: "Solution Review Assistant",
      description: "Produces the assistant follow-up response from the workflow brief and prior worker results.",
      triggerCondition: () => true,
      priority: 200,
      dependencies: ["requirements-clarification"],
      execute: executeSolutionReviewAssistantWorker,
    },
  ]
}

function buildClarificationWorkerOutcome(args: {
  clarificationSummary: ClarificationSummary
  workerResult?: WorkerResult
}): Promise<{
  nextActions: string[]
  warnings?: string[]
}> {
  const { clarificationSummary, workerResult } = args

  if (!workerResult || workerResult.status === "failed") {
    return Promise.resolve({
      nextActions: getClarificationFallbackActions(clarificationSummary),
      warnings: uniqueStrings(getClarificationFallbackWarnings(workerResult?.errors)),
    })
  }

  const parsedOutput = ClarificationWorkerOutputSchema.safeParse(workerResult.output)
  if (!parsedOutput.success) {
    return Promise.resolve({
      nextActions: getClarificationFallbackActions(clarificationSummary),
      warnings: uniqueStrings(getClarificationFallbackWarnings(workerResult.errors)),
    })
  }

  if (clarificationSummary.clarificationQuestions.length === 0) {
    return Promise.resolve({
      nextActions: [],
      ...(workerResult.errors && workerResult.errors.length > 0
        ? {
            warnings: uniqueStrings(workerResult.errors),
          }
        : {}),
    })
  }

  return Promise.resolve({
    nextActions: uniqueStrings([
      ...workerResult.recommendations,
      ...parsedOutput.data.suggestions,
    ]),
    ...(workerResult.errors && workerResult.errors.length > 0
      ? {
          warnings: uniqueStrings(workerResult.errors),
        }
      : {}),
  })
}

function deriveWorkflowState(args: {
  workflow: SolutionReviewWorkflowResult
  clarificationSummary: ClarificationSummary
}): SolutionReviewWorkflowState {
  if (!args.workflow.validationSummary.valid || args.clarificationSummary.blockingQuestions.length > 0) {
    return "blocked"
  }

  if (
    args.workflow.reviewSummary.reviewRequired
    || args.clarificationSummary.nonBlockingQuestions.length > 0
  ) {
    return "review_required"
  }

  return "export_ready"
}

function getNextAction(
  workflowState: SolutionReviewWorkflowState,
): BackgroundSolutionReviewNextAction {
  switch (workflowState) {
    case "blocked":
      return "resolve_blockers"
    case "review_required":
      return "review_assumptions"
    case "export_ready":
      return "export_bundle"
  }
}

function buildWorkflowResult(args: {
  workflow: SolutionReviewWorkflowResult
  clarificationSummary: ClarificationSummary
}): BackgroundSolutionReviewWorkflowResult {
  const workflowState = deriveWorkflowState(args)
  const transitions: BackgroundSolutionReviewWorkflowState[] = [
    "queued",
    "running",
    workflowState,
  ]

  return {
    workflowID: `solution-review-workflow:${args.workflow.sliceInput.requirement.id}`,
    orchestrationState: workflowState,
    workflowState,
    nextAction: getNextAction(workflowState),
    transitions,
    validationSummary: args.workflow.validationSummary,
    reviewSummary: args.workflow.reviewSummary,
    bundle: workflowState === "export_ready" ? args.workflow.bundle : undefined,
  }
}

function buildFailedWorkflow(error: string): BackgroundSolutionReviewWorkflowResult {
  return {
    workflowID: "solution-review-workflow:failed",
    orchestrationState: "failed",
    nextAction: "inspect_failure",
    transitions: ["queued", "running", "failed"],
    error,
  }
}

function collectClarificationItems(
  clarificationSummary: ClarificationSummary,
): {
  blockedItems: string[]
  reviewItems: string[]
} {
  return {
    blockedItems: uniqueStrings(
      clarificationSummary.blockingQuestions.map(formatClarificationItem),
    ),
    reviewItems: uniqueStrings(
      clarificationSummary.nonBlockingQuestions.map(formatClarificationItem),
    ),
  }
}

function buildAgentResponse(args: {
  brief: SolutionReviewAgentBrief
  finalResponse: string
  checklist: string[]
}): SolutionReviewAgentResponse {
  return {
    agentID: args.brief.agentID,
    orchestrationState: args.brief.orchestrationState,
    nextAction: args.brief.nextAction,
    response: args.finalResponse,
    checklist: uniqueStrings(args.checklist),
  }
}

function buildAssistantExecutionResult(args: {
  brief: SolutionReviewAgentBrief
  workerResult?: WorkerResult
}): SolutionReviewAssistantExecutionResult {
  const { brief, workerResult } = args

  if (!workerResult || workerResult.status === "failed") {
    const fallbackResponse = runSolutionReviewAssistant(brief)

    return {
      finalResponse: fallbackResponse.response,
      nextActions: uniqueStrings(fallbackResponse.checklist),
      ...(workerResult?.errors && workerResult.errors.length > 0
        ? {
            warnings: uniqueStrings(workerResult.errors),
          }
        : {}),
    }
  }

  const parsedOutput = SolutionReviewAssistantWorkerOutputSchema.safeParse(workerResult.output)
  if (!parsedOutput.success) {
    const fallbackResponse = runSolutionReviewAssistant(brief)

    return {
      finalResponse: fallbackResponse.response,
      nextActions: uniqueStrings(fallbackResponse.checklist),
      warnings: uniqueStrings([
        ...(workerResult.errors ?? []),
        "Solution review assistant worker returned invalid output result.",
      ]),
    }
  }

  return {
    finalResponse: parsedOutput.data.finalResponse,
    nextActions: uniqueStrings(parsedOutput.data.nextActions),
    ...(workerResult.errors && workerResult.errors.length > 0
      ? {
          warnings: uniqueStrings(workerResult.errors),
        }
      : {}),
  }
}

export async function runSolutionReviewAgentHandoff(args: {
  input: unknown
  pluginConfig: CloudSolutionConfig
  runtime: WorkerRuntimeContext
}): Promise<SolutionReviewAgentHandoff> {
  try {
    const workflow = runSolutionReviewWorkflow({
      input: args.input,
      mode: "export",
      pluginConfig: args.pluginConfig,
      includeBundleWhenNotExportReady: false,
    })

    const clarificationSummary = assessClarificationQuestions(workflow.sliceInput)
    const workflowResult = buildWorkflowResult({
      workflow,
      clarificationSummary,
    })
    const clarificationItems = collectClarificationItems(clarificationSummary)
    const agentBrief = buildSolutionReviewAgentBrief(workflowResult, clarificationItems)
    const coordinatorResult = await runCoordinatorDispatcher({
      input: {
        ...workflow.sliceInput,
        context: {
          agentBrief,
        },
      },
      workers: buildReviewWorkflowWorkers(),
      runtime: args.runtime,
      reviewSummary: workflow.reviewSummary,
    })
    const clarificationResult = await buildClarificationWorkerOutcome({
      clarificationSummary,
      workerResult: coordinatorResult.aggregatedOutput["requirements-clarification"],
    })
    const assistantResult = buildAssistantExecutionResult({
      brief: agentBrief,
      workerResult: coordinatorResult.aggregatedOutput["solution-review-assistant"],
    })
    const agentResponse = buildAgentResponse({
      brief: agentBrief,
      finalResponse: assistantResult.finalResponse,
      checklist: assistantResult.nextActions,
    })

    const warnings = uniqueStrings([
      ...(clarificationResult.warnings ?? []),
      ...(assistantResult.warnings ?? []),
    ])

    return {
      ...workflowResult,
      clarificationSummary,
      agentBrief,
      agentResponse,
      workersInvoked: coordinatorResult.workersInvoked,
      executionOrder: coordinatorResult.executionOrder,
      finalResponse: agentResponse.response,
      nextActions: uniqueStrings([
        ...clarificationResult.nextActions,
        ...agentResponse.checklist,
      ]),
      ...(warnings.length > 0
        ? {
            warnings,
          }
        : {}),
    }
  } catch (error) {
    const failedWorkflow = buildFailedWorkflow(
      error instanceof Error ? error.message : String(error),
    )
    const agentBrief = buildSolutionReviewAgentBrief(failedWorkflow)
    const assistantResult = await runSolutionReviewAssistantInChildSession({
      brief: agentBrief,
      runtime: args.runtime,
    })
    const agentResponse = buildAgentResponse({
      brief: agentBrief,
      finalResponse: assistantResult.finalResponse,
      checklist: assistantResult.nextActions,
    })

    return {
      ...failedWorkflow,
      clarificationSummary: emptyClarificationSummary,
      agentBrief,
      agentResponse,
      workersInvoked: [],
      executionOrder: [],
      finalResponse: agentResponse.response,
      nextActions: agentResponse.checklist,
      ...(assistantResult.warnings
        ? {
            warnings: assistantResult.warnings,
          }
        : {}),
    }
  }
}
