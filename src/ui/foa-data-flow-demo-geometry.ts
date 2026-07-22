import type { FoaFlowLessonKind } from "../tutorials/foa-flow-lesson-models.js";
import type { FlowEdge } from "../tutorials/flow-lesson-model.js";

interface FoaDataFlowViewportElements {
  readonly root: HTMLElement;
  readonly nodeElements: ReadonlyMap<string, HTMLButtonElement>;
  readonly refreshEdgeGeometry: () => void;
}

export function observeViewportZoom(
  ownerDocument: Document,
  elements: FoaDataFlowViewportElements,
): () => void {
  const view = ownerDocument.defaultView;
  if (view === null) return () => undefined;
  let refreshFrame: number | null = null;
  const refresh = (): void => {
    const viewportWidth = view.innerWidth;
    const chromeWidth = view.outerWidth;
    // Browser zoom changes this ratio before the tutorial container reports its final size.
    const zoomRatio =
      viewportWidth > 0 && chromeWidth > 0 ? Math.max(1, chromeWidth / viewportWidth) : 1;
    const compact = viewportWidth <= 640 || zoomRatio > 1.08;
    elements.root.dataset.flowCompact = String(compact);
    elements.root.style.setProperty("--flow-viewport-compensation", "1");
    elements.root.dataset.flowViewportCompensation = "1.000";
    for (const [nodeId, node] of elements.nodeElements) {
      const position = compact
        ? compactNodePosition(elements.root.dataset.flowFrameKind as FoaFlowLessonKind, nodeId)
        : nodePosition(elements.root.dataset.flowFrameKind as FoaFlowLessonKind, nodeId);
      node.style.setProperty("--flow-node-x", position.x);
      node.style.setProperty("--flow-node-y", position.y);
    }
    // Edge measurement must wait until the new node anchors have reached layout.
    if (refreshFrame !== null) view.cancelAnimationFrame(refreshFrame);
    refreshFrame = view.requestAnimationFrame(() => {
      refreshFrame = null;
      elements.refreshEdgeGeometry();
    });
  };
  view.addEventListener("resize", refresh);
  refresh();
  return (): void => {
    view.removeEventListener("resize", refresh);
    if (refreshFrame !== null) view.cancelAnimationFrame(refreshFrame);
  };
}

export function createEdgeLayer(
  ownerDocument: Document,
  lessonOrder: number,
  kind: FoaFlowLessonKind,
  edges: readonly FlowEdge[],
): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = ownerDocument.createElementNS(namespace, "svg");
  svg.classList.add("foa-flow-demo__edges");
  svg.setAttribute("viewBox", "0 0 1000 300");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const definitions = ownerDocument.createElementNS(namespace, "defs");
  const marker = ownerDocument.createElementNS(namespace, "marker");
  const markerId = `foa-flow-arrow-${String(lessonOrder)}`;
  marker.id = markerId;
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "8");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = ownerDocument.createElementNS(namespace, "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill", "context-stroke");
  marker.append(arrow);
  definitions.append(marker);
  svg.append(definitions);
  for (const edge of edges) {
    const path = ownerDocument.createElementNS(namespace, "path");
    path.dataset.flowEdgeId = edge.id;
    path.dataset.flowEdge = publicEdgeName(edge);
    path.dataset.flowFrom = edge.from;
    path.dataset.flowTo = edge.to;
    path.dataset.state = "idle";
    path.setAttribute("d", edgePath(kind, edge.id));
    path.setAttribute("marker-end", `url(#${markerId})`);
    svg.append(path);
    if (edge.kind === "true" || edge.kind === "false" || edge.kind === "back") {
      const label = ownerDocument.createElementNS(namespace, "text");
      const position = edgeLabelPosition(kind, edge.id);
      label.dataset.flowEdgeLabel = publicEdgeName(edge);
      label.dataset.flowEdgeLabelId = edge.id;
      label.dataset.labelZh = edge.label?.zh ?? edge.kind;
      label.dataset.labelEn = edge.label?.en ?? edge.kind;
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("x", position.x);
      label.setAttribute("y", position.y);
      label.textContent = label.dataset.labelZh;
      svg.append(label);
    }
  }
  return svg;
}

