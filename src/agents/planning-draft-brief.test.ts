import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn04CloudNetworkAllocationFixture,
} from "../scenarios/fixtures"
import { runSolutionReviewWorkflow } from "../features/solution-review-workflow"
import { buildPlanningDraftAgentBrief } from "./planning-draft-brief"

describe("buildPlanningDraftAgentBrief", () => {
  test("maps each planner id to the expected artifact domain and shared guardrails", () => {
    const connectivityWorkflow = runSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      mode: "review",
    })
    const allocationWorkflow = runSolutionReviewWorkflow({
      input: createScn04CloudNetworkAllocationFixture(),
      mode: "review",
    })

    const briefs = [
      buildPlanningDraftAgentBrief({
        agentID: "device_cabling_planner",
        sliceInput: connectivityWorkflow.sliceInput,
        validationSummary: connectivityWorkflow.validationSummary,
        reviewSummary: connectivityWorkflow.reviewSummary,
      }),
      buildPlanningDraftAgentBrief({
        agentID: "device_port_plan_planner",
        sliceInput: connectivityWorkflow.sliceInput,
        validationSummary: connectivityWorkflow.validationSummary,
        reviewSummary: connectivityWorkflow.reviewSummary,
      }),
      buildPlanningDraftAgentBrief({
        agentID: "port_connection_planner",
        sliceInput: connectivityWorkflow.sliceInput,
        validationSummary: connectivityWorkflow.validationSummary,
        reviewSummary: connectivityWorkflow.reviewSummary,
      }),
      buildPlanningDraftAgentBrief({
        agentID: "ip_allocation_planner",
        sliceInput: allocationWorkflow.sliceInput,
        validationSummary: allocationWorkflow.validationSummary,
        reviewSummary: allocationWorkflow.reviewSummary,
      }),
    ]

    expect(briefs.map((brief) => brief.artifactType)).toEqual([
      "device-cabling-table",
      "device-port-plan",
      "device-port-connection-table",
      "ip-allocation-table",
    ])
    expect(briefs.every((brief) => brief.guardrails.some((item) => item.includes("final artifact")))).toBe(true)
  })
})
