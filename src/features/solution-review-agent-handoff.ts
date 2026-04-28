import { z } from "zod"

import type { CloudSolutionConfig } from "../config"
import {
  runCoordinatorDispatcher,
  type WorkerDefinition,
  type WorkerResult,
  type WorkerRuntimeContext,
} from "../coordinator"
import type {
  CandidateFact,
  CandidateFactConfirmationSummary,
  DraftInputState,
} from "../domain"
import {
  buildSolutionReviewAgentBrief,
  runSolutionReviewAssistant,
  runSolutionReviewAssistantInChildSession,
  type SolutionReviewAgentBrief,
  type SolutionReviewAssistantExecutionResult,
  type SolutionReviewAgentResponse,
} from "../agents"
import { prepareDraftSolutionInput } from "../normalizers"
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
import { executeEvidenceReconciliationWorker } from "../workers/evidence-reconciliation"
import { EvidenceReconciliationWorkerOutputSchema } from "../workers/evidence-reconciliation/types"
import { executeSolutionReviewAssistantWorker } from "../workers/solution-review-assistant/worker"
import { reconcileExtractedFacts } from "../validators"
import {
  runSolutionReviewWorkflow,
  type SolutionReviewWorkflowResult,
  type SolutionReviewWorkflowState,
} from "./solution-review-workflow"

export type SolutionReviewAgentHandoff = BackgroundSolutionReviewWorkflowResult & {
  inputState: DraftInputState
  candidateFacts: CandidateFact[]
  confirmationSummary: CandidateFactConfirmationSummary
  confirmationPackets: SolutionReviewWorkflowResult["reviewSummary"]["confirmationPackets"]
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

function deriveFailedInputState(input: unknown): DraftInputState {
  if (typeof input !== "object" || input === null) {
    return "confirmed_slice"
  }

  const record = input as Record<string, unknown>
  if ("documentAssist" in record || "confirmation" in record) {
    return "candidate_fact_draft"
  }

  if ("structuredInput" in record) {
    return "structured_input"
  }

  return "confirmed_slice"
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

function buildPreAssistantWorkflowWorkers(): WorkerDefinition[] {
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
      id: "evidence-reconciliation",
      name: "Evidence Reconciliation",
      description: "Detects conflicts between extracted facts from multiple sources.",
      triggerCondition: () => true,
      priority: 150,
      dependencies: ["requirements-clarification"],
      execute: executeEvidenceReconciliationWorker,
    },
  ]
}

function buildEvidenceFallbackWarnings(errors?: string[]): string[] {
  if (
    errors?.length === 1
    && errors[0] === "Worker evidence-reconciliation returned invalid output result"
  ) {
    return [
      "Evidence reconciliation child session returned invalid output; used deterministic conflict summary instead.",
    ]
  }

  return errors && errors.length > 0
    ? errors
    : [
        "Evidence reconciliation child session returned invalid output; used deterministic conflict summary instead.",
      ]
}

