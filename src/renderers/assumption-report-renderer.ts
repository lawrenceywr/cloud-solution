import type { DesignReviewItemRow, GeneratedArtifact } from "../domain"

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\r?\n+/g, " <br> ")
    .replace(/\|/g, "\\|")
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

export function renderAssumptionReport(args: {
  projectName: string
  reviewRequired: boolean
  assumptions: DesignReviewItemRow[]
  gaps: DesignReviewItemRow[]
  unresolvedItems: DesignReviewItemRow[]
}): GeneratedArtifact {
  const {
    projectName,
    reviewRequired,
    assumptions,
    gaps,
    unresolvedItems,
  } = args

  const content = [
    "# Design Assumptions and Gaps",
    "",
    `Project: ${projectName}`,
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
  ].join("\n")

  return {
    name: "design-assumptions-and-gaps.md",
    mimeType: "text/markdown",
    content,
  }
}
