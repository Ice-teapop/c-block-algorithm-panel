import { describe, expect, it } from "vitest";
import { textRange } from "../../src/core/model.js";
import {
  FLOW_PROJECTION_SCHEMA_VERSION,
  FLOW_VIEW_STATE_SCHEMA_VERSION,
  type FlowNode,
  type FlowPort,
  type FlowProjection,
  type FlowViewState,
} from "../../src/flow/index.js";
import {
  alignFlowCanvasPositions,
  createFlowCanvasDraftConnectionIntent,
  createFlowWirePath,
  normalizeFlowCanvasDraftState,
  normalizeFlowCanvasViewState,
  type FlowCanvasDraftNode,
} from "../../src/ui/flow-canvas.js";

describe("M6 flow canvas contracts", () => {
  it("restores only known coordinates and selection for the same source fingerprint", () => {
    const projection = fixtureProjection("sha256:a");
    const restored = normalizeFlowCanvasViewState(projection, {
      schemaVersion: FLOW_VIEW_STATE_SCHEMA_VERSION,
      sourceFingerprint: "sha256:a",
      viewport: { x: 24, y: -18, zoom: 99 },
      positions: {
        start: { x: 44, y: 72 },
        branch: { x: Number.NaN, y: 30 },
        removed: { x: 1, y: 1 },
      },
      selectedNodeIds: ["branch", "branch", "removed"],
      detailNodeId: "removed",
    });

    expect(restored.viewport).toEqual({ x: 24, y: -18, zoom: 2.5 });
    expect(restored.positions).toEqual({
      start: { x: 44, y: 72 },
      branch: { x: 240, y: 40 },
    });
    expect(restored.selectedNodeIds).toEqual(["branch"]);
    expect(restored.detailNodeId).toBeNull();
    expect(Object.isFrozen(restored.positions)).toBe(true);
  });

  it("fails closed to projection defaults when a sidecar belongs to stale C source", () => {
    const projection = fixtureProjection("sha256:new");
    const stale: FlowViewState = {
      schemaVersion: FLOW_VIEW_STATE_SCHEMA_VERSION,
      sourceFingerprint: "sha256:old",
      viewport: { x: 900, y: 800, zoom: 0.5 },
      positions: { start: { x: 999, y: 999 } },
      selectedNodeIds: ["start"],
      detailNodeId: "start",
    };

    expect(normalizeFlowCanvasViewState(projection, stale)).toEqual({
      schemaVersion: FLOW_VIEW_STATE_SCHEMA_VERSION,
      sourceFingerprint: "sha256:new",
      viewport: { x: 0, y: 0, zoom: 1 },
      positions: {
        start: { x: 20, y: 40 },
        branch: { x: 240, y: 40 },
      },
      selectedNodeIds: [],
      detailNodeId: null,
    });
  });

  it("builds deterministic cubic SVG wires without accepting invalid coordinates", () => {
    expect(createFlowWirePath({ x: 10, y: 20 }, { x: 210, y: 120 })).toBe(
      "M 10 20 C 100 20, 120 120, 210 120",
    );
    expect(() => createFlowWirePath({ x: Number.NaN, y: 0 }, { x: 1, y: 1 })).toThrow(/有限坐标/u);
  });

  it("aligns mixed free nodes without changing their unconstrained axis", () => {
    const aligned = alignFlowCanvasPositions(
      [
        { id: "a", position: { x: 80, y: 10 } },
        { id: "b", position: { x: 20, y: 90 } },
      ],
      "left",
    );

    expect(Object.fromEntries(aligned)).toEqual({
      a: { x: 20, y: 10 },
      b: { x: 20, y: 90 },
    });
  });

  it("distributes selected nodes vertically and rejects ambiguous inputs", () => {
    const distributed = alignFlowCanvasPositions(
      [
        { id: "bottom", position: { x: 300, y: 210 } },
        { id: "top", position: { x: 100, y: 10 } },
        { id: "middle", position: { x: 200, y: 42 } },
      ],
      "distribute-y",
    );

    expect(Object.fromEntries(distributed)).toEqual({
      top: { x: 100, y: 10 },
      middle: { x: 200, y: 110 },
      bottom: { x: 300, y: 210 },
    });
    expect(() =>
      alignFlowCanvasPositions(
        [
          { id: "same", position: { x: 0, y: 0 } },
          { id: "same", position: { x: 1, y: 1 } },
        ],
        "left",
      ),
    ).toThrow(/id 必须唯一/u);
  });

  it("normalizes freely positioned draft metadata, ports and selection without losing source", () => {
    const draft = draftNode();
    const normalized = normalizeFlowCanvasDraftState({
      nodes: [draft],
      connection: null,
      selectedNodeIds: [draft.id, draft.id, "missing"],
    });

    expect(normalized.selectedNodeIds).toEqual([draft.id]);
    expect(normalized.nodes[0]).toMatchObject({
      presetId: "builtin.c.print-integer",
      sourceText: 'printf("%d\\n", value);',
      position: { x: 120, y: 88 },
      ports: [
        expect.objectContaining({ id: "draft:in", direction: "input" }),
        expect.objectContaining({ id: "draft:out", direction: "output", edgeKind: "next" }),
      ],
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.nodes[0]?.ports)).toBe(true);
  });

  it("creates an explicit draft intent only for a real editable projected input", () => {
    const targetPort = controlPort("target:in", "input", null);
    const target = node("target", "statement", "目标语句", 240, 40, [targetPort]);
    const projection = Object.freeze({
      ...fixtureProjection("sha256:draft"),
      nodes: Object.freeze([target]),
    });
    const draft = draftNode();
    const output = draft.ports?.find((port) => port.direction === "output");
    if (output === undefined) throw new Error("fixture 缺少草稿输出端口");

    expect(
      createFlowCanvasDraftConnectionIntent(projection, draft, output, target, targetPort),
    ).toEqual({
      sourceFingerprint: "sha256:draft",
      draftNodeId: "draft:print",
      draftPortId: "draft:out",
      presetId: "builtin.c.print-integer",
      sourceText: 'printf("%d\\n", value);',
      toNodeId: "target",
      toPortId: "target:in",
      edgeKind: "next",
    });

    const lockedTarget = Object.freeze({ ...target, locked: true });
    expect(
      createFlowCanvasDraftConnectionIntent(
        Object.freeze({ ...projection, nodes: Object.freeze([lockedTarget]) }),
        draft,
        output,
        lockedTarget,
        targetPort,
      ),
    ).toBeNull();
  });

  it("rejects duplicate draft ids and output ports without an edge kind", () => {
    const draft = draftNode();
    expect(() =>
      normalizeFlowCanvasDraftState({ nodes: [draft, draft], connection: null }),
    ).toThrow(/唯一非空 id/u);
    expect(() =>
      normalizeFlowCanvasDraftState({
        nodes: [
          {
            ...draft,
            ports: [{ ...draft.ports?.[1], id: "bad", direction: "output", edgeKind: null }],
          } as FlowCanvasDraftNode,
        ],
        connection: null,
      }),
    ).toThrow(/输出端口必须声明 edgeKind/u);
  });
});

