import {
  createFlowNodeAnchor,
  resolveFlowNodeAnchor,
  type FlowNodeAnchorResolution,
  type FlowPort,
  type FlowProjection,
} from "../flow/index.js";
import {
  normalizeFlowCanvasDraftState,
  type FlowCanvasDraftVisualState,
  type FlowCanvasVirtualEndpoint,
} from "../ui/flow-canvas.js";
import { connectVirtualFlowOverlay, reconcileVirtualFlowOverlay } from "./virtual-flow-overlay.js";

const MAX_DRAFT_NODES = 256;
const MAX_VIRTUAL_EDGES = 512;
const MAX_DRAFT_LABEL_LENGTH = 256;
const MAX_DRAFT_SOURCE_LENGTH = 16 * 1024;

export interface FlowSidecarRestoreIssue {
  readonly code:
    | "invalid-anchor"
    | "anchor-mismatch"
    | "ambiguous-anchor"
    | "legacy-stale-source"
    | "invalid-virtual-edge";
  readonly path: string;
  readonly message: string;
}

export type FlowDraftSidecarRestore =
  | {
      readonly ok: true;
      readonly state: FlowCanvasDraftVisualState;
      readonly issues: readonly FlowSidecarRestoreIssue[];
    }
  | {
      readonly ok: false;
      readonly state: null;
      readonly issues: readonly FlowSidecarRestoreIssue[];
    };

/** Serializes draft nodes while replacing every projection endpoint with a versioned anchor. */
export function serializeFlowDraftSidecarState(
  state: FlowCanvasDraftVisualState,
  projection: FlowProjection,
): unknown {
  const normalized = normalizeAndBoundDraftState(state);
  if (normalized === null) throw new TypeError("无法序列化无效的画布草稿状态");
  return {
    nodes: normalized.nodes,
    selectedNodeIds: normalized.selectedNodeIds ?? [],
    connection: normalized.connection,
    virtualEdges: (normalized.virtualEdges ?? []).map((edge) => ({
      from: serializeEndpoint(edge.from, projection),
      to: serializeEndpoint(edge.to, projection),
    })),
  };
}

/**
 * Restores v2 anchored virtual edges. Legacy v1 projection IDs are accepted only for the exact
 * source fingerprint and are converted to anchors on the next save.
 */
export function restoreFlowDraftSidecarState(
  value: unknown,
  projection: FlowProjection,
  options: {
    readonly schemaVersion: 1 | 2;
    readonly savedSourceFingerprint: string;
    readonly sourceMatches: boolean;
  },
): FlowDraftSidecarRestore {
  if (!isRecord(value)) return failed("画布草稿 sidecar 必须是对象");
  if (options.schemaVersion === 1) {
    return restoreLegacyDraftState(value, projection, options.sourceMatches);
  }
  return restoreAnchoredDraftState(value, projection, options.savedSourceFingerprint);
}

function restoreLegacyDraftState(
  value: Record<string, unknown>,
  projection: FlowProjection,
  sourceMatches: boolean,
): FlowDraftSidecarRestore {
  if (!sourceMatches) {
    const base = normalizeAndBoundDraftState({
      nodes: value.nodes,
      selectedNodeIds: [],
      connection: null,
      virtualEdges: [],
    } as unknown as FlowCanvasDraftVisualState);
    if (base === null) return failed("旧版画布草稿结构无效");
    return restored(base, [
      sidecarIssue(
        "legacy-stale-source",
        "$.drafts.virtualEdges",
        "旧版虚拟边缺少结构锚点且源码已变化，已安全丢弃",
      ),
    ]);
  }
  const normalized = normalizeAndBoundDraftState(value as unknown as FlowCanvasDraftVisualState);
  if (normalized === null) return failed("旧版画布草稿结构无效");
  const reconciled = reconcileVirtualFlowOverlay(projection, normalized);
  const dropped = (normalized.virtualEdges?.length ?? 0) - (reconciled.virtualEdges?.length ?? 0);
  return restored(
    reconciled,
    dropped > 0
      ? [
          sidecarIssue(
            "invalid-virtual-edge",
            "$.drafts.virtualEdges",
            `${String(dropped)} 条旧版虚拟边已失效并丢弃`,
          ),
        ]
      : [],
  );
}

