import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../scenarios/fixtures"
import { loadPluginConfig } from "../plugin-config"
import { createFakeCoordinatorClient } from "../test-helpers/fake-coordinator-client"
import { runSolutionReviewAgentHandoff } from "./solution-review-agent-handoff"

describe("runSolutionReviewAgentHandoff", () => {
  test("returns a converged orchestrator result after clarification and review child sessions", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: [],
            clarificationQuestions: [],
            suggestions: [],
          },
          recommendations: ["输入完整，无需澄清"],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "The workflow is export-ready; use the bundled artifacts as the final reviewed output.",
            nextActions: ["export_bundle", "artifact-bundle-index.md"],
          },
          recommendations: ["export_bundle", "artifact-bundle-index.md"],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
      runtime: {
        client,
        parentSessionID: "handoff-parent-session",
        agent: "cloud-solution-test",
        directory: process.cwd(),
        worktree: process.cwd(),
        abort: new AbortController().signal,
      },
    })

    expect(createCalls).toHaveLength(2)
    expect(promptCalls).toHaveLength(2)
    expect(result.orchestrationState).toBe("export_ready")
    expect(result.workflowState).toBe("export_ready")
    expect(result.transitions).toEqual(["queued", "running", "export_ready"])
    expect(result.nextAction).toBe("export_bundle")
    expect(result.bundle?.exportReady).toBe(true)
    expect(result.clarificationSummary).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      blockingQuestions: [],
      nonBlockingQuestions: [],
      suggestions: [],
    })
    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toEqual(["export_bundle", "artifact-bundle-index.md"])
    expect(result).not.toHaveProperty("warnings")
  })

  test("returns blocked when clarification identifies blocking items", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: ["links"],
            clarificationQuestions: [
              {
                field: "links",
                question: "设备要求双归属但链路不足",
                severity: "blocking",
              },
            ],
            suggestions: [],
          },
          recommendations: ["请补充以下信息后再继续方案评审"],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "Blocking validation issues must be resolved before review or export can continue.",
            nextActions: ["links: 设备要求双归属但链路不足"],
          },
          recommendations: ["links: 设备要求双归属但链路不足"],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: {
        ...baseInput,
        devices: baseInput.devices.map((device) =>
          device.id === "device-server-a"
            ? {
                ...device,
                redundancyIntent: "dual-homed-required" as const,
              }
            : device,
        ),
      },
      pluginConfig,
      runtime: {
        client,
        parentSessionID: "handoff-parent-session",
        agent: "cloud-solution-test",
        directory: process.cwd(),
        worktree: process.cwd(),
        abort: new AbortController().signal,
      },
    })

    expect(result.orchestrationState).toBe("blocked")
    expect(result.workflowState).toBe("blocked")
    expect(result.nextAction).toBe("resolve_blockers")
    expect(result.bundle).toBeUndefined()
    expect(result.clarificationSummary.blockingQuestions).toEqual([
      {
        field: "links",
        question: "设备要求双归属但链路不足",
        severity: "blocking",
      },
    ])
    expect(result.finalResponse).toContain("Blocking")
    expect(result.nextActions).toContain("links: 设备要求双归属但链路不足")
  })

  test("returns review_required when clarification items are non-blocking", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: ["links"],
            clarificationQuestions: [
              {
                field: "links",
                question: "设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
                severity: "warning",
                suggestion: "确认是否接受当前冗余不足，或补充第二条独立链路",
              },
            ],
            suggestions: ["确认是否接受当前冗余不足，或补充第二条独立链路"],
          },
          recommendations: ["请补充以下信息后再继续方案评审"],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "Review the listed assumptions and unresolved items before approving export.",
            nextActions: [
              "links: 设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
            ],
          },
          recommendations: [
            "links: 设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
          ],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: {
        ...baseInput,
        devices: baseInput.devices.map((device) =>
          device.id === "device-server-a"
            ? {
                ...device,
                redundancyIntent: "dual-homed-preferred" as const,
              }
            : device,
        ),
      },
      pluginConfig,
      runtime: {
        client,
        parentSessionID: "handoff-parent-session",
        agent: "cloud-solution-test",
        directory: process.cwd(),
        worktree: process.cwd(),
        abort: new AbortController().signal,
      },
    })

    expect(result.orchestrationState).toBe("review_required")
    expect(result.workflowState).toBe("review_required")
    expect(result.nextAction).toBe("review_assumptions")
    expect(result.bundle).toBeUndefined()
    expect(result.clarificationSummary.blockingQuestions).toEqual([])
    expect(result.clarificationSummary.nonBlockingQuestions).toEqual([
      {
        field: "links",
        question: "设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
        severity: "warning",
        suggestion: "确认是否接受当前冗余不足，或补充第二条独立链路",
      },
    ])
    expect(result.finalResponse).toContain("Review")
    expect(result.nextActions).toContain(
      "links: 设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
    )
  })

  test("preserves export-ready public behavior when clarification child output envelope is valid but typed output is invalid", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: [],
          },
          recommendations: ["输入完整，无需澄清"],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "The workflow is export-ready; use the bundled artifacts as the final reviewed output.",
            nextActions: ["export_bundle", "artifact-bundle-index.md"],
          },
          recommendations: ["export_bundle", "artifact-bundle-index.md"],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
      runtime: {
        client,
        parentSessionID: "handoff-parent-session",
        agent: "cloud-solution-test",
        directory: process.cwd(),
        worktree: process.cwd(),
        abort: new AbortController().signal,
      },
    })

    expect(result.orchestrationState).toBe("export_ready")
    expect(result.workflowState).toBe("export_ready")
    expect(result.nextAction).toBe("export_bundle")
    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toEqual(["export_bundle", "artifact-bundle-index.md"])
    expect(result.warnings).toEqual([
      "Requirements clarification child session returned invalid output; used deterministic clarification summary instead.",
    ])
  })
})