// Geometry is derived from rendered boxes and never owns semantic or timeline state.
export function observeEdgeGeometry(
  ownerDocument: Document,
  kind: FoaFlowLessonKind,
  graph: HTMLElement,
  svg: SVGSVGElement,
  edges: readonly FlowEdge[],
  nodes: ReadonlyMap<string, HTMLElement>,
  edgeElements: ReadonlyMap<string, SVGPathElement>,
): { readonly refresh: () => void; readonly disconnect: () => void } {
  const edgeLabels = new Map<string, SVGTextElement>();
  for (const label of svg.querySelectorAll<SVGTextElement>("[data-flow-edge-label-id]")) {
    const edgeId = label.dataset.flowEdgeLabelId;
    if (edgeId !== undefined) edgeLabels.set(edgeId, label);
  }

  const refresh = (): void => {
    const graphRect = graph.getBoundingClientRect();
    if (graphRect.width <= 0 || graphRect.height <= 0) return;
    svg.setAttribute("viewBox", `0 0 ${String(graphRect.width)} ${String(graphRect.height)}`);
    const nodeRects = [...nodes.values()].map((node) => node.getBoundingClientRect());
    const placedLabelRects: DOMRect[] = [];
    for (const edge of edges) {
      const from = nodes.get(edge.from)?.getBoundingClientRect();
      const to = nodes.get(edge.to)?.getBoundingClientRect();
      const path = edgeElements.get(edge.id);
      if (from === undefined || to === undefined || path === undefined) continue;
      const fromCenterX = from.left + from.width / 2;
      const fromCenterY = from.top + from.height / 2;
      const toCenterX = to.left + to.width / 2;
      const toCenterY = to.top + to.height / 2;
      // Vertically stacked branch nodes need top/bottom ports to avoid crossing node bodies.
      const useVerticalPorts =
        kind === "branch" &&
        Math.abs(fromCenterX - toCenterX) < Math.min(from.width, to.width) * 0.45 &&
        Math.abs(fromCenterY - toCenterY) > Math.min(from.height, to.height) * 0.7;
      const startsBeforeTarget = fromCenterX <= toCenterX;
      const targetIsBelow = fromCenterY <= toCenterY;
      const startX = useVerticalPorts
        ? fromCenterX - graphRect.left
        : (startsBeforeTarget ? from.right : from.left) -
          graphRect.left +
          (startsBeforeTarget ? 1 : -1);
      const endX = useVerticalPorts
        ? toCenterX - graphRect.left
        : (startsBeforeTarget ? to.left : to.right) -
          graphRect.left +
          (startsBeforeTarget ? -1 : 1);
      const startY = useVerticalPorts
        ? (targetIsBelow ? from.bottom + 1 : from.top - 1) - graphRect.top
        : fromCenterY - graphRect.top;
      const endY = useVerticalPorts
        ? (targetIsBelow ? to.top - 1 : to.bottom + 1) - graphRect.top
        : toCenterY - graphRect.top;
      if (kind === "linear") {
        path.setAttribute(
          "d",
          Math.abs(startY - endY) < 0.5
            ? `M ${String(startX)} ${String(startY)} H ${String(endX)}`
            : `M ${String(startX)} ${String(startY)} L ${String(endX)} ${String(endY)}`,
        );
        continue;
      }

      const branchStartY = useVerticalPorts
        ? startY
        : edge.kind === "true"
          ? startY - 7
          : edge.kind === "false"
            ? startY + 7
            : startY;
      if (useVerticalPorts) {
        const controlY = branchStartY + (endY - branchStartY) / 2;
        path.setAttribute(
          "d",
          `M ${String(startX)} ${String(branchStartY)} C ${String(startX)} ${String(
            controlY,
          )} ${String(endX)} ${String(controlY)} ${String(endX)} ${String(endY)}`,
        );
      } else {
        const controlX = startX + (endX - startX) / 2;
        path.setAttribute(
          "d",
          Math.abs(branchStartY - endY) < 0.5
            ? `M ${String(startX)} ${String(branchStartY)} H ${String(endX)}`
            : `M ${String(startX)} ${String(branchStartY)} C ${String(controlX)} ${String(
                branchStartY,
              )} ${String(controlX)} ${String(endY)} ${String(endX)} ${String(endY)}`,
        );
      }
      const label = edgeLabels.get(edge.id);
      if (label !== undefined) {
        if (useVerticalPorts) {
          label.setAttribute("x", String(startX + 18));
          label.setAttribute("y", String((from.bottom + to.top) / 2 - graphRect.top + 4));
          placedLabelRects.push(label.getBoundingClientRect());
        } else {
          placeEdgeLabel(label, path, graphRect, nodeRects, placedLabelRects);
        }
      }
    }
  };

  // ResizeObserver handles later changes; the first frame captures initial placement.
  const view = ownerDocument.defaultView;
  const observer =
    view?.ResizeObserver === undefined ? null : new view.ResizeObserver(() => refresh());
  observer?.observe(graph);
  const frameId = view?.requestAnimationFrame(() => refresh()) ?? null;
  return Object.freeze({
    refresh,
    disconnect: (): void => {
      observer?.disconnect();
      if (frameId !== null) view?.cancelAnimationFrame(frameId);
    },
  });
}

