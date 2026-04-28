import { describe, expect, test } from "bun:test"

import { loadPluginConfig } from "./plugin-config"
import { createHooks } from "./create-hooks"
import {
  createScn01SingleRackConnectivityFixture,
  createScn07GuardedExportFixture,
} from "./scenarios/fixtures"

function createWarningOnlyReviewFixture() {
  const baseFixture = createScn01SingleRackConnectivityFixture()

  return {
    ...baseFixture,
    devices: baseFixture.devices.map((device) =>
      device.id === "device-server-a"
        ? {
            ...device,
            redundancyIntent: "dual-homed-preferred" as const,
          }
        : device,
    ),
  }
}

function createPendingConfirmationItem() {
  return {
    id: "template-plane-type-conflict|switch-a:eth0|server-a:eth1",
    kind: "template-plane-type-conflict" as const,
    severity: "warning" as const,
    title: "template plane type conflict requires confirmation",
    detail:
      "Workbook-derived link switch-a:eth0 ↔ server-a:eth1 resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.",
    subjectType: "link" as const,
    confidenceState: "unresolved" as const,
    entityRefs: [],
    sourceRefs: [{ kind: "user-input" as const, ref: "structured-input" }],
  }
}

describe("createHooks", () => {
  test("blocks execution when sessionID is missing", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.executionReadinessGuard?.["tool.execute.before"]?.(
        {
          tool: "describe_cloud_solution",
          sessionID: "",
          callID: "missing-session",
        },
        { args: {} },
      ),
    ).rejects.toThrow("sessionID")
  })

  test("allows execution when context is complete", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.executionReadinessGuard?.["tool.execute.before"]?.(
        {
          tool: "describe_cloud_solution",
          sessionID: "hook-session",
          callID: "valid-call",
        },
        { args: {} },
      ),
    ).resolves.toBeUndefined()
  })

  test("blocks slice tools when requirement input is missing", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.missingRequiredInputGuard?.["tool.execute.before"]?.(
        {
          tool: "export_artifact_bundle",
          sessionID: "hook-session",
          callID: "missing-requirement",
        },
        { args: { allocations: [] } },
      ),
    ).rejects.toThrow("requirement object")
  })

  test("blocks slice tools when documentAssist is present but empty", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.missingRequiredInputGuard?.["tool.execute.before"]?.(
        {
          tool: "validate_solution_model",
          sessionID: "hook-session",
          callID: "empty-document-assist",
        },
        {
          args: {
            requirement: createScn07GuardedExportFixture().requirement,
            documentAssist: {},
          },
        },
      ),
    ).rejects.toThrow("at least one planning input section")
  })

  test("blocks artifact generation when blocking validation issues remain", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.artifactGenerationPrecheck?.["tool.execute.before"]?.(
        {
          tool: "export_artifact_bundle",
          sessionID: "hook-session",
          callID: "blocking-export",
        },
        {
          args: {
            ...createScn07GuardedExportFixture(),
            allocations: [],
          },
        },
      ),
    ).rejects.toThrow("blocked by validation issues")
  })

  test("blocks direct physical artifact generation when pending confirmation items remain", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.artifactGenerationPrecheck?.["tool.execute.before"]?.(
        {
          tool: "generate_device_cabling_table",
          sessionID: "hook-session",
          callID: "pending-confirmation-physical",
        },
        {
          args: {
            ...createScn01SingleRackConnectivityFixture(),
            pendingConfirmationItems: [createPendingConfirmationItem()],
          },
        },
      ),
    ).rejects.toThrow("Artifact generation requires review before export")
  })

  test("blocks export when inferred or unresolved facts remain", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.lowConfidenceExportGuard?.["tool.execute.before"]?.(
        {
          tool: "export_artifact_bundle",
          sessionID: "hook-session",
          callID: "low-confidence-export",
        },
        { args: createScn07GuardedExportFixture() },
      ),
    ).rejects.toThrow("requires confirmation")
  })

  test("reminds review before export when warning-only issues remain", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.assumptionReviewReminder?.["tool.execute.before"]?.(
        {
          tool: "export_artifact_bundle",
          sessionID: "hook-session",
          callID: "review-reminder",
        },
        { args: createWarningOnlyReviewFixture() },
      ),
    ).rejects.toThrow("requires review before export")
  })

  test("respects disabled hook configuration", () => {
    const hooks = createHooks({
      pluginConfig: {
        ...loadPluginConfig(process.cwd()),
        disabled_hooks: ["low-confidence-export-guard"],
      },
    })

    expect(hooks.lowConfidenceExportGuard).toBeNull()
  })
})