function fixtureProjection(sourceFingerprint: string): FlowProjection {
  const start = node("start", "start", "开始", 20, 40);
  const branch = node("branch", "branch", "条件分支", 240, 40);
  return Object.freeze({
    schemaVersion: FLOW_PROJECTION_SCHEMA_VERSION,
    sourceRevision: 1,
    sourceFingerprint,
    sourceLength: 32,
    documentHasError: false,
    functions: Object.freeze([]),
    nodes: Object.freeze([start, branch]),
    edges: Object.freeze([]),
    dataEdges: Object.freeze([]),
  });
}

function node(
  id: string,
  kind: FlowNode["kind"],
  label: string,
  x: number,
  y: number,
  ports: readonly FlowPort[] = [],
): FlowNode {
  return Object.freeze({
    id,
    functionId: "fn:main",
    sourceNodeId: id,
    kind,
    label,
    nodeType: kind,
    range: textRange(0, 1),
    ownerBlockRange: textRange(0, 1),
    sourceText: "x;",
    reachable: true,
    locked: false,
    lockReasons: Object.freeze([]),
    allowsFanOut: kind === "branch",
    defaultPosition: Object.freeze({ x, y }),
    ports: Object.freeze([...ports]),
  });
}

function controlPort(
  id: string,
  direction: FlowPort["direction"],
  edgeKind: FlowPort["edgeKind"],
): FlowPort {
  return Object.freeze({
    id,
    nodeId: "target",
    direction,
    channel: "control",
    edgeKind,
    label: direction === "input" ? "输入" : "下一步",
    editable: true,
    capacity: direction === "input" ? "many" : "one",
    allowsFanOut: false,
  });
}

function draftNode(): FlowCanvasDraftNode {
  return Object.freeze({
    id: "draft:print",
    label: "打印整数",
    presetId: "builtin.c.print-integer",
    sourceText: 'printf("%d\\n", value);',
    position: Object.freeze({ x: 120, y: 88 }),
    status: "detached",
    ports: Object.freeze([
      Object.freeze({
        id: "draft:in",
        direction: "input",
        channel: "control",
        edgeKind: null,
        label: "输入",
        editable: true,
      }),
      Object.freeze({
        id: "draft:out",
        direction: "output",
        channel: "control",
        edgeKind: "next",
        label: "下一步",
        editable: true,
      }),
    ]),
  });
}
