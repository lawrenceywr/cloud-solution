import { describe, expect, test } from "bun:test"

import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { executeWorkerSubsession } from "./subsession-executor"

describe("executeWorkerSubsession", () => {
  test("creates a child session under the parent session and parses JSON output", async () => {
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: [],
          },
          recommendations: [],
        }),
      ],
    })

    const runtime = createWorkerRuntimeContext(client, {
      parentSessionID: "root-session",
    })

    const result = await executeWorkerSubsession({
      workerId: "requirements-clarification",
      workerName: "Requirements Clarification",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      runtime,
    })

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(createCalls[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          parentID: "root-session",
          title: "Requirements Clarification",
        }),
      }),
    )
    expect(result.workerId).toBe("requirements-clarification")
    expect(result.status).toBe("success")
  })

  test("parses fenced JSON output", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        "```json\n{\n  \"workerId\": \"test-worker\",\n  \"status\": \"success\",\n  \"output\": { \"workflowState\": \"export_ready\" },\n  \"recommendations\": [\"方案已就绪，可以导出制品\"]\n}\n```",
      ],
    })

    const result = await executeWorkerSubsession({
      workerId: "test-worker",
      workerName: "Test Worker",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result).toEqual({
      workerId: "test-worker",
      status: "success",
      output: {
        workflowState: "export_ready",
      },
      recommendations: ["方案已就绪，可以导出制品"],
    })
  })

  test("returns a failed worker result when JSON is invalid", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: ["not-json"],
    })

    const result = await executeWorkerSubsession({
      workerId: "test-worker",
      workerName: "Test Worker",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result).toEqual({
      workerId: "test-worker",
      status: "failed",
      output: {},
      recommendations: [],
      errors: ["Worker test-worker returned invalid JSON result"],
    })
  })

  test("preserves a failed generic worker result even when output looks valid", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "test-worker",
          status: "failed",
          output: {
            workflowState: "export_ready",
          },
          recommendations: ["方案已就绪，可以导出制品"],
          errors: ["child session reported failure"],
        }),
      ],
    })

    const result = await executeWorkerSubsession({
      workerId: "test-worker",
      workerName: "Test Worker",
      systemPrompt: "Return JSON only",
      userPrompt: "{}",
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result).toEqual({
      workerId: "test-worker",
      status: "failed",
      output: {
        workflowState: "export_ready",
      },
      recommendations: ["方案已就绪，可以导出制品"],
      errors: ["child session reported failure"],
    })
  })
})
