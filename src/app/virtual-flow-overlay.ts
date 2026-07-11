import type { FlowEdge, FlowPort, FlowProjection } from "../flow/index.js";
import type {
  FlowCanvasActivePath,
  FlowCanvasDraftNode,
  FlowCanvasDraftPort,
  FlowCanvasDraftVisualState,
  FlowCanvasVirtualConnectionIntent,
  FlowCanvasVirtualEdge,
  FlowCanvasVirtualEndpoint,
} from "../ui/flow-canvas.js";

const MAX_VIRTUAL_EDGES = 512;

/** Adds one playback-only attachment and proves it against an existing typed CFG edge when complete. */
export function connectVirtualFlowOverlay(
  projection: FlowProjection,
  state: FlowCanvasDraftVisualState,
  intent: FlowCanvasVirtualConnectionIntent,
): FlowCanvasDraftVisualState {
  if (intent.sourceFingerprint !== projection.sourceFingerprint) {
    throw new Error("虚拟连线不属于当前源码快照");
  }
  const from = resolveEndpoint(projection, state.nodes, intent.from, "output");
  const to = resolveEndpoint(projection, state.nodes, intent.to, "input");
  if (from.kind === to.kind) {
    throw new Error("虚拟覆盖首版必须把一个虚拟节点插入现有 C CFG 边");
  }
  const virtual =
    from.kind === "virtual" ? from : to.kind === "virtual" ? to : unreachableVirtualEndpoint();
  const existing = state.virtualEdges ?? [];
  if (existing.length >= MAX_VIRTUAL_EDGES) throw new Error("虚拟覆盖边已达到 512 条上限");
  if (
    existing.some(
      (edge) => sameEndpoint(edge.from, intent.from) && sameEndpoint(edge.to, intent.to),
    )
  ) {
    throw new Error("相同的虚拟覆盖连接已经存在");
  }
  const capacityMany =
    virtual.node.presetId === "builtin.flow.merge" && virtual.port.direction === "input";
  if (
    !capacityMany &&
    existing.some((edge) =>
      sameEndpoint(edge.from.source === "virtual" ? edge.from : edge.to, virtual.endpoint),
    )
  ) {
    throw new Error(`虚拟端口“${virtual.port.label}”容量为 one`);
  }

  const added: FlowCanvasVirtualEdge = Object.freeze({
    id: virtualEdgeId(intent.from, intent.to),
    from: Object.freeze({ ...intent.from }),
    to: Object.freeze({ ...intent.to }),
    status: "pending",
    sourceEdgeIds: Object.freeze([]),
  });
  const reconciled = reconcileVirtualEdges(projection, [...existing, added]);
  const resolvedAdded = reconciled.find((edge) => edge.id === added.id);
  const hasCounterpart = reconciled.some(
    (edge) =>
      edge.id !== added.id &&
      virtualNodeId(edge) === virtualNodeId(added) &&
      edge.from.source !== added.from.source,
  );
  if (hasCounterpart && resolvedAdded?.status !== "valid") {
    throw new Error("虚拟节点两端并不对应同一条现有 CFG 边；覆盖连线已拒绝");
  }
  return freezeState(state, reconciled);
}

/** Drops stale anchors and recomputes the exact underlying CFG edge identities. */
export function reconcileVirtualFlowOverlay(
  projection: FlowProjection,
  state: FlowCanvasDraftVisualState,
): FlowCanvasDraftVisualState {
  const valid = (state.virtualEdges ?? []).filter((edge) => {
    try {
      resolveEndpoint(projection, state.nodes, edge.from, "output");
      resolveEndpoint(projection, state.nodes, edge.to, "input");
      return edge.from.source !== edge.to.source;
    } catch {
      return false;
    }
  });
  return freezeState(state, reconcileVirtualEdges(projection, valid));
}

export function decoratePathWithVirtualOverlay(
  state: FlowCanvasDraftVisualState,
  path: FlowCanvasActivePath,
): FlowCanvasActivePath {
  const activeSourceEdges = new Set(path.edgeIds);
  const activeOverlayEdges = (state.virtualEdges ?? []).filter(
    (edge) => edge.status === "valid" && edge.sourceEdgeIds.some((id) => activeSourceEdges.has(id)),
  );
  if (activeOverlayEdges.length === 0) return path;
  const virtualNodeIds = activeOverlayEdges.map(virtualNodeId);
  return Object.freeze({
    nodeIds: Object.freeze([...new Set([...path.nodeIds, ...virtualNodeIds])]),
    edgeIds: Object.freeze([
      ...new Set([...path.edgeIds, ...activeOverlayEdges.map((edge) => edge.id)]),
    ]),
    currentNodeId: path.currentNodeId,
    mode: path.mode,
  });
}

