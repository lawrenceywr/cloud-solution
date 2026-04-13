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
import { buildPlanningDraftAgentBrief } from "../agents"
import { executeDeviceCablingPlannerWorker } from "./device-cabling-planner"
import { executeDevicePortPlanPlannerWorker } from "./device-port-plan-planner"
import { executeIpAllocationPlannerWorker } from "./ip-allocation-planner"
import { executePortConnectionPlannerWorker } from "./port-connection-planner"

describe("planner workers", () => {
  test("workers downgrade planner facts to draft confidence and add system provenance", async () => {
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
        execute: executeDeviceCablingPlannerWorker,
        workerId: "device-cabling-planner",
        input: connectivityWorkflow,
        brief: buildPlanningDraftAgentBrief({
          agentID: "device_cabling_planner",
          sliceInput: connectivityWorkflow.sliceInput,
          validationSummary: connectivityWorkflow.validationSummary,
          reviewSummary: connectivityWorkflow.reviewSummary,
        }),
        output: {
          structuredInput: {
            racks: [{ name: "Rack X", uHeight: 42, statusConfidence: "confirmed" }],
            devices: [{ name: "Switch X", role: "switch", rackName: "Rack X", statusConfidence: "confirmed", ports: [{ name: "eth99", statusConfidence: "confirmed" }] }],
            links: [],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        execute: executeDevicePortPlanPlannerWorker,
        workerId: "device-port-plan-planner",
        input: connectivityWorkflow,
        brief: buildPlanningDraftAgentBrief({
          agentID: "device_port_plan_planner",
          sliceInput: connectivityWorkflow.sliceInput,
          validationSummary: connectivityWorkflow.validationSummary,
          reviewSummary: connectivityWorkflow.reviewSummary,
        }),
        output: {
          structuredInput: {
            racks: [],
            devices: [{ name: "Server X", role: "server", statusConfidence: "confirmed", ports: [{ name: "eth88", purpose: "uplink", statusConfidence: "confirmed" }] }],
            links: [],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        execute: executePortConnectionPlannerWorker,
        workerId: "port-connection-planner",
        input: connectivityWorkflow,
        brief: buildPlanningDraftAgentBrief({
          agentID: "port_connection_planner",
          sliceInput: connectivityWorkflow.sliceInput,
          validationSummary: connectivityWorkflow.validationSummary,
          reviewSummary: connectivityWorkflow.reviewSummary,
        }),
        output: {
          structuredInput: {
            racks: [],
            devices: [
              { name: "Switch Y", role: "switch", ports: [{ name: "eth7", statusConfidence: "confirmed" }] },
              { name: "Server Y", role: "server", ports: [{ name: "eth8", statusConfidence: "confirmed" }] },
            ],
            links: [{ endpointA: { deviceName: "Switch Y", portName: "eth7" }, endpointB: { deviceName: "Server Y", portName: "eth8" }, statusConfidence: "confirmed" }],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        execute: executeIpAllocationPlannerWorker,
        workerId: "ip-allocation-planner",
        input: allocationWorkflow,
        brief: buildPlanningDraftAgentBrief({
          agentID: "ip_allocation_planner",
          sliceInput: allocationWorkflow.sliceInput,
          validationSummary: allocationWorkflow.validationSummary,
          reviewSummary: allocationWorkflow.reviewSummary,
        }),
        output: {
          structuredInput: {
            racks: [],
            devices: [],
            links: [],
            segments: [{ name: "Planner Mgmt", segmentType: "mgmt", purpose: "planner-mgmt", statusConfidence: "confirmed" }],
            allocations: [{ segmentName: "Planner Mgmt", allocationType: "service", ipAddress: "10.99.0.10", statusConfidence: "confirmed" }],
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

      const result = await run.execute({
        ...run.input.sliceInput,
        validationIssues: run.input.issues,
        reviewSummary: run.input.reviewSummary,
        context: {
          plannerBrief: run.brief,
        },
        workerMessages: {},
      }, createWorkerRuntimeContext(client))

      expect(result.status).toBe("success")
      const structuredInput = result.output.structuredInput as {
        racks: Array<{ statusConfidence: string, sourceRefs: Array<{ kind: string }> }>
        devices: Array<{ statusConfidence: string, sourceRefs: Array<{ kind: string }>, ports: Array<{ statusConfidence: string, sourceRefs: Array<{ kind: string }> }> }>
        links: Array<{ statusConfidence: string, sourceRefs: Array<{ kind: string }> }>
        segments: Array<{ statusConfidence: string, sourceRefs: Array<{ kind: string }> }>
        allocations: Array<{ statusConfidence: string, sourceRefs: Array<{ kind: string }> }>
      }
      const firstEntity = structuredInput.racks[0]
        ?? structuredInput.devices[0]
        ?? structuredInput.links[0]
        ?? structuredInput.segments[0]
        ?? structuredInput.allocations[0]

      expect(firstEntity.statusConfidence).toBe("inferred")
      expect(firstEntity.sourceRefs.some((ref) => ref.kind === "system")).toBe(true)
    }
  })
})
