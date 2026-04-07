import { z } from "zod"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import {
  ArtifactTypeSchema,
  ConfidenceStateSchema,
  SolutionRequirementSchema,
  SourceReferenceSchema,
} from "../../domain"
import { createCaptureSolutionRequirementsArgs } from "../intake-tool-args"

const CaptureSolutionRequirementsInputSchema = z.object({
  requirementId: z.string().optional(),
  projectName: z.string(),
  scopeType: z.enum(["cloud", "data-center", "hybrid"]),
  artifactRequests: z.array(ArtifactTypeSchema).default([]),
  requirementNotes: z.string().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  documentSources: z.array(SourceReferenceSchema.extend({
    kind: z.enum(["document", "diagram", "image"]),
  })).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildRequirementId(projectName: string): string {
  const slug = slugify(projectName)
  return `req-${slug || "captured-solution"}`
}

export function createCaptureSolutionRequirementsTools(args: {
  pluginConfig: CloudSolutionConfig
}): Record<string, ToolDefinition> {
  const capture_solution_requirements: ToolDefinition = tool({
    description:
      "Capture front-door requirement metadata and return a normalized requirement plus a draft-topology input envelope.",
    args: createCaptureSolutionRequirementsArgs(),
    execute: async (inputArgs) => {
      const parsedInput = CaptureSolutionRequirementsInputSchema.parse(inputArgs)
      if (!args.pluginConfig.allow_document_assist && parsedInput.documentSources.length > 0) {
        throw new Error("Document-assisted drafting is disabled by plugin config.")
      }
      const noteSourceRef = parsedInput.requirementNotes
        ? [{
            kind: "user-input" as const,
            ref: "capture_solution_requirements",
            note: parsedInput.requirementNotes,
          }]
        : []

      const requirement = SolutionRequirementSchema.parse({
        id: parsedInput.requirementId ?? buildRequirementId(parsedInput.projectName),
        projectName: parsedInput.projectName,
        scopeType: parsedInput.scopeType,
        artifactRequests: parsedInput.artifactRequests,
        sourceRefs: [...parsedInput.sourceRefs, ...noteSourceRef],
        statusConfidence: parsedInput.statusConfidence,
      })

      return JSON.stringify(
        {
          requirement,
          draftInput: {
            requirement,
            ...(parsedInput.documentSources.length > 0
              ? {
                  documentAssist: {
                    documentSources: parsedInput.documentSources,
                    candidateFacts: {
                      racks: [],
                      devices: [],
                      links: [],
                      segments: [],
                      allocations: [],
                    },
                  },
                }
              : {
                  structuredInput: {
                    racks: [],
                    devices: [],
                    links: [],
                    segments: [],
                    allocations: [],
                  },
                }),
          },
          nextAction:
            parsedInput.documentSources.length > 0
              ? "extract_document_candidate_facts"
              : "draft_topology_model",
        },
        null,
        2,
      )
    },
  })

  return { capture_solution_requirements }
}
