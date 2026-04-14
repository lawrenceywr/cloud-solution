import { describe, expect, test } from "bun:test"

import type { SourceReference } from "../domain"
import { loadPluginConfig } from "../plugin-config"
import { createPhase09DocumentExtractionInputFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { prepareRequirementAdvisorySources } from "./document-source-advisory-mcp"

function isInventoryOrSystemSourceRef(sourceRef: SourceReference): sourceRef is SourceReference & {
  kind: "inventory" | "system"
} {
  return sourceRef.kind === "inventory" || sourceRef.kind === "system"
}

describe("prepareRequirementAdvisorySources", () => {
  test("drops advisory sources whose sourceRef does not match approved requirement sourceRefs", async () => {
    const fixture = createPhase09DocumentExtractionInputFixture()
    const inventorySource = fixture.requirement.sourceRefs.find(
      (sourceRef) => sourceRef.kind === "inventory",
    )
    if (!inventorySource || !isInventoryOrSystemSourceRef(inventorySource)) {
      throw new Error("Expected an inventory sourceRef in the Phase 9 fixture.")
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-advisory-mcp",
          status: "success",
          output: {
            advisorySources: [
              {
                sourceRef: inventorySource,
                advisoryText: "Valid inventory summary.",
              },
              {
                sourceRef: {
                  kind: "inventory",
                  ref: "cmdb/services/forged-service",
                  note: "Forged",
                },
                advisoryText: "Forged summary.",
              },
            ],
            advisoryWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await prepareRequirementAdvisorySources({
      requirement: fixture.requirement,
      pluginConfig: {
        ...loadPluginConfig(process.cwd()),
        document_assist_advisory_source_tool_name: "query_external_solution_source" as const,
      },
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.advisorySources).toEqual([
      {
        sourceRef: inventorySource,
        advisoryText: "Valid inventory summary.",
      },
    ])
    expect(result.advisoryWarnings).toEqual([
      "Dropped 1 advisory external source result(s) whose sourceRef did not match the supplied requirement.sourceRefs.",
    ])
  })

  test("falls back to warnings when advisory external-source retrieval fails", async () => {
    const fixture = createPhase09DocumentExtractionInputFixture()
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "wrong-worker",
          status: "success",
          output: {},
          recommendations: [],
        }),
      ],
    })

    const result = await prepareRequirementAdvisorySources({
      requirement: fixture.requirement,
      pluginConfig: {
        ...loadPluginConfig(process.cwd()),
        document_assist_advisory_source_tool_name: "query_external_solution_source" as const,
      },
      runtime: createWorkerRuntimeContext(client),
    })

    expect(result.advisorySources).toEqual([])
    expect(result.advisoryWarnings).toEqual([
      "Worker document-source-advisory-mcp returned unexpected workerId 'wrong-worker'",
    ])
  })
})
