import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn05DocumentAssistedDraftFixture,
  createScn05PromotedDocumentAssistFixture,
} from "../scenarios/fixtures"
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
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [],
            reconciliationWarnings: [],
          },
          recommendations: ["未发现证据冲突，可以继续方案评审"],
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

    expect(createCalls).toHaveLength(3)
    expect(promptCalls).toHaveLength(3)
    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(result.inputState).toBe("confirmed_slice")
    expect(result.candidateFacts).toEqual([])
    expect(result.confirmationSummary).toEqual({
      requestedEntityRefs: [],
      confirmedEntityRefs: [],
      pendingEntityRefs: [],
      missingEntityRefs: [],
    })
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
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [],
            reconciliationWarnings: [],
          },
          recommendations: ["未发现证据冲突，可以继续方案评审"],
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
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
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
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [],
            reconciliationWarnings: [],
          },
          recommendations: ["未发现证据冲突，可以继续方案评审"],
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
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
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

  test("blocks workflow when evidence reconciliation returns a new blocking conflict", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
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
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [
              {
                id: "worker-only-conflict",
                conflictType: "duplicate_allocation_ip",
                severity: "blocking",
                message: "Evidence worker detected a duplicate IP conflict missed by deterministic reconciliation.",
                entityRefs: [
                  "allocation:allocation-server-a",
                  "allocation:allocation-server-b",
                ],
                sourceRefs: [
                  {
                    kind: "document",
                    ref: "worker-reconciliation.pdf",
                    note: "Worker-reported conflict source",
                  },
                ],
                suggestedResolution: "Review the conflicting allocation evidence before export.",
              },
            ],
            reconciliationWarnings: [],
          },
          recommendations: ["检测到以下证据冲突，请解决后再继续方案评审"],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse: "Workflow blocked due to worker-reported evidence conflicts.",
            nextActions: ["resolve_conflicts", "worker-only-conflict"],
          },
          recommendations: ["resolve_conflicts", "worker-only-conflict"],
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

    expect(result.orchestrationState).toBe("blocked")
    expect(result.workflowState).toBe("blocked")
    expect(result.reviewSummary).toBeDefined()
    if (!result.reviewSummary) {
      throw new Error("Expected reviewSummary to be defined for blocked workflow")
    }
    expect(result.reviewSummary.hasBlockingConflicts).toBe(true)
    expect(result.reviewSummary.conflicts.some((conflict) => conflict.id === "worker-only-conflict")).toBe(true)
    expect(result.agentBrief.orchestrationState).toBe("blocked")
    expect(result.agentResponse.nextAction).toBe("resolve_blockers")
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
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [],
            reconciliationWarnings: [],
          },
          recommendations: ["未发现证据冲突，可以继续方案评审"],
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
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
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

  test("surfaces candidate-fact draft metadata for SCN-05 document-assisted review input", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: ["documentAssist.candidateFacts"],
            clarificationQuestions: [
              {
                field: "documentAssist.candidateFacts",
                question: "文档提取候选事实尚未确认，请确认需要保留的候选实体后再继续导出。",
                severity: "warning",
                suggestion:
                  "在 draft_topology_model 中通过 confirmation.entityRefs 显式确认候选实体后重新运行 review workflow。",
              },
            ],
            suggestions: [
              "在 draft_topology_model 中通过 confirmation.entityRefs 显式确认候选实体后重新运行 review workflow。",
            ],
          },
          recommendations: [
            "在 draft_topology_model 中通过 confirmation.entityRefs 显式确认候选实体后重新运行 review workflow。",
          ],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse:
              "Draft candidate facts still require confirmation before export can continue.",
            nextActions: [
              "segment:segment-document-public-service",
              "allocation:allocation-document-public-service-10-50-0-10",
            ],
          },
          recommendations: [
            "segment:segment-document-public-service",
            "allocation:allocation-document-public-service-10-50-0-10",
          ],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: createScn05DocumentAssistedDraftFixture(),
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

    expect(result.inputState).toBe("candidate_fact_draft")
    expect(result.candidateFacts).toEqual([
      expect.objectContaining({
        entityRef: "allocation:allocation-document-public-service-10-50-0-10",
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        entityRef: "segment:segment-document-public-service",
        requiresConfirmation: true,
      }),
    ])
    expect(result.confirmationSummary.pendingEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
    expect(result.orchestrationState).toBe("blocked")
    expect(result.clarificationSummary.nonBlockingQuestions).toContainEqual(
      expect.objectContaining({
        field: "documentAssist.candidateFacts",
      }),
    )
  })

  test("treats fully confirmed SCN-05 document-assisted input as a confirmed slice", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
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
      input: createScn05PromotedDocumentAssistFixture(),
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

    expect(result.inputState).toBe("confirmed_slice")
    expect(result.confirmationSummary.confirmedEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
    expect(result.confirmationSummary.pendingEntityRefs).toEqual([])
    expect(result.orchestrationState).toBe("export_ready")
    expect(result.clarificationSummary).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      blockingQuestions: [],
      nonBlockingQuestions: [],
      suggestions: [],
    })
  })

  test("preserves pending confirmation items through the orchestrated review path", async () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const link = baseInput.links[0]!
    const endpointAPort = baseInput.ports.find((port) => port.id === link.endpointA.portId)!
    const endpointBPort = baseInput.ports.find((port) => port.id === link.endpointB.portId)!
    const endpointADevice = baseInput.devices.find((device) => device.id === endpointAPort.deviceId)!
    const endpointBDevice = baseInput.devices.find((device) => device.id === endpointBPort.deviceId)!
    const { client } = createFakeCoordinatorClient({
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
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [],
            reconciliationWarnings: [],
          },
          recommendations: ["未发现证据冲突，可以继续方案评审"],
        }),
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse: "Pending template plane-type conflicts still require review before export.",
            nextActions: ["review_pending_confirmation_items"],
          },
          recommendations: ["review_pending_confirmation_items"],
        }),
      ],
    })

    const result = await runSolutionReviewAgentHandoff({
      input: {
        ...baseInput,
        pendingConfirmationItems: [
          {
            id: `template-plane-type-conflict|${endpointADevice.name}:${endpointAPort.name}|${endpointBDevice.name}:${endpointBPort.name}`,
            kind: "template-plane-type-conflict",
            title: "template plane type conflict requires confirmation",
            detail: `Workbook-derived link ${endpointADevice.name}:${endpointAPort.name} ↔ ${endpointBDevice.name}:${endpointBPort.name} resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.`,
            severity: "warning",
            confidenceState: "unresolved",
            subjectType: "link",
            subjectId: link.id,
            entityRefs: [`link:${link.id}`, `port:${endpointAPort.id}`, `port:${endpointBPort.id}`],
            endpointA: { deviceName: endpointADevice.name, portName: endpointAPort.name },
            endpointB: { deviceName: endpointBDevice.name, portName: endpointBPort.name },
            sourceRefs: [{ kind: "user-input" as const, ref: "structured-input" }],
          },
        ],
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
    expect(result.reviewSummary?.unresolvedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "template plane type conflict requires confirmation",
          confidenceState: "unresolved",
        }),
      ]),
    )
    expect(result.reviewSummary?.confirmationPackets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `template-plane-type-conflict|${endpointADevice.name}:${endpointAPort.name}|${endpointBDevice.name}:${endpointBPort.name}`,
          requiredDecision: `Operator must choose the authoritative plane/link type for ${endpointADevice.name}:${endpointAPort.name} ↔ ${endpointBDevice.name}:${endpointBPort.name}: storage or business, then update the source/structured input accordingly.`,
          sourceRefs: [{ kind: "user-input", ref: "structured-input" }],
        }),
      ]),
    )
    expect(result.confirmationSummary.pendingConfirmationItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "template plane type conflict requires confirmation",
        }),
      ]),
    )
    expect(result.confirmationPackets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `template-plane-type-conflict|${endpointADevice.name}:${endpointAPort.name}|${endpointBDevice.name}:${endpointBPort.name}`,
          sourceRefs: [{ kind: "user-input", ref: "structured-input" }],
        }),
      ]),
    )
    expect(result.agentBrief.confirmationPackets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `template-plane-type-conflict|${endpointADevice.name}:${endpointAPort.name}|${endpointBDevice.name}:${endpointBPort.name}`,
          sourceRefs: [],
        }),
      ]),
    )
  })
})
