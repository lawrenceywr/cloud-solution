import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn04CloudNetworkAllocationFixture,
} from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runDraftTopologyModel } from "./draft-topology-model"
import { runDeviceCablingPlanner } from "./device-cabling-planner"
import { runDevicePortPlanPlanner } from "./device-port-plan-planner"
import { runIpAllocationPlanner } from "./ip-allocation-planner"
import { runPortConnectionPlanner } from "./port-connection-planner"

describe("planner features", () => {
  test("planner features return draft envelopes that route back to draft_topology_model", async () => {
    const runs = [
      {
        call: runDeviceCablingPlanner,
        input: createScn01SingleRackConnectivityFixture(),
        workerId: "device-cabling-planner",
        output: {
          structuredInput: {
            racks: [{ name: "Rack Planner", uHeight: 42 }],
            devices: [{ name: "Switch Planner", role: "switch", rackName: "Rack Planner", ports: [{ name: "eth30" }] }],
            links: [],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        call: runDevicePortPlanPlanner,
        input: createScn01SingleRackConnectivityFixture(),
        workerId: "device-port-plan-planner",
        output: {
          structuredInput: {
            racks: [],
            devices: [{ name: "Server Planner", role: "server", ports: [{ name: "eth31", purpose: "uplink" }] }],
            links: [],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        call: runPortConnectionPlanner,
        input: createScn01SingleRackConnectivityFixture(),
        workerId: "port-connection-planner",
        output: {
          structuredInput: {
            racks: [],
            devices: [
              { name: "Switch Planner", role: "switch", ports: [{ name: "eth32" }] },
              { name: "Server Planner", role: "server", ports: [{ name: "eth33" }] },
            ],
            links: [{ endpointA: { deviceName: "Switch Planner", portName: "eth32" }, endpointB: { deviceName: "Server Planner", portName: "eth33" } }],
            segments: [],
            allocations: [],
          },
          planningWarnings: [],
        },
      },
      {
        call: runIpAllocationPlanner,
        input: createScn04CloudNetworkAllocationFixture(),
        workerId: "ip-allocation-planner",
        output: {
          structuredInput: {
            racks: [],
            devices: [],
            links: [],
            segments: [{ name: "Planner Service", segmentType: "service", cidr: "10.120.0.0/24", gateway: "10.120.0.1", purpose: "planner-service" }],
            allocations: [{ segmentName: "Planner Service", allocationType: "service", ipAddress: "10.120.0.20", hostname: "planner-service" }],
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
        input: run.input,
        runtime: createWorkerRuntimeContext(client),
      })
      const drafted = await runDraftTopologyModel({
        input: result.draftInput,
        allowDocumentAssist: true,
      })

      expect(result.nextAction).toBe("draft_topology_model")
      expect(result.draftInput.requirement.id).toBe(run.input.requirement.id)
      expect(result.draftInput.structuredInput).toBeDefined()
      expect(drafted.inputState).toBe("structured_input")
      expect(drafted.normalizedInput.requirement.id).toBe(run.input.requirement.id)
    }
  })
})
