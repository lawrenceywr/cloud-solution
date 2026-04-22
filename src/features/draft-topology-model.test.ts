import { describe, expect, test } from "bun:test"

import { createScn05DocumentAssistedDraftFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runDraftTopologyModel } from "./draft-topology-model"

describe("runDraftTopologyModel", () => {
  test("returns the same draft-oriented payload shape through the feature layer", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "evidence-reconciliation",
          status: "success",
          output: {
            conflicts: [],
            reconciliationWarnings: [],
          },
          recommendations: ["未发现证据冲突，可以继续方案评审"],
        }),
      ],
    })

    const result = await runDraftTopologyModel({
      input: createScn05DocumentAssistedDraftFixture(),
      allowDocumentAssist: true,
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.inputState).toBe("candidate_fact_draft")
    expect(result.candidateFacts.length).toBeGreaterThan(0)
    expect(result.conflictSummary.hasConflicts).toBe(false)
    expect(result).toHaveProperty("designGapSummary")
  })

  test("surfaces pending confirmation items through draft confirmation and gap summaries", async () => {
    const documentSource = {
      kind: "document" as const,
      ref: "fixtures/cabling-template.xlsx",
      note: "Cable planning template",
    }

    const result = await runDraftTopologyModel({
      input: {
        requirement: {
          id: "req-draft-pending-confirmation-1",
          projectName: "Draft Pending Confirmation Example",
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
              statusConfidence: "inferred",
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
              statusConfidence: "inferred",
              ports: [
                {
                  name: "3/0",
                  portType: "storage",
                  sourceRefs: [documentSource],
                  statusConfidence: "inferred",
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
              statusConfidence: "inferred",
              ports: [
                {
                  name: "1/1",
                  portType: "business",
                  sourceRefs: [documentSource],
                  statusConfidence: "inferred",
                },
              ],
            },
          ],
          links: [
            {
              endpointA: { deviceName: "server-a", portName: "3/0" },
              endpointB: { deviceName: "switch-a", portName: "1/1" },
              sourceRefs: [documentSource],
              statusConfidence: "inferred",
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
      allowDocumentAssist: true,
    })

    expect(result.confirmationSummary.pendingConfirmationItems ?? []).toHaveLength(1)
    expect(result.confirmationSummary.pendingConfirmationItems?.[0]).toEqual(
      expect.objectContaining({
        subjectType: "link",
        subjectId: expect.any(String),
        entityRefs: expect.arrayContaining([
          expect.stringMatching(/^link:/),
          expect.stringMatching(/^port:/),
        ]),
      }),
    )
    expect(result.designGapSummary.unresolvedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "template plane type conflict requires confirmation",
          confidenceState: "unresolved",
        }),
      ]),
    )
  })
})
