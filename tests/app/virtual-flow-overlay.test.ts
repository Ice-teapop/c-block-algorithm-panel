import { describe, expect, it } from "vitest";
import {
  activeVirtualPlaybackNodes,
  connectVirtualFlowOverlay,
  decoratePathWithVirtualOverlay,
  reconcileVirtualFlowOverlay,
} from "../../src/app/virtual-flow-overlay.js";
import { textRange } from "../../src/core/index.js";
import {
  FLOW_PROJECTION_SCHEMA_VERSION,
  type FlowEdge,
  type FlowNode,
  type FlowPort,
  type FlowProjection,
} from "../../src/flow/index.js";
import type {
  FlowCanvasActivePath,
  FlowCanvasDraftNode,
  FlowCanvasDraftVisualState,
  FlowCanvasVirtualEndpoint,
} from "../../src/ui/flow-canvas.js";

describe("virtual playback overlay", () => {
  it("binds Pause to one exact existing CFG edge without changing the projection", () => {
    const projection = fixtureProjection();
    const initial = fixtureState([virtualNode("pause", "builtin.flow.pause")]);
    const first = connectVirtualFlowOverlay(
      projection,
      initial,
      intent(
        projection,
        endpoint("projection", "a", "a:out"),
        endpoint("virtual", "pause", "pause:in"),
      ),
    );
    expect(first.virtualEdges).toEqual([
      expect.objectContaining({ status: "pending", sourceEdgeIds: [] }),
    ]);

    const complete = connectVirtualFlowOverlay(
      projection,
      first,
      intent(
        projection,
        endpoint("virtual", "pause", "pause:out"),
        endpoint("projection", "b", "b:in"),
      ),
    );
    expect(complete.virtualEdges).toHaveLength(2);
    expect(complete.virtualEdges?.every((edge) => edge.status === "valid")).toBe(true);
    expect(complete.virtualEdges?.every((edge) => edge.sourceEdgeIds.includes("edge:a-b"))).toBe(
      true,
    );
    expect(projection.edges).toHaveLength(1);

    const decorated = decoratePathWithVirtualOverlay(complete, realPath(["edge:a-b"]));
    expect(decorated.nodeIds).toContain("pause");
    expect(decorated.edgeIds).toEqual(
      expect.arrayContaining(complete.virtualEdges?.map((edge) => edge.id) ?? []),
    );
    expect(activeVirtualPlaybackNodes(complete, ["edge:a-b"]).map((node) => node.id)).toEqual([
      "pause",
    ]);
  });

  it("rejects a completed overlay that does not bridge an existing CFG edge", () => {
    const projection = fixtureProjection();
    const initial = fixtureState([virtualNode("checkpoint", "builtin.flow.checkpoint")]);
    const first = connectVirtualFlowOverlay(
      projection,
      initial,
      intent(
        projection,
        endpoint("projection", "a", "a:out"),
        endpoint("virtual", "checkpoint", "checkpoint:in"),
      ),
    );

    expect(() =>
      connectVirtualFlowOverlay(
        projection,
        first,
        intent(
          projection,
          endpoint("virtual", "checkpoint", "checkpoint:out"),
          endpoint("projection", "c", "c:in"),
        ),
      ),
    ).toThrow(/并不对应同一条现有 CFG 边/u);
    expect(first.virtualEdges).toHaveLength(1);
  });

  it("drops stale projection anchors while retaining the virtual node snapshot", () => {
    const projection = fixtureProjection();
    const initial = fixtureState([virtualNode("pause", "builtin.flow.pause")]);
    const attached = connectVirtualFlowOverlay(
      projection,
      initial,
      intent(
        projection,
        endpoint("projection", "a", "a:out"),
        endpoint("virtual", "pause", "pause:in"),
      ),
    );
    const changed = Object.freeze({
      ...projection,
      sourceFingerprint: "source:changed",
      nodes: Object.freeze(projection.nodes.filter((node) => node.id !== "a")),
      edges: Object.freeze([]),
    });

    const reconciled = reconcileVirtualFlowOverlay(changed, attached);
    expect(reconciled.nodes.map((node) => node.id)).toEqual(["pause"]);
    expect(reconciled.virtualEdges).toEqual([]);
  });
});

