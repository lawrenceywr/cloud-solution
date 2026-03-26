import type {
  CloudSolutionSliceInput,
  GeneratedArtifact,
  IpAllocationTableRow,
  ValidationIssue,
} from "../../domain"
import { IpAllocationTableRowSchema } from "../../domain"
import { hasBlockingIssues } from "../../validators"

function buildRows(input: CloudSolutionSliceInput): IpAllocationTableRow[] {
  const segmentMap = new Map(input.segments.map((segment) => [segment.id, segment]))

  return input.allocations
    .slice()
    .sort((left, right) => {
      const segmentDelta = left.segmentId.localeCompare(right.segmentId)
      if (segmentDelta !== 0) {
        return segmentDelta
      }

      const ipDelta = left.ipAddress.localeCompare(right.ipAddress)
      if (ipDelta !== 0) {
        return ipDelta
      }

      return left.id.localeCompare(right.id)
    })
    .map((allocation) => {
      const segment = segmentMap.get(allocation.segmentId)
      if (!segment || !segment.cidr) {
        throw new Error(`Cannot build IP allocation row for ${allocation.id}`)
      }

      const consumerRef = [
        allocation.deviceId,
        allocation.hostname,
        allocation.interfaceName,
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" / ")

      return IpAllocationTableRowSchema.parse({
        allocationId: allocation.id,
        segmentId: segment.id,
        segmentName: segment.name,
        segmentCidr: segment.cidr,
        allocationType: allocation.allocationType,
        ipAddress: allocation.ipAddress,
        consumerRef: consumerRef || undefined,
        gateway: segment.gateway,
        purpose: allocation.purpose ?? segment.purpose,
      })
    })
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

function buildRowTable(rows: IpAllocationTableRow[]): string {
  const lines = [
    "| Allocation ID | Segment | CIDR | Type | IP Address | Consumer | Gateway | Purpose |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const row of rows) {
    lines.push(
      `| ${row.allocationId} | ${row.segmentName} (${row.segmentId}) | ${row.segmentCidr} | ${row.allocationType} | ${row.ipAddress} | ${row.consumerRef ?? "-"} | ${row.gateway ?? "-"} | ${row.purpose ?? "-"} |`,
    )
  }

  return lines.join("\n")
}

export function buildIpAllocationTableArtifact(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): GeneratedArtifact {
  const { input, issues } = args
  const blocked = hasBlockingIssues(issues)

  const sections = [
    "# IP Allocation Table",
    "",
    `Project: ${input.requirement.projectName}`,
    `Status: ${blocked ? "blocked" : "ready"}`,
    `Segment count: ${input.segments.length}`,
    `Device count: ${input.devices.length}`,
    `Issue count: ${issues.length}`,
  ]

  if (blocked) {
    sections.push("", "## Blocking Conditions", buildIssueTable(issues))
  } else {
    const rows = buildRows(input)
    sections.push("", "## Allocation Rows", buildRowTable(rows))
  }

  return {
    name: "ip-allocation-table.md",
    mimeType: "text/markdown",
    content: sections.join("\n"),
  }
}
