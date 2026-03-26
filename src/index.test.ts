import { describe, expect, test } from "bun:test"

import { createCloudSolutionRuntime } from "./index"

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

describe("createCloudSolutionRuntime", () => {
  test("assembles the thin plugin flow and invokes the scaffold tool", async () => {
    const runtime = createCloudSolutionRuntime(process.cwd())

    expect(runtime.pluginConfig.plugin_name).toBe("cloud-solution")
    expect(Object.keys(runtime.tools)).toContain("describe_cloud_solution")
    expect(runtime.pluginInterface.tool).toBe(runtime.tools)

    const result = await runtime.kernel.invokeTool({
      toolName: "describe_cloud_solution",
      sessionID: "runtime-session",
    })
    const parsed = JSON.parse(result)

    expect(parsed.trustBoundary).toContain("canonical-domain-model")
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

    expect(parsed.reviewRequired).toBe(true)
    expect(parsed.assumptions).toHaveLength(1)
    expect(parsed.artifact.name).toBe("design-assumptions-and-gaps.md")
    expect(parsed.artifact.content).toContain("Design Assumptions and Gaps")
    expect(parsed.artifact.content).toContain("device-switch-a")
  })
})
