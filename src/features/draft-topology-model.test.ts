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
})
