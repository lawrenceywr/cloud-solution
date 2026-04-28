import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createCloudSolutionRuntime } from "./index"
import {
  createScn01SingleRackConnectivityFixture,
  createPhase09AdvisorySourcesFixture,
  createPhase09DocumentExtractionInputFixture,
  createPhase09ExtractedCandidateFactsFixture,
  createScn05DocumentAssistedDraftFixture,
  createScn05DocumentExtractionInputFixture,
  createScn05ExtractedCandidateFactsFixture,
  createScn05PromotedDocumentAssistFixture,
  createScn07GuardedExportFixture,
  createScn08HighReliabilityRackLayoutFixture,
} from "./scenarios/fixtures"
import { createFakeCoordinatorClient } from "./test-helpers/fake-coordinator-client"

const createdDirectories: string[] = []

function writeDocumentFixtureFiles(directory: string): void {
  const fixtureDirectory = join(directory, "fixtures")
  mkdirSync(fixtureDirectory, { recursive: true })
  writeFileSync(join(fixtureDirectory, "scn-05-supporting-design.pdf"), "SCN-05 supporting design")
  writeFileSync(
    join(fixtureDirectory, "scn-05-topology-diagram.drawio"),
    "<mxfile host=\"app.diagrams.net\"><diagram id=\"scn-05\">placeholder</diagram></mxfile>",
  )
  writeFileSync(join(fixtureDirectory, "runtime-roundtrip-supporting.pdf"), "Runtime roundtrip")
  writeFileSync(join(fixtureDirectory, "captured-supporting-design.pdf"), "Captured supporting design")
}

function createTempProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "cloud-solution-runtime-"))
  writeDocumentFixtureFiles(directory)
  createdDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

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

