import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn08HighReliabilityRackLayoutFixture,
} from "../scenarios/fixtures"
import { runSummarizeDesignGaps } from "./summarize-design-gaps"

describe("runSummarizeDesignGaps", () => {
  test("returns deterministic review output through the feature layer", async () => {
    const result = await runSummarizeDesignGaps({
      input: createScn01SingleRackConnectivityFixture(),
    })

    expect(result.workflowState).toBe("export_ready")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.hasBlockingConflicts).toBe(false)
    expect(result.blockingConflictCount).toBe(0)
  })

  test("does not surface device_power_missing for cable-manager devices", async () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const result = await runSummarizeDesignGaps({
      input: {
        ...baseInput,
        devices: [
          ...baseInput.devices,
          {
            id: "device-cable-manager-a",
            name: "48口理线器",
            role: "cable-manager",
            rackId: "rack-a",
            rackPosition: 20,
            rackUnitHeight: 1,
            powerWatts: undefined,
            sourceRefs: [],
            statusConfidence: "confirmed",
          },
        ],
      },
    })

    expect(result.validationSummary.issues.map((issue) => issue.code)).not.toContain("device_power_missing")
    expect(result.gaps.map((gap) => gap.title)).not.toContain("device_power_missing")
  })

  test("surfaces operator-facing confirmation packets in the feature output", async () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const link = baseInput.links[0]!
    const endpointAPort = baseInput.ports.find((port) => port.id === link.endpointA.portId)!
    const endpointBPort = baseInput.ports.find((port) => port.id === link.endpointB.portId)!
    const endpointADevice = baseInput.devices.find((device) => device.id === endpointAPort.deviceId)!
    const endpointBDevice = baseInput.devices.find((device) => device.id === endpointBPort.deviceId)!

    const result = await runSummarizeDesignGaps({
      input: {
        ...baseInput,
        pendingConfirmationItems: [
          {
            id: `template-plane-type-conflict|${endpointADevice.name}:${endpointAPort.name}|${endpointBDevice.name}:${endpointBPort.name}`,
            kind: "template-plane-type-conflict",
            title: "template plane type conflict requires confirmation",
            detail: `Workbook-derived link ${endpointADevice.name}:${endpointAPort.name} ↔ ${endpointBDevice.name}:${endpointBPort.name} resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.`,
            severity: "warning",
            confidenceState: "unresolved",
            subjectType: "link",
            subjectId: link.id,
            entityRefs: [`link:${link.id}`],
            endpointA: { deviceName: endpointADevice.name, portName: endpointAPort.name },
            endpointB: { deviceName: endpointBDevice.name, portName: endpointBPort.name },
            sourceRefs: [{ kind: "user-input" as const, ref: "structured-input" }],
          },
        ],
      },
    })

    expect(result.reviewSummary.confirmationPacketCount).toBe(1)
    expect(result.confirmationPackets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `template-plane-type-conflict|${endpointADevice.name}:${endpointAPort.name}|${endpointBDevice.name}:${endpointBPort.name}`,
          requiredDecision: `Operator must choose the authoritative plane/link type for ${endpointADevice.name}:${endpointAPort.name} ↔ ${endpointBDevice.name}:${endpointBPort.name}: storage or business, then update the source/structured input accordingly.`,
        }),
      ]),
    )
  })
})
