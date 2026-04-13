import type { Conflict, GeneratedArtifact } from "../domain"

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\r?\n+/g, " <br> ")
    .replace(/\|/g, "\\|")
}

function renderConflictRow(conflict: Conflict): string {
  const sourceRefs = conflict.sourceRefs.length > 0
    ? conflict.sourceRefs.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}`).join(", ")
    : "-"

  const entityRefs = conflict.entityRefs.join(", ") || "-"

  return [
    `| ${escapeMarkdownTableCell(conflict.id)} | ${escapeMarkdownTableCell(conflict.conflictType)} | ${escapeMarkdownTableCell(conflict.severity)} | ${escapeMarkdownTableCell(conflict.message)} | ${escapeMarkdownTableCell(entityRefs)} | ${escapeMarkdownTableCell(sourceRefs)} | ${escapeMarkdownTableCell(conflict.suggestedResolution ?? "-")} |`,
  ].join("\n")
}

function buildConflictsTable(conflicts: Conflict[]): string {
  if (conflicts.length === 0) {
    return "No conflicts detected."
  }

  const lines = [
    "| ID | Type | Severity | Message | Entity References | Source References | Suggested Resolution |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const conflict of conflicts) {
    lines.push(renderConflictRow(conflict))
  }

  return lines.join("\n")
}

export function renderConflictReport(args: {
  projectName: string
  conflicts: Conflict[]
  blockingConflictCount: number
  warningConflictCount: number
}): GeneratedArtifact {
  const {
    projectName,
    conflicts,
    blockingConflictCount,
    warningConflictCount,
  } = args

  const blockingConflicts = conflicts.filter(c => c.severity === "blocking")
  const warningConflicts = conflicts.filter(c => c.severity === "warning")

  const content = [
    "# Conflict Report",
    "",
    `Project: ${projectName}`,
    `Total Conflicts: ${conflicts.length}`,
    `Blocking Conflicts: ${blockingConflictCount}`,
    `Warning Conflicts: ${warningConflictCount}`,
    "",
    "## Summary",
    "",
    blockingConflictCount > 0
      ? `⚠️ **${blockingConflictCount} blocking conflict(s) must be resolved before proceeding with artifact export.**`
      : "✅ No blocking conflicts detected.",
    "",
    "## Blocking Conflicts",
    "",
    blockingConflicts.length > 0
      ? buildConflictsTable(blockingConflicts)
      : "None",
    "",
    "## Warning Conflicts",
    "",
    warningConflicts.length > 0
      ? buildConflictsTable(warningConflicts)
      : "None",
    "",
    "## All Conflicts",
    "",
    buildConflictsTable(conflicts),
  ].join("\n")

  return {
    name: "conflict-report.md",
    mimeType: "text/markdown",
    content,
  }
}