function createTemplateImportRuntimeInput() {
  return {
    requirement: {
      id: "req-runtime-template-import-1",
      projectName: "Runtime Template Import Example",
      scopeType: "data-center" as const,
      artifactRequests: ["device-cabling-table"],
      sourceRefs: [],
      statusConfidence: "confirmed" as const,
    },
    documentSources: [
      {
        kind: "document" as const,
        ref: "test/设备连线模板.xlsx",
        note: "Cable planning template",
      },
      {
        kind: "document" as const,
        ref: "test/设备装架图模板.xlsx",
        note: "Rack layout template",
      },
      {
        kind: "document" as const,
        ref: "test/5-设备端口规划20260327.xlsx",
        note: "Port plan workbook",
      },
    ],
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
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: createScn05DocumentExtractionInputFixture().documentAssist.documentSources[0],
                markdown: "# Runtime converted design\n\nConverted with MarkItDown.",
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

    expect(createCalls).toHaveLength(2)
    expect(promptCalls).toHaveLength(2)
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
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: {
                  kind: "document",
                  ref: "fixtures/runtime-roundtrip-supporting.pdf",
                  note: "Runtime roundtrip supporting doc",
                },
                markdown: "# Runtime roundtrip\n\nConverted with MarkItDown.",
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

  test("loads configured advisory external-source retrieval through the runtime kernel", async () => {
    const projectDirectory = createTempProject()
    const projectConfigDir = join(projectDirectory, ".opencode")
    mkdirSync(projectConfigDir, { recursive: true })
    writeFileSync(
      join(projectConfigDir, "cloud-solution.jsonc"),
      JSON.stringify({
        document_assist_advisory_source_tool_name: "query_external_solution_source",
      }),
    )

    const fixture = createPhase09DocumentExtractionInputFixture()
    const { client, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: fixture.documentAssist.documentSources[0],
                markdown: "# Runtime supporting design\n\nConverted with MarkItDown.",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
        JSON.stringify({
          workerId: "document-source-advisory-mcp",
          status: "success",
          output: {
            advisorySources: createPhase09AdvisorySourcesFixture(),
            advisoryWarnings: [],
          },
          recommendations: [],
        }),
        JSON.stringify({
          workerId: "document-assisted-extraction",
          status: "success",
          output: {
            candidateFacts: createPhase09ExtractedCandidateFactsFixture(),
            extractionWarnings: [],
          },
          recommendations: ["draft_topology_model"],
        }),
      ],
    })
    const runtime = createCloudSolutionRuntime(projectDirectory, {
      worktree: projectDirectory,
      client,
    })

    const extractResult = await runtime.kernel.invokeTool({
      toolName: "extract_document_candidate_facts",
      sessionID: "runtime-phase09-extract",
      args: fixture,
    })
    const extractParsed = JSON.parse(extractResult)
    const draftResult = await runtime.kernel.invokeTool({
      toolName: "draft_topology_model",
      sessionID: "runtime-phase09-draft",
      args: extractParsed.draftInput,
    })
    const draftParsed = JSON.parse(draftResult)

    expect(promptCalls.length).toBeGreaterThanOrEqual(3)
    expect(promptCalls[1]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          tools: expect.objectContaining({
            query_external_solution_source: true,
          }),
        }),
      }),
    )
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

  test("invokes the device rack layout slice through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    const result = await runtime.kernel.invokeTool({
      toolName: "generate_device_rack_layout",
      sessionID: "runtime-device-rack-layout-session",
      args: createScn08HighReliabilityRackLayoutFixture(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.issues).toEqual([])
    expect(parsed.artifact.name).toBe("device-rack-layout.md")
    expect(parsed.artifact.content).toContain("SCN-08 High Reliability Rack Layout")
    expect(parsed.artifact.content).toContain("tor-pair-a")
  })

  test("invokes template import through the runtime kernel and roundtrips into draft_topology_model", async () => {
    const input = createTemplateImportRuntimeInput()
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: input.documentSources[0],
                markdown: "## 服务器带内带外连线\n\n| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |\n| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 某项目-管理域节点-B1H服务器-CS5280H3-A01 | E15 | 某项目-带内管理TOR-H3C S5560X-54C-EI-A11 |",
              },
              {
                sourceRef: input.documentSources[1],
                markdown: "## Sheet1\n\n| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | 7kw |\n| --- | --- | --- | --- | --- |\n| NaN | 1000 | 某项目-管理域节点-B1H服务器-CS5280H3-A01 | 17 | NaN |\n| NaN | 55 | 某项目-带内管理TOR-H3C S5560X-54C-EI-A11 | 42 | NaN |",
              },
              {
                sourceRef: input.documentSources[2],
                markdown: "## B1-H服务器\n\n| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 3 | 2端口GE电接口网卡 | 0 | 1G | 管理接入 | H3C S5560X-54C-EI | 千兆管理网络 | NaN |\n\n## 千兆带内管理TOR\n\n| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 1 | 48个GE接口 | 1-48 | 1G | 服务器 | 服务器 | 千兆管理网络 | NaN |",
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })
    const runtime = createCloudSolutionRuntime(process.cwd(), { client })

    const extractResult = JSON.parse(
      await runtime.kernel.invokeTool({
        toolName: "extract_structured_input_from_templates",
        sessionID: "runtime-template-import-session",
        args: input,
      }),
    )
    const draftResult = JSON.parse(
      await runtime.kernel.invokeTool({
        toolName: "draft_topology_model",
        sessionID: "runtime-template-import-session",
        args: extractResult.draftInput,
      }),
    )

    expect(extractResult.nextAction).toBe("draft_topology_model")
    expect(extractResult.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "业务POD-B1H服务器-CS5280H3-1",
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "0/0", portIndex: 0 }),
          ]),
        }),
      ]),
    )
    expect(draftResult.validationSummary.issues.map((issue: { code: string }) => issue.code)).not.toContain("duplicate_device_id")
  })

  test("rejects runtime rack-layout generation when planning input is missing", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "generate_device_rack_layout",
        sessionID: "runtime-device-rack-layout-missing-input",
        args: {
          requirement: {
            id: "req-runtime-rack-layout-missing-1",
            projectName: "Runtime Rack Layout Missing Input",
            scopeType: "data-center",
          },
        },
      }),
    ).rejects.toThrow("at least one planning input section")
  })

  test("rejects runtime rack-layout generation when blocking validation issues remain", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())
    const fixture = createScn08HighReliabilityRackLayoutFixture()
    fixture.devices.push({
      id: "device-storage-b",
      name: "storage-b",
      role: "storage",
      rackId: "rack-a",
      rackPosition: 20,
      rackUnitHeight: 4,
      powerWatts: 5000,
      sourceRefs: [],
      statusConfidence: "confirmed",
    })

    await expect(
      runtime.kernel.invokeTool({
        toolName: "generate_device_rack_layout",
        sessionID: "runtime-device-rack-layout-blocked",
        args: fixture,
      }),
    ).rejects.toThrow("Artifact generation is blocked by validation issues")
  })

  test("rejects runtime physical artifact generation when pending confirmation items remain", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "generate_device_cabling_table",
        sessionID: "runtime-device-cabling-pending-confirmation",
        args: {
          ...createPhysicalRuntimeInput(),
          pendingConfirmationItems: [createPendingConfirmationItem()],
        },
      }),
    ).rejects.toThrow("Artifact generation requires review before export")
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

  test("rejects runtime IP generation when blocking validation issues remain", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
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
      }),
    ).rejects.toThrow("Artifact generation is blocked by validation issues")
  })

  test("rejects runtime port-connection generation when blocking validation issues remain", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
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
      }),
    ).rejects.toThrow("Artifact generation is blocked by validation issues")
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
    expect(parsed.reviewSummary.reviewRequired).toBe(true)
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

  test("rejects low-confidence export_artifact_bundle attempts through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "export_artifact_bundle",
        sessionID: "runtime-scn07-low-confidence-export",
        args: createScn07GuardedExportFixture(),
      }),
    ).rejects.toThrow("requires confirmation for inferred or unresolved facts")
  })

  test("rejects runtime validation when documentAssist is present but empty", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "validate_solution_model",
        sessionID: "runtime-empty-document-assist",
        args: {
          requirement: createScn07GuardedExportFixture().requirement,
          documentAssist: {},
        },
      }),
    ).rejects.toThrow("at least one planning input section")
  })

  test("rejects incomplete export_artifact_bundle attempts through the runtime kernel", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    await expect(
      runtime.kernel.invokeTool({
        toolName: "export_artifact_bundle",
        sessionID: "runtime-scn07-incomplete-export",
        args: {
          ...createScn07GuardedExportFixture(),
          allocations: [],
        },
      }),
    ).rejects.toThrow("Artifact bundle export is blocked by validation issues")
  })

  test("blocks export_artifact_bundle through the runtime kernel when evidence reconciliation reports a worker-only conflict", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [
              {
                id: "runtime-bundle-worker-conflict",
                conflictType: "duplicate_allocation_ip",
                severity: "blocking",
                message: "Runtime worker-only blocking conflict.",
                entityRefs: ["allocation:allocation-server-a", "allocation:allocation-server-b"],
                sourceRefs: [
                  {
                    kind: "document",
                    ref: "runtime-worker-conflict.pdf",
                    note: "Runtime worker conflict",
                  },
                ],
                suggestedResolution: "Resolve before export.",
              },
            ],
            reconciliationWarnings: [],
          },
          recommendations: ["检测到以下证据冲突，请解决后再继续方案评审"],
        }),
      ],
    })
    const runtime = createCloudSolutionRuntime(process.cwd(), {
      worktree: process.cwd(),
      client,
    })

    const result = await runtime.kernel.invokeTool({
      toolName: "export_artifact_bundle",
      sessionID: "runtime-bundle-worker-conflict-session",
      args: createBundleRuntimeInput(),
    })
    const parsed = JSON.parse(result)

    expect(parsed.workflowState).toBe("blocked")
    expect(parsed.exportReady).toBeUndefined()
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
          parentID: "runtime-workflow-session",
          title: "Requirements Clarification",
        }),
      }),
    )
    expect(createCalls[1]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "runtime-workflow-session",
          title: "Evidence Reconciliation",
        }),
      }),
    )
    expect(createCalls[2]).toEqual(
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
