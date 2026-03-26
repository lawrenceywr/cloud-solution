import { describe, expect, test } from "bun:test"

import { loadPluginConfig } from "./plugin-config"
import { createManagers } from "./create-managers"
import { createTools } from "./create-tools"

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
      { sessionID: "tool-test-session" },
    )
    const parsed = JSON.parse(response)

    expect(parsed.pluginName).toBe("cloud-solution")
    expect(parsed.supportedArtifacts).toContain("ip-allocation-table")
    expect(parsed.exampleRequirement.scopeType).toBe("data-center")
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
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
      { sessionID: "tool-test-session" },
    )
    const parsed = JSON.parse(response)

    expect(parsed.reviewRequired).toBe(true)
    expect(parsed.assumptionCount).toBe(1)
    expect(parsed.unresolvedItemCount).toBe(1)
    expect(parsed.artifact.name).toBe("design-assumptions-and-gaps.md")
    expect(parsed.artifact.content).toContain("## Assumptions")
    expect(parsed.artifact.content).toContain("device-switch-a")
  })
})