function buildEvidenceReconciliationOutcome(args: {
  deterministicConflicts: SolutionReviewWorkflowResult["reviewSummary"]["conflicts"]
  workerResult?: WorkerResult
}): {
  conflicts: SolutionReviewWorkflowResult["reviewSummary"]["conflicts"]
  warnings?: string[]
} {
  const { deterministicConflicts, workerResult } = args
  if (!workerResult || workerResult.status === "failed") {
    return {
      conflicts: deterministicConflicts,
      warnings: uniqueStrings(buildEvidenceFallbackWarnings(workerResult?.errors)),
    }
  }

  const parsedOutput = EvidenceReconciliationWorkerOutputSchema.safeParse(workerResult.output)
  if (!parsedOutput.success) {
    return {
      conflicts: deterministicConflicts,
      warnings: uniqueStrings(buildEvidenceFallbackWarnings(workerResult.errors)),
    }
  }

  const mergedConflicts = new Map(deterministicConflicts.map((conflict) => [conflict.id, conflict]))
  for (const conflict of parsedOutput.data.conflicts) {
    mergedConflicts.set(conflict.id, conflict)
  }

  return {
    conflicts: [...mergedConflicts.values()],
    ...(workerResult.errors && workerResult.errors.length > 0
      ? {
          warnings: uniqueStrings([
            ...parsedOutput.data.reconciliationWarnings,
            ...workerResult.errors,
          ]),
        }
      : parsedOutput.data.reconciliationWarnings.length > 0
        ? {
            warnings: uniqueStrings(parsedOutput.data.reconciliationWarnings),
          }
        : {}),
  }
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
  if (
    !args.workflow.validationSummary.valid
    || args.workflow.reviewSummary.hasBlockingConflicts
    || args.clarificationSummary.blockingQuestions.length > 0
  ) {
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
    const preparedInput = prepareDraftSolutionInput({
      input: args.input,
      allowDocumentAssist: args.pluginConfig.allow_document_assist,
    })
    
    // Run deterministic conflict detection before workflow
    const deterministicConflicts = reconcileExtractedFacts({
      devices: preparedInput.normalizedInput.devices,
      ports: preparedInput.normalizedInput.ports,
      links: preparedInput.normalizedInput.links,
      segments: preparedInput.normalizedInput.segments,
      allocations: preparedInput.normalizedInput.allocations,
      racks: preparedInput.normalizedInput.racks,
    })
    const workflowInput = {
      ...preparedInput.normalizedInput,
      ...(preparedInput.confirmationSummary.pendingConfirmationItems?.length
        ? {
            pendingConfirmationItems: preparedInput.confirmationSummary.pendingConfirmationItems,
          }
        : {}),
    }
    
    const initialWorkflow = runSolutionReviewWorkflow({
      input: workflowInput,
      mode: "export",
      pluginConfig: args.pluginConfig,
      includeBundleWhenNotExportReady: false,
      conflicts: deterministicConflicts,
    })

    const clarificationSummary = assessClarificationQuestions(initialWorkflow.sliceInput)
    const coordinatorResult = await runCoordinatorDispatcher({
      input: {
        ...initialWorkflow.sliceInput,
      },
      workers: buildPreAssistantWorkflowWorkers(),
      runtime: args.runtime,
      reviewSummary: initialWorkflow.reviewSummary,
    })
    const clarificationResult = await buildClarificationWorkerOutcome({
      clarificationSummary,
      workerResult: coordinatorResult.aggregatedOutput["requirements-clarification"],
    })
    const evidenceResult = buildEvidenceReconciliationOutcome({
      deterministicConflicts,
      workerResult: coordinatorResult.aggregatedOutput["evidence-reconciliation"],
    })
    const workflow = runSolutionReviewWorkflow({
      input: workflowInput,
      mode: "export",
      pluginConfig: args.pluginConfig,
      includeBundleWhenNotExportReady: false,
      conflicts: evidenceResult.conflicts,
    })
    const workflowResult = buildWorkflowResult({
      workflow,
      clarificationSummary,
    })
    const clarificationItems = collectClarificationItems(clarificationSummary)
    const agentBrief = buildSolutionReviewAgentBrief(workflowResult, clarificationItems)
    const assistantWorkerResult = await executeSolutionReviewAssistantWorker(
      {
        ...workflow.sliceInput,
        validationIssues: workflow.issues,
        reviewSummary: workflow.reviewSummary,
        context: {
          agentBrief,
        },
        workerMessages: coordinatorResult.aggregatedOutput,
      },
      args.runtime,
    )
    const assistantResult = buildAssistantExecutionResult({
      brief: agentBrief,
      workerResult: assistantWorkerResult,
    })
    const agentResponse = buildAgentResponse({
      brief: agentBrief,
      finalResponse: assistantResult.finalResponse,
      checklist: assistantResult.nextActions,
    })

    const warnings = uniqueStrings([
      ...(clarificationResult.warnings ?? []),
      ...(evidenceResult.warnings ?? []),
      ...(assistantResult.warnings ?? []),
    ])

    return {
      ...workflowResult,
      inputState: preparedInput.inputState,
      candidateFacts: preparedInput.candidateFacts,
      confirmationSummary: preparedInput.confirmationSummary,
      confirmationPackets: workflow.reviewSummary.confirmationPackets,
      clarificationSummary,
      agentBrief,
      agentResponse,
      workersInvoked: [...coordinatorResult.workersInvoked, "solution-review-assistant"],
      executionOrder: [...coordinatorResult.executionOrder, "solution-review-assistant"],
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
      inputState: deriveFailedInputState(args.input),
      candidateFacts: [],
      confirmationSummary: {
        requestedEntityRefs: [],
        confirmedEntityRefs: [],
        pendingEntityRefs: [],
        missingEntityRefs: [],
      },
      confirmationPackets: [],
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
