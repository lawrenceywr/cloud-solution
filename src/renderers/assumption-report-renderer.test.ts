import { describe, expect, test } from "bun:test"

import { renderAssumptionReport } from "./assumption-report-renderer"

describe("renderAssumptionReport", () => {
  test("renders deterministic sections for assumptions, gaps, and unresolved items", () => {
    const artifact = renderAssumptionReport({
      projectName: "Review Example",
      reviewRequired: true,
      assumptions: [
        {
          kind: "assumption",
          severity: "warning",
          subjectType: "device",
          subjectId: "device-a",
          title: "Assumed device fact",
          detail: "device device-a is currently inferred and should be reviewed before export.",
          confidenceState: "inferred",
          entityRefs: ["device:device-a"],
          sourceRefs: [],
        },
      ],
      gaps: [
        {
          kind: "gap",
          severity: "blocking",
          subjectType: "segment",
          subjectId: "segment-a",
          title: "Blocking validation gap",
          detail: "Segment segment-a is missing required CIDR information.",
          entityRefs: ["segment:segment-a"],
          sourceRefs: [],
        },
      ],
      unresolvedItems: [
        {
          kind: "unresolved-item",
          severity: "warning",
          subjectType: "link",
          subjectId: "link-a",
          title: "Review warning",
          detail: "Link link-a should be reviewed.",
          entityRefs: ["link:link-a"],
          sourceRefs: [],
        },
      ],
      confirmationPackets: [],
    })

    expect(artifact.name).toBe("design-assumptions-and-gaps.md")
    expect(artifact.content).toContain("Review Required: yes")
    expect(artifact.content).toContain("## Assumptions")
    expect(artifact.content).toContain("## Blocking Gaps")
    expect(artifact.content).toContain("## Unresolved Review Items")
    expect(artifact.content).not.toContain("## Confirmation Packets")
  })

  test("escapes markdown table delimiters and flattens multiline values", () => {
    const artifact = renderAssumptionReport({
      projectName: "Escaping Example",
      reviewRequired: true,
      assumptions: [
        {
          kind: "assumption",
          severity: "warning",
          subjectType: "device",
          subjectId: "device|a",
          title: "Assumed | fact",
          detail: "line one\nline two | pipe",
          confidenceState: "inferred",
          entityRefs: ["device:device|a"],
          sourceRefs: [
            {
              kind: "document",
              ref: "rack|sheet\npage-1",
            },
          ],
        },
      ],
      gaps: [],
      unresolvedItems: [],
      confirmationPackets: [],
    })

    expect(artifact.content).toContain("device:device\\|a")
    expect(artifact.content).toContain("Assumed \\| fact")
    expect(artifact.content).toContain("line one <br> line two \\| pipe")
    expect(artifact.content).toContain("document:rack\\|sheet <br> page-1")
  })

  test("escapes project metadata in the report header", () => {
    const artifact = renderAssumptionReport({
      projectName: "Review & <Project> | Alpha\nBeta > Gamma",
      reviewRequired: false,
      assumptions: [],
      gaps: [],
      unresolvedItems: [],
      confirmationPackets: [],
    })

    expect(artifact.content).toContain(
      "Project: Review &amp; &lt;Project&gt; \\| Alpha <br> Beta &gt; Gamma",
    )
  })

  test("renders operator-facing confirmation packets with escaped markdown-safe details", () => {
    const artifact = renderAssumptionReport({
      projectName: "Packet Example",
      reviewRequired: true,
      assumptions: [],
      gaps: [],
      unresolvedItems: [],
      confirmationPackets: [
        {
          id: "template-plane-type-conflict|server-a:eth0|switch-a:1/1",
          kind: "template-plane-type-conflict",
          severity: "warning",
          title: "Confirm <plane> & review | packet",
          requiredDecision: "Operator must choose the authoritative plane/link type for server-a:eth0 ↔ switch-a:1/1: storage or business, then update the source/structured input accordingly.",
          currentAmbiguity: "Workbook-derived <link> & endpoint mismatch\nneeds operator review | now.",
          subjectType: "link",
          subjectId: "link-a",
          entityRefs: ["link:link-a", "port:port-a|1"],
          sourceRefs: [{ kind: "document", ref: "template<sheet>|1" }],
          endpoints: {
            endpointA: { deviceName: "server-a", portName: "eth0" },
            endpointB: { deviceName: "switch-a", portName: "1/1" },
          },
          suggestedAction: "Confirm with the operator & update the structured input <exactly>.",
        },
      ],
    })

    expect(artifact.content).toContain("## Confirmation Packets")
    expect(artifact.content).toContain("### 1. Confirm &lt;plane&gt; &amp; review \\| packet")
    expect(artifact.content).toContain("- Required Decision: Operator must choose the authoritative plane/link type for server-a:eth0 ↔ switch-a:1/1: storage or business, then update the source/structured input accordingly.")
    expect(artifact.content).toContain("- Current Ambiguity: Workbook-derived &lt;link&gt; &amp; endpoint mismatch <br> needs operator review \\| now.")
    expect(artifact.content).toContain("- Suggested Action: Confirm with the operator &amp; update the structured input &lt;exactly&gt;.")
    expect(artifact.content).toContain("- Endpoints: server-a:eth0 ↔ switch-a:1/1")
    expect(artifact.content).toContain("- Entity Refs: link:link-a, port:port-a\\|1")
    expect(artifact.content).toContain("- Source Refs: document:template&lt;sheet&gt;\\|1")
  })
})
