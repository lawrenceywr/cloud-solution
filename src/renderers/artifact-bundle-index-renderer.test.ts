import { describe, expect, test } from "bun:test"

import { renderArtifactBundleIndex } from "./artifact-bundle-index-renderer"

describe("renderArtifactBundleIndex", () => {
  test("renders deterministic bundle metadata and file list", () => {
    const artifact = renderArtifactBundleIndex({
      projectName: "Bundle Example",
      exportReady: true,
      reviewRequired: false,
      requestedArtifactTypes: ["device-cabling-table", "ip-allocation-table"],
      includedArtifactNames: [
        "artifact-bundle-index.md",
        "design-assumptions-and-gaps.md",
        "device-cabling-table.md",
        "ip-allocation-table.md",
      ],
      validationSummary: {
        valid: true,
        blockingIssueCount: 0,
        warningCount: 0,
        informationalIssueCount: 0,
        issues: [],
      },
      reviewSummary: {
        reviewRequired: false,
        blockingGapCount: 0,
        assumptionCount: 0,
        unresolvedItemCount: 0,
        assumptions: [],
        gaps: [],
        unresolvedItems: [],
        artifact: {
          name: "design-assumptions-and-gaps.md",
          mimeType: "text/markdown",
          content: "# Design Assumptions and Gaps",
        },
      },
    })

    expect(artifact.name).toBe("artifact-bundle-index.md")
    expect(artifact.content).toContain("Export Ready: yes")
    expect(artifact.content).toContain("## Requested Artifact Types")
    expect(artifact.content).toContain("## Included Files")
  })
})
