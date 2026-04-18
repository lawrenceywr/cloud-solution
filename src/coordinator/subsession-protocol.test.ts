import { describe, expect, test } from "bun:test"
import { z } from "zod"

import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { executeSubsessionProtocol } from "./subsession-protocol"

describe("executeSubsessionProtocol", () => {
  test("returns typed output when worker result matches the spec", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse: "ready",
            nextActions: ["export_bundle"],
          },
          recommendations: ["export_bundle"],
        }),
      ],
    })

    const result = await executeSubsessionProtocol({
      workerId: "solution-review-assistant",
      sessionTitle: "Solution Review Assistant",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      outputSchema: z.object({
        finalResponse: z.string(),
        nextActions: z.array(z.string()),
      }),
    }, createWorkerRuntimeContext(client))

    expect(result).toEqual({
      success: true,
      result: {
        workerId: "solution-review-assistant",
        status: "success",
        output: {
          finalResponse: "ready",
          nextActions: ["export_bundle"],
        },
        recommendations: ["export_bundle"],
      },
    })
  })

  test("normalizes completed_with_warnings to a partial success result", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "completed_with_warnings",
          output: {
            finalResponse: "ready",
            nextActions: ["export_bundle"],
          },
          recommendations: ["export_bundle"],
        }),
      ],
    })

    const result = await executeSubsessionProtocol({
      workerId: "solution-review-assistant",
      sessionTitle: "Solution Review Assistant",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      outputSchema: z.object({
        finalResponse: z.string(),
        nextActions: z.array(z.string()),
      }),
    }, createWorkerRuntimeContext(client))

    expect(result).toEqual({
      success: true,
      result: {
        workerId: "solution-review-assistant",
        status: "partial",
        output: {
          finalResponse: "ready",
          nextActions: ["export_bundle"],
        },
        recommendations: ["export_bundle"],
      },
    })
  })

  test("normalizes completed to a success result", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "completed",
          output: {
            finalResponse: "ready",
            nextActions: ["export_bundle"],
          },
          recommendations: ["export_bundle"],
        }),
      ],
    })

    const result = await executeSubsessionProtocol({
      workerId: "solution-review-assistant",
      sessionTitle: "Solution Review Assistant",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      outputSchema: z.object({
        finalResponse: z.string(),
        nextActions: z.array(z.string()),
      }),
    }, createWorkerRuntimeContext(client))

    expect(result).toEqual({
      success: true,
      result: {
        workerId: "solution-review-assistant",
        status: "success",
        output: {
          finalResponse: "ready",
          nextActions: ["export_bundle"],
        },
        recommendations: ["export_bundle"],
      },
    })
  })

  test("normalizes structured worker errors into strings", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            finalResponse: "ready",
            nextActions: ["export_bundle"],
          },
          recommendations: ["export_bundle"],
          errors: [
            {
              ref: "test/source.xlsx",
              message: "Output exceeded inline transport limits.",
            },
          ],
        }),
      ],
    })

    const result = await executeSubsessionProtocol({
      workerId: "solution-review-assistant",
      sessionTitle: "Solution Review Assistant",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      outputSchema: z.object({
        finalResponse: z.string(),
        nextActions: z.array(z.string()),
      }),
    }, createWorkerRuntimeContext(client))

    expect(result).toEqual({
      success: true,
      result: {
        workerId: "solution-review-assistant",
        status: "success",
        output: {
          finalResponse: "ready",
          nextActions: ["export_bundle"],
        },
        recommendations: ["export_bundle"],
        errors: ["test/source.xlsx: Output exceeded inline transport limits."],
      },
    })
  })

  test("returns a normalized failure when the child session reports an unexpected workerId", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "different-worker",
          status: "success",
          output: {
            finalResponse: "ready",
            nextActions: ["export_bundle"],
          },
          recommendations: ["export_bundle"],
        }),
      ],
    })

    const result = await executeSubsessionProtocol({
      workerId: "solution-review-assistant",
      sessionTitle: "Solution Review Assistant",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      outputSchema: z.object({
        finalResponse: z.string(),
        nextActions: z.array(z.string()),
      }),
    }, createWorkerRuntimeContext(client))

    expect(result).toEqual({
      success: false,
      result: {
        workerId: "solution-review-assistant",
        status: "failed",
        output: {},
        recommendations: [],
        errors: [
          "Worker solution-review-assistant returned unexpected workerId 'different-worker'",
        ],
      },
    })
  })

  test("returns a normalized failure when worker output does not match the schema", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "solution-review-assistant",
          status: "success",
          output: {
            nextActions: ["export_bundle"],
          },
          recommendations: ["export_bundle"],
        }),
      ],
    })

    const result = await executeSubsessionProtocol({
      workerId: "solution-review-assistant",
      sessionTitle: "Solution Review Assistant",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      outputSchema: z.object({
        finalResponse: z.string(),
        nextActions: z.array(z.string()),
      }),
    }, createWorkerRuntimeContext(client))

    expect(result).toEqual({
      success: false,
      result: {
        workerId: "solution-review-assistant",
        status: "failed",
        output: {},
        recommendations: [],
        errors: ["Worker solution-review-assistant returned invalid output result"],
      },
    })
  })
})
