import { z } from "zod"

import {
  CloudSolutionSliceInputSchema,
  DesignGapSummarySchema,
  type ArtifactType,
  type CloudSolutionSliceInput,
  type DesignGapSummary,
  type ValidationSummary,
  ValidationSummarySchema,
} from "../domain"
import { StructuredSolutionInputSchema } from "../normalizers/normalize-structured-solution-input"

export const PlanningDraftAgentIDSchema = z.enum([
  "ip_allocation_planner",
  "port_connection_planner",
  "device_cabling_planner",
  "device_port_plan_planner",
])

export const PlanningDraftAgentBriefSchema = z.object({
  agentID: PlanningDraftAgentIDSchema,
  artifactType: z.enum([
    "device-cabling-table",
    "device-port-plan",
    "device-port-connection-table",
    "ip-allocation-table",
  ]),
  goal: z.string(),
  summary: z.string(),
  requirement: CloudSolutionSliceInputSchema.shape.requirement,
  sliceInput: CloudSolutionSliceInputSchema,
  validationSummary: ValidationSummarySchema,
  reviewSummary: DesignGapSummarySchema,
  guardrails: z.array(z.string()),
})

export const PlanningDraftAgentOutputSchema = z.object({
  structuredInput: StructuredSolutionInputSchema.shape.structuredInput,
  planningWarnings: z.array(z.string()).default([]),
})

export type PlanningDraftAgentID = z.infer<typeof PlanningDraftAgentIDSchema>
export type PlanningDraftAgentBrief = z.infer<typeof PlanningDraftAgentBriefSchema>

function getArtifactType(agentID: PlanningDraftAgentID): ArtifactType {
  switch (agentID) {
    case "ip_allocation_planner":
      return "ip-allocation-table"
    case "port_connection_planner":
      return "device-port-connection-table"
    case "device_cabling_planner":
      return "device-cabling-table"
    case "device_port_plan_planner":
      return "device-port-plan"
  }
}

function getGoal(agentID: PlanningDraftAgentID): string {
  switch (agentID) {
    case "ip_allocation_planner":
      return "Produce an advisory IP allocation planning draft that can re-enter draft_topology_model without bypassing validation."
    case "port_connection_planner":
      return "Produce an advisory device port connection planning draft that can re-enter draft_topology_model without bypassing validation."
    case "device_cabling_planner":
      return "Produce an advisory device cabling planning draft that can re-enter draft_topology_model without bypassing validation."
    case "device_port_plan_planner":
      return "Produce an advisory device port plan draft that can re-enter draft_topology_model without bypassing validation."
  }
}

export function buildPlanningDraftAgentBrief(args: {
  agentID: PlanningDraftAgentID
  sliceInput: CloudSolutionSliceInput
  validationSummary: ValidationSummary
  reviewSummary: DesignGapSummary
}): PlanningDraftAgentBrief {
  return PlanningDraftAgentBriefSchema.parse({
    agentID: args.agentID,
    artifactType: getArtifactType(args.agentID),
    goal: getGoal(args.agentID),
    summary:
      `Validation has ${args.validationSummary.blockingIssueCount} blocking issues and ${args.validationSummary.warningCount} warnings. `
      + `Review currently requires ${args.reviewSummary.assumptionCount} assumptions and ${args.reviewSummary.unresolvedItemCount} unresolved items to stay visible.`,
    requirement: args.sliceInput.requirement,
    sliceInput: args.sliceInput,
    validationSummary: args.validationSummary,
    reviewSummary: args.reviewSummary,
    guardrails: [
      "Return draft structured input only; do not produce final artifact tables.",
      "Do not mark planner output as confirmed.",
      "Do not change orchestration state, export readiness, or validated canonical facts.",
      "Keep any proposed topology or allocation changes advisory so they can re-enter draft_topology_model.",
    ],
  })
}
