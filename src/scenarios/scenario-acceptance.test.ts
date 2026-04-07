import { describe, expect, test } from "bun:test"

import { createCloudSolutionRuntime } from "../index"
import {
  createScn01SingleRackConnectivityFixture,
  createScn02DualTorFixture,
  createScn03MultiRackPodFixture,
  createScn04CloudNetworkAllocationFixture,
  createScn05DocumentAssistedDraftFixture,
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
  createScn05PromotedDocumentAssistFixture,
} from "./fixtures"
import { createFakeCoordinatorClient } from "../test-helpers/fake-coordinator-client"

async function invokeTool(args: {
  toolName: string
  fixture: Record<string, unknown>
}) {
  const runtime = createCloudSolutionRuntime(process.cwd())
  const result = await runtime.kernel.invokeTool({
    toolName: args.toolName,
    sessionID: `scenario-${args.toolName}`,
    args: args.fixture,
  })

  return JSON.parse(result)
}

async function invokeReviewWorkflow(args: {
  fixture: Record<string, unknown>
  promptTexts: string[]
}) {
  const { client } = createFakeCoordinatorClient({
    promptTexts: args.promptTexts,
  })
  const runtime = createCloudSolutionRuntime(process.cwd(), {
    worktree: process.cwd(),
    client,
  })
  const result = await runtime.kernel.invokeTool({
    toolName: "start_solution_review_workflow",
    sessionID: "scenario-start-solution-review-workflow",
    args: args.fixture,
  })

  return JSON.parse(result)
}

async function invokeToolWithClient(args: {
  toolName: string
  fixture: Record<string, unknown>
  promptTexts: string[]
}) {
  const { client } = createFakeCoordinatorClient({
    promptTexts: args.promptTexts,
  })
  const runtime = createCloudSolutionRuntime(process.cwd(), {
    worktree: process.cwd(),
    client,
  })
  const result = await runtime.kernel.invokeTool({
    toolName: args.toolName,
    sessionID: `scenario-${args.toolName}-with-client`,
    args: args.fixture,
  })

  return JSON.parse(result)
}

