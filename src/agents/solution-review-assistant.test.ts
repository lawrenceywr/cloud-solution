import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../scenarios/fixtures"
import { loadPluginConfig } from "../plugin-config"
import { runBackgroundSolutionReviewWorkflow } from "../features/background-solution-review-workflow"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { executeSolutionReviewAssistantWorker } from "../workers/solution-review-assistant/worker"
import { buildSolutionReviewAgentBrief } from "./solution-review-brief"
import {
  runSolutionReviewAssistant,
  runSolutionReviewAssistantInChildSession,
} from "./solution-review-assistant"

describe("runSolutionReviewAssistant", () => {
  test("returns export guidance for export_ready state", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const response = runSolutionReviewAssistant(buildSolutionReviewAgentBrief(workflow))

    expect(response.orchestrationState).toBe("export_ready")
    expect(response.nextAction).toBe("export_bundle")
    expect(response.checklist).toContain("artifact-bundle-index.md")
  })

  test("returns review guidance for review_required state", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const workflow = runBackgroundSolutionReviewWorkflow({
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
    })
    const response = runSolutionReviewAssistant(buildSolutionReviewAgentBrief(workflow))

    expect(response.orchestrationState).toBe("review_required")
    expect(response.nextAction).toBe("review_assumptions")
    expect(response.checklist.length).toBeGreaterThan(0)
  })

  test("returns blocker guidance for blocked state", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: {
        ...baseInput,
        allocations: [],
      },
      pluginConfig,
    })
    const response = runSolutionReviewAssistant(buildSolutionReviewAgentBrief(workflow))

    expect(response.orchestrationState).toBe("blocked")
    expect(response.nextAction).toBe("resolve_blockers")
    expect(response.checklist.some((item) => item.includes("ip_allocations_missing"))).toBe(true)
  })

  test("returns failure guidance for failed state", () => {
    const response = runSolutionReviewAssistant({
      agentID: "solution_review_assistant",
      orchestrationState: "failed",
      workflowState: undefined,
      goal: "Inspect failure details.",
      nextAction: "inspect_failure",
      summary: "Workflow failed.",
      blockedItems: ["boom"],
      reviewItems: [],
      confirmationPackets: [],
      exportArtifactNames: [],
      guardrails: [],
    })

    expect(response.orchestrationState).toBe("failed")
    expect(response.nextAction).toBe("inspect_failure")
    expect(response.checklist).toEqual(["boom"])
  })

  test("includes confirmation packet decisions in deterministic review fallback guidance", () => {
    const response = runSolutionReviewAssistant({
      agentID: "solution_review_assistant",
      orchestrationState: "review_required",
      workflowState: "review_required",
      goal: "Review unresolved items.",
      nextAction: "review_assumptions",
      summary: "Workflow needs review.",
      blockedItems: [],
      reviewItems: [],
      confirmationPackets: [
        {
          id: "template-plane-type-conflict|server-a:eth0|switch-a:1/1",
          kind: "template-plane-type-conflict",
          severity: "warning",
          title: "template plane type conflict requires confirmation",
          requiredDecision: "Confirm the intended plane/link type for server-a:eth0 ↔ switch-a:1/1, then update the source/structured input accordingly.",
          currentAmbiguity: "Workbook-derived link ambiguity remains unresolved.",
          subjectType: "link",
          subjectId: "link-a",
          entityRefs: ["link:link-a"],
          sourceRefs: [],
          endpoints: {
            endpointA: { deviceName: "server-a", portName: "eth0" },
            endpointB: { deviceName: "switch-a", portName: "1/1" },
          },
          suggestedAction: "Confirm with the operator and update the structured input.",
        },
      ],
      exportArtifactNames: [],
      guardrails: [],
    })

    expect(response.orchestrationState).toBe("review_required")
    expect(response.checklist).toContain(
      "Confirm the intended plane/link type for server-a:eth0 ↔ switch-a:1/1, then update the source/structured input accordingly.",
    )
    expect(response.checklist).toContain(
      "Confirm with the operator and update the structured input.",
    )
  })

  test("returns child-session assistant output when the internal review agent responds with valid worker JSON", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
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

    const result = await runSolutionReviewAssistantInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(result).toEqual({
      finalResponse:
        "The workflow is export-ready; use the bundled artifacts as the final reviewed output.",
      nextActions: ["export_bundle", "artifact-bundle-index.md"],
    })
  })

  test("falls back to deterministic assistant output when child-session JSON is invalid", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)
    const { client } = createFakeCoordinatorClient({
      promptTexts: ["not-json"],
    })

    const result = await runSolutionReviewAssistantInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toContain("artifact-bundle-index.md")
    expect(result.warnings).toEqual([
      "Worker solution-review-assistant returned invalid JSON result",
    ])
  })

  test("falls back deterministically when child-session output has a valid envelope but invalid typed assistant output", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "The workflow is export-ready; use the bundled artifacts as the final reviewed output.",
          },
          recommendations: ["export_bundle", "artifact-bundle-index.md"],
        }),
      ],
    })

    const result = await runSolutionReviewAssistantInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toContain("artifact-bundle-index.md")
    expect(result.warnings).toEqual([
      "Solution review assistant child session returned invalid output; used deterministic fallback instead.",
    ])
  })

  test("falls back deterministically when child-session output uses the wrong workerId", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "different-worker",
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

    const result = await runSolutionReviewAssistantInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toContain("artifact-bundle-index.md")
    expect(result.warnings).toEqual([
      "Worker solution-review-assistant returned unexpected workerId 'different-worker'",
    ])
  })

  test("keeps a failed generic child result as a fallback even when the typed assistant output looks valid", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "failed",
          output: {
            finalResponse:
              "The workflow is export-ready; use the bundled artifacts as the final reviewed output.",
            nextActions: ["export_bundle", "artifact-bundle-index.md"],
          },
          recommendations: ["export_bundle", "artifact-bundle-index.md"],
          errors: ["assistant child failed"],
        }),
      ],
    })

    const result = await runSolutionReviewAssistantInChildSession({
      brief,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.finalResponse).toContain("export-ready")
    expect(result.nextActions).toContain("artifact-bundle-index.md")
    expect(result.warnings).toEqual(["assistant child failed"])
  })

  test("worker accepts older brief payloads that omit confirmationPackets", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse: "Review the listed assumptions and unresolved items before approving export.",
            nextActions: ["inspect_review_summary"],
          },
          recommendations: ["inspect_review_summary"],
        }),
      ],
    })

    const result = await executeSolutionReviewAssistantWorker({
      requirement: {
        id: "req-worker-compat-1",
        projectName: "Worker Compatibility Example",
        scopeType: "data-center",
        artifactRequests: [],
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      devices: [],
      racks: [],
      ports: [],
      links: [],
      segments: [],
      allocations: [],
      validationIssues: [],
      reviewSummary: undefined,
      context: {
        agentBrief: {
          agentID: "solution_review_assistant",
          orchestrationState: "review_required",
          workflowState: "review_required",
          goal: "Review unresolved items.",
          nextAction: "review_assumptions",
          summary: "Workflow needs review.",
          blockedItems: [],
          reviewItems: ["inspect_review_summary"],
          exportArtifactNames: [],
          guardrails: [],
        },
      },
      workerMessages: {},
    }, createWorkerRuntimeContext(client))

    expect(result.status).toBe("success")
    expect(result.output).toEqual({
      finalResponse: "Review the listed assumptions and unresolved items before approving export.",
      nextActions: ["inspect_review_summary"],
    })
  })
})
