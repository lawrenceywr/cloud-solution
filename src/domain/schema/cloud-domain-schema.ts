import { z } from "zod"

export const ConfidenceStateSchema = z.enum([
  "confirmed",
  "inferred",
  "unresolved",
])

export const ArtifactTypeSchema = z.enum([
  "device-cabling-table",
  "device-rack-layout",
  "device-port-plan",
  "device-port-connection-table",
  "ip-allocation-table",
])

export const SUPPORTED_ARTIFACT_TYPES = ArtifactTypeSchema.options

export const PortTypeSchema = z.enum([
  "data",
  "business",
  "storage",
  "inband-mgmt",
  "oob-mgmt",
  "peer-link",
  "uplink",
])

export const LinkTypeSchema = z.enum([
  "business",
  "storage",
  "inband-mgmt",
  "oob-mgmt",
  "peer-link",
  "uplink",
  "inter-switch",
])

export const HighAvailabilityRoleSchema = z.enum([
  "primary",
  "secondary",
])

export const SourceReferenceSchema = z.object({
  kind: z.enum(["user-input", "inventory", "diagram", "document", "image", "system"]),
  ref: z.string(),
  note: z.string().optional(),
})

export const DraftInputStateSchema = z.enum([
  "structured_input",
  "candidate_fact_draft",
  "confirmed_slice",
])

export const CandidateFactSubjectTypeSchema = z.enum([
  "device",
  "rack",
  "port",
  "link",
  "segment",
  "allocation",
])

export const CandidateFactSchema = z.object({
  entityRef: z.string(),
  subjectType: CandidateFactSubjectTypeSchema,
  subjectId: z.string(),
  statusConfidence: ConfidenceStateSchema,
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  requiresConfirmation: z.boolean(),
})

export const CandidateFactPromotionSchema = z.object({
  entityRef: z.string(),
})

export const PendingConfirmationItemKindSchema = z.enum([
  "template-plane-type-conflict",
])

export const PendingConfirmationEndpointSchema = z.object({
  deviceName: z.string(),
  portName: z.string(),
})

export const PendingConfirmationItemSchema = z.object({
  id: z.string(),
  kind: PendingConfirmationItemKindSchema,
  severity: z.enum(["warning", "informational"]).default("warning"),
  title: z.string(),
  detail: z.string(),
  subjectType: z.literal("link").default("link"),
  subjectId: z.string().optional(),
  confidenceState: ConfidenceStateSchema.default("unresolved"),
  entityRefs: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  endpointA: PendingConfirmationEndpointSchema.optional(),
  endpointB: PendingConfirmationEndpointSchema.optional(),
  suggestedAction: z.string().optional(),
})

export const CandidateFactConfirmationSummarySchema = z.object({
  requestedEntityRefs: z.array(z.string()).default([]),
  confirmedEntityRefs: z.array(z.string()).default([]),
  pendingEntityRefs: z.array(z.string()).default([]),
  missingEntityRefs: z.array(z.string()).default([]),
  pendingConfirmationItems: z.array(PendingConfirmationItemSchema).optional(),
})

