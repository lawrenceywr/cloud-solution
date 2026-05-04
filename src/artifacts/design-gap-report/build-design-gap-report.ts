import type {
  CloudSolutionSliceInput,
  ConfidenceState,
  Conflict,
  DesignGapSummary,
  PendingConfirmationItem,
  DesignReviewItemRow,
  SourceReference,
  ValidationIssue,
  ValidationIssueSubjectType,
} from "../../domain"
import { DesignGapSummarySchema } from "../../domain"
import { renderAssumptionReport, renderConflictReport } from "../../renderers"
import {
  buildConfirmationPackets,
  buildIssueConfirmationPackets,
} from "./build-confirmation-packets"

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

function buildIssueRows(args: {
  issues: ValidationIssue[]
  relevantSubjectTypes?: Set<ValidationIssueSubjectType>
}) {
  const { issues, relevantSubjectTypes } = args
  const gaps: DesignReviewItemRow[] = []
  const unresolvedItems: DesignReviewItemRow[] = []

  for (const issue of issues) {
    if (relevantSubjectTypes && !relevantSubjectTypes.has(issue.subjectType)) {
      continue
    }

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

function buildPendingConfirmationRows(items: PendingConfirmationItem[]) {
  const confirmationPackets = buildConfirmationPackets(items)

  return {
    confirmationPackets,
    unresolvedItems: confirmationPackets
      .map((item): DesignReviewItemRow => ({
      kind: "unresolved-item",
      severity: item.severity,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      title: item.title,
      detail: item.currentAmbiguity,
      confidenceState: "unresolved",
      entityRefs: item.entityRefs,
      sourceRefs: item.sourceRefs,
    }))
      .sort(compareRows),
  }
}

export function buildDesignGapReport(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
  relevantSubjectTypes?: ValidationIssueSubjectType[]
  conflicts?: Conflict[]
  pendingConfirmationItems?: PendingConfirmationItem[]
}): DesignGapSummary {
  const {
    input,
    issues,
    relevantSubjectTypes,
    conflicts = [],
    pendingConfirmationItems = [],
  } = args
  const relevantSubjectTypeSet = relevantSubjectTypes
    ? new Set(relevantSubjectTypes)
    : undefined
  const pendingConfirmationRows = buildPendingConfirmationRows(pendingConfirmationItems)
  const assumptions = buildAssumptionRows(input).filter((row) => row.kind === "assumption")
    .filter((row) => !relevantSubjectTypeSet || relevantSubjectTypeSet.has(row.subjectType))
  const issueRows = buildIssueRows({
    issues,
    relevantSubjectTypes: relevantSubjectTypeSet,
  })
  const unresolvedItems = [
    ...issueRows.unresolvedItems,
    ...buildAssumptionRows(input)
      .filter((row) => row.kind === "unresolved-item")
      .filter((row) => !relevantSubjectTypeSet || relevantSubjectTypeSet.has(row.subjectType)),
    ...pendingConfirmationRows.unresolvedItems
      .filter((row) => !relevantSubjectTypeSet || relevantSubjectTypeSet.has(row.subjectType)),
  ].sort(compareRows)
  const relevantIssues = issues.filter((issue) => !relevantSubjectTypeSet || relevantSubjectTypeSet.has(issue.subjectType))
  const issueConfirmationPackets = buildIssueConfirmationPackets({
    input,
    issues: relevantIssues,
  })
  const confirmationPackets = [
    ...pendingConfirmationRows.confirmationPackets,
    ...issueConfirmationPackets,
  ].filter((item) => !relevantSubjectTypeSet || relevantSubjectTypeSet.has(item.subjectType))
  const reviewRequired =
    issueRows.gaps.length > 0 || assumptions.length > 0 || unresolvedItems.length > 0 || conflicts.length > 0

  const blockingConflicts = conflicts.filter(c => c.severity === "blocking")
  const warningConflicts = conflicts.filter(c => c.severity === "warning")

  return DesignGapSummarySchema.parse({
    reviewRequired,
    blockingGapCount: issueRows.gaps.length,
    assumptionCount: assumptions.length,
    unresolvedItemCount: unresolvedItems.length,
    assumptions,
    gaps: issueRows.gaps,
    unresolvedItems,
    confirmationPackets,
    conflicts,
    blockingConflictCount: blockingConflicts.length,
    warningConflictCount: warningConflicts.length,
    hasBlockingConflicts: blockingConflicts.length > 0,
    conflictArtifact: renderConflictReport({
      projectName: input.requirement.projectName,
      conflicts,
      blockingConflictCount: blockingConflicts.length,
      warningConflictCount: warningConflicts.length,
    }),
    artifact: renderAssumptionReport({
      projectName: input.requirement.projectName,
      reviewRequired,
      assumptions,
      gaps: issueRows.gaps,
      unresolvedItems,
      confirmationPackets,
    }),
  })
}
