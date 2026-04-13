# Stage-07 Evidence Reconciliation Implementation Plan

## Scenario Goal

Implement comprehensive evidence reconciliation capabilities to detect, report, and block on conflicts that arise when multiple sources (documents, diagrams, inventory lists, user input) provide contradictory or overlapping information about the same entities in cloud and data-center solution designs.

## Implemented Conflict Detection Rules

### Device-Level Conflicts
- **Contradictory Device Attributes**: Detect when the same device has conflicting values for critical attributes like `rackId`, `role`, `rackPosition`, `vendor`, or `model` across different sources
- **Duplicate Device IDs**: Identify when the same device ID appears multiple times with potentially different configurations

### Port-Level Conflicts  
- **Duplicate Port IDs**: Detect when the same port name appears multiple times on the same device across different sources
- **Impossible Port Configurations**: Flag ports that have contradictory purposes or configurations

### Link-Level Conflicts
- **Link Endpoint Conflicts**: Identify when the same logical link references different physical endpoints across sources
- **Impossible Link Connections**: Detect connections that violate physical or logical constraints

### Network Segment Conflicts
- **Segment Address Overlap**: Detect when network segments have overlapping CIDR ranges that could cause routing conflicts
- **Segment Gateway Conflicts**: Identify when overlapping segments share the same gateway IP address
- **Invalid CIDR/Gateway Combinations**: Flag segments with invalid CIDR notation or gateways outside their defined ranges

### IP Allocation Conflicts
- **Duplicate IP Allocations**: Detect when the same IP address is assigned to multiple devices within the same network segment
- **Allocation-Segment Conflicts**: Identify allocations that reference non-existent segments or have IPs outside their segment's CIDR range

## Worker Architecture Design

### Implemented Conflict Detection Pipeline

The evidence reconciliation system integrates into the existing coordinator architecture as a detect/report/block step:

1. **Prepared Slice Input**: Uses normalized candidate facts and canonical inputs already prepared by the draft/review features
2. **Deterministic Conflict Detection**: Applies repository conflict rules before any child-session worker runs
3. **Evidence Reconciliation Worker**: Returns additional conflict items and warnings using the shared coordinator protocol
4. **Review Workflow Gating**: Feeds blocking conflicts back into review/export state so export stops until humans resolve the contradictions outside the current workflow

### Conflict Severity Classification

- **Blocking Conflicts**: Prevent workflow progression and artifact export until resolved
  - Contradictory critical attributes (rack assignment, device role)
  - Duplicate identifiers that prevent unique entity resolution  
  - Network conflicts that would cause operational failures (IP duplicates, overlapping CIDRs)
- **Warning Conflicts**: Allow workflow progression but require user acknowledgment
  - Minor attribute discrepancies
  - Non-critical configuration differences
  - Potentially redundant information

### Integration with Existing System

The evidence reconciliation workers integrate seamlessly with the existing:
- **Candidate Fact System**: Builds upon the established `candidate_fact_draft` input state
- **Confirmation Framework**: Uses the same confirmation mechanism as SCN-05 document-assisted drafting
- **Review Workflow**: Extends the existing review workflow with conflict-specific validation steps
- **Artifact Generation**: Produces conflict reports as additional review artifacts alongside standard planning outputs

## Coordinator Integration

### Workflow State Integration

The implemented coordinator integration keeps the existing review/export state machine and feeds conflict severity back into those existing states:

- `blocked`: one or more blocking conflicts prevent review/export progression
- `review_required`: warning conflicts or unresolved review items still require human attention
- `export_ready`: no blocking conflicts remain and the validated slice is ready for export

### Message Passing Protocol

Workers communicate through the existing standardized worker result envelope:

- `workerId`
- `status`
- `output.conflicts`
- `output.reconciliationWarnings`
- `recommendations`
- optional `errors`

### Dependency Management

The evidence reconciliation workflow maintains proper dependencies:
- Runs after candidate fact collection and normalization
- Blocks artifact generation while blocking conflicts remain
- Defers actual human conflict-resolution decisions to a later explicit workflow slice

## Testing Strategy

### Unit Testing Approach

- **Individual Rule Testing**: Each conflict detection rule tested in isolation with targeted fixtures
- **Edge Case Coverage**: Comprehensive testing of boundary conditions and edge cases
- **Performance Testing**: Validation of conflict detection performance with large datasets

### Integration Testing Approach  

- **SCN-06 End-to-End Testing**: Complete integration test using the multi-document conflict scenario
- **Workflow State Testing**: Verification of proper workflow state transitions through conflict scenarios
- **Artifact Generation Testing**: Validation that conflict reports are properly generated and formatted

### Acceptance Testing Criteria

- Conflicts are correctly detected and classified by severity
- Blocking conflicts prevent workflow progression
- Warning conflicts allow progression with appropriate warnings
- Conflict reports are properly formatted and include all relevant details
- The workflow clearly stops at detect / report / block rather than pretending to auto-resolve conflicts

## Acceptance Standards

### Functional Requirements

1. **Accurate Conflict Detection**: All specified conflict types must be reliably detected across diverse input scenarios
2. **Proper Severity Classification**: Conflicts must be correctly classified as blocking or warning based on their impact
3. **Comprehensive Reporting**: Conflict reports must include all necessary details for user understanding and resolution
4. **Workflow Integration**: The system must properly block or allow workflow progression based on conflict severity
5. **Scope Discipline**: The system must not claim automatic conflict-resolution tracking before that workflow exists

### Quality Requirements

1. **Deterministic Behavior**: Identical inputs must produce identical conflict detection results
2. **Performance**: Conflict detection must complete within reasonable timeframes for typical enterprise scenarios
3. **Maintainability**: Conflict detection rules must be modular and easily extensible
4. **Documentation**: All conflict types and resolution strategies must be well-documented

### Success Metrics

- 100% detection rate for all defined conflict types in test scenarios
- Zero false positives in baseline test cases
- Conflict reports contain all necessary information for user resolution
- Workflow properly blocks on blocking conflicts and allows progression on warnings only
- Phase 7 implementation passes all acceptance tests including SCN-06 detect/report/block behavior
