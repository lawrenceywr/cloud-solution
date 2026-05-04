import type {
  CloudSolutionSliceInput,
  DevicePortPlanRow,
  GeneratedArtifact,
  ValidationIssue,
} from "../../domain"
import { DevicePortPlanRowSchema } from "../../domain"
import { hasBlockingIssues } from "../../validators"

type ResolvedPortContext = {
  rackId: string
  rackName: string
  rackPosition: number
  rackUnitHeight: number
  deviceId: string
  deviceName: string
  portId: string
  portName: string
  portPurpose?: string
  portType?: CloudSolutionSliceInput["ports"][number]["portType"]
  portIndex?: number
}

type PortConnection = {
  linkId: string
  peerPortId: string
  redundancyGroup?: string
}

function buildIssueTable(issues: ValidationIssue[]): string {
  const lines = [
    "| Severity | Code | Message | Entities |",
    "| --- | --- | --- | --- |",
  ]

  for (const issue of issues) {
    lines.push(
      `| ${issue.severity} | ${issue.code} | ${issue.message} | ${issue.entityRefs.join(", ") || "-"} |`,
    )
  }

  return lines.join("\n")
}

function resolveMaps(input: CloudSolutionSliceInput) {
  return {
    rackMap: new Map(input.racks.map((rack) => [rack.id, rack])),
    deviceMap: new Map(input.devices.map((device) => [device.id, device])),
    portMap: new Map(input.ports.map((port) => [port.id, port])),
  }
}

function buildConnectionMap(input: CloudSolutionSliceInput) {
  const connectionMap = new Map<string, PortConnection[]>()

  for (const link of input.links) {
    const endpointAConnections = connectionMap.get(link.endpointA.portId) ?? []
    endpointAConnections.push({
      linkId: link.id,
      peerPortId: link.endpointB.portId,
      redundancyGroup: link.redundancyGroup,
    })
    connectionMap.set(link.endpointA.portId, endpointAConnections)

    const endpointBConnections = connectionMap.get(link.endpointB.portId) ?? []
    endpointBConnections.push({
      linkId: link.id,
      peerPortId: link.endpointA.portId,
      redundancyGroup: link.redundancyGroup,
    })
    connectionMap.set(link.endpointB.portId, endpointBConnections)
  }

  return connectionMap
}

function buildServerLacpGroups(input: CloudSolutionSliceInput): Map<string, string> {
  const deviceMap = new Map(input.devices.map((device) => [device.id, device]))
  const portMap = new Map(input.ports.map((port) => [port.id, port]))
  const groupCountsByServer = new Map<string, Map<string, number>>()

  for (const link of input.links) {
    if (!link.redundancyGroup) {
      continue
    }

    const endpointAPort = portMap.get(link.endpointA.portId)
    const endpointBPort = portMap.get(link.endpointB.portId)
    const endpointADevice = endpointAPort ? deviceMap.get(endpointAPort.deviceId) : undefined
    const endpointBDevice = endpointBPort ? deviceMap.get(endpointBPort.deviceId) : undefined
    const serverDevice = endpointADevice?.role === "server"
      ? endpointADevice
      : endpointBDevice?.role === "server"
        ? endpointBDevice
        : undefined

    if (!serverDevice || serverDevice.redundancyIntent === "single-homed") {
      continue
    }

    const groupCounts = groupCountsByServer.get(serverDevice.id) ?? new Map<string, number>()
    groupCounts.set(link.redundancyGroup, (groupCounts.get(link.redundancyGroup) ?? 0) + 1)
    groupCountsByServer.set(serverDevice.id, groupCounts)
  }

  const lacpGroups = new Map<string, string>()
  for (const [serverDeviceId, groupCounts] of groupCountsByServer.entries()) {
    for (const [redundancyGroup, count] of groupCounts.entries()) {
      if (count > 1) {
        lacpGroups.set(`${serverDeviceId}:${redundancyGroup}`, "bond mode4 / LACP")
      }
    }
  }

  return lacpGroups
}

function resolvePortContext(args: {
  portId: string
  rackMap: Map<string, CloudSolutionSliceInput["racks"][number]>
  deviceMap: Map<string, CloudSolutionSliceInput["devices"][number]>
  portMap: Map<string, CloudSolutionSliceInput["ports"][number]>
}): ResolvedPortContext {
  const { portId, rackMap, deviceMap, portMap } = args
  const port = portMap.get(portId)
  if (!port) {
    throw new Error(`Cannot build device port plan row for missing port: ${portId}`)
  }

  const device = deviceMap.get(port.deviceId)
  if (!device) {
    throw new Error(`Cannot build device port plan row for missing device: ${port.deviceId}`)
  }

  if (!device.rackId) {
    throw new Error(`Cannot build device port plan row for unplaced device: ${device.id}`)
  }

  const rack = rackMap.get(device.rackId)
  if (!rack) {
    throw new Error(`Cannot build device port plan row for missing rack: ${device.rackId}`)
  }

  if (typeof device.rackPosition !== "number") {
    throw new Error(`Cannot build device port plan row for missing rack position: ${device.id}`)
  }

  if (typeof device.rackUnitHeight !== "number") {
    throw new Error(`Cannot build device port plan row for missing rack unit height: ${device.id}`)
  }

  return {
    rackId: rack.id,
    rackName: rack.name,
    rackPosition: device.rackPosition,
    rackUnitHeight: device.rackUnitHeight,
    deviceId: device.id,
    deviceName: device.name,
    portId: port.id,
    portName: port.name,
    portPurpose: port.purpose,
    portType: port.portType,
    portIndex: port.portIndex,
  }
}

