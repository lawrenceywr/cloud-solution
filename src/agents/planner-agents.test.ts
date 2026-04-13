import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn04CloudNetworkAllocationFixture,
} from "../scenarios/fixtures"
import { runSolutionReviewWorkflow } from "../features/solution-review-workflow"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { buildPlanningDraftAgentBrief } from "./planning-draft-brief"
import { runDeviceCablingPlannerInChildSession } from "./device-cabling-planner"
import { runDevicePortPlanPlannerInChildSession } from "./device-port-plan-planner"
import { runIpAllocationPlannerInChildSession } from "./ip-allocation-planner"
import { runPortConnectionPlannerInChildSession } from "./port-connection-planner"

describe("planner child agents", () => {
  test("each planner parses a valid child-session envelope", async () => {
    const connectivityWorkflow = runSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      mode: "review",
    })
    const allocationWorkflow = runSolutionReviewWorkflow({
      input: createScn04CloudNetworkAllocationFixture(),
      mode: "review",
    })

    const runs = [
      {
        call: runDeviceCablingPlannerInChildSession,
        brief: buildPlanningDraftAgentBrief({
          agentID: "device_cabling_planner",
          sliceInput: connectivityWorkflow.sliceInput,
          validationSummary: connectivityWorkflow.validationSummary,
          reviewSummary: connectivityWorkflow.reviewSummary,
        }),
        workerId: "device-cabling-planner",
        output: {
          structuredInput: {
            racks: [{ name: "Rack A", uHeight: 42 }],
            devices: [{ name: "Switch A", role: "switch", rackName: "Rack A", ports: [{ name: "eth10" }] }],
            links: [],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        call: runDevicePortPlanPlannerInChildSession,
        brief: buildPlanningDraftAgentBrief({
          agentID: "device_port_plan_planner",
          sliceInput: connectivityWorkflow.sliceInput,
          validationSummary: connectivityWorkflow.validationSummary,
          reviewSummary: connectivityWorkflow.reviewSummary,
        }),
        workerId: "device-port-plan-planner",
        output: {
          structuredInput: {
            racks: [],
            devices: [{ name: "Server A", role: "server", ports: [{ name: "eth9", purpose: "uplink" }] }],
            links: [],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        call: runPortConnectionPlannerInChildSession,
        brief: buildPlanningDraftAgentBrief({
          agentID: "port_connection_planner",
          sliceInput: connectivityWorkflow.sliceInput,
          validationSummary: connectivityWorkflow.validationSummary,
          reviewSummary: connectivityWorkflow.reviewSummary,
        }),
        workerId: "port-connection-planner",
        output: {
          structuredInput: {
            racks: [],
            devices: [
              { name: "Switch A", role: "switch", ports: [{ name: "eth10" }] },
              { name: "Server A", role: "server", ports: [{ name: "eth9" }] },
            ],
            links: [{ endpointA: { deviceName: "Switch A", portName: "eth10" }, endpointB: { deviceName: "Server A", portName: "eth9" } }],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        call: runIpAllocationPlannerInChildSession,
        brief: buildPlanningDraftAgentBrief({
          agentID: "ip_allocation_planner",
          sliceInput: allocationWorkflow.sliceInput,
          validationSummary: allocationWorkflow.validationSummary,
          reviewSummary: allocationWorkflow.reviewSummary,
        }),
        workerId: "ip-allocation-planner",
        output: {
          structuredInput: {
            racks: [],
            devices: [],
            links: [],
            segments: [{ name: "Planner Public", segmentType: "service", cidr: "10.90.0.0/24", gateway: "10.90.0.1", purpose: "planner-public" }],
            allocations: [{ segmentName: "Planner Public", allocationType: "service", ipAddress: "10.90.0.10", hostname: "planner-api" }],
          },
          planningWarnings: [],
        },
      },
    ]

    for (const run of runs) {
      const { client } = createFakeCoordinatorClient({
        promptTexts: [
          JSON.stringify({
            workerId: run.workerId,
            status: "success",
            output: run.output,
            recommendations: ["draft_topology_model"],
          }),
        ],
      })

      const result = await run.call({
        brief: run.brief,
        runtime: createWorkerRuntimeContext(client),
      })

      expect(result.success).toBe(true)
    }
  })
})
