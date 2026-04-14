import { describe, expect, test } from "bun:test"

import { createPhase09DocumentExtractionInputFixture } from "../scenarios/fixtures"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runDocumentSourceAdvisoryMcpInChildSession } from "./document-source-advisory-mcp"

describe("runDocumentSourceAdvisoryMcpInChildSession", () => {
  test("returns advisory external-source evidence from a valid child session", async () => {
    const fixture = createPhase09DocumentExtractionInputFixture()
    const approvedSourceRefs = fixture.requirement.sourceRefs.filter(
      (sourceRef) => sourceRef.kind === "inventory" || sourceRef.kind === "system",
    )
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-advisory-mcp",
          status: "success",
          output: {
            advisorySources: [
              {
                sourceRef: approvedSourceRefs[0],
                advisoryText: "Inventory says the service network uses 10.50.0.0/24.",
              },
            ],
            advisoryWarnings: ["Topology system had no additional port details."],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runDocumentSourceAdvisoryMcpInChildSession({
      requirementContext: {
        id: fixture.requirement.id,
        projectName: fixture.requirement.projectName,
        scopeType: fixture.requirement.scopeType,
        artifactRequests: fixture.requirement.artifactRequests,
      },
      approvedSourceRefs,
      toolName: "query_external_solution_source",
      runtime: createWorkerRuntimeContext(client, {
        directory: "/tmp/original-directory",
        worktree: "/tmp/advisory-worktree",
      }),
    })

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(createCalls[0]).toEqual(
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/advisory-worktree",
        }),
      }),
    )
    expect(promptCalls[0]).toEqual(
      expect.objectContaining({
        query: expect.objectContaining({
          directory: "/tmp/advisory-worktree",
        }),
        body: expect.objectContaining({
          tools: expect.objectContaining({
            query_external_solution_source: true,
          }),
          parts: [
            expect.objectContaining({
              text: expect.not.stringContaining('"sourceRefs"'),
            }),
          ],
        }),
      }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.output.advisorySources[0]?.sourceRef).toEqual(approvedSourceRefs[0])
      expect(result.result.output.advisoryWarnings).toEqual([
        "Topology system had no additional port details.",
      ])
    }
  })
})