// Convert SVG-local samples to screen space so the FLIP token follows the visible wire.
export function transportKeyframes(
  edge: SVGPathElement | undefined,
  before: DOMRect,
  after: DOMRect,
  deltaX: number,
  deltaY: number,
  forward: boolean,
): Keyframe[] {
  const fallback: Keyframe[] = [
    { transform: `translate(${String(deltaX)}px, ${String(deltaY)}px)`, opacity: 1 },
    { transform: "translate(0, 0)", opacity: 1 },
  ];
  if (edge === undefined) return fallback;

  const matrix = edge.getScreenCTM();
  const svg = edge.ownerSVGElement;
  const length = edge.getTotalLength();
  if (matrix === null || svg === null || !Number.isFinite(length) || length <= 0) return fallback;

  const finalCenterX = after.left + after.width / 2;
  const finalCenterY = after.top + after.height / 2;
  const transformAt = (progress: number): string => {
    const point = edge.getPointAtLength(length * (forward ? progress : 1 - progress));
    const screenPoint = svg.createSVGPoint();
    screenPoint.x = point.x;
    screenPoint.y = point.y;
    const transformed = screenPoint.matrixTransform(matrix);
    return `translate(${String(transformed.x - finalCenterX)}px, ${String(
      transformed.y - finalCenterY,
    )}px)`;
  };

  return [
    {
      transform: `translate(${String(before.left - after.left)}px, ${String(
        before.top - after.top,
      )}px)`,
      opacity: 1,
      offset: 0,
    },
    { transform: transformAt(0), opacity: 1, offset: 0.16 },
    { transform: transformAt(0.33), opacity: 1, offset: 0.38 },
    { transform: transformAt(0.66), opacity: 1, offset: 0.62 },
    { transform: transformAt(1), opacity: 1, offset: 0.84 },
    { transform: "translate(0, 0)", opacity: 1, offset: 1 },
  ];
}

export function nodePosition(kind: FoaFlowLessonKind, nodeId: string): { x: string; y: string } {
  if (kind === "linear") {
    if (nodeId.endsWith("input")) return { x: "10%", y: "50%" };
    if (nodeId.endsWith("value")) return { x: "35%", y: "50%" };
    if (nodeId.endsWith("square")) return { x: "60%", y: "50%" };
    return { x: "85%", y: "50%" };
  }
  if (kind === "branch") {
    if (nodeId === "boundary.input") return { x: "10%", y: "50%" };
    if (nodeId === "boundary.value") return { x: "36%", y: "50%" };
    if (nodeId === "boundary.positive") return { x: "60%", y: "28%" };
    if (nodeId === "boundary.negative") return { x: "60%", y: "72%" };
    if (nodeId === "boundary.output-positive") return { x: "88%", y: "17%" };
    if (nodeId === "boundary.output-negative") return { x: "88%", y: "50%" };
    if (nodeId === "boundary.output-zero") return { x: "88%", y: "83%" };
    if (nodeId.endsWith("decision")) return { x: "18%", y: "50%" };
    if (nodeId.endsWith("update")) return { x: "55%", y: "24%" };
    return { x: "86%", y: "50%" };
  }
  if (nodeId.endsWith("init")) return { x: "10%", y: "50%" };
  if (nodeId.endsWith("condition")) return { x: "34%", y: "50%" };
  if (nodeId.endsWith("body")) return { x: "61%", y: "23%" };
  if (nodeId.endsWith("update")) return { x: "61%", y: "77%" };
  return { x: "90%", y: "50%" };
}

