import {
  FLOW_VIEW_STATE_SCHEMA_VERSION,
  type FlowEdge,
  type FlowDataEdge,
  type FlowNode,
  type FlowPoint,
  type FlowPort,
  type FlowProjection,
  type FlowViewState,
} from "../flow/index.js";

export type FlowCanvasViewChangeReason =
  | "projection"
  | "restore"
  | "selection"
  | "node-move"
  | "keyboard-move"
  | "viewport"
  | "detail"
  | "align";

export type FlowCanvasDraftChangeReason =
  "restore" | "selection" | "node-move" | "keyboard-move" | "delete" | "content" | "align";

export interface FlowCanvasConnectionGesture {
  readonly sourceFingerprint: string;
  readonly fromNodeId: string;
  readonly fromPortId: string;
  readonly toNodeId: string;
  readonly toPortId: string;
  readonly edgeKind: FlowPort["edgeKind"];
}

export interface FlowCanvasDraftNode {
  readonly id: string;
  readonly label: string;
  readonly position: FlowPoint;
  readonly status: "detached" | "valid" | "invalid";
  readonly presetId?: string | null | undefined;
  readonly presetVersion?: string | null | undefined;
  readonly blockKind?: "statement" | "control" | "function" | "module" | "virtual" | undefined;
  readonly placedAt?: string | undefined;
  readonly sourceText?: string | undefined;
  readonly ports?: readonly FlowCanvasDraftPort[] | undefined;
}

export interface FlowCanvasDraftPort {
  readonly id: string;
  readonly direction: "input" | "output";
  readonly channel: "control" | "data";
  readonly edgeKind: FlowPort["edgeKind"];
  readonly label: string;
  readonly editable: boolean;
}

export interface FlowCanvasDraftConnectionIntent {
  readonly sourceFingerprint: string;
  readonly draftNodeId: string;
  readonly draftPortId: string;
  readonly presetId: string | null;
  readonly sourceText: string | null;
  readonly toNodeId: string;
  readonly toPortId: string;
  readonly edgeKind: Exclude<FlowPort["edgeKind"], null>;
}

export interface FlowCanvasDraftConnection {
  readonly from: FlowPoint;
  readonly to: FlowPoint;
  readonly status: "pending" | "valid" | "invalid";
}

export interface FlowCanvasVirtualEndpoint {
  readonly source: "projection" | "virtual";
  readonly nodeId: string;
  readonly portId: string;
}

export interface FlowCanvasVirtualConnectionIntent {
  readonly sourceFingerprint: string;
  readonly from: FlowCanvasVirtualEndpoint;
  readonly to: FlowCanvasVirtualEndpoint;
}

/** A playback-only attachment. It never represents or rewrites a C CFG edge. */
export interface FlowCanvasVirtualEdge {
  readonly id: string;
  readonly from: FlowCanvasVirtualEndpoint;
  readonly to: FlowCanvasVirtualEndpoint;
  readonly status: "pending" | "valid";
  readonly sourceEdgeIds: readonly string[];
}

export interface FlowCanvasDraftVisualState {
  readonly nodes: readonly FlowCanvasDraftNode[];
  readonly connection: FlowCanvasDraftConnection | null;
  readonly selectedNodeIds?: readonly string[] | undefined;
  readonly virtualEdges?: readonly FlowCanvasVirtualEdge[] | undefined;
}

export interface FlowCanvasActivePath {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly currentNodeId: string | null;
  readonly mode: "real" | "simulation";
}

export interface FlowCanvasDetailContext {
  readonly node: FlowNode;
  readonly body: HTMLElement;
}

export interface FlowCanvasOptions {
  readonly onNodeClick?: ((node: FlowNode, selectedNodeIds: readonly string[]) => void) | undefined;
  readonly onViewStateChange?:
    ((state: FlowViewState, reason: FlowCanvasViewChangeReason) => void) | undefined;
  readonly onConnectionIntent?: ((gesture: FlowCanvasConnectionGesture) => void) | undefined;
  readonly onDraftConnectionIntent?:
    ((intent: FlowCanvasDraftConnectionIntent) => void) | undefined;
  readonly onVirtualConnectionIntent?:
    ((intent: FlowCanvasVirtualConnectionIntent) => void) | undefined;
  readonly onDraftStateChange?:
    ((state: FlowCanvasDraftVisualState, reason: FlowCanvasDraftChangeReason) => void) | undefined;
  readonly onDraftNodeClick?:
    ((node: FlowCanvasDraftNode, selectedNodeIds: readonly string[]) => void) | undefined;
  readonly onDeleteDraftNodes?: ((nodeIds: readonly string[]) => void) | undefined;
  readonly onDeleteNodes?: ((nodeIds: readonly string[]) => void) | undefined;
  readonly onCopyNodes?: ((nodeIds: readonly string[]) => void) | undefined;
  readonly onUndo?: (() => void) | undefined;
  readonly onHistoryCheckpoint?: (() => void) | undefined;
  readonly renderNodeDetail?: ((context: FlowCanvasDetailContext) => void) | undefined;
}

export interface FlowCanvasController {
  readonly element: HTMLElement;
  setProjection(projection: FlowProjection | null): void;
  setViewState(viewState: FlowViewState): void;
  getViewState(): FlowViewState;
  setActivePath(path: FlowCanvasActivePath | readonly string[]): void;
  setDraftVisualState(state: FlowCanvasDraftVisualState | null): void;
  getDraftVisualState(): FlowCanvasDraftVisualState | null;
  focusNode(nodeId: string): void;
  refreshDetail(): void;
  alignSelection(mode: "left" | "distribute-y"): void;
  destroy(): void;
}

interface NodeDragGesture {
  readonly kind: "node";
  readonly pointerId: number;
  readonly startClient: FlowPoint;
  readonly origins: Readonly<Record<string, FlowPoint>>;
}

interface PanGesture {
  readonly kind: "pan";
  readonly pointerId: number;
  readonly startClient: FlowPoint;
  readonly origin: FlowPoint;
}

interface MarqueeGesture {
  readonly kind: "marquee";
  readonly pointerId: number;
  readonly startClient: FlowPoint;
  currentClient: FlowPoint;
  readonly additive: boolean;
}

interface WireGesture {
  readonly kind: "wire";
  readonly source: "projection" | "draft";
  readonly pointerId: number;
  readonly nodeId: string;
  readonly portId: string;
  readonly start: FlowPoint;
  current: FlowPoint;
}

interface DraftNodeDragGesture {
  readonly kind: "draft-node";
  readonly pointerId: number;
  readonly startClient: FlowPoint;
  readonly origins: Readonly<Record<string, FlowPoint>>;
}

interface DetailMoveGesture {
  readonly kind: "detail-move";
  readonly pointerId: number;
  readonly startClient: FlowPoint;
  readonly origin: FlowPoint;
}

interface DetailResizeGesture {
  readonly kind: "detail-resize";
  readonly pointerId: number;
  readonly startClient: FlowPoint;
  readonly origin: FlowPoint;
}

type CanvasGesture =
  | NodeDragGesture
  | PanGesture
  | MarqueeGesture
  | WireGesture
  | DraftNodeDragGesture
  | DetailMoveGesture
  | DetailResizeGesture;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const NODE_WIDTH = 160;
const NODE_HEIGHT = 36;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const KEYBOARD_MOVE = 2;
const DETAIL_MIN_WIDTH = 280;
const DETAIL_MIN_HEIGHT = 180;

