import { readFileSync } from "node:fs"

import { describe, expect, test } from "bun:test"

import { createCloudSolutionRuntime } from "../index"
import {
  createScn01SingleRackConnectivityFixture,
  createScn02DualTorFixture,
  createScn03MultiRackPodFixture,
} from "./fixtures"

type NormalizedBundleSnapshot = {
  workflowState: string
  exportReady: boolean
  reviewRequired: boolean
  requestedArtifactTypes: string[]
  includedArtifactNames: string[]
  validationSummary: {
    valid: boolean
    blockingIssueCount: number
    warningCount: number
    informationalIssueCount: number
  }
  reviewSummary: {
    reviewRequired: boolean
    blockingGapCount: number
    assumptionCount: number
    unresolvedItemCount: number
  }
  artifactContents: Record<string, string>
}

function normalizeBundle(bundle: {
  workflowState: string
  exportReady: boolean
  reviewRequired: boolean
  requestedArtifactTypes: string[]
  includedArtifactNames: string[]
  validationSummary: {
    valid: boolean
    blockingIssueCount: number
    warningCount: number
    informationalIssueCount: number
  }
  reviewSummary: {
    reviewRequired: boolean
    blockingGapCount: number
    assumptionCount: number
    unresolvedItemCount: number
  }
  artifacts: Array<{ name: string; content: string }>
}): NormalizedBundleSnapshot {
  return {
    workflowState: bundle.workflowState,
    exportReady: bundle.exportReady,
    reviewRequired: bundle.reviewRequired,
    requestedArtifactTypes: bundle.requestedArtifactTypes,
    includedArtifactNames: bundle.includedArtifactNames,
    validationSummary: {
      valid: bundle.validationSummary.valid,
      blockingIssueCount: bundle.validationSummary.blockingIssueCount,
      warningCount: bundle.validationSummary.warningCount,
      informationalIssueCount: bundle.validationSummary.informationalIssueCount,
    },
    reviewSummary: {
      reviewRequired: bundle.reviewSummary.reviewRequired,
      blockingGapCount: bundle.reviewSummary.blockingGapCount,
      assumptionCount: bundle.reviewSummary.assumptionCount,
      unresolvedItemCount: bundle.reviewSummary.unresolvedItemCount,
    },
    artifactContents: Object.fromEntries(
      bundle.artifacts.map((artifact) => [artifact.name, artifact.content]),
    ),
  }
}

function readExpectedSnapshot(name: string): NormalizedBundleSnapshot {
  return JSON.parse(
    readFileSync(new URL(`./expected/${name}-export-bundle.json`, import.meta.url), "utf8"),
  ) as NormalizedBundleSnapshot
}

async function snapshotBundle(fixture: Record<string, unknown>) {
  const runtime = createCloudSolutionRuntime(process.cwd())
  const result = await runtime.kernel.invokeTool({
    toolName: "export_artifact_bundle",
    sessionID: "scenario-bundle-snapshot",
    args: fixture,
  })

  return normalizeBundle(JSON.parse(result))
}

describe("scenario bundle snapshots", () => {
  test("SCN-01 export bundle matches the checked-in snapshot", async () => {
    expect(await snapshotBundle(createScn01SingleRackConnectivityFixture())).toEqual(
      readExpectedSnapshot("scn-01"),
    )
  })

  test("SCN-02 export bundle matches the checked-in snapshot", async () => {
    expect(await snapshotBundle(createScn02DualTorFixture())).toEqual(
      readExpectedSnapshot("scn-02"),
    )
  })

  test("SCN-03 export bundle matches the checked-in snapshot", async () => {
    expect(await snapshotBundle(createScn03MultiRackPodFixture())).toEqual(
      readExpectedSnapshot("scn-03"),
    )
  })
})
