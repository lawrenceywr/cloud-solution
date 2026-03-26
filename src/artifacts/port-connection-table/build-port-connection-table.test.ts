import { describe, expect, test } from "bun:test"

import type { CloudSolutionSliceInput, ValidationIssue } from "../../domain"
import { buildPortConnectionTableArtifact } from "./build-port-connection-table"

function createBaseSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-port-1",
      projectName: "Port Connection Example",
      scopeType: "data-center",
      artifactRequests: ["device-port-connection-table"],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    devices: [
      {
        id: "device-a",
        name: "switch-a",
        role: "switch",
        rackId: "rack-a",
        rackPosition: 1,
        rackUnitHeight: 1,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "device-b",
        name: "server-b",
        role: "server",
        rackId: "rack-a",
        rackPosition: 10,
        rackUnitHeight: 2,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    racks: [
      {
        id: "rack-a",
        name: "rack-a",
        uHeight: 42,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    ports: [
      {
        id: "port-a",
        deviceId: "device-a",
        name: "eth0",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "port-b",
        deviceId: "device-b",
        name: "eth1",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    links: [
      {
        id: "link-a",
        endpointA: { portId: "port-b" },
        endpointB: { portId: "port-a" },
        purpose: "uplink",
        redundancyGroup: "server-b-single-rack",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    segments: [],
    allocations: [],
  }
}

describe("buildPortConnectionTableArtifact", () => {
  test("builds a ready markdown table from explicit port links", () => {
    const artifact = buildPortConnectionTableArtifact({
      input: createBaseSliceInput(),
      issues: [],
    })

    expect(artifact.name).toBe("port-connection-table.md")
    expect(artifact.content).toContain("Status: ready")
    expect(artifact.content).toContain("| Link ID | Endpoint A Rack | Endpoint A Device | Endpoint A Port | Endpoint B Rack | Endpoint B Device | Endpoint B Port | Purpose | Redundancy Group |")
    expect(artifact.content).toContain("rack-a (rack-a) U1")
    expect(artifact.content).toContain("switch-a (device-a)")
    expect(artifact.content).toContain("server-b (device-b)")
    expect(artifact.content).toContain("server-b-single-rack")
  })

  test("builds a blocked summary when blocking issues exist", () => {
    const issues: ValidationIssue[] = [
      {
        id: "link_port_missing:link:link-a:links[].endpointB.portId",
        severity: "blocking",
        code: "link_port_missing",
        message: "Link link-a references a missing port on endpointB: port-missing.",
        subjectType: "link",
        subjectId: "link-a",
        path: "links[].endpointB.portId",
        entityRefs: ["link:link-a", "port:port-missing"],
        blocking: true,
      },
    ]

    const artifact = buildPortConnectionTableArtifact({
      input: createBaseSliceInput(),
      issues,
    })

    expect(artifact.content).toContain("Status: blocked")
    expect(artifact.content).toContain("## Blocking Conditions")
    expect(artifact.content).toContain("link_port_missing")
  })
})