export function createFlowCanvas(
  host: HTMLElement,
  options: FlowCanvasOptions = {},
): FlowCanvasController {
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "flow-canvas";
  root.tabIndex = 0;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "算法流程画布。方向键移动所选节点，按住空格拖动画布，滚轮缩放。");
  root.dataset.flowCanvas = "true";

  const wires = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
  wires.classList.add("flow-canvas__wires");
  wires.setAttribute("aria-hidden", "true");
  const wireViewport = ownerDocument.createElementNS(SVG_NAMESPACE, "g");
  const edgeLayer = ownerDocument.createElementNS(SVG_NAMESPACE, "g");
  edgeLayer.classList.add("flow-canvas__edge-layer");
  const draftWire = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
  draftWire.classList.add("flow-canvas__draft-wire");
  draftWire.setAttribute("visibility", "hidden");
  wireViewport.append(edgeLayer, draftWire);
  wires.append(wireViewport);

  const viewport = ownerDocument.createElement("div");
  viewport.className = "flow-canvas__viewport";
  const surface = ownerDocument.createElement("div");
  surface.className = "flow-canvas__surface";
  const nodeLayer = ownerDocument.createElement("div");
  nodeLayer.className = "flow-canvas__node-layer";
  const draftLayer = ownerDocument.createElement("div");
  draftLayer.className = "flow-canvas__draft-layer";
  surface.append(nodeLayer, draftLayer);
  viewport.append(surface);

  const marquee = ownerDocument.createElement("div");
  marquee.className = "flow-canvas__marquee";
  marquee.hidden = true;
  marquee.setAttribute("aria-hidden", "true");

  const emptyState = ownerDocument.createElement("p");
  emptyState.className = "flow-canvas__empty";
  emptyState.textContent = "打开 C 文件后，这里会显示可自由摆放的流程节点。";

  const detail = createDetailWindow(ownerDocument);
  root.append(wires, viewport, marquee, emptyState, detail.window);
  host.replaceChildren(root);

  let projection: FlowProjection | null = null;
  let viewState = emptyViewState("");
  let activePath: FlowCanvasActivePath = emptyActivePath();
  let draftState: FlowCanvasDraftVisualState | null = null;
  let detailDraftNodeId: string | null = null;
  let gesture: CanvasGesture | null = null;
  let spacePressed = false;
  let destroyed = false;
  const nodeElements = new Map<string, HTMLElement>();
  const edgeElements = new Map<string, SVGPathElement>();
  const virtualEdgeElements = new Map<string, SVGPathElement>();
  const draftNodeElements = new Map<string, HTMLElement>();

  const publishViewState = (reason: FlowCanvasViewChangeReason): void => {
    options.onViewStateChange?.(cloneViewState(viewState), reason);
  };

  const publishDraftState = (reason: FlowCanvasDraftChangeReason): void => {
    if (draftState !== null) options.onDraftStateChange?.(freezeDraftState(draftState), reason);
  };

  const setInternalViewState = (
    candidate: FlowViewState,
    reason: FlowCanvasViewChangeReason,
  ): void => {
    viewState =
      projection === null
        ? cloneViewState(candidate)
        : normalizeFlowCanvasViewState(projection, candidate);
    renderViewport();
    renderSelection();
    renderDetail();
    publishViewState(reason);
  };

  const nodeForId = (nodeId: string): FlowNode | undefined =>
    projection?.nodes.find((node) => node.id === nodeId);

  const draftNodeForId = (nodeId: string): FlowCanvasDraftNode | undefined =>
    draftState?.nodes.find((node) => node.id === nodeId);

  const positionFor = (node: FlowNode): FlowPoint =>
    viewState.positions[node.id] ?? node.defaultPosition;

  function renderProjection(): void {
    nodeElements.clear();
    edgeElements.clear();
    virtualEdgeElements.clear();
    nodeLayer.replaceChildren();
    edgeLayer.replaceChildren();
    emptyState.hidden = projection !== null && projection.nodes.length > 0;
    if (projection === null) {
      renderDetail();
      return;
    }

    for (const edge of projection.edges) {
      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add("flow-canvas__wire");
      path.dataset.flowEdgeId = edge.id;
      path.dataset.edgeKind = edge.kind;
      path.dataset.editable = String(edge.editable);
      edgeLayer.append(path);
      edgeElements.set(edge.id, path);
    }
    for (const edge of projection.dataEdges) {
      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add("flow-canvas__wire", "flow-canvas__wire--data");
      path.dataset.flowDataEdgeId = edge.id;
      path.dataset.channel = "data";
      path.dataset.variableName = edge.variableName;
      path.dataset.editable = "false";
      edgeLayer.prepend(path);
      edgeElements.set(edge.id, path);
    }

    for (const node of projection.nodes) {
      const element = renderNode(ownerDocument, node);
      nodeLayer.append(element);
      nodeElements.set(node.id, element);
    }
    renderViewport();
    renderSelection();
    renderActivePath();
    renderDraft();
    renderDetail();
  }

  function renderViewport(): void {
    const { x, y, zoom } = viewState.viewport;
    viewport.style.transform = `translate(${String(x)}px, ${String(y)}px) scale(${String(zoom)})`;
    wireViewport.setAttribute(
      "transform",
      `translate(${String(x)} ${String(y)}) scale(${String(zoom)})`,
    );
    root.dataset.zoom = zoom.toFixed(2);
    for (const node of projection?.nodes ?? []) {
      const element = nodeElements.get(node.id);
      const position = positionFor(node);
      if (element !== undefined) {
        element.style.transform = `translate(${String(position.x)}px, ${String(position.y)}px)`;
      }
    }
    renderWires();
  }

  function renderWires(): void {
    if (projection === null) return;
    const nodes = new Map(projection.nodes.map((node) => [node.id, node]));
    for (const edge of projection.edges) {
      const path = edgeElements.get(edge.id);
      const fromNode = nodes.get(edge.from.nodeId);
      const toNode = nodes.get(edge.to.nodeId);
      const fromPort = fromNode?.ports.find((port) => port.id === edge.from.portId);
      const toPort = toNode?.ports.find((port) => port.id === edge.to.portId);
      if (
        path === undefined ||
        fromNode === undefined ||
        toNode === undefined ||
        fromPort === undefined ||
        toPort === undefined
      ) {
        path?.setAttribute("d", "");
        continue;
      }
      const from = flowPortPoint(fromNode, fromPort, positionFor(fromNode));
      const to = flowPortPoint(toNode, toPort, positionFor(toNode));
      path.setAttribute("d", createFlowWirePath(from, to));
    }
    for (const edge of projection.dataEdges) renderDataWire(edge, nodes);
    renderVirtualWires();
    renderGestureWire();
  }

  function renderVirtualEdges(): void {
    for (const [edgeId, element] of virtualEdgeElements) {
      element.remove();
      edgeElements.delete(edgeId);
    }
    virtualEdgeElements.clear();
    for (const edge of draftState?.virtualEdges ?? []) {
      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add("flow-canvas__wire", "flow-canvas__wire--virtual");
      path.dataset.flowVirtualEdgeId = edge.id;
      path.dataset.status = edge.status;
      path.dataset.editable = "true";
      edgeLayer.append(path);
      virtualEdgeElements.set(edge.id, path);
      edgeElements.set(edge.id, path);
    }
    renderVirtualWires();
  }

  function renderVirtualWires(): void {
    for (const edge of draftState?.virtualEdges ?? []) {
      const path = virtualEdgeElements.get(edge.id);
      const from = virtualEndpointPoint(edge.from);
      const to = virtualEndpointPoint(edge.to);
      path?.setAttribute("d", from === null || to === null ? "" : createFlowWirePath(from, to));
    }
  }

  function virtualEndpointPoint(endpoint: FlowCanvasVirtualEndpoint): FlowPoint | null {
    if (endpoint.source === "projection") {
      const node = nodeForId(endpoint.nodeId);
      const port = node?.ports.find((candidate) => candidate.id === endpoint.portId);
      return node === undefined || port === undefined
        ? null
        : flowPortPoint(node, port, positionFor(node));
    }
    const node = draftNodeForId(endpoint.nodeId);
    const port = node?.ports?.find((candidate) => candidate.id === endpoint.portId);
    return node === undefined || port === undefined ? null : draftPortPoint(node, port);
  }

  function renderDataWire(edge: FlowDataEdge, nodes: ReadonlyMap<string, FlowNode>): void {
    const path = edgeElements.get(edge.id);
    const fromNode = nodes.get(edge.fromNodeId);
    const toNode = nodes.get(edge.toNodeId);
    if (path === undefined || fromNode === undefined || toNode === undefined) {
      path?.setAttribute("d", "");
      return;
    }
    const fromPosition = positionFor(fromNode);
    const toPosition = positionFor(toNode);
    path.setAttribute(
      "d",
      createFlowWirePath(
        point(fromPosition.x + NODE_WIDTH, fromPosition.y + 9),
        point(toPosition.x, toPosition.y + NODE_HEIGHT - 9),
      ),
    );
  }

  function renderGestureWire(): void {
    const connection =
      gesture?.kind === "wire"
        ? { from: gesture.start, to: gesture.current, status: "pending" as const }
        : draftState?.connection;
    if (connection === null || connection === undefined) {
      draftWire.setAttribute("visibility", "hidden");
      draftWire.setAttribute("d", "");
      delete draftWire.dataset.status;
      return;
    }
    draftWire.removeAttribute("visibility");
    draftWire.dataset.status = connection.status;
    draftWire.setAttribute("d", createFlowWirePath(connection.from, connection.to));
  }

  function renderSelection(): void {
    const selected = new Set(viewState.selectedNodeIds);
    for (const [nodeId, element] of nodeElements) {
      const isSelected = selected.has(nodeId);
      element.classList.toggle("is-selected", isSelected);
      element.setAttribute("aria-selected", String(isSelected));
      element.tabIndex = isSelected ? 0 : -1;
    }
    const selectedDrafts = new Set(draftState?.selectedNodeIds ?? []);
    for (const [nodeId, element] of draftNodeElements) {
      const isSelected = selectedDrafts.has(nodeId);
      element.classList.toggle("is-selected", isSelected);
      element.setAttribute("aria-selected", String(isSelected));
      element.tabIndex = isSelected ? 0 : -1;
      element.style.boxShadow = isSelected ? "0 0 0 1px var(--accent-line)" : "";
    }
  }

  function renderActivePath(): void {
    const activeNodes = new Set(activePath.nodeIds);
    const activeEdges = new Set(activePath.edgeIds);
    for (const [nodeId, element] of nodeElements) {
      element.classList.toggle("is-active-path", activeNodes.has(nodeId));
      element.classList.toggle("is-current", activePath.currentNodeId === nodeId);
      element.dataset.executionMode = activeNodes.has(nodeId) ? activePath.mode : "idle";
    }
    for (const [edgeId, element] of edgeElements) {
      element.classList.toggle("is-active-path", activeEdges.has(edgeId));
      element.dataset.executionMode = activeEdges.has(edgeId) ? activePath.mode : "idle";
    }
    for (const [nodeId, element] of draftNodeElements) {
      element.classList.toggle("is-active-path", activeNodes.has(nodeId));
      element.classList.toggle("is-current", activePath.currentNodeId === nodeId);
      element.dataset.executionMode = activeNodes.has(nodeId) ? activePath.mode : "idle";
    }
  }

  function renderDraft(): void {
    draftNodeElements.clear();
    draftLayer.replaceChildren();
    for (const node of draftState?.nodes ?? []) {
      const element = ownerDocument.createElement("article");
      element.className = "flow-canvas__draft-node";
      element.dataset.draftId = node.id;
      element.dataset.flowDraftNodeId = node.id;
      element.dataset.status = node.status;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `${node.label}，未接入草稿`);
      element.setAttribute("aria-selected", "false");
      element.tabIndex = -1;
      element.style.width = `${String(NODE_WIDTH)}px`;
      element.style.minHeight = `${String(NODE_HEIGHT)}px`;
      element.style.cursor = "grab";
      element.style.transform = `translate(${String(node.position.x)}px, ${String(node.position.y)}px)`;
      const label = ownerDocument.createElement("span");
      label.className = "flow-node__label";
      label.textContent = node.label;
      element.append(label);
      for (const port of node.ports ?? []) {
        const portElement = ownerDocument.createElement("button");
        portElement.className = `flow-node__port flow-node__port--${port.direction}`;
        portElement.type = "button";
        portElement.tabIndex = -1;
        portElement.dataset.flowDraftNodeId = node.id;
        portElement.dataset.flowDraftPortId = port.id;
        portElement.dataset.channel = port.channel;
        portElement.dataset.editable = String(port.editable);
        portElement.disabled = !port.editable;
        portElement.setAttribute("aria-label", `${node.label}：${port.label}`);
        portElement.title = port.label;
        element.append(portElement);
      }
      draftLayer.append(element);
      draftNodeElements.set(node.id, element);
    }
    renderSelection();
    renderVirtualEdges();
    renderGestureWire();
  }

  function renderDetail(): void {
    const node =
      viewState.detailNodeId === null
        ? undefined
        : projection?.nodes.find((candidate) => candidate.id === viewState.detailNodeId);
    const draftNode =
      node === undefined && detailDraftNodeId !== null
        ? draftNodeForId(detailDraftNodeId)
        : undefined;
    if (node === undefined && draftNode === undefined) {
      detail.window.hidden = true;
      detail.body.replaceChildren();
      return;
    }
    detail.window.hidden = false;
    detail.title.textContent = node?.label ?? draftNode?.label ?? "草稿";
    detail.window.dataset.nodeId = node?.id ?? draftNode?.id ?? "";
    detail.window.dataset.locked = String(node?.locked ?? false);
    detail.window.dataset.draft = String(draftNode !== undefined);
    detail.body.replaceChildren();
    if (node !== undefined) {
      renderDefaultDetail(ownerDocument, detail.body, node);
      options.renderNodeDetail?.(Object.freeze({ node, body: detail.body }));
    } else if (draftNode !== undefined) {
      renderDefaultDraftDetail(ownerDocument, detail.body, draftNode, (sourceText) => {
        if (draftState === null || draftNode.blockKind === "virtual") return;
        options.onHistoryCheckpoint?.();
        draftState = freezeDraftState({
          ...draftState,
          nodes: draftState.nodes.map((candidate) =>
            candidate.id === draftNode.id
              ? Object.freeze({ ...candidate, sourceText, status: "detached" as const })
              : candidate,
          ),
        });
        renderDraft();
        publishDraftState("content");
        renderDetail();
      });
    }
  }

  function selectNode(node: FlowNode, additive: boolean): void {
    detailDraftNodeId = null;
    if ((draftState?.selectedNodeIds?.length ?? 0) > 0 && draftState !== null) {
      draftState = freezeDraftState({ ...draftState, selectedNodeIds: [] });
      publishDraftState("selection");
    }
    const selected = new Set(additive ? viewState.selectedNodeIds : []);
    if (additive && selected.has(node.id)) selected.delete(node.id);
    else selected.add(node.id);
    viewState = cloneViewState(viewState, {
      selectedNodeIds: [...selected],
      detailNodeId: node.id,
    });
    renderSelection();
    renderDetail();
    publishViewState("selection");
    options.onNodeClick?.(node, viewState.selectedNodeIds);
  }

  function selectDraftNode(node: FlowCanvasDraftNode, additive: boolean): void {
    if (draftState === null) return;
    const selected = new Set(additive ? (draftState.selectedNodeIds ?? []) : []);
    if (additive && selected.has(node.id)) selected.delete(node.id);
    else selected.add(node.id);
    draftState = freezeDraftState({ ...draftState, selectedNodeIds: [...selected] });
    if (viewState.selectedNodeIds.length > 0) {
      viewState = cloneViewState(viewState, { selectedNodeIds: [], detailNodeId: null });
      publishViewState("selection");
    }
    detailDraftNodeId = node.id;
    renderSelection();
    renderDetail();
    publishDraftState("selection");
    options.onDraftNodeClick?.(node, draftState.selectedNodeIds ?? []);
  }

  function startNodeGesture(event: PointerEvent, node: FlowNode): void {
    options.onHistoryCheckpoint?.();
    selectNode(node, event.shiftKey || event.metaKey || event.ctrlKey);
    const selected = viewState.selectedNodeIds.includes(node.id)
      ? viewState.selectedNodeIds
      : [node.id];
    const origins: Record<string, FlowPoint> = {};
    for (const selectedId of selected) {
      const selectedNode = nodeForId(selectedId);
      if (selectedNode !== undefined) origins[selectedId] = positionFor(selectedNode);
    }
    gesture = {
      kind: "node",
      pointerId: event.pointerId,
      startClient: point(event.clientX, event.clientY),
      origins: Object.freeze(origins),
    };
  }

  function startDraftNodeGesture(event: PointerEvent, node: FlowCanvasDraftNode): void {
    options.onHistoryCheckpoint?.();
    selectDraftNode(node, event.shiftKey || event.metaKey || event.ctrlKey);
    const draftSelection = draftState?.selectedNodeIds ?? [];
    const selected = draftSelection.includes(node.id) ? draftSelection : [node.id];
    const origins: Record<string, FlowPoint> = {};
    for (const selectedId of selected ?? []) {
      const selectedNode = draftNodeForId(selectedId);
      if (selectedNode !== undefined) origins[selectedId] = selectedNode.position;
    }
    gesture = {
      kind: "draft-node",
      pointerId: event.pointerId,
      startClient: point(event.clientX, event.clientY),
      origins: Object.freeze(origins),
    };
  }

  function startWireGesture(event: PointerEvent, node: FlowNode, port: FlowPort): void {
    if (port.direction !== "output" || port.channel !== "control" || port.edgeKind === null) return;
    const start = flowPortPoint(node, port, positionFor(node));
    gesture = {
      kind: "wire",
      source: "projection",
      pointerId: event.pointerId,
      nodeId: node.id,
      portId: port.id,
      start,
      current: clientToWorld(root, viewState, event.clientX, event.clientY),
    };
    renderGestureWire();
  }

  function startDraftWireGesture(
    event: PointerEvent,
    node: FlowCanvasDraftNode,
    port: FlowCanvasDraftPort,
  ): void {
    if (!port.editable || port.direction !== "output" || port.edgeKind === null) return;
    gesture = {
      kind: "wire",
      source: "draft",
      pointerId: event.pointerId,
      nodeId: node.id,
      portId: port.id,
      start: draftPortPoint(node, port),
      current: clientToWorld(root, viewState, event.clientX, event.clientY),
    };
    renderGestureWire();
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (destroyed || event.button > 1) return;
    const target = closestElement(event.target);
    if (target === null) return;

    if (target.closest("[data-flow-detail-resize]") !== null) {
      event.preventDefault();
      gesture = {
        kind: "detail-resize",
        pointerId: event.pointerId,
        startClient: point(event.clientX, event.clientY),
        origin: point(detail.window.offsetWidth, detail.window.offsetHeight),
      };
      root.setPointerCapture?.(event.pointerId);
      return;
    }
    if (target.closest("button") === null && target.closest("[data-flow-detail-handle]") !== null) {
      event.preventDefault();
      gesture = {
        kind: "detail-move",
        pointerId: event.pointerId,
        startClient: point(event.clientX, event.clientY),
        origin: point(detail.window.offsetLeft, detail.window.offsetTop),
      };
      root.setPointerCapture?.(event.pointerId);
      return;
    }
    if (target.closest("[data-flow-detail-window]") !== null) return;

    const draftPortElement = target.closest<HTMLElement>("[data-flow-draft-port-id]");
    if (draftPortElement !== null) {
      const node = draftNodeForId(draftPortElement.dataset.flowDraftNodeId ?? "");
      const port = node?.ports?.find(
        (candidate) => candidate.id === draftPortElement.dataset.flowDraftPortId,
      );
      if (node !== undefined && port !== undefined) {
        event.preventDefault();
        startDraftWireGesture(event, node, port);
        if (gesture !== null) root.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    const portElement = target.closest<HTMLElement>("[data-flow-port-id]");
    if (portElement !== null) {
      const node = nodeForId(portElement.dataset.flowNodeId ?? "");
      const port = node?.ports.find((candidate) => candidate.id === portElement.dataset.flowPortId);
      if (node !== undefined && port !== undefined) {
        event.preventDefault();
        startWireGesture(event, node, port);
        if (gesture !== null) root.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    const draftNodeElement = target.closest<HTMLElement>("[data-flow-draft-node-id]");
    if (draftNodeElement !== null) {
      const node = draftNodeForId(draftNodeElement.dataset.flowDraftNodeId ?? "");
      if (node !== undefined) {
        event.preventDefault();
        startDraftNodeGesture(event, node);
        root.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    const nodeElement = target.closest<HTMLElement>("[data-flow-node-id]");
    if (nodeElement !== null) {
      const node = nodeForId(nodeElement.dataset.flowNodeId ?? "");
      if (node !== undefined) {
        event.preventDefault();
        startNodeGesture(event, node);
        root.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    if (target.closest(".flow-canvas") !== root) return;
    event.preventDefault();
    if (event.button === 1 || spacePressed) {
      gesture = {
        kind: "pan",
        pointerId: event.pointerId,
        startClient: point(event.clientX, event.clientY),
        origin: point(viewState.viewport.x, viewState.viewport.y),
      };
      root.classList.add("is-panning");
    } else {
      gesture = {
        kind: "marquee",
        pointerId: event.pointerId,
        startClient: point(event.clientX, event.clientY),
        currentClient: point(event.clientX, event.clientY),
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
      };
      marquee.hidden = false;
      renderMarquee(root, marquee, gesture);
    }
    root.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (destroyed || gesture === null || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "node") {
      const dx = (event.clientX - gesture.startClient.x) / viewState.viewport.zoom;
      const dy = (event.clientY - gesture.startClient.y) / viewState.viewport.zoom;
      const positions = { ...viewState.positions };
      for (const [nodeId, origin] of Object.entries(gesture.origins)) {
        positions[nodeId] = point(origin.x + dx, origin.y + dy);
      }
      viewState = cloneViewState(viewState, { positions });
      renderViewport();
      publishViewState("node-move");
    } else if (gesture.kind === "draft-node") {
      if (draftState === null) return;
      const dx = (event.clientX - gesture.startClient.x) / viewState.viewport.zoom;
      const dy = (event.clientY - gesture.startClient.y) / viewState.viewport.zoom;
      draftState = freezeDraftState({
        ...draftState,
        nodes: draftState.nodes.map((node) => {
          const origin = gesture?.kind === "draft-node" ? gesture.origins[node.id] : undefined;
          return origin === undefined
            ? node
            : { ...node, position: point(origin.x + dx, origin.y + dy) };
        }),
      });
      renderDraft();
      publishDraftState("node-move");
    } else if (gesture.kind === "pan") {
      viewState = cloneViewState(viewState, {
        viewport: {
          ...viewState.viewport,
          x: gesture.origin.x + event.clientX - gesture.startClient.x,
          y: gesture.origin.y + event.clientY - gesture.startClient.y,
        },
      });
      renderViewport();
      publishViewState("viewport");
    } else if (gesture.kind === "marquee") {
      gesture.currentClient = point(event.clientX, event.clientY);
      renderMarquee(root, marquee, gesture);
    } else if (gesture.kind === "wire") {
      gesture.current = clientToWorld(root, viewState, event.clientX, event.clientY);
      renderGestureWire();
    } else if (gesture.kind === "detail-move") {
      detail.window.style.left = `${String(Math.max(0, gesture.origin.x + event.clientX - gesture.startClient.x))}px`;
      detail.window.style.top = `${String(Math.max(0, gesture.origin.y + event.clientY - gesture.startClient.y))}px`;
    } else {
      detail.window.style.width = `${String(Math.max(DETAIL_MIN_WIDTH, gesture.origin.x + event.clientX - gesture.startClient.x))}px`;
      detail.window.style.height = `${String(Math.max(DETAIL_MIN_HEIGHT, gesture.origin.y + event.clientY - gesture.startClient.y))}px`;
    }
  };

  const finishGesture = (event: PointerEvent): void => {
    if (destroyed || gesture === null || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "marquee") finishMarquee(gesture);
    else if (gesture.kind === "wire") finishWire(gesture, event);
    root.classList.remove("is-panning");
    marquee.hidden = true;
    root.releasePointerCapture?.(event.pointerId);
    gesture = null;
    renderGestureWire();
  };

  function finishMarquee(current: MarqueeGesture): void {
    const start = clientToWorld(root, viewState, current.startClient.x, current.startClient.y);
    const end = clientToWorld(root, viewState, current.currentClient.x, current.currentClient.y);
    const bounds = normalizedBounds(start, end);
    const selected = new Set(current.additive ? viewState.selectedNodeIds : []);
    for (const node of projection?.nodes ?? []) {
      const position = positionFor(node);
      if (
        rectanglesIntersect(bounds, {
          left: position.x,
          top: position.y,
          right: position.x + NODE_WIDTH,
          bottom: position.y + NODE_HEIGHT,
        })
      ) {
        selected.add(node.id);
      }
    }
    viewState = cloneViewState(viewState, { selectedNodeIds: [...selected] });
    if (draftState !== null) {
      const selectedDrafts = new Set(current.additive ? (draftState.selectedNodeIds ?? []) : []);
      for (const node of draftState.nodes) {
        if (
          rectanglesIntersect(bounds, {
            left: node.position.x,
            top: node.position.y,
            right: node.position.x + NODE_WIDTH,
            bottom: node.position.y + NODE_HEIGHT,
          })
        ) {
          selectedDrafts.add(node.id);
        }
      }
      draftState = freezeDraftState({ ...draftState, selectedNodeIds: [...selectedDrafts] });
      publishDraftState("selection");
    }
    renderSelection();
    publishViewState("selection");
  }

  function finishWire(current: WireGesture, event: PointerEvent): void {
    const target = ownerDocument.elementFromPoint?.(event.clientX, event.clientY);
    const virtualPortElement =
      target instanceof Element ? target.closest<HTMLElement>("[data-flow-draft-port-id]") : null;
    if (virtualPortElement !== null) {
      const targetNode = draftNodeForId(virtualPortElement.dataset.flowDraftNodeId ?? "");
      const targetPort = targetNode?.ports?.find(
        (port) => port.id === virtualPortElement.dataset.flowDraftPortId,
      );
      if (
        targetNode?.blockKind !== "virtual" ||
        targetPort === undefined ||
        !targetPort.editable ||
        targetPort.direction !== "input" ||
        targetPort.channel !== "control"
      ) {
        return;
      }
      const from = virtualSourceEndpoint(current);
      if (from !== null) {
        options.onVirtualConnectionIntent?.(
          Object.freeze({
            sourceFingerprint: projection?.sourceFingerprint ?? "",
            from,
            to: Object.freeze({
              source: "virtual" as const,
              nodeId: targetNode.id,
              portId: targetPort.id,
            }),
          }),
        );
      }
      return;
    }
    const portElement =
      target instanceof Element ? target.closest<HTMLElement>("[data-flow-port-id]") : null;
    if (portElement === null) return;
    const targetNode = nodeForId(portElement.dataset.flowNodeId ?? "");
    const targetPort = targetNode?.ports.find((port) => port.id === portElement.dataset.flowPortId);
    if (
      projection === null ||
      targetNode === undefined ||
      targetPort === undefined ||
      targetPort.direction !== "input"
    ) {
      return;
    }
    if (current.source === "draft") {
      const sourceNode = draftNodeForId(current.nodeId);
      const sourcePort = sourceNode?.ports?.find((port) => port.id === current.portId);
      if (sourceNode === undefined || sourcePort === undefined) return;
      if (sourceNode.blockKind === "virtual") {
        options.onVirtualConnectionIntent?.(
          Object.freeze({
            sourceFingerprint: projection.sourceFingerprint,
            from: Object.freeze({
              source: "virtual" as const,
              nodeId: sourceNode.id,
              portId: sourcePort.id,
            }),
            to: Object.freeze({
              source: "projection" as const,
              nodeId: targetNode.id,
              portId: targetPort.id,
            }),
          }),
        );
        return;
      }
      const intent = createFlowCanvasDraftConnectionIntent(
        projection,
        sourceNode,
        sourcePort,
        targetNode,
        targetPort,
      );
      if (intent !== null) options.onDraftConnectionIntent?.(intent);
      return;
    }
    const sourceNode = nodeForId(current.nodeId);
    const sourcePort = sourceNode?.ports.find((port) => port.id === current.portId);
    if (sourceNode === undefined || sourcePort === undefined || !sourcePort.editable) return;
    options.onConnectionIntent?.(
      Object.freeze({
        sourceFingerprint: projection.sourceFingerprint,
        fromNodeId: sourceNode.id,
        fromPortId: sourcePort.id,
        toNodeId: targetNode.id,
        toPortId: targetPort.id,
        edgeKind: sourcePort.edgeKind,
      }),
    );
  }

  function virtualSourceEndpoint(current: WireGesture): FlowCanvasVirtualEndpoint | null {
    if (current.source === "projection") {
      return nodeForId(current.nodeId) === undefined
        ? null
        : Object.freeze({
            source: "projection" as const,
            nodeId: current.nodeId,
            portId: current.portId,
          });
    }
    const source = draftNodeForId(current.nodeId);
    return source?.blockKind === "virtual"
      ? Object.freeze({
          source: "virtual" as const,
          nodeId: current.nodeId,
          portId: current.portId,
        })
      : null;
  }

  const onWheel = (event: WheelEvent): void => {
    if (destroyed || projection === null) return;
    event.preventDefault();
    const bounds = root.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      const nextZoom = clamp(
        viewState.viewport.zoom * Math.exp(-event.deltaY * 0.0015),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const worldX = (cursorX - viewState.viewport.x) / viewState.viewport.zoom;
      const worldY = (cursorY - viewState.viewport.y) / viewState.viewport.zoom;
      viewState = cloneViewState(viewState, {
        viewport: {
          x: cursorX - worldX * nextZoom,
          y: cursorY - worldY * nextZoom,
          zoom: nextZoom,
        },
      });
    } else {
      viewState = cloneViewState(viewState, {
        viewport: {
          ...viewState.viewport,
          x: viewState.viewport.x - event.deltaX,
          y: viewState.viewport.y - event.deltaY,
        },
      });
    }
    renderViewport();
    publishViewState("viewport");
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (destroyed || isEditableTarget(event.target)) return;
    if (event.key === " ") {
      spacePressed = true;
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      gesture = null;
      marquee.hidden = true;
      if (viewState.detailNodeId !== null || detailDraftNodeId !== null) {
        viewState = cloneViewState(viewState, { detailNodeId: null });
        detailDraftNodeId = null;
        renderDetail();
        publishViewState("detail");
      }
      return;
    }
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "a") {
      event.preventDefault();
      viewState = cloneViewState(viewState, {
        selectedNodeIds: projection?.nodes.map((node) => node.id) ?? [],
      });
      if (draftState !== null) {
        draftState = freezeDraftState({
          ...draftState,
          selectedNodeIds: draftState.nodes.map((node) => node.id),
        });
        publishDraftState("selection");
      }
      renderSelection();
      publishViewState("selection");
      return;
    }
    if (
      command &&
      event.key.toLowerCase() === "c" &&
      (viewState.selectedNodeIds.length > 0 || (draftState?.selectedNodeIds?.length ?? 0) > 0)
    ) {
      event.preventDefault();
      options.onHistoryCheckpoint?.();
      if (viewState.selectedNodeIds.length > 0) options.onCopyNodes?.(viewState.selectedNodeIds);
      if (draftState !== null && (draftState.selectedNodeIds?.length ?? 0) > 0) {
        const selected = new Set(draftState.selectedNodeIds);
        const copies = draftState.nodes
          .filter((node) => selected.has(node.id))
          .map((node, index) =>
            Object.freeze({
              ...node,
              id: `${node.id}:copy:${String(Date.now())}:${String(index)}`,
              position: Object.freeze(point(node.position.x + 24, node.position.y + 42)),
              placedAt: new Date().toISOString(),
            }),
          );
        draftState = freezeDraftState({
          ...draftState,
          nodes: [...draftState.nodes, ...copies],
          selectedNodeIds: copies.map((node) => node.id),
        });
        detailDraftNodeId = copies[0]?.id ?? null;
        renderDraft();
        renderDetail();
        publishDraftState("content");
      }
      return;
    }
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      options.onUndo?.();
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      (viewState.selectedNodeIds.length > 0 || (draftState?.selectedNodeIds?.length ?? 0) > 0)
    ) {
      event.preventDefault();
      const selectedDraftIds = draftState?.selectedNodeIds ?? [];
      if (draftState !== null && selectedDraftIds.length > 0) {
        options.onHistoryCheckpoint?.();
        const deleted = Object.freeze([...selectedDraftIds]);
        const deletedSet = new Set(deleted);
        draftState = freezeDraftState({
          ...draftState,
          nodes: draftState.nodes.filter((node) => !deletedSet.has(node.id)),
          virtualEdges: (draftState.virtualEdges ?? []).filter(
            (edge) => !deletedSet.has(edge.from.nodeId) && !deletedSet.has(edge.to.nodeId),
          ),
          selectedNodeIds: [],
        });
        if (detailDraftNodeId !== null && deletedSet.has(detailDraftNodeId)) {
          detailDraftNodeId = null;
          renderDetail();
        }
        renderDraft();
        publishDraftState("delete");
        options.onDeleteDraftNodes?.(deleted);
      }
      if (viewState.selectedNodeIds.length > 0) {
        options.onDeleteNodes?.(viewState.selectedNodeIds);
      }
      return;
    }
    const delta = keyboardDelta(event.key, event.shiftKey ? KEYBOARD_MOVE * 5 : KEYBOARD_MOVE);
    const selectedDraftIds = draftState?.selectedNodeIds ?? [];
    if (
      delta === null ||
      (viewState.selectedNodeIds.length === 0 && selectedDraftIds.length === 0)
    ) {
      return;
    }
    event.preventDefault();
    options.onHistoryCheckpoint?.();
    const positions = { ...viewState.positions };
    for (const nodeId of viewState.selectedNodeIds) {
      const node = nodeForId(nodeId);
      if (node === undefined) continue;
      const origin = positionFor(node);
      positions[nodeId] = point(origin.x + delta.x, origin.y + delta.y);
    }
    viewState = cloneViewState(viewState, { positions });
    if (draftState !== null && selectedDraftIds.length > 0) {
      const selectedDraftSet = new Set(selectedDraftIds);
      draftState = freezeDraftState({
        ...draftState,
        nodes: draftState.nodes.map((node) =>
          selectedDraftSet.has(node.id)
            ? { ...node, position: point(node.position.x + delta.x, node.position.y + delta.y) }
            : node,
        ),
      });
      renderDraft();
      publishDraftState("keyboard-move");
    }
    renderViewport();
    publishViewState("keyboard-move");
  };

  const onKeyup = (event: KeyboardEvent): void => {
    if (event.key === " ") spacePressed = false;
  };

  const onDetailClick = (event: MouseEvent): void => {
    const target = closestElement(event.target);
    if (target !== null && target.closest("[data-flow-detail-close]") !== null) {
      viewState = cloneViewState(viewState, { detailNodeId: null });
      detailDraftNodeId = null;
      renderDetail();
      publishViewState("detail");
    } else if (target !== null && target.closest("[data-flow-detail-minimize]") !== null) {
      const minimized = detail.window.dataset.minimized !== "true";
      detail.window.dataset.minimized = String(minimized);
      detail.body.hidden = minimized;
      detail.resize.hidden = minimized;
      detail.minimize.textContent = minimized ? "展开" : "收起";
      detail.minimize.setAttribute("aria-expanded", String(!minimized));
    }
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", finishGesture);
  root.addEventListener("pointercancel", finishGesture);
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("keyup", onKeyup);
  detail.window.addEventListener("click", onDetailClick);

  return Object.freeze({
    element: root,
    setProjection(nextProjection: FlowProjection | null): void {
      assertActive(destroyed);
      projection = nextProjection;
      viewState =
        nextProjection === null
          ? emptyViewState("")
          : normalizeFlowCanvasViewState(nextProjection, viewState);
      activePath = emptyActivePath();
      gesture = null;
      renderProjection();
      publishViewState("projection");
    },
    setViewState(nextViewState: FlowViewState): void {
      assertActive(destroyed);
      setInternalViewState(nextViewState, "restore");
    },
    getViewState(): FlowViewState {
      assertActive(destroyed);
      return cloneViewState(viewState);
    },
    setActivePath(nextPath: FlowCanvasActivePath | readonly string[]): void {
      assertActive(destroyed);
      activePath = Array.isArray(nextPath)
        ? Object.freeze({
            nodeIds: Object.freeze([...nextPath]),
            edgeIds: Object.freeze([]),
            currentNodeId: nextPath.at(-1) ?? null,
            mode: "real" as const,
          })
        : freezeActivePath(nextPath as FlowCanvasActivePath);
      renderActivePath();
    },
    setDraftVisualState(nextDraftState: FlowCanvasDraftVisualState | null): void {
      assertActive(destroyed);
      draftState = nextDraftState === null ? null : freezeDraftState(nextDraftState);
      detailDraftNodeId = draftState?.selectedNodeIds?.[0] ?? null;
      renderDraft();
      renderDetail();
      if (draftState !== null) publishDraftState("restore");
    },
    getDraftVisualState(): FlowCanvasDraftVisualState | null {
      assertActive(destroyed);
      return draftState === null ? null : freezeDraftState(draftState);
    },
    focusNode(nodeId: string): void {
      assertActive(destroyed);
      const node = nodeForId(nodeId);
      const element = nodeElements.get(nodeId);
      if (node === undefined || element === undefined)
        throw new RangeError(`未知流程节点：${nodeId}`);
      viewState = cloneViewState(viewState, {
        selectedNodeIds: [nodeId],
        detailNodeId: nodeId,
      });
      renderSelection();
      renderDetail();
      element.focus();
      publishViewState("selection");
    },
    refreshDetail(): void {
      assertActive(destroyed);
      renderDetail();
    },
    alignSelection(mode: "left" | "distribute-y"): void {
      assertActive(destroyed);
      const selected = selectedPositions(projection, viewState, draftState);
      if (selected.length < (mode === "left" ? 2 : 3)) return;
      options.onHistoryCheckpoint?.();
      const updates = alignFlowCanvasPositions(selected, mode);
      viewState = cloneViewState(viewState, {
        positions: Object.freeze({
          ...viewState.positions,
          ...Object.fromEntries(
            [...updates.entries()]
              .filter(([id]) => nodeForId(id) !== undefined)
              .map(([id, value]) => [id, value]),
          ),
        }),
      });
      if (draftState !== null) {
        draftState = freezeDraftState({
          ...draftState,
          nodes: draftState.nodes.map((node) =>
            updates.has(node.id) ? { ...node, position: updates.get(node.id)! } : node,
          ),
        });
        renderDraft();
        publishDraftState("align");
      }
      renderViewport();
      publishViewState("align");
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      gesture = null;
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", finishGesture);
      root.removeEventListener("pointercancel", finishGesture);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("keydown", onKeydown);
      root.removeEventListener("keyup", onKeyup);
      detail.window.removeEventListener("click", onDetailClick);
      root.remove();
      nodeElements.clear();
      edgeElements.clear();
      virtualEdgeElements.clear();
      draftNodeElements.clear();
      detailDraftNodeId = null;
    },
  });
}

export function normalizeFlowCanvasViewState(
  projection: FlowProjection,
  candidate: FlowViewState | null | undefined,
): FlowViewState {
  const knownIds = new Set(projection.nodes.map((node) => node.id));
  const sameSource = candidate?.sourceFingerprint === projection.sourceFingerprint;
  const positions: Record<string, FlowPoint> = {};
  for (const node of projection.nodes) {
    const candidatePosition = sameSource ? candidate?.positions[node.id] : undefined;
    positions[node.id] = isFinitePoint(candidatePosition)
      ? point(candidatePosition.x, candidatePosition.y)
      : point(node.defaultPosition.x, node.defaultPosition.y);
  }
  const selectedNodeIds = sameSource
    ? [...new Set(candidate?.selectedNodeIds.filter((id) => knownIds.has(id)) ?? [])]
    : [];
  const detailNodeId =
    sameSource &&
    candidate?.detailNodeId !== null &&
    candidate?.detailNodeId !== undefined &&
    knownIds.has(candidate.detailNodeId)
      ? candidate.detailNodeId
      : null;
  const candidateViewport = sameSource ? candidate?.viewport : undefined;
  return Object.freeze({
    schemaVersion: FLOW_VIEW_STATE_SCHEMA_VERSION,
    sourceFingerprint: projection.sourceFingerprint,
    viewport: Object.freeze({
      x: finiteOr(candidateViewport?.x, 0),
      y: finiteOr(candidateViewport?.y, 0),
      zoom: clamp(finiteOr(candidateViewport?.zoom, 1), MIN_ZOOM, MAX_ZOOM),
    }),
    positions: Object.freeze(positions),
    selectedNodeIds: Object.freeze(selectedNodeIds),
    detailNodeId,
  });
}

export interface FlowCanvasAlignItem {
  readonly id: string;
  readonly position: FlowPoint;
}

function selectedPositions(
  projection: FlowProjection | null,
  viewState: FlowViewState,
  draftState: FlowCanvasDraftVisualState | null,
): readonly FlowCanvasAlignItem[] {
  const selectedProjection = new Set(viewState.selectedNodeIds);
  const selectedDrafts = new Set(draftState?.selectedNodeIds ?? []);
  return Object.freeze([
    ...(projection?.nodes ?? [])
      .filter((node) => selectedProjection.has(node.id))
      .map((node) =>
        Object.freeze({
          id: node.id,
          position: viewState.positions[node.id] ?? node.defaultPosition,
        }),
      ),
    ...(draftState?.nodes ?? [])
      .filter((node) => selectedDrafts.has(node.id))
      .map((node) => Object.freeze({ id: node.id, position: node.position })),
  ]);
}

export function alignFlowCanvasPositions(
  selected: readonly FlowCanvasAlignItem[],
  mode: "left" | "distribute-y",
): ReadonlyMap<string, FlowPoint> {
  const minimum = mode === "left" ? 2 : 3;
  if (selected.length < minimum) {
    throw new RangeError(`${mode} 至少需要 ${minimum} 个节点`);
  }
  if (new Set(selected.map((item) => item.id)).size !== selected.length) {
    throw new TypeError("对齐节点 id 必须唯一");
  }
  if (selected.some((item) => item.id.length === 0 || !isFinitePoint(item.position))) {
    throw new TypeError("对齐节点必须包含非空 id 与有限坐标");
  }
  const result = new Map<string, FlowPoint>();
  if (mode === "left") {
    const x = Math.min(...selected.map((item) => item.position.x));
    for (const item of selected) result.set(item.id, point(x, item.position.y));
    return result;
  }
  const ordered = [...selected].sort(
    (left, right) => left.position.y - right.position.y || left.id.localeCompare(right.id),
  );
  const first = ordered[0]!.position.y;
  const last = ordered.at(-1)!.position.y;
  const step = (last - first) / (ordered.length - 1);
  ordered.forEach((item, index) =>
    result.set(item.id, point(item.position.x, first + step * index)),
  );
  return result;
}

export function createFlowWirePath(from: FlowPoint, to: FlowPoint): string {
  if (!isFinitePoint(from) || !isFinitePoint(to)) throw new TypeError("wire 端点必须是有限坐标");
  const controlDistance = Math.max(36, Math.abs(to.x - from.x) * 0.45);
  return `M ${formatCoordinate(from.x)} ${formatCoordinate(from.y)} C ${formatCoordinate(from.x + controlDistance)} ${formatCoordinate(from.y)}, ${formatCoordinate(to.x - controlDistance)} ${formatCoordinate(to.y)}, ${formatCoordinate(to.x)} ${formatCoordinate(to.y)}`;
}

export function createFlowCanvasDraftConnectionIntent(
  projection: FlowProjection,
  draftNode: FlowCanvasDraftNode,
  draftPort: FlowCanvasDraftPort,
  targetNode: FlowNode,
  targetPort: FlowPort,
): FlowCanvasDraftConnectionIntent | null {
  if (
    draftNode.status === "invalid" ||
    !draftPort.editable ||
    draftPort.direction !== "output" ||
    draftPort.channel !== "control" ||
    draftPort.edgeKind === null ||
    targetNode.locked ||
    !targetPort.editable ||
    targetPort.direction !== "input" ||
    targetPort.channel !== "control" ||
    !(draftNode.ports ?? []).some((port) => port.id === draftPort.id) ||
    !projection.nodes.some((node) => node.id === targetNode.id) ||
    !targetNode.ports.some((port) => port.id === targetPort.id)
  ) {
    return null;
  }
  return Object.freeze({
    sourceFingerprint: projection.sourceFingerprint,
    draftNodeId: draftNode.id,
    draftPortId: draftPort.id,
    presetId: draftNode.presetId ?? null,
    sourceText: draftNode.sourceText ?? null,
    toNodeId: targetNode.id,
    toPortId: targetPort.id,
    edgeKind: draftPort.edgeKind,
  });
}

function renderNode(ownerDocument: Document, node: FlowNode): HTMLElement {
  const element = ownerDocument.createElement("article");
  element.className = "flow-node";
  element.dataset.flowNodeId = node.id;
  element.dataset.nodeKind = node.kind;
  element.dataset.reachable = String(node.reachable);
  element.dataset.locked = String(node.locked);
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `${node.label}${node.locked ? "，已锁定" : ""}`);
  element.setAttribute("aria-selected", "false");
  element.setAttribute("aria-disabled", String(node.locked));
  element.tabIndex = -1;
  element.style.width = `${String(NODE_WIDTH)}px`;
  element.style.minHeight = `${String(NODE_HEIGHT)}px`;

  const kind = ownerDocument.createElement("span");
  kind.className = "flow-node__kind";
  kind.textContent = shortNodeKind(node.kind);
  const label = ownerDocument.createElement("span");
  label.className = "flow-node__label";
  label.textContent = node.label;
  const status = ownerDocument.createElement("span");
  status.className = "flow-node__status";
  status.textContent = node.locked ? "锁" : node.reachable ? "" : "不可达";
  element.append(kind, label, status);

  for (const port of node.ports) {
    const portElement = ownerDocument.createElement("button");
    portElement.className = `flow-node__port flow-node__port--${port.direction}`;
    portElement.type = "button";
    portElement.tabIndex = -1;
    portElement.dataset.flowNodeId = node.id;
    portElement.dataset.flowPortId = port.id;
    portElement.dataset.channel = port.channel;
    portElement.dataset.editable = String(port.editable);
    portElement.dataset.fanOut = String(port.allowsFanOut);
    // Read-only CFG outputs may still be used as playback-overlay anchors. Dropping them on
    // another projected node remains blocked; only virtual nodes accept these anchors.
    portElement.disabled = !port.editable && port.direction !== "output";
    portElement.setAttribute("aria-label", `${node.label}：${port.label}`);
    portElement.title = port.label;
    element.append(portElement);
  }
  if (node.lockReasons.length > 0) {
    element.title = node.lockReasons.map((reason) => reason.message).join("\n");
  }
  return element;
}

function flowPortPoint(node: FlowNode, port: FlowPort, position: FlowPoint): FlowPoint {
  const peers = node.ports.filter(
    (candidate) => candidate.direction === port.direction && candidate.channel === port.channel,
  );
  const index = Math.max(
    0,
    peers.findIndex((candidate) => candidate.id === port.id),
  );
  const spread = peers.length <= 1 ? 0 : (index - (peers.length - 1) / 2) * 8;
  return point(
    position.x + (port.direction === "output" ? NODE_WIDTH : 0),
    position.y + NODE_HEIGHT / 2 + spread,
  );
}

function draftPortPoint(node: FlowCanvasDraftNode, port: FlowCanvasDraftPort): FlowPoint {
  const peers = (node.ports ?? []).filter(
    (candidate) => candidate.direction === port.direction && candidate.channel === port.channel,
  );
  const index = Math.max(
    0,
    peers.findIndex((candidate) => candidate.id === port.id),
  );
  const spread = peers.length <= 1 ? 0 : (index - (peers.length - 1) / 2) * 8;
  return point(
    node.position.x + (port.direction === "output" ? NODE_WIDTH : 0),
    node.position.y + NODE_HEIGHT / 2 + spread,
  );
}

function renderDefaultDetail(ownerDocument: Document, body: HTMLElement, node: FlowNode): void {
  const meta = ownerDocument.createElement("div");
  meta.className = "flow-detail__meta";
  meta.textContent = `${shortNodeKind(node.kind)} · ${node.reachable ? "可达" : "不可达"}`;
  const code = ownerDocument.createElement("pre");
  code.className = "flow-detail__code";
  const codeValue = ownerDocument.createElement("code");
  codeValue.textContent =
    node.sourceText.length > 0 ? node.sourceText : "此节点不生成独立 C 源码。";
  code.append(codeValue);
  const ports = ownerDocument.createElement("section");
  ports.className = "flow-detail__ports";
  const portsTitle = ownerDocument.createElement("h3");
  portsTitle.textContent = "连接端口";
  const portsValue = ownerDocument.createElement("p");
  portsValue.textContent =
    node.ports.length === 0
      ? "无"
      : node.ports
          .map((port) => `${port.direction === "input" ? "输入" : "输出"}：${port.label}`)
          .join(" · ");
  ports.append(portsTitle, portsValue);
  body.append(meta, code, ports);
  if (node.lockReasons.length > 0) {
    const lock = ownerDocument.createElement("section");
    lock.className = "flow-detail__lock";
    const title = ownerDocument.createElement("h3");
    title.textContent = "为何不能改线";
    const message = ownerDocument.createElement("p");
    message.textContent = node.lockReasons.map((reason) => reason.message).join("；");
    lock.append(title, message);
    body.append(lock);
  }
}

function renderDefaultDraftDetail(
  ownerDocument: Document,
  body: HTMLElement,
  node: FlowCanvasDraftNode,
  onSave: (sourceText: string) => void,
): void {
  const meta = ownerDocument.createElement("div");
  meta.className = "flow-detail__meta";
  meta.textContent = `${node.blockKind === "virtual" ? "虚拟回放节点" : "未接入源码草稿"} · 模板 ${node.presetId ?? "自定义"}@${node.presetVersion ?? "snapshot"}`;

  const lifecycle = ownerDocument.createElement("section");
  lifecycle.className = "flow-detail__lifecycle";
  const lifecycleTitle = ownerDocument.createElement("h3");
  lifecycleTitle.textContent = "项目固定快照";
  const lifecycleText = ownerDocument.createElement("p");
  lifecycleText.textContent = `放置时间：${node.placedAt ?? "未知"}。模板后续更新、弃用或退休不会改写此草稿的源码与端口快照。`;
  lifecycle.append(lifecycleTitle, lifecycleText);

  const ports = ownerDocument.createElement("section");
  ports.className = "flow-detail__ports";
  const portsTitle = ownerDocument.createElement("h3");
  portsTitle.textContent = "端口快照";
  const portsText = ownerDocument.createElement("p");
  portsText.textContent =
    (node.ports?.length ?? 0) === 0
      ? "无"
      : (node.ports ?? [])
          .map(
            (port) =>
              `${port.direction === "input" ? "输入" : "输出"}：${port.label}${port.editable ? "" : "（只读）"}`,
          )
          .join(" · ");
  ports.append(portsTitle, portsText);

  const editor = ownerDocument.createElement("section");
  editor.className = "flow-detail__editor";
  const editorTitle = ownerDocument.createElement("h3");
  editorTitle.textContent = node.blockKind === "virtual" ? "回放语义" : "草稿 C 源码";
  const textarea = ownerDocument.createElement("textarea");
  textarea.value =
    node.blockKind === "virtual"
      ? "该节点只控制教学/回放，不生成或改写 C 语句。"
      : (node.sourceText ?? "");
  textarea.disabled = node.blockKind === "virtual";
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", `${node.label} 草稿源码`);
  const save = ownerDocument.createElement("button");
  save.type = "button";
  save.className = "button button--primary";
  save.textContent = "保存草稿快照";
  save.disabled = textarea.disabled;
  save.addEventListener("click", () => onSave(textarea.value));
  editor.append(editorTitle, textarea, save);
  body.append(meta, lifecycle, ports, editor);
}

function createDetailWindow(ownerDocument: Document) {
  const windowElement = ownerDocument.createElement("aside");
  windowElement.className = "flow-detail";
  windowElement.dataset.flowDetailWindow = "true";
  windowElement.dataset.tourTarget = "node-detail";
  windowElement.setAttribute("role", "region");
  windowElement.setAttribute("aria-label", "节点详情");
  windowElement.hidden = true;
  windowElement.style.left = "24px";
  windowElement.style.top = "24px";
  windowElement.style.width = "360px";
  windowElement.style.height = "320px";
  const header = ownerDocument.createElement("header");
  header.className = "flow-detail__header";
  header.dataset.flowDetailHandle = "true";
  const title = ownerDocument.createElement("strong");
  title.className = "flow-detail__title";
  const actions = ownerDocument.createElement("div");
  actions.className = "flow-detail__actions";
  const minimize = ownerDocument.createElement("button");
  minimize.type = "button";
  minimize.textContent = "收起";
  minimize.dataset.flowDetailMinimize = "true";
  minimize.setAttribute("aria-expanded", "true");
  const close = ownerDocument.createElement("button");
  close.type = "button";
  close.textContent = "关闭";
  close.dataset.flowDetailClose = "true";
  actions.append(minimize, close);
  header.append(title, actions);
  const body = ownerDocument.createElement("div");
  body.className = "flow-detail__body";
  const resize = ownerDocument.createElement("div");
  resize.className = "flow-detail__resize";
  resize.dataset.flowDetailResize = "true";
  resize.setAttribute("role", "separator");
  resize.setAttribute("aria-label", "调整节点详情大小");
  windowElement.append(header, body, resize);
  return { window: windowElement, title, body, minimize, resize };
}

function emptyViewState(sourceFingerprint: string): FlowViewState {
  return Object.freeze({
    schemaVersion: FLOW_VIEW_STATE_SCHEMA_VERSION,
    sourceFingerprint,
    viewport: Object.freeze({ x: 0, y: 0, zoom: 1 }),
    positions: Object.freeze({}),
    selectedNodeIds: Object.freeze([]),
    detailNodeId: null,
  });
}

function cloneViewState(
  source: FlowViewState,
  changes: Partial<
    Pick<FlowViewState, "viewport" | "positions" | "selectedNodeIds" | "detailNodeId">
  > = {},
): FlowViewState {
  const viewport = changes.viewport ?? source.viewport;
  const positions = changes.positions ?? source.positions;
  const selectedNodeIds = changes.selectedNodeIds ?? source.selectedNodeIds;
  return Object.freeze({
    schemaVersion: FLOW_VIEW_STATE_SCHEMA_VERSION,
    sourceFingerprint: source.sourceFingerprint,
    viewport: Object.freeze({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }),
    positions: Object.freeze(
      Object.fromEntries(
        Object.entries(positions).map(([id, value]) => [
          id,
          Object.freeze(point(value.x, value.y)),
        ]),
      ),
    ),
    selectedNodeIds: Object.freeze([...selectedNodeIds]),
    detailNodeId: changes.detailNodeId === undefined ? source.detailNodeId : changes.detailNodeId,
  });
}

function emptyActivePath(): FlowCanvasActivePath {
  return Object.freeze({
    nodeIds: Object.freeze([]),
    edgeIds: Object.freeze([]),
    currentNodeId: null,
    mode: "real",
  });
}

function freezeActivePath(path: FlowCanvasActivePath): FlowCanvasActivePath {
  return Object.freeze({
    nodeIds: Object.freeze([...path.nodeIds]),
    edgeIds: Object.freeze([...path.edgeIds]),
    currentNodeId: path.currentNodeId,
    mode: path.mode,
  });
}

export function normalizeFlowCanvasDraftState(
  state: FlowCanvasDraftVisualState,
): FlowCanvasDraftVisualState {
  const seenNodeIds = new Set<string>();
  const nodes = state.nodes.map((node) => {
    if (node.id.trim().length === 0 || seenNodeIds.has(node.id) || !isFinitePoint(node.position)) {
      throw new TypeError("草稿节点必须具有唯一非空 id 和有限坐标");
    }
    seenNodeIds.add(node.id);
    const seenPortIds = new Set<string>();
    const ports = (node.ports ?? []).map((port) => {
      if (
        port.id.trim().length === 0 ||
        seenPortIds.has(port.id) ||
        (port.channel === "control" && port.direction === "output" && port.edgeKind === null)
      ) {
        throw new TypeError("草稿控制端口必须唯一，且输出端口必须声明 edgeKind");
      }
      seenPortIds.add(port.id);
      return Object.freeze({ ...port });
    });
    return Object.freeze({
      ...node,
      position: Object.freeze(point(node.position.x, node.position.y)),
      ports: Object.freeze(ports),
    });
  });
  const selectedNodeIds = Object.freeze(
    [...new Set(state.selectedNodeIds ?? [])].filter((nodeId) => seenNodeIds.has(nodeId)),
  );
  if (
    state.connection !== null &&
    (!isFinitePoint(state.connection.from) || !isFinitePoint(state.connection.to))
  ) {
    throw new TypeError("草稿连线必须使用有限坐标");
  }
  const seenVirtualEdgeIds = new Set<string>();
  const virtualEdges = (state.virtualEdges ?? []).map((edge) => {
    if (
      edge.id.trim().length === 0 ||
      seenVirtualEdgeIds.has(edge.id) ||
      (edge.status !== "pending" && edge.status !== "valid") ||
      edge.from.source === edge.to.source ||
      edge.from.nodeId === edge.to.nodeId ||
      edge.from.nodeId.trim().length === 0 ||
      edge.from.portId.trim().length === 0 ||
      edge.to.nodeId.trim().length === 0 ||
      edge.to.portId.trim().length === 0
    ) {
      throw new TypeError("虚拟覆盖边必须唯一，并连接真实投影与虚拟节点");
    }
    const virtualEndpoint = edge.from.source === "virtual" ? edge.from : edge.to;
    const virtualNode = nodes.find((node) => node.id === virtualEndpoint.nodeId);
    const virtualPort = virtualNode?.ports?.find((port) => port.id === virtualEndpoint.portId);
    if (virtualNode?.blockKind !== "virtual" || virtualPort === undefined) {
      throw new TypeError("虚拟覆盖边引用了未知虚拟节点或端口");
    }
    seenVirtualEdgeIds.add(edge.id);
    return Object.freeze({
      ...edge,
      from: Object.freeze({ ...edge.from }),
      to: Object.freeze({ ...edge.to }),
      sourceEdgeIds: Object.freeze([...new Set(edge.sourceEdgeIds)]),
    });
  });
  return Object.freeze({
    nodes: Object.freeze(nodes),
    connection:
      state.connection === null
        ? null
        : Object.freeze({
            ...state.connection,
            from: Object.freeze(point(state.connection.from.x, state.connection.from.y)),
            to: Object.freeze(point(state.connection.to.x, state.connection.to.y)),
          }),
    selectedNodeIds,
    virtualEdges: Object.freeze(virtualEdges),
  });
}

function freezeDraftState(state: FlowCanvasDraftVisualState): FlowCanvasDraftVisualState {
  return normalizeFlowCanvasDraftState(state);
}

function renderMarquee(root: HTMLElement, element: HTMLElement, gesture: MarqueeGesture): void {
  const bounds = normalizedBounds(gesture.startClient, gesture.currentClient);
  const rootBounds = root.getBoundingClientRect();
  element.style.left = `${String(bounds.left - rootBounds.left)}px`;
  element.style.top = `${String(bounds.top - rootBounds.top)}px`;
  element.style.width = `${String(bounds.right - bounds.left)}px`;
  element.style.height = `${String(bounds.bottom - bounds.top)}px`;
}

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function normalizedBounds(from: FlowPoint, to: FlowPoint): Bounds {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    right: Math.max(from.x, to.x),
    bottom: Math.max(from.y, to.y),
  };
}

function rectanglesIntersect(left: Bounds, right: Bounds): boolean {
  return (
    left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top
  );
}

function clientToWorld(
  root: HTMLElement,
  state: FlowViewState,
  clientX: number,
  clientY: number,
): FlowPoint {
  const bounds = root.getBoundingClientRect();
  return point(
    (clientX - bounds.left - state.viewport.x) / state.viewport.zoom,
    (clientY - bounds.top - state.viewport.y) / state.viewport.zoom,
  );
}

function keyboardDelta(key: string, amount: number): FlowPoint | null {
  if (key === "ArrowLeft") return point(-amount, 0);
  if (key === "ArrowRight") return point(amount, 0);
  if (key === "ArrowUp") return point(0, -amount);
  if (key === "ArrowDown") return point(0, amount);
  return null;
}

function shortNodeKind(kind: FlowNode["kind"]): string {
  if (kind === "start") return "开始";
  if (kind === "end") return "结束";
  if (kind === "branch") return "分支";
  if (kind === "loop") return "循环";
  if (kind === "switch") return "选择";
  if (kind === "assert") return "断言";
  if (kind === "declaration") return "声明";
  if (kind === "raw") return "原始";
  if (kind === "control") return "控制";
  return "语句";
}

function point(x: number, y: number): FlowPoint {
  return { x, y };
}

function isFinitePoint(value: FlowPoint | null | undefined): value is FlowPoint {
  return (
    value !== null && value !== undefined && Number.isFinite(value.x) && Number.isFinite(value.y)
  );
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function closestElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Flow canvas 已销毁");
}