function placeEdgeLabel(
  label: SVGTextElement,
  path: SVGPathElement,
  graphRect: DOMRect,
  nodeRects: readonly DOMRect[],
  placedLabelRects: readonly DOMRect[],
): void {
  const pathLength = path.getTotalLength();
  const offsets = [
    { x: 0, y: -12 },
    { x: 0, y: 18 },
    { x: -24, y: -12 },
    { x: 24, y: -12 },
    { x: -24, y: 18 },
    { x: 24, y: 18 },
    { x: -48, y: -14 },
    { x: 48, y: -14 },
    { x: -48, y: 22 },
    { x: 48, y: 22 },
  ] as const;
  let fallback: { readonly x: number; readonly y: number } | null = null;
  for (const progress of [0.5, 0.35, 0.65] as const) {
    const point = path.getPointAtLength(pathLength * progress);
    for (const offset of offsets) {
      const candidate = { x: point.x + offset.x, y: point.y + offset.y };
      fallback ??= candidate;
      label.setAttribute("x", String(candidate.x));
      label.setAttribute("y", String(candidate.y));
      const bounds = label.getBoundingClientRect();
      const insideGraph =
        bounds.left >= graphRect.left + 2 &&
        bounds.right <= graphRect.right - 2 &&
        bounds.top >= graphRect.top + 2 &&
        bounds.bottom <= graphRect.bottom - 2;
      if (
        insideGraph &&
        !nodeRects.some((node) => rectanglesOverlap(bounds, node, 4)) &&
        !placedLabelRects.some((placed) => rectanglesOverlap(bounds, placed, 4))
      ) {
        (placedLabelRects as DOMRect[]).push(bounds);
        return;
      }
    }
  }
  if (fallback !== null) {
    label.setAttribute("x", String(fallback.x));
    label.setAttribute("y", String(fallback.y));
  }
  (placedLabelRects as DOMRect[]).push(label.getBoundingClientRect());
}

function rectanglesOverlap(left: DOMRect, right: DOMRect, margin: number): boolean {
  return (
    left.left < right.right + margin &&
    left.right > right.left - margin &&
    left.top < right.bottom + margin &&
    left.bottom > right.top - margin
  );
}

function edgeLabelPosition(kind: FoaFlowLessonKind, edgeId: string): { x: string; y: string } {
  if (kind === "branch") {
    return edgeId === "branch.true" ? { x: "410", y: "104" } : { x: "410", y: "206" };
  }
  if (edgeId === "loop.true") return { x: "455", y: "102" };
  if (edgeId === "loop.false") return { x: "550", y: "142" };
  return { x: "410", y: "265" };
}

function edgePath(kind: FoaFlowLessonKind, edgeId: string): string {
  if (kind === "linear") {
    if (edgeId.includes("input-to-value")) return "M 180 150 H 270";
    if (edgeId.includes("value-to-square")) return "M 430 150 H 520";
    return "M 680 150 H 770";
  }
  if (kind === "branch") {
    if (edgeId === "branch.true") return "M 260 143 C 370 143 370 72 470 72";
    if (edgeId === "branch.false") return "M 260 157 C 520 157 620 150 780 150";
    return "M 630 72 C 700 72 720 150 780 150";
  }
  if (edgeId.includes("init-to-condition")) return "M 175 150 H 260";
  if (edgeId === "loop.true") return "M 405 140 C 455 120 485 70 540 70";
  if (edgeId === "loop.false") return "M 405 158 C 545 158 690 150 825 150";
  if (edgeId.includes("body-to-update")) return "M 615 105 C 615 135 615 165 615 195";
  return "M 540 232 C 440 270 300 250 330 188";
}

function compactNodePosition(kind: FoaFlowLessonKind, nodeId: string): { x: string; y: string } {
  if (kind === "linear") {
    if (nodeId.endsWith("input")) return { x: "5.5%", y: "50%" };
    if (nodeId.endsWith("value")) return { x: "22%", y: "50%" };
    if (nodeId.endsWith("square")) return { x: "38.5%", y: "50%" };
    return { x: "55%", y: "50%" };
  }
  if (kind === "branch") {
    if (nodeId === "boundary.input") return { x: "5.5%", y: "50%" };
    if (nodeId === "boundary.value") return { x: "22%", y: "50%" };
    if (nodeId === "boundary.positive") return { x: "38.5%", y: "32%" };
    if (nodeId === "boundary.negative") return { x: "38.5%", y: "68%" };
    if (nodeId === "boundary.output-positive") return { x: "55%", y: "21%" };
    if (nodeId === "boundary.output-negative") return { x: "55%", y: "50%" };
    if (nodeId === "boundary.output-zero") return { x: "55%", y: "79%" };
    if (nodeId.endsWith("decision")) return { x: "10%", y: "50%" };
    if (nodeId.endsWith("update")) return { x: "31%", y: "24%" };
    return { x: "53%", y: "50%" };
  }
  if (nodeId.endsWith("init")) return { x: "5.5%", y: "50%" };
  if (nodeId.endsWith("condition")) return { x: "22%", y: "50%" };
  if (nodeId.endsWith("body")) return { x: "38.5%", y: "23%" };
  if (nodeId.endsWith("update")) return { x: "38.5%", y: "77%" };
  return { x: "55%", y: "50%" };
}

function publicEdgeName(edge: FlowEdge): string {
  if (edge.id === "loop.back") return "loop-back";
  if (edge.id === "loop.false") return "exit";
  if (edge.kind === "true" || edge.kind === "false") return edge.kind;
  return edge.id;
}
