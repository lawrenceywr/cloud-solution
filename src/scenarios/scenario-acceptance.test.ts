import { describe, expect, test } from "bun:test"

import { createCloudSolutionRuntime } from "../index"
import {
  createScn01SingleRackConnectivityFixture,
  createScn02DualTorFixture,
  createScn03MultiRackPodFixture,
} from "./fixtures"

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
    expect(cabling.artifact.content).toContain("link-storage-a-primary")
    expect(cabling.artifact.content).toContain("storage-a-dual-home")
    expect(portPlan.artifact.content).toContain("storage-a-dual-home")
    expect(ipAllocation.artifact.content).toContain("172.16.0.10")
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
    expect(cabling.artifact.content).toContain("rack-a (rack-a)")
    expect(cabling.artifact.content).toContain("rack-b (rack-b)")
    expect(portConnection.artifact.content).toContain("rack-a")
    expect(portConnection.artifact.content).toContain("rack-b")
    expect(ipAllocation.artifact.content).toContain("10.31.0.11")
  })
})