function comparePortContexts(left: ResolvedPortContext, right: ResolvedPortContext): number {
  const rackNameDelta = left.rackName.localeCompare(right.rackName)
  if (rackNameDelta !== 0) {
    return rackNameDelta
  }

  const rackPositionDelta = left.rackPosition - right.rackPosition
  if (rackPositionDelta !== 0) {
    return rackPositionDelta
  }

  const deviceNameDelta = left.deviceName.localeCompare(right.deviceName)
  if (deviceNameDelta !== 0) {
    return deviceNameDelta
  }

  const portNameDelta = left.portName.localeCompare(right.portName)
  if (portNameDelta !== 0) {
    return portNameDelta
  }

  return left.portId.localeCompare(right.portId)
}

function formatPeerRef(args: {
  peerPortId: string
  rackMap: Map<string, CloudSolutionSliceInput["racks"][number]>
  deviceMap: Map<string, CloudSolutionSliceInput["devices"][number]>
  portMap: Map<string, CloudSolutionSliceInput["ports"][number]>
}): string {
  const { peerPortId, rackMap, deviceMap, portMap } = args
  const peerContext = resolvePortContext({
    portId: peerPortId,
    rackMap,
    deviceMap,
    portMap,
  })

  return `${peerContext.deviceName} (${peerContext.deviceId}) / ${peerContext.portName} (${peerContext.portId})`
}

function buildRows(input: CloudSolutionSliceInput): DevicePortPlanRow[] {
  const { rackMap, deviceMap, portMap } = resolveMaps(input)
  const connectionMap = buildConnectionMap(input)
  const serverLacpGroups = buildServerLacpGroups(input)
  const resolvedPorts = input.ports
    .map((port) => resolvePortContext({
      portId: port.id,
      rackMap,
      deviceMap,
      portMap,
    }))
    .sort(comparePortContexts)

  return resolvedPorts.map((resolvedPort) => {
    const connections = (connectionMap.get(resolvedPort.portId) ?? [])
      .slice()
      .sort((left, right) => left.linkId.localeCompare(right.linkId))

    const connectionRefs = connections.map((connection) => connection.linkId).join(", ")
    const redundancyGroups = [...new Set(
      connections
        .map((connection) => connection.redundancyGroup)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    )]
      .map((redundancyGroup) => {
        const lacpIntent = serverLacpGroups.get(`${resolvedPort.deviceId}:${redundancyGroup}`)
        return lacpIntent ? `${redundancyGroup} (${lacpIntent})` : redundancyGroup
      })
      .join(", ")
    const peerRefs = connections
      .map((connection) =>
        formatPeerRef({
          peerPortId: connection.peerPortId,
          rackMap,
          deviceMap,
          portMap,
        }),
      )
      .join("; ")

    return DevicePortPlanRowSchema.parse({
      rackName: resolvedPort.rackName,
      rackId: resolvedPort.rackId,
      rackPosition: resolvedPort.rackPosition,
      rackUnitHeight: resolvedPort.rackUnitHeight,
      deviceName: resolvedPort.deviceName,
      deviceId: resolvedPort.deviceId,
      portName: resolvedPort.portName,
      portId: resolvedPort.portId,
      portPurpose: resolvedPort.portPurpose,
      portType: resolvedPort.portType,
      portIndex: resolvedPort.portIndex,
      connectionRefs: connectionRefs || undefined,
      peerRefs: peerRefs || undefined,
      redundancyGroups: redundancyGroups || undefined,
    })
  })
}

function buildRowTable(rows: DevicePortPlanRow[]): string {
  const lines = [
    "| Rack | Rack Units | Device | Port | Purpose | Port Type | Port Index | Connections | Peer Endpoints | Redundancy Groups |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const row of rows) {
    lines.push(
      `| ${row.rackName} (${row.rackId}) | U${row.rackPosition} (${row.rackUnitHeight}U) | ${row.deviceName} (${row.deviceId}) | ${row.portName} (${row.portId}) | ${row.portPurpose ?? "-"} | ${row.portType ?? "-"} | ${row.portIndex ?? "-"} | ${row.connectionRefs ?? "-"} | ${row.peerRefs ?? "-"} | ${row.redundancyGroups ?? "-"} |`,
    )
  }

  return lines.join("\n")
}

export function buildDevicePortPlanArtifact(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): GeneratedArtifact {
  const { input, issues } = args
  const blocked = hasBlockingIssues(issues)

  const sections = [
    "# Device Port Plan",
    "",
    `Project: ${input.requirement.projectName}`,
    `Status: ${blocked ? "blocked" : "ready"}`,
    `Rack count: ${input.racks.length}`,
    `Device count: ${input.devices.length}`,
    `Port count: ${input.ports.length}`,
    `Issue count: ${issues.length}`,
  ]

  if (blocked) {
    sections.push("", "## Blocking Conditions", buildIssueTable(issues))
  } else {
    const rows = buildRows(input)
    sections.push("", "## Port Plan Rows", buildRowTable(rows))
  }

  return {
    name: "device-port-plan.md",
    mimeType: "text/markdown",
    content: sections.join("\n"),
  }
}
