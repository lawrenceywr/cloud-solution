import { z } from "zod"

export const ConfidenceStateSchema = z.enum([
  "confirmed",
  "inferred",
  "unresolved",
])

export const ArtifactTypeSchema = z.enum([
  "device-cabling-table",
  "device-port-plan",
  "device-port-connection-table",
  "ip-allocation-table",
])

export const SourceReferenceSchema = z.object({
  kind: z.enum(["user-input", "inventory", "diagram", "document", "system"]),
  ref: z.string(),
  note: z.string().optional(),
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
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: ConfidenceStateSchema.default("confirmed"),
})

export const PortSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  name: z.string(),
  purpose: z.string().optional(),
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
  redundancyGroup: z.string().optional(),
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
  redundancyGroup: z.string().optional(),
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
export type SourceReference = z.infer<typeof SourceReferenceSchema>
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
