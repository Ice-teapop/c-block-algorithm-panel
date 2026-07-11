import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CParser } from "../../src/core/index.js";
import {
  createDefaultFlowViewState,
  serializeFlowViewState,
  type FlowProjection,
} from "../../src/flow/index.js";
import {
  restoreFlowDraftSidecarState,
  serializeFlowDraftSidecarState,
} from "../../src/app/flow-sidecar-state.js";
import {
  FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION,
  readFlowWorkbenchSidecar,
  restoreFlowProjectionSidecarState,
  type FlowWorkbenchSidecar,
} from "../../src/app/flow-workbench-controller.js";
import { connectVirtualFlowOverlay } from "../../src/app/virtual-flow-overlay.js";
import type { FlowCanvasDraftNode, FlowCanvasDraftVisualState } from "../../src/ui/flow-canvas.js";
import { createTestParser } from "../core/parser-fixture.js";
import { analyzeFlowFixture } from "../flow/fixture.js";

describe("flow workbench sidecar anchors", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("persists projection endpoints as anchors and derives edge IDs again on restore", () => {
    const projection = analyzeFlowFixture(
      parser,
      "int f(void) { int x = 0; x++; return x; }\n",
    ).projection;
    const state = connectedVirtualState(projection);
    const serialized = serializeFlowDraftSidecarState(state, projection) as {
      virtualEdges: Array<Record<string, unknown>>;
    };
    const json = JSON.stringify(serialized);

    expect(serialized.virtualEdges).toHaveLength(2);
    for (const edge of serialized.virtualEdges) {
      expect(edge).not.toHaveProperty("id");
      expect(edge).not.toHaveProperty("status");
      expect(edge).not.toHaveProperty("sourceEdgeIds");
    }
    for (const node of projection.nodes) expect(json).not.toContain(node.id);
    for (const edge of projection.edges) expect(json).not.toContain(edge.id);
    const restored = restoreFlowDraftSidecarState(serialized, projection, {
      schemaVersion: 2,
      savedSourceFingerprint: projection.sourceFingerprint,
      sourceMatches: true,
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("v2 虚拟边应恢复");
    expect(restored.issues).toEqual([]);
    expect(restored.state.virtualEdges).toHaveLength(2);
    expect(restored.state.virtualEdges?.every((edge) => edge.status === "valid")).toBe(true);
    expect(restored.state.virtualEdges?.flatMap((edge) => edge.sourceEdgeIds)).not.toEqual([]);
  });

  it("keeps anchored view and virtual edges pending until progressive CFG reaches the function", () => {
    const projection = analyzeFlowFixture(
      parser,
      "int f(void) { int x = 0; x++; return x; }\n",
    ).projection;
    const declaration = projection.nodes.find((node) => node.sourceText.trim() === "int x = 0;");
    if (declaration === undefined) throw new Error("fixture 缺少声明节点");
    const defaults = createDefaultFlowViewState(projection);
    const moved = Object.freeze({ x: 444, y: 222 });
    const viewState = Object.freeze({
      ...defaults,
      positions: Object.freeze({ ...defaults.positions, [declaration.id]: moved }),
      selectedNodeIds: Object.freeze([declaration.id]),
      detailNodeId: declaration.id,
    });
    const sidecar: FlowWorkbenchSidecar = Object.freeze({
      schemaVersion: FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION,
      sourceFingerprint: projection.sourceFingerprint,
      viewState: JSON.parse(serializeFlowViewState(viewState, projection)) as unknown,
      layoutPreset: "build",
      layouts: Object.freeze({}),
      panelVisibility: Object.freeze({}),
      drafts: serializeFlowDraftSidecarState(connectedVirtualState(projection), projection),
    });
    const emptyProjection: FlowProjection = Object.freeze({
      ...projection,
      functions: Object.freeze([]),
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
      dataEdges: Object.freeze([]),
    });

    const progressive = restoreFlowProjectionSidecarState(sidecar, emptyProjection, true);
    expect(progressive.ok).toBe(true);
    if (!progressive.ok) throw new Error("空 CFG 应保留可重试 sidecar");
    expect(progressive.retryable).toBe(true);
    expect(progressive.viewState.positions).toEqual({});
    expect(progressive.draftState.virtualEdges).toEqual([]);

    const complete = restoreFlowProjectionSidecarState(sidecar, projection, true);
    expect(complete.ok).toBe(true);
    if (!complete.ok) throw new Error("完整 CFG 应恢复 sidecar");
    expect(complete.retryable).toBe(false);
    expect(complete.viewState.positions[declaration.id]).toEqual(moved);
    expect(complete.viewState.selectedNodeIds).toEqual([declaration.id]);
    expect(complete.viewState.detailNodeId).toBe(declaration.id);
    expect(complete.draftState.virtualEdges).toHaveLength(2);
  });

  it("rebinds unique virtual endpoints after source shifts and drops ambiguous endpoints", () => {
    const oldProjection = analyzeFlowFixture(
      parser,
      "int f(void) { int x = 0; x++; return x; }\n",
    ).projection;
    const serialized = serializeFlowDraftSidecarState(
      connectedVirtualState(oldProjection),
      oldProjection,
    );
    const shifted = analyzeFlowFixture(
      parser,
      "#include <stddef.h>\nint f(void) { int x = 0; x++; return x; }\n",
      2,
    ).projection;

    const rebound = restoreFlowDraftSidecarState(serialized, shifted, {
      schemaVersion: 2,
      savedSourceFingerprint: oldProjection.sourceFingerprint,
      sourceMatches: false,
    });

    expect(rebound.ok).toBe(true);
    if (!rebound.ok) throw new Error("唯一虚拟端点应恢复");
    expect(rebound.issues).toEqual([]);
    expect(rebound.state.virtualEdges?.every((edge) => edge.status === "valid")).toBe(true);

    const ambiguous = analyzeFlowFixture(
      parser,
      "int f(void) { int x = 0; x++; x++; return x; }\n",
      3,
    ).projection;
    const partial = restoreFlowDraftSidecarState(serialized, ambiguous, {
      schemaVersion: 2,
      savedSourceFingerprint: oldProjection.sourceFingerprint,
      sourceMatches: false,
    });

    expect(partial.ok).toBe(true);
    if (!partial.ok) throw new Error("歧义虚拟端点应局部丢弃");
    expect(partial.issues.map((entry) => entry.code)).toContain("ambiguous-anchor");
    expect(partial.state.nodes.map((node) => node.id)).toEqual(["draft:pause"]);
    expect(partial.state.virtualEdges?.every((edge) => edge.status === "pending")).toBe(true);
  });

  it("reads legacy v1 only against the exact source and migrates on the next v2 save", () => {
    const projection = analyzeFlowFixture(
      parser,
      "int f(void) { int x = 0; x++; return x; }\n",
    ).projection;
    const legacy = connectedVirtualState(projection);

    const exact = restoreFlowDraftSidecarState(legacy, projection, {
      schemaVersion: 1,
      savedSourceFingerprint: projection.sourceFingerprint,
      sourceMatches: true,
    });
    const stale = restoreFlowDraftSidecarState(legacy, projection, {
      schemaVersion: 1,
      savedSourceFingerprint: "old",
      sourceMatches: false,
    });

    expect(exact.ok).toBe(true);
    if (!exact.ok) throw new Error("同源码 v1 应恢复");
    expect(exact.state.virtualEdges).toHaveLength(2);
    const migrated = JSON.stringify(serializeFlowDraftSidecarState(exact.state, projection));
    for (const edge of projection.edges) expect(migrated).not.toContain(edge.id);
    expect(stale.ok).toBe(true);
    if (!stale.ok) throw new Error("旧版 stale 应安全降级");
    expect(stale.state.nodes).toHaveLength(1);
    expect(stale.state.virtualEdges).toEqual([]);
    expect(stale.issues.map((entry) => entry.code)).toEqual(["legacy-stale-source"]);
  });

  it("accepts workbench sidecar v1/v2 envelopes and rejects unknown versions", () => {
    const base = {
      sourceFingerprint: "source:a",
      viewState: {},
      layoutPreset: "build",
      layouts: {},
      panelVisibility: {},
      drafts: { nodes: [], selectedNodeIds: [], connection: null, virtualEdges: [] },
    };

    expect(readFlowWorkbenchSidecar({ ...base, schemaVersion: 1 })).toMatchObject({
      schemaVersion: 1,
    });
    expect(
      readFlowWorkbenchSidecar({
        ...base,
        schemaVersion: FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION,
      }),
    ).toMatchObject({ schemaVersion: 2 });
    expect(readFlowWorkbenchSidecar({ ...base, schemaVersion: 3 })).toBeNull();
  });
});

function connectedVirtualState(projection: FlowProjection): FlowCanvasDraftVisualState {
  const source = projection.nodes.find((node) => node.sourceText.trim() === "x++;");
  const target = projection.nodes.find((node) => node.sourceText.trim() === "return x;");
  const sourceEdge = projection.edges.find(
    (edge) => edge.from.nodeId === source?.id && edge.to.nodeId === target?.id,
  );
  if (source === undefined || target === undefined || sourceEdge === undefined) {
    throw new Error("fixture 缺少 x++ -> return x CFG 边");
  }
  const virtual = virtualNode();
  const initial: FlowCanvasDraftVisualState = Object.freeze({
    nodes: Object.freeze([virtual]),
    selectedNodeIds: Object.freeze([]),
    connection: null,
    virtualEdges: Object.freeze([]),
  });
  const incoming = connectVirtualFlowOverlay(projection, initial, {
    sourceFingerprint: projection.sourceFingerprint,
    from: Object.freeze({
      source: "projection",
      nodeId: sourceEdge.from.nodeId,
      portId: sourceEdge.from.portId,
    }),
    to: Object.freeze({ source: "virtual", nodeId: virtual.id, portId: "draft:pause:in" }),
  });
  return connectVirtualFlowOverlay(projection, incoming, {
    sourceFingerprint: projection.sourceFingerprint,
    from: Object.freeze({ source: "virtual", nodeId: virtual.id, portId: "draft:pause:out" }),
    to: Object.freeze({
      source: "projection",
      nodeId: sourceEdge.to.nodeId,
      portId: sourceEdge.to.portId,
    }),
  });
}

function virtualNode(): FlowCanvasDraftNode {
  return Object.freeze({
    id: "draft:pause",
    label: "Pause",
    position: Object.freeze({ x: 320, y: 180 }),
    status: "valid",
    presetId: "builtin.flow.pause",
    presetVersion: "1.0.0",
    blockKind: "virtual",
    ports: Object.freeze([
      Object.freeze({
        id: "draft:pause:in",
        direction: "input",
        channel: "control",
        edgeKind: null,
        label: "进入",
        editable: true,
      }),
      Object.freeze({
        id: "draft:pause:out",
        direction: "output",
        channel: "control",
        edgeKind: "next",
        label: "继续",
        editable: true,
      }),
    ]),
  });
}