export const SolutionRequirementSchema = z.object({
  id: z.string(),
  projectName: z.string(),
  scopeType: z.enum(["cloud", "data-center", "hybrid"]),
  artifactRequests: z.array(ArtifactTypeSchema).default([]),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  vendor: z.string().optional(),
  model: z.string().optional(),
  redundancyIntent: z.enum([
    "single-homed",
    "dual-homed-preferred",
    "dual-homed-required",
  ]).optional(),
  rackId: z.string().optional(),
  rackPosition: z.number().int().positive().optional(),
  rackUnitHeight: z.number().int().positive().optional(),
  highAvailabilityGroup: z.string().optional(),
  highAvailabilityRole: HighAvailabilityRoleSchema.optional(),
  powerWatts: z.number().positive().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const RackSchema = z.object({
  id: z.string(),
  name: z.string(),
  siteId: z.string().optional(),
  room: z.string().optional(),
  row: z.string().optional(),
  uHeight: z.number().int().positive().optional(),
  maxPowerKw: z.number().positive().optional(),
  adjacentRackIds: z.array(z.string()).optional(),
  adjacentColumnRackIds: z.array(z.string()).optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const PortSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  name: z.string(),
  purpose: z.string().optional(),
  portType: PortTypeSchema.optional(),
  portIndex: z.number().int().nonnegative().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const LinkEndpointSchema = z.object({
  portId: z.string(),
})

export const LinkSchema = z.object({
  id: z.string(),
  endpointA: LinkEndpointSchema,
  endpointB: LinkEndpointSchema,
  purpose: z.string().optional(),
  linkType: LinkTypeSchema.optional(),
  redundancyGroup: z.string().optional(),
  cableId: z.string().optional(),
  cableName: z.string().optional(),
  cableSpec: z.string().optional(),
  cableCount: z.number().int().positive().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const NetworkSegmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  segmentType: z.enum([
    "vlan",
    "subnet",
    "vrf",
    "mgmt",
    "storage",
    "service",
  ]),
  cidr: z.string().optional(),
  gateway: z.string().optional(),
  purpose: z.string(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const IpAllocationTypeSchema = z.enum([
  "gateway",
  "device",
  "service",
  "reserved",
])

export const IpAllocationSchema = z.object({
  id: z.string(),
  segmentId: z.string(),
  allocationType: IpAllocationTypeSchema,
  ipAddress: z.string(),
  deviceId: z.string().optional(),
  hostname: z.string().optional(),
  interfaceName: z.string().optional(),
  purpose: z.string().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const ValidationIssueCodeSchema = z.enum([
  "network_segments_missing",
  "duplicate_device_id",
  "duplicate_rack_id",
  "duplicate_segment_id",
  "device_inventory_missing",
  "device_rack_required",
  "device_rack_missing",
  "device_rack_position_required",
  "device_rack_unit_height_required",
  "physical_racks_missing",
  "physical_devices_missing",
  "physical_ports_missing",
  "device_cabling_links_missing",
  "rack_layout_devices_missing",
  "port_connection_links_missing",
  "physical_fact_not_confirmed",
  "ip_allocations_missing",
  "network_fact_not_confirmed",
  "device_redundancy_links_insufficient",
  "device_redundancy_peers_insufficient",
  "redundancy_group_missing",
  "redundancy_group_inconsistent",
  "segment_cidr_required",
  "segment_cidr_invalid",
  "segment_cidr_overlap",
  "segment_gateway_required",
  "segment_gateway_invalid",
  "segment_gateway_requires_cidr",
  "segment_gateway_outside_cidr",
  "duplicate_allocation_id",
  "allocation_segment_missing",
  "allocation_ip_invalid",
  "allocation_ip_outside_segment",
  "allocation_device_missing",
  "duplicate_allocation_ip",
  "duplicate_port_id",
  "port_device_missing",
  "duplicate_link_id",
  "link_port_missing",
  "link_self_reference",
  "duplicate_link_connection",
  "inter_rack_link_same_rack",
  "multi_rack_links_missing",
  "rack_position_overlap",
  "rack_position_exceeds_height",
  "rack_power_budget_missing",
  "device_power_missing",
  "rack_power_threshold_exceeded",
  "ha_group_role_missing",
  "ha_group_role_incomplete",
  "ha_group_not_adjacent",
  "plane_link_port_type_mismatch",
  "peer_link_endpoint_invalid",
  "peer_link_ha_group_invalid",
  "inter_switch_link_endpoint_invalid",
  "uplink_link_endpoint_invalid",
  "redundancy_peer_ha_group_invalid",
  "mlag_port_index_mismatch",
  "conflict_duplicate_device",
  "conflict_contradictory_attribute",
  "conflict_duplicate_port_id",
  "conflict_impossible_connection",
  "conflict_segment_overlap",
])

export const ValidationIssueSubjectTypeSchema = z.enum([
  "requirement",
  "device",
  "rack",
  "segment",
  "allocation",
  "port",
  "link",
])

export const ConflictTypeSchema = z.enum([
  "duplicate_device",
  "contradictory_device_attribute",
  "duplicate_port_id",
  "impossible_port",
  "impossible_link_connection",
  "link_endpoint_conflict",
  "segment_address_overlap",
  "segment_gateway_conflict",
  "duplicate_allocation_ip",
  "allocation_segment_conflict",
])

export const ConflictSchema = z.object({
  id: z.string(),
  conflictType: ConflictTypeSchema,
  severity: z.enum(["blocking", "warning"]),
  message: z.string(),
  entityRefs: z.array(z.string()),
  sourceRefs: z.array(SourceReferenceSchema),
  suggestedResolution: z.string().optional(),
  attributes: z.record(z.string(), z.array(z.unknown())).optional(),
})

export const ConflictReportSchema = z.object({
  conflicts: z.array(ConflictSchema).default([]),
  blockingConflictCount: z.number().int().nonnegative().default(0),
  warningConflictCount: z.number().int().nonnegative().default(0),
  hasBlockingConflicts: z.boolean().default(false),
})

export const ValidationIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["blocking", "warning", "informational"]),
  code: ValidationIssueCodeSchema,
  message: z.string(),
  subjectType: ValidationIssueSubjectTypeSchema,
  subjectId: z.string(),
  path: z.string().optional(),
  entityRefs: z.array(z.string()).default([]),
  blocking: z.boolean(),
})

export const CloudSolutionSliceInputSchema = z.object({
  requirement: SolutionRequirementSchema,
  devices: z.array(DeviceSchema).default([]),
  racks: z.array(RackSchema).default([]),
  ports: z.array(PortSchema).default([]),
  links: z.array(LinkSchema).default([]),
  segments: z.array(NetworkSegmentSchema).default([]),
  allocations: z.array(IpAllocationSchema).default([]),
})

export const DeviceCablingTableRowSchema = z.object({
  linkId: z.string(),
  endpointARackName: z.string(),
  endpointARackId: z.string(),
  endpointARackPosition: z.number().int().positive(),
  endpointADeviceName: z.string(),
  endpointADeviceId: z.string(),
  endpointAPortName: z.string(),
  endpointAPortId: z.string(),
  endpointBRackName: z.string(),
  endpointBRackId: z.string(),
  endpointBRackPosition: z.number().int().positive(),
  endpointBDeviceName: z.string(),
  endpointBDeviceId: z.string(),
  endpointBPortName: z.string(),
  endpointBPortId: z.string(),
  purpose: z.string().optional(),
  linkType: LinkTypeSchema.optional(),
  redundancyGroup: z.string().optional(),
  cableId: z.string().optional(),
  cableName: z.string().optional(),
  cableSpec: z.string().optional(),
  cableCount: z.number().int().positive().optional(),
})

export const DeviceRackLayoutRowSchema = z.object({
  rackName: z.string(),
  rackId: z.string(),
  rackPosition: z.number().int().positive(),
  rackUnitHeight: z.number().int().positive(),
  deviceName: z.string(),
  deviceId: z.string(),
  deviceRole: z.string(),
  highAvailabilityGroup: z.string().optional(),
  highAvailabilityRole: HighAvailabilityRoleSchema.optional(),
  powerWatts: z.number().positive().optional(),
})

export const DevicePortPlanRowSchema = z.object({
  rackName: z.string(),
  rackId: z.string(),
  rackPosition: z.number().int().positive(),
  rackUnitHeight: z.number().int().positive(),
  deviceName: z.string(),
  deviceId: z.string(),
  portName: z.string(),
  portId: z.string(),
  portPurpose: z.string().optional(),
  portType: PortTypeSchema.optional(),
  portIndex: z.number().int().nonnegative().optional(),
  connectionRefs: z.string().optional(),
  peerRefs: z.string().optional(),
  redundancyGroups: z.string().optional(),
})

export const DesignReviewItemKindSchema = z.enum([
  "assumption",
  "gap",
  "unresolved-item",
])

export const DesignReviewItemRowSchema = z.object({
  kind: DesignReviewItemKindSchema,
  severity: z.enum(["blocking", "warning", "informational"]),
  subjectType: ValidationIssueSubjectTypeSchema,
  subjectId: z.string(),
  title: z.string(),
  detail: z.string(),
  confidenceState: ConfidenceStateSchema.optional(),
  entityRefs: z.array(z.string()).default([]),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
})

export const PortConnectionTableRowSchema = z.object({
  linkId: z.string(),
  endpointARackName: z.string().optional(),
  endpointARackId: z.string().optional(),
  endpointARackPosition: z.number().int().positive().optional(),
  endpointADeviceName: z.string(),
  endpointADeviceId: z.string(),
  endpointAPortName: z.string(),
  endpointAPortId: z.string(),
  endpointBRackName: z.string().optional(),
  endpointBRackId: z.string().optional(),
  endpointBRackPosition: z.number().int().positive().optional(),
  endpointBDeviceName: z.string(),
  endpointBDeviceId: z.string(),
  endpointBPortName: z.string(),
  endpointBPortId: z.string(),
  purpose: z.string().optional(),
  redundancyGroup: z.string().optional(),
})

export const IpAllocationTableRowSchema = z.object({
  allocationId: z.string(),
  segmentId: z.string(),
  segmentName: z.string(),
  segmentCidr: z.string(),
  allocationType: IpAllocationTypeSchema,
  ipAddress: z.string(),
  consumerRef: z.string().optional(),
  gateway: z.string().optional(),
  purpose: z.string().optional(),
})

export const GeneratedArtifactSchema = z.object({
  name: z.string(),
  mimeType: z.literal("text/markdown"),
  content: z.string(),
})

export const ValidationSummarySchema = z.object({
  valid: z.boolean(),
  blockingIssueCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  informationalIssueCount: z.number().int().nonnegative(),
  issues: z.array(ValidationIssueSchema),
})

export const DesignGapSummarySchema = z.object({
  reviewRequired: z.boolean(),
  blockingGapCount: z.number().int().nonnegative(),
  assumptionCount: z.number().int().nonnegative(),
  unresolvedItemCount: z.number().int().nonnegative(),
  assumptions: z.array(DesignReviewItemRowSchema),
  gaps: z.array(DesignReviewItemRowSchema),
  unresolvedItems: z.array(DesignReviewItemRowSchema),
  conflicts: z.array(ConflictSchema).default([]),
  blockingConflictCount: z.number().int().nonnegative().default(0),
  warningConflictCount: z.number().int().nonnegative().default(0),
  hasBlockingConflicts: z.boolean().default(false),
  conflictArtifact: GeneratedArtifactSchema.optional(),
  artifact: GeneratedArtifactSchema,
})

export const ArtifactBundleExportSchema = z.object({
  exportReady: z.boolean(),
  reviewRequired: z.boolean(),
  requestedArtifactTypes: z.array(ArtifactTypeSchema),
  includedArtifactNames: z.array(z.string()),
  validationSummary: ValidationSummarySchema,
  reviewSummary: DesignGapSummarySchema,
  bundleIndex: GeneratedArtifactSchema,
  artifacts: z.array(GeneratedArtifactSchema),
})

export const CloudSolutionModelSchema = CloudSolutionSliceInputSchema.extend({
  issues: z.array(ValidationIssueSchema).default([]),
})

export const SUPPORTED_ENTITY_KINDS = [
  "SolutionRequirement",
  "Device",
  "Rack",
  "Port",
  "Link",
  "NetworkSegment",
  "IpAllocation",
  "ValidationIssue",
] as const

export type ArtifactType = z.infer<typeof ArtifactTypeSchema>
export type ConfidenceState = z.infer<typeof ConfidenceStateSchema>
export type PortType = z.infer<typeof PortTypeSchema>
export type LinkType = z.infer<typeof LinkTypeSchema>
export type HighAvailabilityRole = z.infer<typeof HighAvailabilityRoleSchema>
export type DraftInputState = z.infer<typeof DraftInputStateSchema>
export type SourceReference = z.infer<typeof SourceReferenceSchema>
export type CandidateFact = z.infer<typeof CandidateFactSchema>
export type CandidateFactPromotion = z.infer<typeof CandidateFactPromotionSchema>
export type PendingConfirmationItemKind = z.infer<typeof PendingConfirmationItemKindSchema>
export type PendingConfirmationItem = z.infer<typeof PendingConfirmationItemSchema>
export type CandidateFactConfirmationSummary = z.infer<typeof CandidateFactConfirmationSummarySchema>
export type SolutionRequirement = z.infer<typeof SolutionRequirementSchema>
export type CloudSolutionSliceInput = z.infer<typeof CloudSolutionSliceInputSchema>
export type Device = z.infer<typeof DeviceSchema>
export type Rack = z.infer<typeof RackSchema>
export type Port = z.infer<typeof PortSchema>
export type LinkEndpoint = z.infer<typeof LinkEndpointSchema>
export type Link = z.infer<typeof LinkSchema>
export type NetworkSegment = z.infer<typeof NetworkSegmentSchema>
export type IpAllocationType = z.infer<typeof IpAllocationTypeSchema>
export type IpAllocation = z.infer<typeof IpAllocationSchema>
export type ValidationIssueCode = z.infer<typeof ValidationIssueCodeSchema>
export type ValidationIssueSubjectType = z.infer<
  typeof ValidationIssueSubjectTypeSchema
>
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>
export type DeviceCablingTableRow = z.infer<typeof DeviceCablingTableRowSchema>
export type DeviceRackLayoutRow = z.infer<typeof DeviceRackLayoutRowSchema>
export type DevicePortPlanRow = z.infer<typeof DevicePortPlanRowSchema>
export type DesignReviewItemKind = z.infer<typeof DesignReviewItemKindSchema>
export type DesignReviewItemRow = z.infer<typeof DesignReviewItemRowSchema>
export type IpAllocationTableRow = z.infer<typeof IpAllocationTableRowSchema>
export type PortConnectionTableRow = z.infer<typeof PortConnectionTableRowSchema>
export type GeneratedArtifact = z.infer<typeof GeneratedArtifactSchema>
export type ValidationSummary = z.infer<typeof ValidationSummarySchema>
export type DesignGapSummary = z.infer<typeof DesignGapSummarySchema>
export type ArtifactBundleExport = z.infer<typeof ArtifactBundleExportSchema>
export type CloudSolutionModel = z.infer<typeof CloudSolutionModelSchema>
export type ConflictType = z.infer<typeof ConflictTypeSchema>
export type Conflict = z.infer<typeof ConflictSchema>
export type ConflictReport = z.infer<typeof ConflictReportSchema>
