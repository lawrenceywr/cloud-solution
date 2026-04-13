import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn05DocumentAssistedDraftFixture,
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
  createScn05PromotedDocumentAssistFixture,
} from "./scenarios/fixtures"
import { loadPluginConfig } from "./plugin-config"
import { createManagers } from "./create-managers"
import { createTools } from "./create-tools"
import { createFakeCoordinatorClient } from "./test-helpers/fake-coordinator-client"
import { createTestToolContext } from "./test-helpers/tool-context"

function createPhysicalToolInput() {
  return {
    requirement: {
      id: "req-physical-tool-1",
      projectName: "Physical Tool Example",
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
        id: "link-a",
        endpointA: { portId: "port-switch-a-1" },
        endpointB: { portId: "port-server-a-1" },
        purpose: "server-uplink",
      },
    ],
  }
}

function createStructuredPhysicalToolInput() {
  return {
    requirement: {
      id: "req-structured-tool-1",
      projectName: "Structured Tool Example",
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
          purpose: "uplink",
        },
      ],
      segments: [],
      allocations: [],
    },
  }
}

function createReviewToolInput() {
  return {
    requirement: {
      id: "req-review-tool-1",
      projectName: "Review Tool Example",
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

function createBundleToolInput() {
  return createScn01SingleRackConnectivityFixture()
}

function createCaptureRequirementToolInput() {
  return {
    projectName: "Captured Cloud Intake",
    scopeType: "cloud" as const,
    artifactRequests: ["ip-allocation-table"],
    requirementNotes: "Need a first-pass cloud allocation draft.",
  }
}

function createDocumentAssistedCaptureRequirementToolInput() {
  return {
    projectName: "Captured Document Intake",
    scopeType: "cloud" as const,
    artifactRequests: ["ip-allocation-table"],
    requirementNotes: "Need a first-pass document-assisted allocation draft.",
    documentSources: [
      {
        kind: "document" as const,
        ref: "fixtures/captured-supporting-design.pdf",
        note: "Captured supporting PDF",
      },
    ],
  }
}

function createDraftTopologyToolInput() {
  return {
    requirement: {
      id: "req-draft-tool-1",
      projectName: "Draft Tool Example",
      scopeType: "cloud" as const,
      artifactRequests: ["ip-allocation-table"],
    },
    structuredInput: {
      racks: [],
      devices: [],
      links: [],
      segments: [
        {
          name: "Public Service",
          segmentType: "service" as const,
          cidr: "10.70.0.0/24",
          gateway: "10.70.0.1",
          purpose: "public-service",
        },
      ],
      allocations: [
        {
          segmentName: "Public Service",
          allocationType: "service" as const,
          ipAddress: "10.70.0.10",
          hostname: "draft-api",
          interfaceName: "eni-public",
          purpose: "public-api",
        },
      ],
    },
  }
}

describe("createTools", () => {
  test("registers describe_cloud_solution tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("describe_cloud_solution")

    const response = await tools.describe_cloud_solution.execute(
      { include_examples: true },
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.pluginName).toBe("cloud-solution")
    expect(parsed.supportedArtifacts).toContain("ip-allocation-table")
    expect(parsed.exampleRequirement.scopeType).toBe("data-center")
  })

  test("registers capture_solution_requirements tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("capture_solution_requirements")

    const response = await tools.capture_solution_requirements.execute(
      createCaptureRequirementToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.requirement.id).toBe("req-captured-cloud-intake")
    expect(parsed.requirement.scopeType).toBe("cloud")
    expect(parsed.requirement.artifactRequests).toEqual(["ip-allocation-table"])
    expect(parsed.requirement.sourceRefs).toEqual([
      {
        kind: "user-input",
        ref: "capture_solution_requirements",
        note: "Need a first-pass cloud allocation draft.",
      },
    ])
    expect(parsed.draftInput.requirement).toEqual(parsed.requirement)
    expect(parsed.draftInput.structuredInput).toEqual({
      racks: [],
      devices: [],
      links: [],
      segments: [],
      allocations: [],
    })
    expect(parsed.nextAction).toBe("draft_topology_model")
  })

  test("capture_solution_requirements seeds a document-assisted draft envelope", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const response = await tools.capture_solution_requirements.execute(
      createDocumentAssistedCaptureRequirementToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.draftInput.documentAssist.documentSources).toEqual([
      {
        kind: "document",
        ref: "fixtures/captured-supporting-design.pdf",
        note: "Captured supporting PDF",
      },
    ])
    expect(parsed.draftInput.documentAssist.candidateFacts).toEqual({
      racks: [],
      devices: [],
      links: [],
      segments: [],
      allocations: [],
    })
    expect(parsed.draftInput).not.toHaveProperty("structuredInput")
    expect(parsed.nextAction).toBe("extract_document_candidate_facts")
  })

  test("registers extract_document_candidate_facts tool and returns a draft-ready documentAssist envelope", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: createScn05DocumentExtractionInputFixture().documentAssist.documentSources[0],
                markdown: "# Supporting network design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
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
    const managers = createManagers({
      context: { directory: process.cwd(), worktree: process.cwd(), client },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd(), worktree: process.cwd(), client },
    })

    expect(Object.keys(tools)).toContain("extract_document_candidate_facts")

    const response = await tools.extract_document_candidate_facts.execute(
      createScn05DocumentExtractionInputFixture(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(createCalls).toHaveLength(2)
    expect(promptCalls).toHaveLength(2)
    expect(parsed.nextAction).toBe("draft_topology_model")
    expect(parsed.draftInput.documentAssist.documentSources).toEqual(
      createScn05DocumentExtractionInputFixture().documentAssist.documentSources,
    )
    expect(parsed.draftInput.documentAssist.candidateFacts).toEqual(
      createScn05ExtractedCandidateFactsFixture(),
    )
    expect(parsed.extractionWarnings).toEqual(["Diagram did not expose any rack details."])
  })

  test("document-assisted capture output roundtrips through extract_document_candidate_facts and into draft_topology_model", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: createDocumentAssistedCaptureRequirementToolInput().documentSources[0],
                markdown: "# Runtime supporting design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createScn05ExtractedCandidateFactsFixture(
              createDocumentAssistedCaptureRequirementToolInput().documentSources,
            ),
            extractionWarnings: [],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })
    const managers = createManagers({
      context: { directory: process.cwd(), worktree: process.cwd(), client },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd(), worktree: process.cwd(), client },
    })

    const captureResponse = await tools.capture_solution_requirements.execute(
      createDocumentAssistedCaptureRequirementToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const captureParsed = JSON.parse(captureResponse)
    const extractResponse = await tools.extract_document_candidate_facts.execute(
      captureParsed.draftInput,
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const extractParsed = JSON.parse(extractResponse)
    const draftResponse = await tools.draft_topology_model.execute(
      extractParsed.draftInput,
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const draftParsed = JSON.parse(draftResponse)

    expect(draftParsed.inputState).toBe("candidate_fact_draft")
    expect(draftParsed.candidateFacts).toHaveLength(2)
  })

  test("extract_document_candidate_facts rejects seeded candidate facts as input", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient()
    const managers = createManagers({
      context: { directory: process.cwd(), worktree: process.cwd(), client },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd(), worktree: process.cwd(), client },
    })

    await expect(
      tools.extract_document_candidate_facts.execute(
        createScn05DocumentAssistedDraftFixture(),
        createTestToolContext({ sessionID: "tool-test-session" }),
      ),
    ).rejects.toThrow(
      "extract_document_candidate_facts expects an empty candidate-fact scaffold as input.",
    )
  })

  test("extract_document_candidate_facts rejects document-assisted extraction when plugin config disables it", async () => {
    const config = {
      ...loadPluginConfig(process.cwd()),
      allow_document_assist: false,
    }
    const { client } = createFakeCoordinatorClient()
    const managers = createManagers({
      context: { directory: process.cwd(), worktree: process.cwd(), client },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd(), worktree: process.cwd(), client },
    })

    await expect(
      tools.extract_document_candidate_facts.execute(
        createScn05DocumentExtractionInputFixture(),
        createTestToolContext({ sessionID: "tool-test-session" }),
      ),
    ).rejects.toThrow("Document-assisted drafting is disabled by plugin config.")
  })

  test("extract_document_candidate_facts rejects absolute document source paths", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient()
    const managers = createManagers({
      context: { directory: process.cwd(), worktree: process.cwd(), client },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd(), worktree: process.cwd(), client },
    })

    await expect(
      tools.extract_document_candidate_facts.execute(
        {
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
        createTestToolContext({ sessionID: "tool-test-session" }),
      ),
    ).rejects.toThrow("documentSources[].ref must be relative to the current workspace.")
  })

  test("extract_document_candidate_facts rejects traversing document source paths", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient()
    const managers = createManagers({
      context: { directory: process.cwd(), worktree: process.cwd(), client },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd(), worktree: process.cwd(), client },
    })

    await expect(
      tools.extract_document_candidate_facts.execute(
        {
          ...createScn05DocumentExtractionInputFixture(),
          documentAssist: {
            ...createScn05DocumentExtractionInputFixture().documentAssist,
            documentSources: [
              {
                kind: "document",
                ref: "../outside-workspace.pdf",
                note: "Traversal outside workspace",
              },
            ],
          },
        },
        createTestToolContext({ sessionID: "tool-test-session" }),
      ),
    ).rejects.toThrow("documentSources[].ref must stay within the current workspace.")
  })

  test("registers draft_topology_model tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("draft_topology_model")

    const response = await tools.draft_topology_model.execute(
      createDraftTopologyToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.normalizedInput.requirement.id).toBe("req-draft-tool-1")
    expect(parsed.normalizedInput.segments[0]).toEqual(
      expect.objectContaining({
        id: "segment-public-service",
        name: "Public Service",
        statusConfidence: "inferred",
      }),
    )
    expect(parsed.normalizedInput.allocations[0]).toEqual(
      expect.objectContaining({
        id: "allocation-public-service-10-70-0-10",
        segmentId: "segment-public-service",
        statusConfidence: "inferred",
      }),
    )
    expect(parsed.validationSummary.valid).toBe(false)
    expect(parsed.validationSummary.issues.map((issue: { code: string }) => issue.code)).toContain(
      "network_fact_not_confirmed",
    )
  })

  test("draft_topology_model rejects confirmed candidate facts", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    await expect(
      tools.draft_topology_model.execute(
        {
          requirement: {
            id: "req-draft-tool-confirmed",
            projectName: "Draft Tool Confirmed",
            scopeType: "cloud",
            artifactRequests: ["ip-allocation-table"],
          },
          structuredInput: {
            racks: [],
            devices: [],
            links: [],
            segments: [
              {
                name: "Public Service",
                segmentType: "service",
                cidr: "10.71.0.0/24",
                gateway: "10.71.0.1",
                purpose: "public-service",
                statusConfidence: "confirmed",
              },
            ],
            allocations: [],
          },
        },
        createTestToolContext({ sessionID: "tool-test-session" }),
      ),
    ).rejects.toThrow()
  })

  test("draft_topology_model returns candidate facts and clarification summary for SCN-05 document-assisted drafts", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })
    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const response = await tools.draft_topology_model.execute(
      createScn05DocumentAssistedDraftFixture(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

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
    expect(parsed.confirmationSummary).toEqual({
      requestedEntityRefs: [],
      confirmedEntityRefs: [],
      pendingEntityRefs: [
        "allocation:allocation-document-public-service-10-50-0-10",
        "segment:segment-document-public-service",
      ],
      missingEntityRefs: [],
    })
    expect(parsed.clarificationSummary.nonBlockingQuestions).toContainEqual(
      expect.objectContaining({
        field: "documentAssist.candidateFacts",
      }),
    )
    expect(parsed.validationSummary.valid).toBe(false)
    expect(parsed.validationSummary.issues.map((issue: { code: string }) => issue.code)).toContain(
      "network_fact_not_confirmed",
    )
  })

  test("draft_topology_model promotes confirmed SCN-05 entities explicitly", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })
    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const response = await tools.draft_topology_model.execute(
      createScn05PromotedDocumentAssistFixture(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.inputState).toBe("confirmed_slice")
    expect(parsed.candidateFacts.every((fact: { requiresConfirmation: boolean }) => !fact.requiresConfirmation)).toBe(true)
    expect(parsed.confirmationSummary).toEqual({
      requestedEntityRefs: [
        "allocation:allocation-document-public-service-10-50-0-10",
        "segment:segment-document-public-service",
      ],
      confirmedEntityRefs: [
        "allocation:allocation-document-public-service-10-50-0-10",
        "segment:segment-document-public-service",
      ],
      pendingEntityRefs: [],
      missingEntityRefs: [],
    })
    expect(parsed.validationSummary.valid).toBe(true)
    expect(parsed.validationSummary.issues).toEqual([])
  })

  test("draft_topology_model rejects document-assisted drafts when plugin config disables them", async () => {
    const config = {
      ...loadPluginConfig(process.cwd()),
      allow_document_assist: false,
    }
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })
    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    await expect(
      tools.draft_topology_model.execute(
        createScn05DocumentAssistedDraftFixture(),
        createTestToolContext({ sessionID: "tool-test-session" }),
      ),
    ).rejects.toThrow("Document-assisted drafting is disabled by plugin config.")
  })

  test("start_solution_review_workflow surfaces mixed canonical and draft input as a failed workflow", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient()
    const managers = createManagers({
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
      pluginConfig: config,
    })
    const tools = createTools({
      pluginConfig: config,
      managers,
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
    })

    const response = await tools.start_solution_review_workflow.execute(
      {
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
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.orchestrationState).toBe("failed")
    expect(parsed.inputState).toBe("candidate_fact_draft")
    expect(parsed.nextAction).toBe("inspect_failure")
    expect(parsed.finalResponse).toContain("failed")
  })

  test("registers generate_ip_allocation_table tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("generate_ip_allocation_table")

    const response = await tools.generate_ip_allocation_table.execute(
      {
        requirement: {
          id: "req-tool-1",
          projectName: "Tool Slice Example",
          scopeType: "cloud",
        },
        segments: [
          {
            id: "segment-service",
            name: "service",
            segmentType: "subnet",
            cidr: "10.50.0.0/24",
            gateway: "10.50.0.1",
            purpose: "service",
          },
        ],
        allocations: [
          {
            id: "alloc-tool-1",
            segmentId: "segment-service",
            allocationType: "gateway",
            ipAddress: "10.50.0.1",
          },
          {
            id: "alloc-tool-2",
            segmentId: "segment-service",
            allocationType: "service",
            ipAddress: "10.50.0.10",
            hostname: "api-1",
          },
        ],
      },
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("ip-allocation-table.md")
    expect(parsed.artifact.content).toContain("Status: ready")
    expect(parsed.artifact.content).toContain("alloc-tool-2")
  })

  test("registers generate_port_connection_table tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("generate_port_connection_table")

    const response = await tools.generate_port_connection_table.execute(
      {
        requirement: {
          id: "req-port-tool-1",
          projectName: "Port Tool Example",
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
            id: "link-a",
            endpointA: { portId: "port-b" },
            endpointB: { portId: "port-a" },
            purpose: "uplink",
          },
        ],
      },
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("port-connection-table.md")
    expect(parsed.artifact.content).toContain("Status: ready")
    expect(parsed.artifact.content).toContain("switch-a (device-a)")
  })

  test("registers generate_device_cabling_table tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("generate_device_cabling_table")

    const response = await tools.generate_device_cabling_table.execute(
      createPhysicalToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("device-cabling-table.md")
    expect(parsed.artifact.content).toContain("Status: ready")
    expect(parsed.artifact.content).toContain("rack-a (rack-a) U1")
  })

  test("registers generate_device_port_plan tool", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("generate_device_port_plan")

    const response = await tools.generate_device_port_plan.execute(
      createPhysicalToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("device-port-plan.md")
    expect(parsed.artifact.content).toContain("Status: ready")
    expect(parsed.artifact.content).toContain("port-server-a-2")
  })

  test("normalizes structured input before generating physical artifacts", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const response = await tools.generate_device_cabling_table.execute(
      createStructuredPhysicalToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("device-cabling-table.md")
    expect(parsed.artifact.content).toContain("switch-a")
    expect(parsed.artifact.content).toContain("server-a")
  })

  test("injects ip-allocation artifact request when omitted and blocks empty ready output", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const response = await tools.generate_ip_allocation_table.execute(
      {
        requirement: {
          id: "req-tool-ip-negative-1",
          projectName: "IP Negative Example",
          scopeType: "cloud",
        },
        segments: [
          {
            id: "segment-ip-negative",
            name: "service",
            segmentType: "subnet",
            cidr: "10.90.0.0/24",
            gateway: "10.90.0.1",
            purpose: "service",
          },
        ],
        allocations: [],
      },
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("ip_allocations_missing")
    expect(parsed.artifact.content).toContain("Status: blocked")
  })

  test("injects port-connection artifact request when omitted and blocks weak physical input", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const response = await tools.generate_port_connection_table.execute(
      {
        requirement: {
          id: "req-tool-port-negative-1",
          projectName: "Port Negative Example",
          scopeType: "data-center",
        },
        devices: [
          {
            id: "device-a",
            name: "switch-a",
            role: "switch",
            statusConfidence: "inferred",
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
            id: "link-a",
            endpointA: { portId: "port-a" },
            endpointB: { portId: "port-b" },
          },
        ],
      },
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("physical_fact_not_confirmed")
    expect(parsed.artifact.content).toContain("Status: blocked")
  })

  test("registers summarize_design_gaps and returns deterministic review output", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("summarize_design_gaps")

    const response = await tools.summarize_design_gaps.execute(
      createReviewToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.workflowState).toBe("review_required")
    expect(parsed.reviewSummary.reviewRequired).toBe(true)
    expect(parsed.reviewSummary.assumptionCount).toBe(1)
    expect(parsed.reviewSummary.unresolvedItemCount).toBe(1)
    expect(parsed.artifact.name).toBe("design-assumptions-and-gaps.md")
    expect(parsed.artifact.content).toContain("## Assumptions")
    expect(parsed.artifact.content).toContain("device-switch-a")
  })

  test("registers export_artifact_bundle and returns requested artifacts plus review outputs", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("export_artifact_bundle")

    const response = await tools.export_artifact_bundle.execute(
      createBundleToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.workflowState).toBe("export_ready")
    expect(parsed.exportReady).toBe(true)
    expect(parsed.reviewRequired).toBe(false)
    expect(parsed.requestedArtifactTypes).toEqual([
      "device-cabling-table",
      "device-port-plan",
      "device-port-connection-table",
      "ip-allocation-table",
    ])
    expect(parsed.includedArtifactNames).toEqual([
      "artifact-bundle-index.md",
      "design-assumptions-and-gaps.md",
      "device-cabling-table.md",
      "device-port-plan.md",
      "port-connection-table.md",
      "ip-allocation-table.md",
    ])
    expect(parsed.bundleIndex.content).toContain("## Included Files")
  })

  test("injects default artifact requests into export bundles when omitted", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    const bundleInput = createBundleToolInput()
    const response = await tools.export_artifact_bundle.execute(
      {
        ...bundleInput,
        requirement: {
          ...bundleInput.requirement,
          artifactRequests: [],
        },
      },
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.workflowState).toBe("export_ready")
    expect(parsed.requestedArtifactTypes).toEqual(config.default_artifacts)
    expect(parsed.exportReady).toBe(true)
    expect(parsed.artifacts).toHaveLength(6)
  })

  test("export_artifact_bundle blocks when evidence reconciliation reports a worker-only blocking conflict", async () => {
    const config = loadPluginConfig(process.cwd())
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [
              {
                id: "bundle-worker-only-conflict",
                conflictType: "duplicate_allocation_ip",
                severity: "blocking",
                message: "Worker-only blocking conflict for export bundle path.",
                entityRefs: ["allocation:allocation-server-a", "allocation:allocation-server-b"],
                sourceRefs: [
                  {
                    kind: "document",
                    ref: "bundle-worker-conflict.pdf",
                    note: "Worker-only export conflict",
                  },
                ],
                suggestedResolution: "Resolve the conflicting allocation evidence before export.",
              },
            ],
            reconciliationWarnings: [],
          },
          recommendations: ["检测到以下证据冲突，请解决后再继续方案评审"],
        }),
      ],
    })
    const managers = createManagers({
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
    })

    const response = await tools.export_artifact_bundle.execute(
      createBundleToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.workflowState).toBe("blocked")
    expect(parsed.exportReady).toBeUndefined()
  })

  test("registers start_solution_review_workflow and returns orchestration states", async () => {
    const config = loadPluginConfig(process.cwd())
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
    const managers = createManagers({
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
    })

    expect(Object.keys(tools)).toContain("start_solution_review_workflow")
    expect(Object.keys(tools)).not.toContain("start_coordinator_workflow")

    const response = await tools.start_solution_review_workflow.execute(
      createBundleToolInput(),
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(createCalls).toHaveLength(3)
    expect(promptCalls).toHaveLength(3)
    expect(parsed.workersInvoked).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(parsed.executionOrder).toEqual([
      "requirements-clarification",
      "evidence-reconciliation",
      "solution-review-assistant",
    ])
    expect(createCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "tool-test-session",
          title: "Requirements Clarification",
        }),
      }),
    )
    expect(createCalls[1]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "tool-test-session",
          title: "Evidence Reconciliation",
        }),
      }),
    )
    expect(createCalls[2]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "tool-test-session",
          title: "Solution Review Assistant",
        }),
      }),
    )
    expect(parsed.orchestrationState).toBe("export_ready")
    expect(parsed.workflowState).toBe("export_ready")
    expect(parsed.transitions).toEqual(["queued", "running", "export_ready"])
    expect(parsed.nextAction).toBe("export_bundle")
    expect(parsed.bundle.exportReady).toBe(true)
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

  test("start_solution_review_workflow keeps SCN-04 export-ready for cloud-only allocation slices", async () => {
    const config = loadPluginConfig(process.cwd())
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
    const managers = createManagers({
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: {
        directory: process.cwd(),
        worktree: process.cwd(),
        client,
      },
    })

    const response = await tools.start_solution_review_workflow.execute(
      {
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
      createTestToolContext({ sessionID: "tool-test-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.orchestrationState).toBe("export_ready")
    expect(parsed.clarificationSummary).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      blockingQuestions: [],
      nonBlockingQuestions: [],
      suggestions: [],
    })
  })

  test("fails start_solution_review_workflow when no runtime client is available", () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
      context: { directory: process.cwd() },
    })

    return expect(
      Promise.resolve().then(() =>
        tools.start_solution_review_workflow.execute(
          createBundleToolInput(),
          createTestToolContext({ sessionID: "tool-test-session" }),
        ),
      ),
    ).rejects.toThrow(
      "start_solution_review_workflow requires a plugin runtime client to spawn the internal clarification and review agents",
    )
  })
})