describe("scenario acceptance", () => {
  test("SCN-01 passes end to end across all four core artifacts", async () => {
    const fixture = createScn01SingleRackConnectivityFixture()

    const validation = await invokeTool({
      toolName: "validate_solution_model",
      fixture,
    })
    const cabling = await invokeTool({
      toolName: "generate_device_cabling_table",
      fixture,
    })
    const portPlan = await invokeTool({
      toolName: "generate_device_port_plan",
      fixture,
    })
    const portConnection = await invokeTool({
      toolName: "generate_port_connection_table",
      fixture,
    })
    const ipAllocation = await invokeTool({
      toolName: "generate_ip_allocation_table",
      fixture,
    })

    expect(validation.valid).toBe(true)
    expect(validation.issues).toEqual([])
    expect(cabling.artifact.content).toContain("Status: ready")
    expect(cabling.artifact.content).toContain("device-server-a")
    expect(portPlan.artifact.content).toContain("device-server-b")
    expect(portConnection.artifact.content).toContain("link-server-a")
    expect(ipAllocation.artifact.content).toContain("10.10.0.11")
  })

  test("SCN-02 preserves redundant dual-homing metadata in physical outputs", async () => {
    const fixture = createScn02DualTorFixture()

    const validation = await invokeTool({
      toolName: "validate_solution_model",
      fixture,
    })
    const cabling = await invokeTool({
      toolName: "generate_device_cabling_table",
      fixture,
    })
    const portPlan = await invokeTool({
      toolName: "generate_device_port_plan",
      fixture,
    })
    const ipAllocation = await invokeTool({
      toolName: "generate_ip_allocation_table",
      fixture,
    })

    expect(validation.valid).toBe(true)
    expect(validation.issues).toEqual([])
    expect(cabling.artifact.content).toContain("link-storage-a-primary")
    expect(cabling.artifact.content).toContain("link-compute-a-primary")
    expect(cabling.artifact.content).toContain("storage-a-dual-home")
    expect(cabling.artifact.content).toContain("compute-a-dual-home")
    expect(cabling.artifact.content).toContain("tor-a")
    expect(cabling.artifact.content).toContain("tor-b")
    expect(portPlan.artifact.content).toContain("storage-a-dual-home")
    expect(portPlan.artifact.content).toContain("compute-a-dual-home")
    expect(portPlan.artifact.content).toContain("compute-a")
    expect(ipAllocation.artifact.content).toContain("172.16.0.10")
    expect(ipAllocation.artifact.content).toContain("172.16.0.11")
    expect(ipAllocation.artifact.content).toContain("10.20.0.11")
  })

  test("SCN-03 produces rack-aware multi-rack connectivity outputs", async () => {
    const fixture = createScn03MultiRackPodFixture()

    const validation = await invokeTool({
      toolName: "validate_solution_model",
      fixture,
    })
    const cabling = await invokeTool({
      toolName: "generate_device_cabling_table",
      fixture,
    })
    const portConnection = await invokeTool({
      toolName: "generate_port_connection_table",
      fixture,
    })
    const ipAllocation = await invokeTool({
      toolName: "generate_ip_allocation_table",
      fixture,
    })

    expect(validation.valid).toBe(true)
    expect(validation.issues).toEqual([])
    expect(cabling.artifact.content).toContain("rack-a (rack-a)")
    expect(cabling.artifact.content).toContain("rack-b (rack-b)")
    expect(cabling.artifact.content).toContain("compute-b")
    expect(portConnection.artifact.content).toContain("rack-a")
    expect(portConnection.artifact.content).toContain("rack-b")
    expect(portConnection.artifact.content).toContain("link-inter-rack")
    expect(portConnection.artifact.content.match(/link-inter-rack/g)?.length).toBe(1)
    expect(portConnection.artifact.content).toContain("leaf-a")
    expect(portConnection.artifact.content).toContain("leaf-b")
    expect(ipAllocation.artifact.content).toContain("10.31.0.11")
    expect(ipAllocation.artifact.content).toContain("10.30.0.11")
  })

  test("SCN-01 exports a deterministic artifact bundle", async () => {
    const fixture = createScn01SingleRackConnectivityFixture()

    const bundle = await invokeTool({
      toolName: "export_artifact_bundle",
      fixture,
    })

    expect(bundle.exportReady).toBe(true)
    expect(bundle.workflowState).toBe("export_ready")
    expect(bundle.reviewRequired).toBe(false)
    expect(bundle.validationSummary.valid).toBe(true)
    expect(bundle.includedArtifactNames).toEqual([
      "artifact-bundle-index.md",
      "design-assumptions-and-gaps.md",
      "device-cabling-table.md",
      "device-port-plan.md",
      "port-connection-table.md",
      "ip-allocation-table.md",
    ])
    expect(bundle.bundleIndex.content).toContain("Included File Count: 6")
  })

  test("SCN-04 passes end to end through cloud IP validation and artifact generation", async () => {
    const fixture = createScn04CloudNetworkAllocationFixture()

    const validation = await invokeTool({
      toolName: "validate_solution_model",
      fixture,
    })
    const ipAllocation = await invokeTool({
      toolName: "generate_ip_allocation_table",
      fixture,
    })
    const bundle = await invokeTool({
      toolName: "export_artifact_bundle",
      fixture,
    })

    expect(validation.valid).toBe(true)
    expect(validation.issues).toEqual([])
    expect(ipAllocation.artifact.content).toContain("Status: ready")
    expect(ipAllocation.artifact.content).toContain("public-service")
    expect(ipAllocation.artifact.content).toContain("internal-service")
    expect(ipAllocation.artifact.content).toContain("10.40.0.10")
    expect(ipAllocation.artifact.content).toContain("10.41.0.20")
    expect(bundle.exportReady).toBe(true)
    expect(bundle.workflowState).toBe("export_ready")
    expect(bundle.includedArtifactNames).toEqual([
      "artifact-bundle-index.md",
      "design-assumptions-and-gaps.md",
      "ip-allocation-table.md",
    ])
  })

  test("SCN-05 document-assisted drafts stay non-exportable until explicitly confirmed", async () => {
    const draft = await invokeTool({
      toolName: "draft_topology_model",
      fixture: createScn05DocumentAssistedDraftFixture(),
    })
    const review = await invokeReviewWorkflow({
      fixture: createScn05DocumentAssistedDraftFixture(),
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

    expect(draft.inputState).toBe("candidate_fact_draft")
    expect(draft.validationSummary.valid).toBe(false)
    expect(draft.validationSummary.issues.map((issue: { code: string }) => issue.code)).toContain(
      "network_fact_not_confirmed",
    )
    expect(review.inputState).toBe("candidate_fact_draft")
    expect(review.orchestrationState).toBe("blocked")
    expect(review.confirmationSummary.pendingEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
  })

  test("SCN-05 extraction helper produces a draft input that feeds directly into draft_topology_model", async () => {
    const extraction = await invokeToolWithClient({
      toolName: "extract_document_candidate_facts",
      fixture: createScn05DocumentExtractionInputFixture(),
      promptTexts: [
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture(),
            extractionWarnings: ["Diagram did not expose any rack details."],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })
    const draft = await invokeTool({
      toolName: "draft_topology_model",
      fixture: extraction.draftInput,
    })
    const review = await invokeReviewWorkflow({
      fixture: extraction.draftInput,
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

    expect(extraction.nextAction).toBe("draft_topology_model")
    expect(extraction.draftInput.documentAssist.candidateFacts).toEqual(
      createScn05ExtractedCandidateFactsFixture(),
    )
    expect(extraction.extractionWarnings).toEqual(["Diagram did not expose any rack details."])
    expect(draft.inputState).toBe("candidate_fact_draft")
    expect(draft.validationSummary.valid).toBe(false)
    expect(draft.validationSummary.issues.map((issue: { code: string }) => issue.code)).toContain(
      "network_fact_not_confirmed",
    )
    expect(review.inputState).toBe("candidate_fact_draft")
    expect(review.orchestrationState).toBe("blocked")
  })

  test("SCN-05 reaches export-ready only after explicit confirmation", async () => {
    const promotedDraft = await invokeTool({
      toolName: "draft_topology_model",
      fixture: createScn05PromotedDocumentAssistFixture(),
    })
    const review = await invokeReviewWorkflow({
      fixture: createScn05PromotedDocumentAssistFixture(),
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

    expect(promotedDraft.inputState).toBe("confirmed_slice")
    expect(promotedDraft.validationSummary.valid).toBe(true)
    expect(promotedDraft.confirmationSummary.pendingEntityRefs).toEqual([])
    expect(review.inputState).toBe("confirmed_slice")
    expect(review.orchestrationState).toBe("export_ready")
    expect(review.confirmationSummary.confirmedEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
  })
})
