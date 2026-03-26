import type { CloudSolutionConfig } from "./config"
import { createExecutionReadinessGuardHook } from "./hooks/execution-readiness-guard"
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

  return {
    executionReadinessGuard,
    disposeHooks(): void {
    },
  }
}
