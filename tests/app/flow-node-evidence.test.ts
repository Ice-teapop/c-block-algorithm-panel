import { describe, expect, it } from "vitest";
import type { ProgramAnalysisSnapshot } from "../../src/analysis/index.js";
import { evidenceForFlowNode } from "../../src/app/flow-node-evidence.js";
import { textRange } from "../../src/core/model.js";
import {
  FLOW_PROJECTION_SCHEMA_VERSION,
  type FlowNode,
  type FlowProjection,
} from "../../src/flow/index.js";

describe("flow node detail evidence", () => {
  it("joins exact static findings and real visit counts", () => {
    const projection = fixtureProjection();
    const node = projection.nodes[0]!;
    const evidence = evidenceForFlowNode(node, projection, fixtureAnalysis(), {
      sourceFingerprint: projection.sourceFingerprint,
      mode: "real",
      currentNodeId: node.id,
      nodeVisitCounts: { [node.id]: 3 },
    });

    expect(evidence).toEqual({
      diagnostics: [
        {
          id: "finding:1",
          ruleId: "unreachable-code",
          confidence: "certain",
          subject: "value",
        },
      ],
      runtime: { mode: "real", visitCount: 3, current: true },
    });
  });

  it("drops stale analysis and runtime snapshots instead of guessing", () => {
    const projection = fixtureProjection();
    const node = projection.nodes[0]!;
    expect(
      evidenceForFlowNode(
        node,
        projection,
        { ...fixtureAnalysis(), sourceFingerprint: "sha256:stale" },
        {
          sourceFingerprint: "sha256:stale",
          mode: "simulation",
          currentNodeId: node.id,
          nodeVisitCounts: { [node.id]: 8 },
        },
      ),
    ).toEqual({ diagnostics: [], runtime: null });
  });
});

function fixtureProjection(): FlowProjection {
  const node: FlowNode = Object.freeze({
    id: "flow:statement",
    functionId: "fn:main",
    sourceNodeId: "cfg:statement",
    kind: "statement",
    label: "value++",
    nodeType: "expression_statement",
    range: textRange(20, 28),
    ownerBlockRange: textRange(10, 40),
    sourceText: "value++;",
    reachable: true,
    locked: false,
    lockReasons: Object.freeze([]),
    allowsFanOut: false,
    defaultPosition: Object.freeze({ x: 20, y: 20 }),
    ports: Object.freeze([]),
  });
  return Object.freeze({
    schemaVersion: FLOW_PROJECTION_SCHEMA_VERSION,
    sourceRevision: 1,
    sourceFingerprint: "sha256:current",
    sourceLength: 64,
    documentHasError: false,
    functions: Object.freeze([]),
    nodes: Object.freeze([node]),
    edges: Object.freeze([]),
    dataEdges: Object.freeze([]),
  });
}

function fixtureAnalysis(): ProgramAnalysisSnapshot {
  return Object.freeze({
    revision: 1,
    sourceLength: 64,
    sourceFingerprint: "sha256:current",
    functions: Object.freeze([]),
    defUse: Object.freeze([]),
    memoryEvents: Object.freeze([]),
    memoryTypestate: Object.freeze([]),
    findings: Object.freeze([
      Object.freeze({
        id: "finding:1",
        functionId: "fn:main",
        ruleId: "unreachable-code",
        reason: "no-entry-path",
        confidence: "certain",
        primaryRange: textRange(20, 28),
        ownerNodeId: "cfg:statement",
        subject: "value",
        subjectVariableId: null,
        evidence: Object.freeze([]),
      }),
    ]),
  });
}
