import type { FlowEdge, FlowNode, FlowProjection } from "../flow/index.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { TraceEvent } from "../shared/trace.js";
import type { FlowCanvasActivePath } from "../ui/flow-canvas.js";

export interface TraceFlowProjectionResult {
  readonly path: FlowCanvasActivePath;
  readonly matchedEventCount: number;
  readonly unmatchedEventCount: number;
  /** Adjacent mapped events that cannot be connected by one unambiguous CFG edge. */
  readonly discontinuityCount: number;
  readonly nodeVisitCounts: Readonly<Record<string, number>>;
}

/**
 * Projects observed trace lines onto the exact CFG snapshot that produced the canvas.
 * A missing or ambiguous match is counted and omitted; it is never replaced with a guessed node.
 */
export function projectTraceEventsToFlow(
  source: string,
  projection: FlowProjection,
  events: readonly TraceEvent[],
  mode: "real" | "simulation" = "real",
): TraceFlowProjectionResult {
  if (fingerprintSource(source) !== projection.sourceFingerprint) {
    throw new Error("Trace 源码与流程投影指纹不一致；旧轨迹已作废");
  }
  const ordered = normalizeEvents(events);
  const lineIndex = createLineIndex(source);
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  const nodeSeen = new Set<string>();
  const edgeSeen = new Set<string>();
  const visits = new Map<string, number>();
  let matchedEventCount = 0;
  let unmatchedEventCount = 0;
  let discontinuityCount = 0;
  let previousNode: FlowNode | null = null;
  let pendingBranchKind: "branch-true" | "branch-false" | null = null;

  for (const event of ordered) {
    const line = lineIndex[event.line - 1];
    if (line === undefined) {
      unmatchedEventCount += 1;
      continue;
    }
    const node = selectTraceNode(projection.nodes, line, event);
    if (node === null) {
      unmatchedEventCount += 1;
      continue;
    }
    matchedEventCount += 1;
    visits.set(node.id, (visits.get(node.id) ?? 0) + 1);
    appendUnique(nodeIds, nodeSeen, node.id);

    if (previousNode !== null && previousNode.id !== node.id) {
      const connectingEdge = selectConnectingEdge(
        projection.edges,
        previousNode.id,
        node.id,
        pendingBranchKind,
      );
      if (connectingEdge !== null) appendUnique(edgeIds, edgeSeen, connectingEdge.id);
      else discontinuityCount += 1;
      pendingBranchKind = null;
    }

    if (event.kind === "branch" && event.branchTaken !== null) {
      pendingBranchKind = event.branchTaken ? "branch-true" : "branch-false";
      const observedEdge = selectObservedBranchEdge(projection.edges, node.id, pendingBranchKind);
      if (observedEdge !== null) appendUnique(edgeIds, edgeSeen, observedEdge.id);
      else discontinuityCount += 1;
    }
    previousNode = node;
  }

  return Object.freeze({
    path: Object.freeze({
      nodeIds: Object.freeze(nodeIds),
      edgeIds: Object.freeze(edgeIds),
      currentNodeId: previousNode?.id ?? null,
      mode,
    }),
    matchedEventCount,
    unmatchedEventCount,
    discontinuityCount,
    nodeVisitCounts: Object.freeze(Object.fromEntries(visits)),
  });
}

interface SourceLineRange {
  readonly number: number;
  readonly from: number;
  readonly contentFrom: number;
  readonly to: number;
}

function createLineIndex(source: string): readonly SourceLineRange[] {
  const result: SourceLineRange[] = [];
  let from = 0;
  let number = 1;
  while (from <= source.length) {
    const newline = source.indexOf("\n", from);
    const rawTo = newline < 0 ? source.length : newline;
    const to = rawTo > from && source.charCodeAt(rawTo - 1) === 13 ? rawTo - 1 : rawTo;
    let contentFrom = from;
    while (contentFrom < to && /\s/u.test(source[contentFrom] ?? "")) contentFrom += 1;
    result.push(Object.freeze({ number, from, contentFrom, to }));
    if (newline < 0) break;
    from = newline + 1;
    number += 1;
  }
  return Object.freeze(result);
}

