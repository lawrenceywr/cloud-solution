import { describe, expect, test } from "bun:test"

import { createCompleteCoordinatorInput, createIncompleteCoordinatorInput } from "../../coordinator/__fixtures__"
import type { WorkerInput } from "../../coordinator/types"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../../test-helpers/fake-coordinator-client"
import { ClarificationWorkerOutputSchema } from "./types"
import {
  executeClarificationWorker,
  executeClarificationWorkerSubsession,
} from "./worker"

function createWorkerInput(overrides?: Partial<WorkerInput>): WorkerInput {
  return {
    ...createCompleteCoordinatorInput(),
    validationIssues: [],
    reviewSummary: undefined,
    context: {},
    workerMessages: {},
    ...overrides,
  }
}

describe("requirements-clarification worker", () => {
  test("spawns a child session and returns a no-clarification result", async () => {
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: [],
            clarificationQuestions: [],
            suggestions: [],
          },
          recommendations: ["输入完整，无需澄清"],
        }),
      ],
    })

    const result = await executeClarificationWorker(
      createWorkerInput(),
      createWorkerRuntimeContext(client),
    )

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(result).toEqual({
      workerId: "requirements-clarification",
      status: "success",
      output: {
        missingFields: [],
        clarificationQuestions: [],
        suggestions: [],
      },
      recommendations: ["输入完整，无需澄清"],
    })
  })

  test("returns a clarification payload from the child session", async () => {
    const input = createWorkerInput({
      ...createIncompleteCoordinatorInput(),
    })

    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "success",
          output: {
            missingFields: ["devices"],
            clarificationQuestions: [
              {
                field: "devices",
                question: "请提供设备清单，包括设备名称、角色、厂商、型号",
                severity: "blocking",
              },
            ],
            suggestions: [],
          },
          recommendations: ["请补充以下信息后再继续方案评审"],
        }),
      ],
    })

    const result = await executeClarificationWorker(
      input,
      createWorkerRuntimeContext(client),
    )

    expect(result.output).toEqual({
      missingFields: ["devices"],
      clarificationQuestions: [
        {
          field: "devices",
          question: "请提供设备清单，包括设备名称、角色、厂商、型号",
          severity: "blocking",
        },
      ],
      suggestions: [],
    })
    expect(ClarificationWorkerOutputSchema.parse(result.output)).toEqual({
      missingFields: ["devices"],
      clarificationQuestions: [
        {
          field: "devices",
          question: "请提供设备清单，包括设备名称、角色、厂商、型号",
          severity: "blocking",
        },
      ],
      suggestions: [],
    })
    expect(result.recommendations).toEqual(["请补充以下信息后再继续方案评审"])
  })

  test("returns a failed result when the child session emits invalid JSON", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: ["not-json"],
    })

    const result = await executeClarificationWorker(
      createWorkerInput(),
      createWorkerRuntimeContext(client),
    )

    expect(result.workerId).toBe("requirements-clarification")
    expect(result.status).toBe("failed")
    expect(result.errors).toEqual([
      "Worker requirements-clarification returned invalid JSON result",
    ])
  })

  test("normalizes a wrong child workerId into a failed clarification protocol result", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "different-worker",
          status: "success",
          output: {
            missingFields: [],
            clarificationQuestions: [],
            suggestions: [],
          },
          recommendations: ["输入完整，无需澄清"],
        }),
      ],
    })

    const result = await executeClarificationWorkerSubsession(
      createWorkerInput(),
      createWorkerRuntimeContext(client),
    )

    expect(result).toEqual({
      success: false,
        result: {
          workerId: "requirements-clarification",
          status: "failed",
          output: {},
          recommendations: [],
          errors: [
            "Worker requirements-clarification returned unexpected workerId 'different-worker'",
          ],
        },
      })
  })

  test("preserves a failed child result even when the clarification output shape looks valid", async () => {
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "requirements-clarification",
          status: "failed",
          output: {
            missingFields: [],
            clarificationQuestions: [],
            suggestions: [],
          },
          recommendations: ["输入完整，无需澄清"],
          errors: ["clarification child failed"],
        }),
      ],
    })

    const result = await executeClarificationWorker(
      createWorkerInput(),
      createWorkerRuntimeContext(client),
    )

    expect(result).toEqual({
      workerId: "requirements-clarification",
      status: "failed",
      output: {
        missingFields: [],
        clarificationQuestions: [],
        suggestions: [],
      },
      recommendations: ["输入完整，无需澄清"],
      errors: ["clarification child failed"],
    })
  })
})
