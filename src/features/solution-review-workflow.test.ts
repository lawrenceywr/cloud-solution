import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn07GuardedExportFixture,
} from "../scenarios/fixtures"
import { loadPluginConfig } from "../plugin-config"
import {
  evaluateSolutionReviewWorkflow,
  runSolutionReviewWorkflow,
} from "./solution-review-workflow"

describe("runSolutionReviewWorkflow", () => {
  test("returns export_ready for a clean exportable slice", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const result = runSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      mode: "export",
      pluginConfig,
    })

    expect(result.workflowState).toBe("export_ready")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.reviewSummary.reviewRequired).toBe(false)
    expect(result.bundle?.exportReady).toBe(true)
  })

  test("returns review_required when assumptions and warnings remain", () => {
    const result = runSolutionReviewWorkflow({
      input: {
        requirement: {
          id: "req-review-workflow-1",
          projectName: "Review Workflow Example",
          scopeType: "data-center",
        },
        devices: [
          {
            id: "device-switch-a",
            name: "switch-a",
            role: "switch",
            redundancyIntent: "dual-homed-preferred",
            statusConfidence: "inferred",
          },
        ],
        racks: [],
        ports: [],
        links: [],
        segments: [],
        allocations: [],
      },
      mode: "review",
    })

    expect(result.workflowState).toBe("review_required")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.reviewSummary.assumptionCount).toBe(1)
    expect(result.reviewSummary.unresolvedItemCount).toBe(1)
  })

  test("returns blocked when export mode has blocking validation issues", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const result = runSolutionReviewWorkflow({
      input: {
        ...baseInput,
        allocations: [],
      },
      mode: "export",
      pluginConfig,
    })

    expect(result.workflowState).toBe("blocked")
    expect(result.validationSummary.valid).toBe(false)
    expect(result.bundle).toBeUndefined()
  })

  test("injects default artifact requests in export mode when omitted", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const result = runSolutionReviewWorkflow({
      input: {
        ...baseInput,
        requirement: {
          ...baseInput.requirement,
          artifactRequests: [],
        },
      },
      mode: "export",
      pluginConfig,
    })

    expect(result.sliceInput.requirement.artifactRequests).toEqual(pluginConfig.default_artifacts)
    expect(result.bundle?.requestedArtifactTypes).toEqual(pluginConfig.default_artifacts)
  })

  test("evaluates low-confidence SCN-07 export input as review_required", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const result = evaluateSolutionReviewWorkflow({
      input: createScn07GuardedExportFixture(),
      mode: "export",
      pluginConfig,
    })

    expect(result.workflowState).toBe("review_required")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.reviewSummary.assumptionCount).toBeGreaterThan(0)
  })

  test("evaluates incomplete SCN-07 export input as blocked", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const result = evaluateSolutionReviewWorkflow({
      input: {
        ...createScn07GuardedExportFixture(),
        allocations: [],
      },
      mode: "export",
      pluginConfig,
    })

    expect(result.workflowState).toBe("blocked")
    expect(result.validationSummary.valid).toBe(false)
  })

  test("surfaces raw pending confirmation items as review unresolved items", () => {
    const documentSource = {
      kind: "document" as const,
      ref: "fixtures/cabling-template.xlsx",
      note: "Cable planning template",
    }

    const result = evaluateSolutionReviewWorkflow({
      input: {
        requirement: {
          id: "req-review-pending-confirmation-1",
          projectName: "Review Pending Confirmation Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        structuredInput: {
          racks: [
            {
              name: "rack-a",
              row: "A",
              uHeight: 42,
              maxPowerKw: 7,
              sourceRefs: [documentSource],
              statusConfidence: "confirmed",
            },
          ],
          devices: [
            {
              name: "server-a",
              role: "server",
              rackName: "rack-a",
              rackPosition: 10,
              rackUnitHeight: 2,
              sourceRefs: [documentSource],
              statusConfidence: "confirmed",
              ports: [
                {
                  name: "3/0",
                  sourceRefs: [documentSource],
                  statusConfidence: "confirmed",
                },
              ],
            },
            {
              name: "switch-a",
              role: "switch",
              rackName: "rack-a",
              rackPosition: 1,
              rackUnitHeight: 1,
              sourceRefs: [documentSource],
              statusConfidence: "confirmed",
              ports: [
                {
                  name: "1/1",
                  sourceRefs: [documentSource],
                  statusConfidence: "confirmed",
                },
              ],
            },
          ],
          links: [
            {
              endpointA: { deviceName: "server-a", portName: "3/0" },
              endpointB: { deviceName: "switch-a", portName: "1/1" },
              sourceRefs: [documentSource],
              statusConfidence: "confirmed",
            },
          ],
          segments: [],
          allocations: [],
        },
        pendingConfirmationItems: [
          {
            id: "template-plane-type-conflict|server-a:3/0|switch-a:1/1",
            kind: "template-plane-type-conflict",
            title: "template plane type conflict requires confirmation",
            detail: "Workbook-derived link server-a:3/0 ↔ switch-a:1/1 resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.",
            confidenceState: "unresolved",
            endpointA: { deviceName: "server-a", portName: "3/0" },
            endpointB: { deviceName: "switch-a", portName: "1/1" },
            sourceRefs: [documentSource],
          },
        ],
      },
      mode: "review",
    })

    expect(result.workflowState).toBe("review_required")
    expect(result.reviewSummary.unresolvedItemCount).toBe(1)
    expect(result.reviewSummary.unresolvedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "template plane type conflict requires confirmation",
          confidenceState: "unresolved",
        }),
      ]),
    )
  })
})
