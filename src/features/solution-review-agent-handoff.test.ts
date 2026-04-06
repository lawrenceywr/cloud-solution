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
    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
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
    expect(result.agentBrief.agentID).toBe("solution_review_assistant")
    expect(result.agentBrief.orchestrationState).toBe("export_ready")
    expect(result.agentResponse.agentID).toBe("solution_review_assistant")
    expect(result.agentResponse.orchestrationState).toBe("export_ready")
    expect(result.agentResponse.nextAction).toBe("export_bundle")
    expect(result.agentResponse.checklist).toEqual(["export_bundle", "artifact-bundle-index.md"])
    expect(result.finalResponse).toContain("export-ready")
    expect(result.finalResponse).toBe(result.agentResponse.response)
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
    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
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
    expect(result.agentBrief.orchestrationState).toBe("blocked")
    expect(result.agentResponse.orchestrationState).toBe("blocked")
    expect(result.agentResponse.nextAction).toBe("resolve_blockers")
    expect(result.finalResponse).toContain("Blocking")
    expect(result.finalResponse).toBe(result.agentResponse.response)
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
    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
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
    expect(result.agentBrief.orchestrationState).toBe("review_required")
    expect(result.agentResponse.orchestrationState).toBe("review_required")
    expect(result.agentResponse.nextAction).toBe("review_assumptions")
    expect(result.finalResponse).toContain("Review")
    expect(result.finalResponse).toBe(result.agentResponse.response)
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
    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(result.workflowState).toBe("export_ready")
    expect(result.nextAction).toBe("export_bundle")
    expect(result.agentBrief.orchestrationState).toBe("export_ready")
    expect(result.agentResponse.orchestrationState).toBe("export_ready")
    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toEqual(["export_bundle", "artifact-bundle-index.md"])
    expect(result.warnings).toEqual([
      "Requirements clarification child session returned invalid output; used deterministic clarification summary instead.",
      "Requirements clarification worker failed before assistant execution.",
    ])
  })

  test("returns the same public contract in the explicit failed workflow path", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "The workflow failed before producing a usable result; inspect the failure details before retrying.",
            nextActions: ["inspect_failure"],
          },
          recommendations: ["inspect_failure"],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: null,
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

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(result.workersInvoked).toEqual([])
    expect(result.executionOrder).toEqual([])
    expect(result.orchestrationState).toBe("failed")
    expect(result.workflowState).toBeUndefined()
    expect(result.transitions).toEqual(["queued", "running", "failed"])
    expect(result.nextAction).toBe("inspect_failure")
    expect(result.clarificationSummary).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      blockingQuestions: [],
      nonBlockingQuestions: [],
      suggestions: [],
    })
    expect(result.agentBrief.orchestrationState).toBe("failed")
    expect(result.agentResponse.orchestrationState).toBe("failed")
    expect(result.agentResponse.nextAction).toBe("inspect_failure")
    expect(result.finalResponse).toBe(
      "The workflow failed before producing a usable result; inspect the failure details before retrying.",
    )
    expect(result.finalResponse).toBe(result.agentResponse.response)
    expect(result.nextActions).toEqual(["inspect_failure"])
    expect(result.nextActions).toEqual(result.agentResponse.checklist)
  })
})
