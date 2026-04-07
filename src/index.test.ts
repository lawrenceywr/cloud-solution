import { describe, expect, test } from "bun:test"

import { createCloudSolutionRuntime } from "./index"
import {
  createScn01SingleRackConnectivityFixture,
  createScn05DocumentAssistedDraftFixture,
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
  createScn05PromotedDocumentAssistFixture,
} from "./scenarios/fixtures"
import { createFakeCoordinatorClient } from "./test-helpers/fake-coordinator-client"

function createPhysicalRuntimeInput() {
  return {
    requirement: {
      id: "req-runtime-physical-1",
      projectName: "Runtime Physical Example",
      scopeType: "data-center" as const,
    },
    racks: [
      {
        id: "rack-a",
        name: "rack-a",
        uHeight: 42,
      },
    ],
    devices: [
      {
        id: "device-switch-a",
        name: "switch-a",
        role: "switch",
        rackId: "rack-a",
        rackPosition: 1,
        rackUnitHeight: 1,
      },
      {
        id: "device-server-a",
        name: "server-a",
        role: "server",
        rackId: "rack-a",
        rackPosition: 10,
        rackUnitHeight: 2,
      },
    ],
    ports: [
      {
        id: "port-switch-a-1",
        deviceId: "device-switch-a",
        name: "eth0",
        purpose: "uplink",
      },
      {
        id: "port-server-a-1",
        deviceId: "device-server-a",
        name: "eth1",
        purpose: "server-uplink",
      },
      {
        id: "port-server-a-2",
        deviceId: "device-server-a",
        name: "eth2",
      },
    ],
    links: [
      {
        id: "link-runtime-physical-a",
        endpointA: { portId: "port-switch-a-1" },
        endpointB: { portId: "port-server-a-1" },
        purpose: "runtime-uplink",
      },
    ],
  }
}

function createStructuredRuntimeInput() {
  return {
    requirement: {
      id: "req-runtime-structured-1",
      projectName: "Runtime Structured Example",
      scopeType: "data-center" as const,
      artifactRequests: ["device-cabling-table"],
    },
    structuredInput: {
      racks: [
        {
          name: "Rack A",
          uHeight: 42,
        },
      ],
      devices: [
        {
          name: "Switch A",
          role: "switch",
          rackName: "Rack A",
          rackPosition: 1,
          rackUnitHeight: 1,
          ports: [
            {
              name: "eth0",
            },
          ],
        },
        {
          name: "Server A",
          role: "server",
          rackName: "Rack A",
          rackPosition: 10,
          rackUnitHeight: 2,
          ports: [
            {
              name: "eth0",
            },
          ],
        },
      ],
      links: [
        {
          endpointA: {
            deviceName: "Switch A",
            portName: "eth0",
          },
          endpointB: {
            deviceName: "Server A",
            portName: "eth0",
          },
          purpose: "runtime-uplink",
        },
      ],
      segments: [],
      allocations: [],
    },
  }
}

function createReviewRuntimeInput() {
  return {
    requirement: {
      id: "req-runtime-review-1",
      projectName: "Runtime Review Example",
      scopeType: "data-center" as const,
    },
    devices: [
      {
        id: "device-switch-a",
        name: "switch-a",
        role: "switch",
        redundancyIntent: "dual-homed-preferred" as const,
        statusConfidence: "inferred" as const,
      },
    ],
    ports: [],
    links: [],
    racks: [],
    segments: [],
    allocations: [],
  }
}

function createBundleRuntimeInput() {
  return createScn01SingleRackConnectivityFixture()
}

function createCaptureRequirementsRuntimeInput() {
  return {
    projectName: "Runtime Captured Requirement",
    scopeType: "cloud" as const,
    artifactRequests: ["ip-allocation-table"],
    requirementNotes: "Collect a cloud allocation draft from candidate facts.",
  }
}

function createDraftTopologyRuntimeInput() {
  return {
    requirement: {
      id: "req-runtime-draft-1",
      projectName: "Runtime Draft Example",
      scopeType: "cloud" as const,
      artifactRequests: ["ip-allocation-table"],
    },
    structuredInput: {
      racks: [],
      devices: [],
      links: [],
      segments: [
        {
          name: "Runtime Service",
          segmentType: "service" as const,
          cidr: "10.80.0.0/24",
          gateway: "10.80.0.1",
          purpose: "runtime-service",
        },
      ],
      allocations: [
        {
          segmentName: "Runtime Service",
          allocationType: "service" as const,
          ipAddress: "10.80.0.10",
          hostname: "runtime-service-api",
          interfaceName: "eni-runtime",
          purpose: "runtime-service-api",
        },
      ],
    },
  }
}

