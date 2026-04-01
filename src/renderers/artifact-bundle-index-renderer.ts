import type { ArtifactType, DesignGapSummary, GeneratedArtifact, ValidationSummary } from "../domain"

function buildListSection(args: {
  heading: string
  values: string[]
  emptyLabel: string
}) {
  const { heading, values, emptyLabel } = args

  return [
    `## ${heading}`,
    ...(values.length > 0 ? values.map((value) => `- ${value}`) : [emptyLabel]),
  ].join("\n")
}

export function renderArtifactBundleIndex(args: {
  projectName: string
  exportReady: boolean
  reviewRequired: boolean
  requestedArtifactTypes: ArtifactType[]
  includedArtifactNames: string[]
  validationSummary: ValidationSummary
  reviewSummary: DesignGapSummary
}): GeneratedArtifact {
  const {
    projectName,
    exportReady,
    reviewRequired,
    requestedArtifactTypes,
    includedArtifactNames,
    validationSummary,
    reviewSummary,
  } = args

  const content = [
    "# Artifact Bundle Index",
    "",
    `Project: ${projectName}`,
    `Export Ready: ${exportReady ? "yes" : "no"}`,
    `Review Required: ${reviewRequired ? "yes" : "no"}`,
    `Included File Count: ${includedArtifactNames.length}`,
    `Validation Valid: ${validationSummary.valid ? "yes" : "no"}`,
    `Blocking Issue Count: ${validationSummary.blockingIssueCount}`,
    `Warning Count: ${validationSummary.warningCount}`,
    `Informational Issue Count: ${validationSummary.informationalIssueCount}`,
    `Assumption Count: ${reviewSummary.assumptionCount}`,
    `Gap Count: ${reviewSummary.blockingGapCount}`,
    `Unresolved Item Count: ${reviewSummary.unresolvedItemCount}`,
    "",
    buildListSection({
      heading: "Requested Artifact Types",
      values: requestedArtifactTypes,
      emptyLabel: "No artifact types were requested.",
    }),
    "",
    buildListSection({
      heading: "Included Files",
      values: includedArtifactNames,
      emptyLabel: "No bundle files were produced.",
    }),
  ].join("\n")

  return {
    name: "artifact-bundle-index.md",
    mimeType: "text/markdown",
    content,
  }
}
