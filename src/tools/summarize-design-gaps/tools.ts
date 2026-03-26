import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type {
  CloudSolutionSliceInput,
  ConfidenceState,
  DesignReviewItemRow,
  SourceReference,
  ValidationIssue,
  ValidationIssueSubjectType,
} from "../../domain"
import { renderAssumptionReport } from "../../renderers"
import { normalizeSolutionToolInput } from "../../normalizers"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"
import { hasBlockingIssues, validateCloudSolutionModel } from "../../validators"

type ReviewSubject = {
  subjectType: ValidationIssueSubjectType
  subjectId: string
  statusConfidence: ConfidenceState
  sourceRefs: SourceReference[]
}

function compareRows(left: DesignReviewItemRow, right: DesignReviewItemRow): number {
  const kindDelta = left.kind.localeCompare(right.kind)
  if (kindDelta !== 0) {
    return kindDelta
  }

  const severityDelta = left.severity.localeCompare(right.severity)
  if (severityDelta !== 0) {
    return severityDelta
  }

  const subjectTypeDelta = left.subjectType.localeCompare(right.subjectType)
  if (subjectTypeDelta !== 0) {
    return subjectTypeDelta
  }

  const subjectIdDelta = left.subjectId.localeCompare(right.subjectId)
  if (subjectIdDelta !== 0) {
    return subjectIdDelta
  }

  return left.title.localeCompare(right.title)
}

function buildIssueRows(issues: ValidationIssue[]) {
  const gaps: DesignReviewItemRow[] = []
  const unresolvedItems: DesignReviewItemRow[] = []

  for (const issue of issues) {
    const row: DesignReviewItemRow = {
      kind: issue.severity === "blocking" ? "gap" : "unresolved-item",
      severity: issue.severity,
      subjectType: issue.subjectType,
      subjectId: issue.subjectId,
      title: issue.code,
      detail: issue.message,
      entityRefs: issue.entityRefs,
      sourceRefs: [],
    }

    if (issue.severity === "blocking") {
      gaps.push(row)
    } else {
      unresolvedItems.push(row)
    }
  }

  return {
    gaps: gaps.sort(compareRows),
    unresolvedItems: unresolvedItems.sort(compareRows),
  }
}

function collectReviewSubjects(input: CloudSolutionSliceInput): ReviewSubject[] {
  return [
    {
      subjectType: "requirement",
      subjectId: input.requirement.id,
      statusConfidence: input.requirement.statusConfidence,
      sourceRefs: input.requirement.sourceRefs,
    },
    ...input.devices.map((device) => ({
      subjectType: "device" as const,
      subjectId: device.id,
      statusConfidence: device.statusConfidence,
      sourceRefs: device.sourceRefs,
    })),
    ...input.racks.map((rack) => ({
      subjectType: "rack" as const,
      subjectId: rack.id,
      statusConfidence: rack.statusConfidence,
      sourceRefs: rack.sourceRefs,
    })),
    ...input.ports.map((port) => ({
      subjectType: "port" as const,
      subjectId: port.id,
      statusConfidence: port.statusConfidence,
      sourceRefs: port.sourceRefs,
    })),
    ...input.links.map((link) => ({
      subjectType: "link" as const,
      subjectId: link.id,
      statusConfidence: link.statusConfidence,
      sourceRefs: link.sourceRefs,
    })),
    ...input.segments.map((segment) => ({
      subjectType: "segment" as const,
      subjectId: segment.id,
      statusConfidence: segment.statusConfidence,
      sourceRefs: segment.sourceRefs,
    })),
    ...input.allocations.map((allocation) => ({
      subjectType: "allocation" as const,
      subjectId: allocation.id,
      statusConfidence: allocation.statusConfidence,
      sourceRefs: allocation.sourceRefs,
    })),
  ]
}

function buildAssumptionRows(input: CloudSolutionSliceInput) {
  return collectReviewSubjects(input)
    .flatMap((subject): DesignReviewItemRow[] => {
      if (subject.statusConfidence === "confirmed") {
        return []
      }

      return [{
        kind: subject.statusConfidence === "inferred" ? "assumption" : "unresolved-item",
        severity: subject.statusConfidence === "inferred" ? "warning" : "informational",
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        title: subject.statusConfidence === "inferred"
          ? "inferred fact requires review"
          : "unresolved fact requires clarification",
        detail: `${subject.subjectType} ${subject.subjectId} is marked ${subject.statusConfidence}.`,
        confidenceState: subject.statusConfidence,
        entityRefs: [`${subject.subjectType}:${subject.subjectId}`],
        sourceRefs: subject.sourceRefs,
      }]
    })
    .sort(compareRows)
}

export function createSummarizeDesignGapsTools(): Record<string, ToolDefinition> {
  const summarize_design_gaps: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and return a deterministic assumptions, gaps, and unresolved-items summary for review.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const sliceInput = normalizeSolutionToolInput(inputArgs)
      const issues = validateCloudSolutionModel(sliceInput)
      const assumptions = buildAssumptionRows(sliceInput).filter((row) => row.kind === "assumption")
      const issueRows = buildIssueRows(issues)
      const unresolvedItems = [
        ...issueRows.unresolvedItems,
        ...buildAssumptionRows(sliceInput).filter((row) => row.kind === "unresolved-item"),
      ].sort(compareRows)
      const artifact = renderAssumptionReport({
        projectName: sliceInput.requirement.projectName,
        reviewRequired: hasBlockingIssues(issues) || assumptions.length > 0 || unresolvedItems.length > 0,
        assumptions,
        gaps: issueRows.gaps,
        unresolvedItems,
      })

      return JSON.stringify(
        {
          reviewRequired:
            hasBlockingIssues(issues) || assumptions.length > 0 || unresolvedItems.length > 0,
          blockingGapCount: issueRows.gaps.length,
          assumptionCount: assumptions.length,
          unresolvedItemCount: unresolvedItems.length,
          assumptions,
          gaps: issueRows.gaps,
          unresolvedItems,
          artifact,
        },
        null,
        2,
      )
    },
  })

  return { summarize_design_gaps }
}