describe("createCloudSolutionRuntime", () => {
  test("assembles the thin plugin flow and invokes the scaffold tool", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    expect(runtime.pluginConfig.plugin_name).toBe("cloud-solution")
    expect(Object.keys(runtime.tools)).toContain("describe_cloud_solution")
    expect(Object.keys(runtime.tools)).not.toContain("start_coordinator_workflow")
    expect(runtime.pluginInterface.tool).toBe(runtime.tools)

    const result = await runtime.kernel.invokeTool({
      toolName: "describe_cloud_solution",
      sessionID: "runtime-session",
    })
    const parsed = JSON.parse(result)

    expect(parsed.trustBoundary).toContain("canonical-domain-model")
  })

  test("does not expose start_coordinator_workflow through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "start_coordinator_workflow",
        sessionID: "runtime-coordinator-session",
      }),
    ).rejects.toThrow("Unknown tool: start_coordinator_workflow")
  })

  test("invokes capture_solution_requirements through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "capture_solution_requirements",
      sessionID: "runtime-capture-session",
      args: createCaptureRequirementsRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.requirement.id).toBe("req-runtime-captured-requirement")
    expect(parsed.requirement.artifactRequests).toEqual(["ip-allocation-table"])
    expect(parsed.nextAction).toBe("draft_topology_model")
    expect(parsed.draftInput.requirement).toEqual(parsed.requirement)
  })

  test("invokes draft_topology_model through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "draft_topology_model",
      sessionID: "runtime-draft-session",
      args: createDraftTopologyRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.normalizedInput.requirement.id).toBe("req-runtime-draft-1")
    expect(parsed.normalizedInput.segments[0]).toEqual(
      expect.objectContaining({
        id: "segment-runtime-service",
        statusConfidence: "inferred",
      }),
    )
    expect(parsed.validationSummary.valid).toBe(false)
    expect(parsed.validationSummary.issues.map((issue: { code: string }) => issue.code)).toContain(
      "network_fact_not_confirmed",
    )
  })

  test("rejects confirmed candidate facts through draft_topology_model at runtime", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "draft_topology_model",
        sessionID: "runtime-draft-confirmed-session",
        args: {
          requirement: {
            id: "req-runtime-draft-confirmed",
            projectName: "Runtime Draft Confirmed",
            scopeType: "cloud",
            artifactRequests: ["ip-allocation-table"],
          },
          structuredInput: {
            racks: [],
            devices: [],
            links: [],
            segments: [
              {
                name: "Runtime Service",
                segmentType: "service",
                cidr: "10.81.0.0/24",
                gateway: "10.81.0.1",
                purpose: "runtime-service",
                statusConfidence: "confirmed",
              },
            ],
            allocations: [],
          },
        },
      }),
    ).rejects.toThrow()
  })

  test("returns candidate facts and clarification summary for SCN-05 document-assisted drafts at runtime", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "draft_topology_model",
      sessionID: "runtime-scn05-draft-session",
      args: createScn05DocumentAssistedDraftFixture(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.inputState).toBe("candidate_fact_draft")
    expect(parsed.candidateFacts).toEqual([
      expect.objectContaining({
        entityRef: "allocation:allocation-document-public-service-10-50-0-10",
        statusConfidence: "unresolved",
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        entityRef: "segment:segment-document-public-service",
        statusConfidence: "inferred",
        requiresConfirmation: true,
      }),
    ])
    expect(parsed.confirmationSummary.pendingEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
    expect(parsed.clarificationSummary.nonBlockingQuestions).toContainEqual(
      expect.objectContaining({
        field: "documentAssist.candidateFacts",
      }),
    )
    expect(parsed.validationSummary.valid).toBe(false)
  })

  test("promotes SCN-05 candidate facts to a confirmed slice at runtime", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "draft_topology_model",
      sessionID: "runtime-scn05-promoted-session",
      args: createScn05PromotedDocumentAssistFixture(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.inputState).toBe("confirmed_slice")
    expect(parsed.confirmationSummary.confirmedEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
    expect(parsed.confirmationSummary.pendingEntityRefs).toEqual([])
    expect(parsed.validationSummary.valid).toBe(true)
    expect(parsed.validationSummary.issues).toEqual([])
  })

  test("routes document-assisted capture to extract_document_candidate_facts at runtime", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "capture_solution_requirements",
      sessionID: "runtime-scn05-capture-session",
      args: {
        projectName: "Runtime Document Capture",
        scopeType: "cloud",
        artifactRequests: ["ip-allocation-table"],
        documentSources: [
          {
            kind: "document",
            ref: "fixtures/runtime-roundtrip-supporting.pdf",
            note: "Runtime roundtrip supporting doc",
          },
        ],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.nextAction).toBe("extract_document_candidate_facts")
    expect(parsed.draftInput.documentAssist.documentSources).toEqual([
      {
        kind: "document",
        ref: "fixtures/runtime-roundtrip-supporting.pdf",
        note: "Runtime roundtrip supporting doc",
      },
    ])
  })

  test("extracts document candidate facts through the runtime kernel", async () => {
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture(
              createScn05DocumentExtractionInputFixture().documentAssist.documentSources,
            ),
            extractionWarnings: ["Diagram did not expose any rack details."],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "extract_document_candidate_facts",
      sessionID: "runtime-scn05-extract-session",
      args: createScn05DocumentExtractionInputFixture(),
    })
    const parsed = JSON.parse(result)

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(parsed.nextAction).toBe("draft_topology_model")
    expect(parsed.draftInput.documentAssist.candidateFacts).toEqual(
      createScn05ExtractedCandidateFactsFixture(
        createScn05DocumentExtractionInputFixture().documentAssist.documentSources,
      ),
    )
    expect(parsed.extractionWarnings).toEqual(["Diagram did not expose any rack details."])
  })

  test("fails extract_document_candidate_facts through the runtime kernel without a client", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "extract_document_candidate_facts",
        sessionID: "runtime-scn05-extract-session",
        args: createScn05DocumentExtractionInputFixture(),
      }),
    ).rejects.toThrow(
      "extract_document_candidate_facts requires a plugin runtime client to spawn the internal extraction worker",
    )
  })

  test("rejects absolute document source paths through the runtime kernel", async () => {
    const { client } = createFakeCoordinatorClient()
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    await expect(
      runtime.kernel.invokeTool({
        toolName: "extract_document_candidate_facts",
        sessionID: "runtime-scn05-extract-absolute-path",
        args: {
          ...createScn05DocumentExtractionInputFixture(),
          documentAssist: {
            ...createScn05DocumentExtractionInputFixture().documentAssist,
            documentSources: [
              {
                kind: "document",
                ref: "/tmp/outside-workspace.pdf",
                note: "Outside workspace",
              },
            ],
          },
        },
      }),
    ).rejects.toThrow("documentSources[].ref must be relative to the current workspace.")
  })

  test("document-assisted capture output roundtrips into draft_topology_model at runtime", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture([
              {
                kind: "document",
                ref: "fixtures/runtime-roundtrip-supporting.pdf",
                note: "Runtime roundtrip supporting doc",
              },
            ]),
            extractionWarnings: [],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const captureResult = await runtime.kernel.invokeTool({
      toolName: "capture_solution_requirements",
      sessionID: "runtime-scn05-capture-roundtrip",
      args: {
        projectName: "Runtime Document Capture",
        scopeType: "cloud",
        artifactRequests: ["ip-allocation-table"],
        documentSources: [
          {
            kind: "document",
            ref: "fixtures/runtime-roundtrip-supporting.pdf",
            note: "Runtime roundtrip supporting doc",
          },
        ],
      },
    })
    const captureParsed = JSON.parse(captureResult)
    expect(captureParsed.nextAction).toBe("extract_document_candidate_facts")
    const extractResult = await runtime.kernel.invokeTool({
      toolName: "extract_document_candidate_facts",
      sessionID: "runtime-scn05-capture-roundtrip-extract",
      args: captureParsed.draftInput,
    })
    const extractParsed = JSON.parse(extractResult)
    const draftResult = await runtime.kernel.invokeTool({
      toolName: "draft_topology_model",
      sessionID: "runtime-scn05-capture-roundtrip-draft",
      args: extractParsed.draftInput,
    })
    const draftParsed = JSON.parse(draftResult)

    expect(draftParsed.inputState).toBe("candidate_fact_draft")
    expect(draftParsed.candidateFacts).toHaveLength(2)
  })

  test("invokes the validation slice through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_ip_allocation_table",
      sessionID: "runtime-validation-session",
      args: {
        requirement: {
          id: "req-runtime-1",
          projectName: "Runtime Validation Example",
          scopeType: "cloud",
        },
        segments: [
          {
            id: "segment-runtime",
            name: "runtime",
            segmentType: "subnet",
            cidr: "10.60.0.0/24",
            gateway: "10.60.0.1",
            purpose: "runtime",
          },
        ],
        allocations: [
          {
            id: "alloc-runtime-1",
            segmentId: "segment-runtime",
            allocationType: "gateway",
            ipAddress: "10.60.0.1",
          },
          {
            id: "alloc-runtime-2",
            segmentId: "segment-runtime",
            allocationType: "service",
            ipAddress: "10.60.0.10",
            hostname: "runtime-api",
          },
        ],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.content).toContain("Runtime Validation Example")
    expect(parsed.artifact.content).toContain("alloc-runtime-2")
    expect(parsed.artifact.content).toContain("10.60.0.10")
  })

  test("invokes validate_solution_model through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "validate_solution_model",
      sessionID: "runtime-validate-session",
      args: {
        requirement: {
          id: "req-runtime-validate-1",
          projectName: "Runtime Validate Example",
          scopeType: "cloud",
        },
        segments: [
          {
            id: "segment-validate",
            name: "validate",
            segmentType: "subnet",
            cidr: "10.80.0.0/24",
            gateway: "10.80.0.1",
            purpose: "validate",
          },
        ],
        allocations: [
          {
            id: "alloc-validate-1",
            segmentId: "segment-validate",
            allocationType: "gateway",
            ipAddress: "10.80.0.1",
          },
        ],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.valid).toBe(true)
    expect(parsed.blockingIssueCount).toBe(0)
    expect(parsed.issues).toEqual([])
  })

  test("invokes the port connection slice through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_port_connection_table",
      sessionID: "runtime-port-session",
      args: {
        requirement: {
          id: "req-runtime-port-1",
          projectName: "Runtime Port Example",
          scopeType: "data-center",
          artifactRequests: ["device-port-connection-table"],
        },
        devices: [
          {
            id: "device-a",
            name: "switch-a",
            role: "switch",
          },
          {
            id: "device-b",
            name: "server-b",
            role: "server",
          },
        ],
        ports: [
          {
            id: "port-a",
            deviceId: "device-a",
            name: "eth0",
          },
          {
            id: "port-b",
            deviceId: "device-b",
            name: "eth1",
          },
        ],
        links: [
          {
            id: "link-runtime-a",
            endpointA: { portId: "port-b" },
            endpointB: { portId: "port-a" },
            purpose: "runtime-uplink",
          },
        ],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("port-connection-table.md")
    expect(parsed.artifact.content).toContain("Runtime Port Example")
    expect(parsed.artifact.content).toContain("switch-a (device-a)")
    expect(parsed.artifact.content).toContain("server-b (device-b)")
  })

  test("invokes the device cabling slice through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_device_cabling_table",
      sessionID: "runtime-device-cabling-session",
      args: createPhysicalRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("device-cabling-table.md")
    expect(parsed.artifact.content).toContain("Runtime Physical Example")
    expect(parsed.artifact.content).toContain("rack-a (rack-a) U1")
  })

  test("invokes the device port plan slice through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_device_port_plan",
      sessionID: "runtime-device-port-plan-session",
      args: createPhysicalRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("device-port-plan.md")
    expect(parsed.artifact.content).toContain("Runtime Physical Example")
    expect(parsed.artifact.content).toContain("port-server-a-2")
  })

  test("invokes validation through the runtime kernel with structured input", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "validate_solution_model",
      sessionID: "runtime-structured-session",
      args: createStructuredRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.valid).toBe(true)
    expect(parsed.issues).toEqual([])
  })

  test("blocks runtime IP generation when artifact request was omitted and allocations are missing", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_ip_allocation_table",
      sessionID: "runtime-ip-negative-session",
      args: {
        requirement: {
          id: "req-runtime-ip-negative-1",
          projectName: "Runtime IP Negative Example",
          scopeType: "cloud",
        },
        segments: [
          {
            id: "segment-runtime-negative",
            name: "runtime-negative",
            segmentType: "subnet",
            cidr: "10.91.0.0/24",
            gateway: "10.91.0.1",
            purpose: "runtime-negative",
          },
        ],
        allocations: [],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("ip_allocations_missing")
    expect(parsed.artifact.content).toContain("Status: blocked")
  })

  test("blocks runtime port-connection generation when artifact request was omitted and links are missing", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_port_connection_table",
      sessionID: "runtime-port-negative-session",
      args: {
        requirement: {
          id: "req-runtime-port-negative-1",
          projectName: "Runtime Port Negative Example",
          scopeType: "data-center",
        },
        devices: [
          {
            id: "device-a",
            name: "switch-a",
            role: "switch",
          },
          {
            id: "device-b",
            name: "server-b",
            role: "server",
          },
        ],
        ports: [
          {
            id: "port-a",
            deviceId: "device-a",
            name: "eth0",
          },
          {
            id: "port-b",
            deviceId: "device-b",
            name: "eth1",
          },
        ],
        links: [],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("port_connection_links_missing")
    expect(parsed.artifact.content).toContain("Status: blocked")
  })

  test("invokes summarize_design_gaps through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "summarize_design_gaps",
      sessionID: "runtime-review-session",
      args: createReviewRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.workflowState).toBe("review_required")
    expect(parsed.reviewRequired).toBe(true)
    expect(parsed.assumptions).toHaveLength(1)
    expect(parsed.artifact.name).toBe("design-assumptions-and-gaps.md")
    expect(parsed.artifact.content).toContain("Design Assumptions and Gaps")
    expect(parsed.artifact.content).toContain("device-switch-a")
  })

  test("invokes export_artifact_bundle through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "export_artifact_bundle",
      sessionID: "runtime-bundle-session",
      args: createBundleRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.workflowState).toBe("export_ready")
    expect(parsed.exportReady).toBe(true)
    expect(parsed.validationSummary.valid).toBe(true)
    expect(parsed.artifacts).toHaveLength(6)
    expect(parsed.bundleIndex.name).toBe("artifact-bundle-index.md")
    expect(parsed.includedArtifactNames).toContain("design-assumptions-and-gaps.md")
  })

  test("invokes start_solution_review_workflow through the runtime kernel", async () => {
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
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "start_solution_review_workflow",
      sessionID: "runtime-workflow-session",
      args: createBundleRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(createCalls).toHaveLength(2)
    expect(promptCalls).toHaveLength(2)
    expect(parsed.workersInvoked).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(parsed.executionOrder).toEqual([
      "requirements-clarification",
      "solution-review-assistant",
    ])
    expect(createCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "runtime-workflow-session",
          title: "Requirements Clarification",
        }),
      }),
    )
    expect(createCalls[1]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "runtime-workflow-session",
          title: "Solution Review Assistant",
        }),
      }),
    )
    expect(parsed.orchestrationState).toBe("export_ready")
    expect(parsed.workflowState).toBe("export_ready")
    expect(parsed.transitions).toEqual(["queued", "running", "export_ready"])
    expect(parsed.bundle.exportReady).toBe(true)
    expect(parsed.nextAction).toBe("export_bundle")
    expect(parsed.clarificationSummary).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      blockingQuestions: [],
      nonBlockingQuestions: [],
      suggestions: [],
    })
    expect(parsed.agentBrief.agentID).toBe("solution_review_assistant")
    expect(parsed.agentBrief.orchestrationState).toBe("export_ready")
    expect(parsed.agentResponse.agentID).toBe("solution_review_assistant")
    expect(parsed.agentResponse.orchestrationState).toBe("export_ready")
    expect(parsed.agentResponse.nextAction).toBe("export_bundle")
    expect(parsed.finalResponse).toContain("export-ready")
    expect(parsed.finalResponse).toBe(parsed.agentResponse.response)
    expect(Array.isArray(parsed.nextActions)).toBe(true)
    expect(parsed.nextActions.length).toBeGreaterThan(0)
    expect(parsed).not.toHaveProperty("warnings")
  })

  test("keeps SCN-04 export-ready through start_solution_review_workflow at runtime", async () => {
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
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "start_solution_review_workflow",
      sessionID: "runtime-scn04-workflow-session",
      args: {
        requirement: {
          id: "req-scn-04",
          projectName: "SCN-04 Simple Cloud Network Allocation",
          scopeType: "cloud",
          artifactRequests: ["ip-allocation-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        devices: [],
        racks: [],
        ports: [],
        links: [],
        segments: [
          {
            id: "segment-public-service",
            name: "public-service",
            segmentType: "service",
            cidr: "10.40.0.0/24",
            gateway: "10.40.0.1",
            purpose: "public-service",
            sourceRefs: [],
            statusConfidence: "confirmed",
          },
        ],
        allocations: [
          {
            id: "allocation-public-gateway",
            segmentId: "segment-public-service",
            allocationType: "gateway",
            ipAddress: "10.40.0.1",
            purpose: "public-gateway",
            sourceRefs: [],
            statusConfidence: "confirmed",
          },
        ],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.orchestrationState).toBe("export_ready")
    expect(parsed.clarificationSummary).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      blockingQuestions: [],
      nonBlockingQuestions: [],
      suggestions: [],
    })
  })

  test("keeps SCN-05 document-assisted drafts out of export-ready until confirmation", async () => {
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
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "start_solution_review_workflow",
      sessionID: "runtime-scn05-draft-session",
      args: createScn05DocumentAssistedDraftFixture(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.inputState).toBe("candidate_fact_draft")
    expect(parsed.orchestrationState).toBe("blocked")
    expect(parsed.candidateFacts).toEqual([
      expect.objectContaining({ entityRef: "allocation:allocation-document-public-service-10-50-0-10" }),
      expect.objectContaining({ entityRef: "segment:segment-document-public-service" }),
    ])
    expect(parsed.confirmationSummary.pendingEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
    expect(parsed.clarificationSummary.nonBlockingQuestions).toContainEqual(
      expect.objectContaining({
        field: "documentAssist.candidateFacts",
      }),
    )
  })

  test("treats promoted SCN-05 document-assisted input as a confirmed export-ready slice", async () => {
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
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "start_solution_review_workflow",
      sessionID: "runtime-scn05-confirmed-session",
      args: createScn05PromotedDocumentAssistFixture(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.inputState).toBe("confirmed_slice")
    expect(parsed.orchestrationState).toBe("export_ready")
    expect(parsed.confirmationSummary.confirmedEntityRefs).toEqual([
      "allocation:allocation-document-public-service-10-50-0-10",
      "segment:segment-document-public-service",
    ])
    expect(parsed.confirmationSummary.pendingEntityRefs).toEqual([])
  })

  test("surfaces mixed canonical and draft input as a failed workflow at runtime", async () => {
    const { client } = createFakeCoordinatorClient()
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "start_solution_review_workflow",
      sessionID: "runtime-scn05-mixed-session",
      args: {
        ...createScn05DocumentAssistedDraftFixture(),
        segments: [
          {
            id: "segment-mixed",
            name: "mixed",
            segmentType: "service",
            cidr: "10.99.0.0/24",
            gateway: "10.99.0.1",
            purpose: "mixed",
            sourceRefs: [],
            statusConfidence: "confirmed",
          },
        ],
      },
    })
    const parsed = JSON.parse(result)

    expect(parsed.orchestrationState).toBe("failed")
    expect(parsed.inputState).toBe("candidate_fact_draft")
    expect(parsed.nextAction).toBe("inspect_failure")
    expect(parsed.finalResponse).toContain("failed")
  })

  test("fails start_solution_review_workflow through the runtime kernel without a client", () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    return expect(
      Promise.resolve().then(() =>
        runtime.kernel.invokeTool({
          toolName: "start_solution_review_workflow",
          sessionID: "runtime-workflow-session",
          args: createBundleRuntimeInput(),
        }),
      ),
    ).rejects.toThrow(
      "start_solution_review_workflow requires a plugin runtime client to spawn the internal clarification and review agents",
    )
  })
})
