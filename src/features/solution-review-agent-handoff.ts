import type { CloudSolutionConfig } from "../config"
import type { WorkerInput, WorkerRuntimeContext } from "../coordinator/types"
import {
  buildSolutionReviewAgentBrief,
  runSolutionReviewAssistantInChildSession,
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
import { executeClarificationWorkerSubsession } from "../workers/requirements-clarification/worker"
import {
  runSolutionReviewWorkflow,
  type SolutionReviewWorkflowResult,
  type SolutionReviewWorkflowState,
} from "./solution-review-workflow"

export type SolutionReviewAgentHandoff = BackgroundSolutionReviewWorkflowResult & {
  clarificationSummary: ClarificationSummary
  finalResponse: string
  nextActions: string[]
  warnings?: string[]
}

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

function buildClarificationWorkerInput(
  workflow: SolutionReviewWorkflowResult,
): WorkerInput {
  return {
    requirement: workflow.sliceInput.requirement,
    devices: workflow.sliceInput.devices,
    racks: workflow.sliceInput.racks,
    ports: workflow.sliceInput.ports,
    links: workflow.sliceInput.links,
    segments: workflow.sliceInput.segments,
    allocations: workflow.sliceInput.allocations,
    validationIssues: workflow.validationSummary.issues,
    reviewSummary: workflow.reviewSummary,
  }
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

async function runClarificationChildSession(args: {
  workflow: SolutionReviewWorkflowResult
  clarificationSummary: ClarificationSummary
  runtime: WorkerRuntimeContext
}): Promise<{
  nextActions: string[]
  warnings?: string[]
}> {
  const childResult = await executeClarificationWorkerSubsession(
    buildClarificationWorkerInput(args.workflow),
    args.runtime,
  )

  if (!childResult.success) {
    return {
      nextActions: getClarificationFallbackActions(args.clarificationSummary),
      warnings: uniqueStrings(getClarificationFallbackWarnings(childResult.result.errors)),
    }
  }

  if (args.clarificationSummary.clarificationQuestions.length === 0) {
    return {
      nextActions: [],
      ...(childResult.result.errors && childResult.result.errors.length > 0
        ? {
            warnings: uniqueStrings(childResult.result.errors),
          }
        : {}),
    }
  }

  return {
    nextActions: uniqueStrings([
      ...childResult.result.recommendations,
      ...childResult.result.output.suggestions,
    ]),
    ...(childResult.result.errors && childResult.result.errors.length > 0
      ? {
          warnings: uniqueStrings(childResult.result.errors),
        }
      : {}),
  }
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
    const clarificationResult = await runClarificationChildSession({
      workflow,
      clarificationSummary,
      runtime: args.runtime,
    })
    const workflowResult = buildWorkflowResult({
      workflow,
      clarificationSummary,
    })
    const clarificationItems = collectClarificationItems(clarificationSummary)
    const assistantResult = await runSolutionReviewAssistantInChildSession({
      brief: buildSolutionReviewAgentBrief(workflowResult, clarificationItems),
      runtime: args.runtime,
    })

    const warnings = uniqueStrings([
      ...(clarificationResult.warnings ?? []),
      ...(assistantResult.warnings ?? []),
    ])

    return {
      ...workflowResult,
      clarificationSummary,
      finalResponse: assistantResult.finalResponse,
      nextActions: uniqueStrings([
        ...clarificationResult.nextActions,
        ...assistantResult.nextActions,
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
    const assistantResult = await runSolutionReviewAssistantInChildSession({
      brief: buildSolutionReviewAgentBrief(failedWorkflow),
      runtime: args.runtime,
    })

    return {
      ...failedWorkflow,
      clarificationSummary: emptyClarificationSummary,
      finalResponse: assistantResult.finalResponse,
      nextActions: assistantResult.nextActions,
      ...(assistantResult.warnings
        ? {
            warnings: assistantResult.warnings,
          }
        : {}),
    }
  }
}