function restoreAnchoredDraftState(
  value: Record<string, unknown>,
  projection: FlowProjection,
  savedSourceFingerprint: string,
): FlowDraftSidecarRestore {
  if (!Array.isArray(value.virtualEdges)) return failed("v2 virtualEdges 必须是数组");
  if (value.virtualEdges.length > MAX_VIRTUAL_EDGES) return failed("虚拟边数量超过安全上限");
  const base = normalizeAndBoundDraftState({
    nodes: value.nodes,
    selectedNodeIds: value.selectedNodeIds,
    connection: value.connection,
    virtualEdges: [],
  } as unknown as FlowCanvasDraftVisualState);
  if (base === null) return failed("v2 画布草稿结构无效");

  const issues: FlowSidecarRestoreIssue[] = [];
  let state = base;
  value.virtualEdges.forEach((edgeValue, index) => {
    const path = `$.drafts.virtualEdges[${String(index)}]`;
    if (!isRecord(edgeValue)) {
      issues.push(sidecarIssue("invalid-virtual-edge", path, "虚拟边必须是对象"));
      return;
    }
    const from = restoreEndpoint(edgeValue.from, "output", projection, savedSourceFingerprint);
    const to = restoreEndpoint(edgeValue.to, "input", projection, savedSourceFingerprint);
    if (from.status === "unresolved") {
      issues.push(sidecarIssue(from.code, `${path}.from`, from.message));
      return;
    }
    if (to.status === "unresolved") {
      issues.push(sidecarIssue(to.code, `${path}.to`, to.message));
      return;
    }
    try {
      state = connectVirtualFlowOverlay(projection, state, {
        sourceFingerprint: projection.sourceFingerprint,
        from: from.endpoint,
        to: to.endpoint,
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push(sidecarIssue("invalid-virtual-edge", path, detail));
    }
  });
  return restored(state, issues);
}

function serializeEndpoint(
  endpoint: FlowCanvasVirtualEndpoint,
  projection: FlowProjection,
): unknown {
  if (endpoint.source === "virtual") {
    return { source: "virtual", nodeId: endpoint.nodeId, portId: endpoint.portId };
  }
  const node = projection.nodes.find((candidate) => candidate.id === endpoint.nodeId);
  const port = node?.ports.find((candidate) => candidate.id === endpoint.portId);
  if (node === undefined || port === undefined || port.channel !== "control") {
    throw new TypeError("虚拟边引用了未知的投影端点");
  }
  return {
    source: "projection",
    anchor: createFlowNodeAnchor(projection, node.id),
    port: {
      direction: port.direction,
      edgeKind: port.edgeKind,
    },
  };
}

type RestoredEndpoint =
  | { readonly status: "resolved"; readonly endpoint: FlowCanvasVirtualEndpoint }
  | Extract<FlowNodeAnchorResolution, { status: "unresolved" }>;

function restoreEndpoint(
  value: unknown,
  direction: "input" | "output",
  projection: FlowProjection,
  savedSourceFingerprint: string,
): RestoredEndpoint {
  if (!isRecord(value)) return unresolvedEndpoint("invalid-anchor", "虚拟端点结构无效");
  if (value.source === "virtual") {
    if (!isNonEmptyString(value.nodeId) || !isNonEmptyString(value.portId)) {
      return unresolvedEndpoint("invalid-anchor", "虚拟节点端点缺少 nodeId/portId");
    }
    return Object.freeze({
      status: "resolved",
      endpoint: Object.freeze({ source: "virtual", nodeId: value.nodeId, portId: value.portId }),
    });
  }
  if (value.source !== "projection" || !isRecord(value.anchor) || !isRecord(value.port)) {
    return unresolvedEndpoint("invalid-anchor", "投影端点缺少节点锚点或语义端口");
  }
  const portValue = value.port;
  if (value.anchor.sourceFingerprint !== savedSourceFingerprint) {
    return unresolvedEndpoint("invalid-anchor", "投影端点混用了其他源码指纹");
  }
  const resolution = resolveFlowNodeAnchor(value.anchor, projection);
  if (resolution.status === "unresolved") return resolution;
  if (
    portValue.direction !== direction ||
    (portValue.edgeKind !== null && typeof portValue.edgeKind !== "string")
  ) {
    return unresolvedEndpoint("invalid-anchor", "投影端点的方向或边类型无效");
  }
  const node = projection.nodes.find((candidate) => candidate.id === resolution.nodeId);
  const ports =
    node?.ports.filter(
      (port) =>
        port.channel === "control" &&
        port.direction === direction &&
        port.edgeKind === portValue.edgeKind,
    ) ?? [];
  if (ports.length === 0) {
    return unresolvedEndpoint("anchor-mismatch", "当前节点不存在匹配的语义端口");
  }
  if (ports.length > 1) {
    return unresolvedEndpoint("ambiguous-anchor", "当前节点存在多个相同语义端口");
  }
  return Object.freeze({
    status: "resolved",
    endpoint: Object.freeze({
      source: "projection",
      nodeId: resolution.nodeId,
      portId: requiredPort(ports).id,
    }),
  });
}

function requiredPort(ports: readonly FlowPort[]): FlowPort {
  const port = ports[0];
  if (port === undefined) throw new TypeError("缺少已验证端口");
  return port;
}

function normalizeAndBoundDraftState(
  state: FlowCanvasDraftVisualState,
): FlowCanvasDraftVisualState | null {
  try {
    const normalized = normalizeFlowCanvasDraftState(state);
    if (
      normalized.nodes.length > MAX_DRAFT_NODES ||
      (normalized.virtualEdges?.length ?? 0) > MAX_VIRTUAL_EDGES ||
      normalized.nodes.some(
        (node) =>
          node.label.length === 0 ||
          node.label.length > MAX_DRAFT_LABEL_LENGTH ||
          (node.sourceText?.length ?? 0) > MAX_DRAFT_SOURCE_LENGTH,
      )
    ) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function restored(
  state: FlowCanvasDraftVisualState,
  issues: readonly FlowSidecarRestoreIssue[],
): FlowDraftSidecarRestore {
  return Object.freeze({ ok: true, state, issues: Object.freeze([...issues]) });
}

function failed(message: string): FlowDraftSidecarRestore {
  return Object.freeze({
    ok: false,
    state: null,
    issues: Object.freeze([sidecarIssue("invalid-virtual-edge", "$.drafts", message)]),
  });
}

function unresolvedEndpoint(
  code: Extract<FlowNodeAnchorResolution, { status: "unresolved" }>["code"],
  message: string,
): RestoredEndpoint {
  return Object.freeze({ status: "unresolved", code, message });
}

function sidecarIssue(
  code: FlowSidecarRestoreIssue["code"],
  path: string,
  message: string,
): FlowSidecarRestoreIssue {
  return Object.freeze({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