function selectTraceNode(
  nodes: readonly FlowNode[],
  line: SourceLineRange,
  event: TraceEvent,
): FlowNode | null {
  const candidates = nodes.filter((node) => {
    if (node.kind === "raw" || node.range.from === node.range.to) return false;
    const probe = line.contentFrom < line.to ? line.contentFrom : line.from;
    return node.range.from <= probe && node.range.to >= Math.min(line.to, probe + 1);
  });
  if (candidates.length === 0) return null;
  if (event.kind === "line") {
    const startBoundary = uniqueBoundaryAtLine(candidates, "start", (node) =>
      lineContainsOffset(line, node.range.from),
    );
    if (startBoundary !== null) return startBoundary;
    const endBoundary = uniqueBoundaryAtLine(candidates, "end", (node) =>
      lineContainsOffset(line, Math.max(node.range.from, node.range.to - 1)),
    );
    if (endBoundary !== null) return endBoundary;
  }
  const branchKinds = new Set<FlowNode["kind"]>(["branch", "loop", "assert"]);
  const preferred =
    event.kind === "branch" ? candidates.filter((node) => branchKinds.has(node.kind)) : candidates;
  const ranked = (preferred.length > 0 ? preferred : candidates).sort((left, right) => {
    const leftStartLine = offsetLineNumber(left.range.from, line);
    const rightStartLine = offsetLineNumber(right.range.from, line);
    const leftExact = leftStartLine === line.number ? 0 : 1;
    const rightExact = rightStartLine === line.number ? 0 : 1;
    const leftBoundary = left.kind === "start" || left.kind === "end" ? 1 : 0;
    const rightBoundary = right.kind === "start" || right.kind === "end" ? 1 : 0;
    return (
      leftExact - rightExact ||
      leftBoundary - rightBoundary ||
      left.range.to - left.range.from - (right.range.to - right.range.from) ||
      left.range.from - right.range.from ||
      left.id.localeCompare(right.id)
    );
  });
  const winner = ranked[0];
  if (winner === undefined) return null;
  const tied = ranked[1];
  if (tied !== undefined && traceNodeRank(winner, line) === traceNodeRank(tied, line)) return null;
  return winner;
}

function uniqueBoundaryAtLine(
  candidates: readonly FlowNode[],
  kind: "start" | "end",
  matchesLine: (node: FlowNode) => boolean,
): FlowNode | null {
  const boundaries = candidates.filter((node) => node.kind === kind && matchesLine(node));
  return boundaries.length === 1 ? boundaries[0]! : null;
}

function lineContainsOffset(line: SourceLineRange, offset: number): boolean {
  return offset >= line.from && offset < line.to;
}

function traceNodeRank(node: FlowNode, line: SourceLineRange): string {
  return [
    offsetLineNumber(node.range.from, line) === line.number ? 0 : 1,
    node.kind === "start" || node.kind === "end" ? 1 : 0,
    node.range.to - node.range.from,
    node.range.from,
  ].join(":");
}

function offsetLineNumber(offset: number, current: SourceLineRange): number {
  return offset >= current.from && offset <= current.to ? current.number : -1;
}

function selectConnectingEdge(
  edges: readonly FlowEdge[],
  fromNodeId: string,
  toNodeId: string,
  expectedKind: "branch-true" | "branch-false" | null,
): FlowEdge | null {
  const exact = edges.filter(
    (edge) =>
      edge.from.nodeId === fromNodeId &&
      edge.to.nodeId === toNodeId &&
      (expectedKind === null || edge.kind === expectedKind),
  );
  return exact.length === 1 ? exact[0]! : null;
}

function selectObservedBranchEdge(
  edges: readonly FlowEdge[],
  fromNodeId: string,
  kind: "branch-true" | "branch-false",
): FlowEdge | null {
  const matches = edges.filter((edge) => edge.from.nodeId === fromNodeId && edge.kind === kind);
  return matches.length === 1 ? matches[0]! : null;
}

function normalizeEvents(events: readonly TraceEvent[]): readonly TraceEvent[] {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  let previous = 0;
  for (const event of ordered) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= previous) {
      throw new Error("Trace 事件序号必须严格递增且不得重复");
    }
    if (!Number.isSafeInteger(event.line) || event.line <= 0) {
      throw new Error("Trace 行号必须是正整数");
    }
    previous = event.sequence;
  }
  return Object.freeze(ordered);
}

function appendUnique(values: string[], seen: Set<string>, value: string): void {
  if (seen.has(value)) return;
  seen.add(value);
  values.push(value);
}