export function activeVirtualPlaybackNodes(
  state: FlowCanvasDraftVisualState,
  sourceEdgeIds: readonly string[],
): readonly FlowCanvasDraftNode[] {
  const active = new Set(sourceEdgeIds);
  const nodeIds = new Set(
    (state.virtualEdges ?? [])
      .filter((edge) => edge.status === "valid" && edge.sourceEdgeIds.some((id) => active.has(id)))
      .map(virtualNodeId),
  );
  return Object.freeze(state.nodes.filter((node) => nodeIds.has(node.id)));
}

type ResolvedEndpoint =
  | {
      readonly kind: "projection";
      readonly endpoint: FlowCanvasVirtualEndpoint;
      readonly port: FlowPort;
    }
  | {
      readonly kind: "virtual";
      readonly endpoint: FlowCanvasVirtualEndpoint;
      readonly node: FlowCanvasDraftNode;
      readonly port: FlowCanvasDraftPort;
    };

function resolveEndpoint(
  projection: FlowProjection,
  virtualNodes: readonly FlowCanvasDraftNode[],
  endpoint: FlowCanvasVirtualEndpoint,
  direction: "input" | "output",
): ResolvedEndpoint {
  if (endpoint.source === "projection") {
    const node = projection.nodes.find((candidate) => candidate.id === endpoint.nodeId);
    const port = node?.ports.find((candidate) => candidate.id === endpoint.portId);
    if (
      node === undefined ||
      port === undefined ||
      node.locked ||
      port.direction !== direction ||
      port.channel !== "control"
    ) {
      throw new Error("虚拟覆盖引用了未知、锁定或方向错误的 CFG 端口");
    }
    return Object.freeze({ kind: "projection", endpoint, port });
  }
  const node = virtualNodes.find((candidate) => candidate.id === endpoint.nodeId);
  const port = node?.ports?.find((candidate) => candidate.id === endpoint.portId);
  if (
    node?.blockKind !== "virtual" ||
    port === undefined ||
    !port.editable ||
    port.direction !== direction ||
    port.channel !== "control"
  ) {
    throw new Error("虚拟覆盖引用了未知或方向错误的虚拟端口");
  }
  return Object.freeze({ kind: "virtual", endpoint, node, port });
}

function reconcileVirtualEdges(
  projection: FlowProjection,
  edges: readonly FlowCanvasVirtualEdge[],
): readonly FlowCanvasVirtualEdge[] {
  return Object.freeze(
    edges.map((edge) => {
      const virtualId = virtualNodeId(edge);
      const partners = edges.filter(
        (candidate) =>
          candidate.id !== edge.id &&
          virtualNodeId(candidate) === virtualId &&
          candidate.from.source !== edge.from.source,
      );
      const matched = new Set<string>();
      for (const partner of partners) {
        const incoming = edge.from.source === "projection" ? edge : partner;
        const outgoing = edge.from.source === "virtual" ? edge : partner;
        for (const sourceEdge of matchingSourceEdges(projection.edges, incoming, outgoing)) {
          matched.add(sourceEdge.id);
        }
      }
      return Object.freeze({
        ...edge,
        status: matched.size > 0 ? ("valid" as const) : ("pending" as const),
        sourceEdgeIds: Object.freeze([...matched].sort()),
      });
    }),
  );
}

function unreachableVirtualEndpoint(): never {
  throw new Error("虚拟覆盖必须包含一个虚拟端点");
}

function matchingSourceEdges(
  edges: readonly FlowEdge[],
  incoming: FlowCanvasVirtualEdge,
  outgoing: FlowCanvasVirtualEdge,
): readonly FlowEdge[] {
  if (incoming.from.source !== "projection" || outgoing.to.source !== "projection") return [];
  return edges.filter(
    (edge) =>
      edge.from.nodeId === incoming.from.nodeId &&
      edge.from.portId === incoming.from.portId &&
      edge.to.nodeId === outgoing.to.nodeId &&
      edge.to.portId === outgoing.to.portId,
  );
}

function freezeState(
  state: FlowCanvasDraftVisualState,
  edges: readonly FlowCanvasVirtualEdge[],
): FlowCanvasDraftVisualState {
  return Object.freeze({
    ...state,
    nodes: Object.freeze([...state.nodes]),
    selectedNodeIds: Object.freeze([...(state.selectedNodeIds ?? [])]),
    connection: state.connection,
    virtualEdges: Object.freeze([...edges]),
  });
}

function virtualNodeId(edge: FlowCanvasVirtualEdge): string {
  return edge.from.source === "virtual" ? edge.from.nodeId : edge.to.nodeId;
}

function sameEndpoint(left: FlowCanvasVirtualEndpoint, right: FlowCanvasVirtualEndpoint): boolean {
  return (
    left.source === right.source && left.nodeId === right.nodeId && left.portId === right.portId
  );
}

function virtualEdgeId(from: FlowCanvasVirtualEndpoint, to: FlowCanvasVirtualEndpoint): string {
  return `virtual:${from.source}:${from.nodeId}:${from.portId}->${to.source}:${to.nodeId}:${to.portId}`;
}
