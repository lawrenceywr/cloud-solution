import type { BackgroundSolutionReviewWorkflowResult } from "../features/background-solution-review-workflow"

export type SolutionReviewAgentBrief = {
  agentID: "solution_review_assistant"
  orchestrationState: BackgroundSolutionReviewWorkflowResult["orchestrationState"]
  workflowState?: BackgroundSolutionReviewWorkflowResult["workflowState"]
  goal: string
  nextAction: BackgroundSolutionReviewWorkflowResult["nextAction"]
  summary: string
  blockedItems: string[]
  reviewItems: string[]
  exportArtifactNames: string[]
  guardrails: string[]
}

type SolutionReviewAgentBriefOverrides = {
  blockedItems?: string[]
  reviewItems?: string[]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export function buildSolutionReviewAgentBrief(
  workflow: BackgroundSolutionReviewWorkflowResult,
  overrides?: SolutionReviewAgentBriefOverrides,
): SolutionReviewAgentBrief {
  const blockedItems = uniqueStrings([
    ...(workflow.validationSummary
      ? workflow.validationSummary.issues
        .filter((issue) => issue.severity === "blocking")
        .map((issue) => `${issue.code}: ${issue.message}`)
      : []),
    ...(overrides?.blockedItems ?? []),
  ])
  const reviewItems = uniqueStrings([
    ...(workflow.reviewSummary
      ? [
          ...workflow.reviewSummary.assumptions.map((item) => `${item.title}: ${item.detail}`),
          ...workflow.reviewSummary.gaps.map((item) => `${item.title}: ${item.detail}`),
          ...workflow.reviewSummary.unresolvedItems.map((item) => `${item.title}: ${item.detail}`),
        ]
      : []),
    ...(overrides?.reviewItems ?? []),
  ])
  const exportArtifactNames = workflow.bundle?.includedArtifactNames ?? []

  switch (workflow.orchestrationState) {
    case "blocked":
      return {
        agentID: "solution_review_assistant",
        orchestrationState: workflow.orchestrationState,
        workflowState: workflow.workflowState,
        goal: "Resolve blocking validation issues before any review or export.",
        nextAction: workflow.nextAction,
        summary: `Workflow ${workflow.workflowID} is blocked and requires remediation before review or export.`,
        blockedItems,
        reviewItems,
        exportArtifactNames,
        guardrails: [
          "Do not invent missing facts to clear blockers.",
          "Use the validation and review summaries as the only source of truth.",
          "Do not claim export readiness until blockers are resolved.",
        ],
      }
    case "review_required":
      return {
        agentID: "solution_review_assistant",
        orchestrationState: workflow.orchestrationState,
        workflowState: workflow.workflowState,
        goal: "Review assumptions and unresolved items before export.",
        nextAction: workflow.nextAction,
        summary: `Workflow ${workflow.workflowID} needs human review before export.`,
        blockedItems,
        reviewItems,
        exportArtifactNames,
        guardrails: [
          "Do not treat inferred or unresolved facts as confirmed.",
          "Focus on the listed assumptions, gaps, and unresolved items only.",
          "Do not produce or promise an export bundle in this state.",
        ],
      }
    case "export_ready":
      return {
        agentID: "solution_review_assistant",
        orchestrationState: workflow.orchestrationState,
        workflowState: workflow.workflowState,
        goal: "Explain or deliver the export-ready bundle without changing validated facts.",
        nextAction: workflow.nextAction,
        summary: `Workflow ${workflow.workflowID} is export-ready.`,
        blockedItems,
        reviewItems,
        exportArtifactNames,
        guardrails: [
          "Use the included bundle artifacts and review summary only.",
          "Do not add new rows, links, or allocations that are not already present.",
          "Do not downgrade the validated trust boundary while explaining the result.",
        ],
      }
    case "failed":
      return {
        agentID: "solution_review_assistant",
        orchestrationState: workflow.orchestrationState,
        workflowState: workflow.workflowState,
        goal: "Inspect workflow failure details before retrying.",
        nextAction: workflow.nextAction,
        summary: workflow.error
          ? `Workflow failed: ${workflow.error}`
          : "Workflow failed before a validated result was produced.",
        blockedItems: workflow.error ? [workflow.error] : blockedItems,
        reviewItems,
        exportArtifactNames,
        guardrails: [
          "Do not assume a workflow result exists when orchestration failed.",
          "Inspect the failure details before retrying or escalating.",
          "Do not fabricate bundle or review outputs after failure.",
        ],
      }
    case "queued":
    case "running":
      return {
        agentID: "solution_review_assistant",
        orchestrationState: workflow.orchestrationState,
        workflowState: workflow.workflowState,
        goal: "Wait for the workflow to reach a terminal state.",
        nextAction: workflow.nextAction,
        summary: `Workflow ${workflow.workflowID} is still ${workflow.orchestrationState}.`,
        blockedItems,
        reviewItems,
        exportArtifactNames,
        guardrails: [
          "Do not act on partial workflow state.",
          "Wait for a terminal state before producing recommendations.",
          "Do not infer final readiness from queued or running transitions.",
        ],
      }
  }
}
