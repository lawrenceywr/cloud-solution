import type { CloudSolutionConfig } from "./config"
import { createArtifactGenerationPrecheckHook } from "./hooks/artifact-generation-precheck"
import { createAssumptionReviewReminderHook } from "./hooks/assumption-review-reminder"
import { createExecutionReadinessGuardHook } from "./hooks/execution-readiness-guard"
import { createLowConfidenceExportGuardHook } from "./hooks/low-confidence-export-guard"
import { createMissingRequiredInputGuardHook } from "./hooks/missing-required-input-guard"
import { safeCreateHook } from "./shared/safe-create-hook"

export type CreatedHooks = ReturnType<typeof createHooks>

export function createHooks(args: { pluginConfig: CloudSolutionConfig }) {
  const { pluginConfig } = args

  const disabledHooks = new Set(
    pluginConfig.disabled_hooks.map((name) => name.toLowerCase()),
  )

  const executionReadinessGuard = safeCreateHook(
    "execution-readiness-guard",
    () => createExecutionReadinessGuardHook(pluginConfig),
    { enabled: !disabledHooks.has("execution-readiness-guard") },
  )
  const missingRequiredInputGuard = safeCreateHook(
    "missing-required-input-guard",
    () => createMissingRequiredInputGuardHook(),
    { enabled: !disabledHooks.has("missing-required-input-guard") },
  )
  const artifactGenerationPrecheck = safeCreateHook(
    "artifact-generation-precheck",
    () => createArtifactGenerationPrecheckHook(pluginConfig),
    { enabled: !disabledHooks.has("artifact-generation-precheck") },
  )
  const lowConfidenceExportGuard = safeCreateHook(
    "low-confidence-export-guard",
    () => createLowConfidenceExportGuardHook(pluginConfig),
    { enabled: !disabledHooks.has("low-confidence-export-guard") },
  )
  const assumptionReviewReminder = safeCreateHook(
    "assumption-review-reminder",
    () => createAssumptionReviewReminderHook(pluginConfig),
    { enabled: !disabledHooks.has("assumption-review-reminder") },
  )

  return {
    executionReadinessGuard,
    missingRequiredInputGuard,
    artifactGenerationPrecheck,
    lowConfidenceExportGuard,
    assumptionReviewReminder,
    disposeHooks(): void {
    },
  }
}
