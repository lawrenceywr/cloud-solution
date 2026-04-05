import type { CloudSolutionConfig } from "../config"
import type { ArtifactBundleExport, DesignGapSummary, ValidationSummary } from "../domain"
import {
  runSolutionReviewWorkflow,
  type SolutionReviewWorkflowState,
} from "./solution-review-workflow"

export type BackgroundSolutionReviewWorkflowState =
  | "queued"
  | "running"
  | SolutionReviewWorkflowState
  | "failed"

export type BackgroundSolutionReviewNextAction =
  | "resolve_blockers"
  | "review_assumptions"
  | "export_bundle"
  | "inspect_failure"

export type BackgroundSolutionReviewWorkflowResult = {
  workflowID: string
  orchestrationState: BackgroundSolutionReviewWorkflowState
  workflowState?: SolutionReviewWorkflowState
  nextAction: BackgroundSolutionReviewNextAction
  transitions: BackgroundSolutionReviewWorkflowState[]
  validationSummary?: ValidationSummary
  reviewSummary?: DesignGapSummary
  bundle?: ArtifactBundleExport
  error?: string
}

export function runBackgroundSolutionReviewWorkflow(args: {
  input: unknown
  pluginConfig: CloudSolutionConfig
}): BackgroundSolutionReviewWorkflowResult {
  const { input, pluginConfig } = args
  const transitions: BackgroundSolutionReviewWorkflowState[] = ["queued", "running"]

  try {
    const workflow = runSolutionReviewWorkflow({
      input,
      mode: "export",
      pluginConfig,
      includeBundleWhenNotExportReady: false,
    })
    transitions.push(workflow.workflowState)

    return {
      workflowID: `solution-review-workflow:${workflow.sliceInput.requirement.id}`,
      orchestrationState: workflow.workflowState,
      workflowState: workflow.workflowState,
      nextAction:
        workflow.workflowState === "blocked"
          ? "resolve_blockers"
          : workflow.workflowState === "review_required"
            ? "review_assumptions"
            : "export_bundle",
      transitions,
      validationSummary: workflow.validationSummary,
      reviewSummary: workflow.reviewSummary,
      bundle: workflow.bundle,
    }
  } catch (error) {
    transitions.push("failed")

    return {
      workflowID: "solution-review-workflow:failed",
      orchestrationState: "failed",
      nextAction: "inspect_failure",
      transitions,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