function fixtureProjection(): FlowProjection {
  const aOut = port("a:out", "a", "output", "next");
  const bIn = port("b:in", "b", "input", null);
  const cIn = port("c:in", "c", "input", null);
  const nodes = Object.freeze([node("a", [aOut]), node("b", [bIn]), node("c", [cIn])]);
  const edge: FlowEdge = Object.freeze({
    id: "edge:a-b",
    functionId: "fn:main",
    from: Object.freeze({ nodeId: "a", portId: "a:out" }),
    to: Object.freeze({ nodeId: "b", portId: "b:in" }),
    kind: "next",
    channel: "control",
    slot: 0,
    editable: true,
  });
  return Object.freeze({
    schemaVersion: FLOW_PROJECTION_SCHEMA_VERSION,
    sourceRevision: 1,
    sourceFingerprint: "source:one",
    sourceLength: 10,
    documentHasError: false,
    functions: Object.freeze([]),
    nodes,
    edges: Object.freeze([edge]),
    dataEdges: Object.freeze([]),
  });
}

function node(id: string, ports: readonly FlowPort[]): FlowNode {
  return Object.freeze({
    id,
    functionId: "fn:main",
    sourceNodeId: id,
    kind: "statement",
    label: id,
    nodeType: "expression_statement",
    range: textRange(0, 1),
    ownerBlockRange: textRange(0, 1),
    sourceText: `${id}();`,
    reachable: true,
    locked: false,
    lockReasons: Object.freeze([]),
    allowsFanOut: false,
    defaultPosition: Object.freeze({ x: id.charCodeAt(0) * 2, y: 20 }),
    ports: Object.freeze([...ports]),
  });
}

function port(
  id: string,
  nodeId: string,
  direction: FlowPort["direction"],
  edgeKind: FlowPort["edgeKind"],
): FlowPort {
  return Object.freeze({
    id,
    nodeId,
    direction,
    channel: "control",
    edgeKind,
    label: direction,
    editable: true,
    capacity: direction === "input" ? "many" : "one",
    allowsFanOut: false,
  });
}

function virtualNode(id: string, presetId: string): FlowCanvasDraftNode {
  return Object.freeze({
    id,
    label: id,
    presetId,
    presetVersion: "1.0.0",
    blockKind: "virtual",
    position: Object.freeze({ x: 220, y: 80 }),
    status: "detached",
    ports: Object.freeze([
      Object.freeze({
        id: `${id}:in`,
        direction: "input",
        channel: "control",
        edgeKind: null,
        label: "进入",
        editable: true,
      }),
      Object.freeze({
        id: `${id}:out`,
        direction: "output",
        channel: "control",
        edgeKind: "next",
        label: "继续",
        editable: true,
      }),
    ]),
  });
}

function fixtureState(nodes: readonly FlowCanvasDraftNode[]): FlowCanvasDraftVisualState {
  return Object.freeze({
    nodes: Object.freeze([...nodes]),
    selectedNodeIds: Object.freeze([]),
    connection: null,
    virtualEdges: Object.freeze([]),
  });
}

function endpoint(
  source: FlowCanvasVirtualEndpoint["source"],
  nodeId: string,
  portId: string,
): FlowCanvasVirtualEndpoint {
  return Object.freeze({ source, nodeId, portId });
}

function intent(
  projection: FlowProjection,
  from: FlowCanvasVirtualEndpoint,
  to: FlowCanvasVirtualEndpoint,
) {
  return Object.freeze({ sourceFingerprint: projection.sourceFingerprint, from, to });
}

function realPath(edgeIds: readonly string[]): FlowCanvasActivePath {
  return Object.freeze({
    nodeIds: Object.freeze(["a", "b"]),
    edgeIds: Object.freeze([...edgeIds]),
    currentNodeId: "b",
    mode: "real",
  });
}
