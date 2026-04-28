import type {
  ConfirmationPacket,
  DesignReviewItemRow,
  GeneratedArtifact,
} from "../domain"

function escapeMarkdownText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n+/g, " <br> ")
    .replace(/\|/g, "\\|")
}

function escapeMarkdownTableCell(value: string): string {
  return escapeMarkdownText(value)
}

function buildRowTable(rows: DesignReviewItemRow[]): string {
  const lines = [
    "| Kind | Severity | Subject | Title | Detail | Confidence | Sources |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const row of rows) {
    const sourceRefs = row.sourceRefs.length > 0
      ? row.sourceRefs.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}`).join(", ")
      : "-"

    lines.push(
      `| ${escapeMarkdownTableCell(row.kind)} | ${escapeMarkdownTableCell(row.severity)} | ${escapeMarkdownTableCell(`${row.subjectType}:${row.subjectId}`)} | ${escapeMarkdownTableCell(row.title)} | ${escapeMarkdownTableCell(row.detail)} | ${escapeMarkdownTableCell(row.confidenceState ?? "-")} | ${escapeMarkdownTableCell(sourceRefs)} |`,
    )
  }

  return lines.join("\n")
}

function buildSection(args: {
  heading: string
  rows: DesignReviewItemRow[]
  emptyLabel: string
}) {
  const { heading, rows, emptyLabel } = args

  return [
    `## ${heading}`,
    rows.length > 0 ? buildRowTable(rows) : emptyLabel,
  ].join("\n")
}

function formatPacketEndpoints(packet: ConfirmationPacket): string {
  if (!packet.endpoints?.endpointA && !packet.endpoints?.endpointB) {
    return "-"
  }

  const endpointA = packet.endpoints.endpointA
    ? `${packet.endpoints.endpointA.deviceName}:${packet.endpoints.endpointA.portName}`
    : "-"
  const endpointB = packet.endpoints.endpointB
    ? `${packet.endpoints.endpointB.deviceName}:${packet.endpoints.endpointB.portName}`
    : "-"

  return `${endpointA} ↔ ${endpointB}`
}

function formatPacketRefs(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "-"
}

function formatPacketSources(packet: ConfirmationPacket): string {
  return packet.sourceRefs.length > 0
    ? packet.sourceRefs.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}`).join(", ")
    : "-"
}

function buildConfirmationPacketSection(confirmationPackets: ConfirmationPacket[]): string {
  if (confirmationPackets.length === 0) {
    return ""
  }

  const packetSections = confirmationPackets.map((packet, index) => [
    `### ${index + 1}. ${escapeMarkdownText(packet.title)}`,
    `- Kind: ${escapeMarkdownText(packet.kind)}`,
    `- Severity: ${escapeMarkdownText(packet.severity)}`,
    `- Subject: ${escapeMarkdownText(`${packet.subjectType}:${packet.subjectId}`)}`,
    `- Required Decision: ${escapeMarkdownText(packet.requiredDecision)}`,
    `- Current Ambiguity: ${escapeMarkdownText(packet.currentAmbiguity)}`,
    `- Suggested Action: ${escapeMarkdownText(packet.suggestedAction ?? "-")}`,
    `- Endpoints: ${escapeMarkdownText(formatPacketEndpoints(packet))}`,
    `- Entity Refs: ${escapeMarkdownText(formatPacketRefs(packet.entityRefs))}`,
    `- Source Refs: ${escapeMarkdownText(formatPacketSources(packet))}`,
  ].join("\n"))

  return ["## Confirmation Packets", ...packetSections].join("\n\n")
}

export function renderAssumptionReport(args: {
  projectName: string
  reviewRequired: boolean
  assumptions: DesignReviewItemRow[]
  gaps: DesignReviewItemRow[]
  unresolvedItems: DesignReviewItemRow[]
  confirmationPackets: ConfirmationPacket[]
}): GeneratedArtifact {
  const {
    projectName,
    reviewRequired,
    assumptions,
    gaps,
    unresolvedItems,
    confirmationPackets,
  } = args

  const content = [
    "# Design Assumptions and Gaps",
    "",
    `Project: ${escapeMarkdownText(projectName)}`,
    `Review Required: ${reviewRequired ? "yes" : "no"}`,
    `Assumption Count: ${assumptions.length}`,
    `Gap Count: ${gaps.length}`,
    `Unresolved Item Count: ${unresolvedItems.length}`,
    "",
    buildSection({
      heading: "Assumptions",
      rows: assumptions,
      emptyLabel: "No assumptions were derived from the current validated model.",
    }),
    "",
    buildSection({
      heading: "Blocking Gaps",
      rows: gaps,
      emptyLabel: "No blocking gaps were found.",
    }),
    "",
    buildSection({
      heading: "Unresolved Review Items",
      rows: unresolvedItems,
      emptyLabel: "No unresolved review items were found.",
    }),
    ...(confirmationPackets.length > 0
      ? ["", buildConfirmationPacketSection(confirmationPackets)]
      : []),
  ].join("\n")

  return {
    name: "design-assumptions-and-gaps.md",
    mimeType: "text/markdown",
    content,
  }
}
