import {
  createDefaultFlowViewState,
  deserializeFlowViewState,
  planFlowConnection,
  serializeFlowViewState,
  type ConnectionIntent,
  type FlowNode,
  type FlowProjection,
  type FlowViewState,
  type FlowViewStateIssue,
} from "../flow/index.js";
import type { PanelApi } from "../shared/api.js";
import type {
  PresetBlockKind,
  PresetBlockLifecycle,
  PresetPortDefinition,
} from "../learning/index.js";
import {
  createFlowCanvas,
  type FlowCanvasConnectionGesture,
  type FlowCanvasController,
  type FlowCanvasActivePath,
  type FlowCanvasDetailContext,
  type FlowCanvasDraftConnectionIntent,
  type FlowCanvasDraftNode,
  type FlowCanvasDraftVisualState,
  type FlowCanvasVirtualConnectionIntent,
} from "../ui/flow-canvas.js";
import {
  createResizableLayout,
  type ResizableLayoutController,
  type ResizableLayoutSnapshot,
} from "../ui/resizable-layout.js";
import {
  WORKBENCH_REVEAL_FLOW_DETAIL_EVENT,
  type WorkbenchElements,
} from "../ui/workbench-shell.js";
import {
  restoreFlowDraftSidecarState,
  serializeFlowDraftSidecarState,
  type FlowDraftSidecarRestore,
  type FlowSidecarRestoreIssue,
} from "./flow-sidecar-state.js";
import {
  createWorkspaceSidecarPersistence,
  type WorkspaceSidecarPersistence,
} from "./workspace-sidecar-persistence.js";
import {
  activeVirtualPlaybackNodes,
  connectVirtualFlowOverlay,
  decoratePathWithVirtualOverlay,
  reconcileVirtualFlowOverlay,
} from "./virtual-flow-overlay.js";
import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import {
  evidenceForFlowNode,
  type FlowNodeEvidence,
  type FlowNodeRuntimeSnapshot,
} from "./flow-node-evidence.js";

export interface FlowWorkbenchControllerOptions {
  readonly elements: WorkbenchElements;
  readonly api: Pick<PanelApi, "readWorkspaceSidecar" | "saveWorkspaceSidecar">;
  readonly onNodeSelect: (node: FlowNode) => void;
  readonly onReplaceNodeSource: (node: FlowNode, source: string) => void;
  readonly onDeleteNodes: (nodes: readonly FlowNode[]) => void;
  readonly onConnectionIntent: (intent: ConnectionIntent) => boolean;
  readonly resolvePreset: (presetId: string) => ResolvedFlowPreset | null;
  readonly onDraftConnectionIntent: (intent: FlowCanvasDraftConnectionIntent) => boolean;
  readonly onSourceUndo: () => void;
  readonly onVirtualPlaybackNode?:
    ((node: FlowCanvasDraftNode, mode: FlowCanvasActivePath["mode"]) => void) | undefined;
  readonly onStatus: (message: string, state: "ready" | "warning" | "error") => void;
}

interface ResolvedFlowPreset {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly source: string | null;
  readonly blockKind: PresetBlockKind;
  readonly lifecycle: PresetBlockLifecycle;
  readonly ports: readonly PresetPortDefinition[];
}

export interface FlowWorkbenchController {
  readonly projection: FlowProjection | null;
  readonly activeEntryId: string | null;
  readonly hasPendingChanges: boolean;
  adoptProjection(projection: FlowProjection): void;
  setAnalysis(analysis: ProgramAnalysisSnapshot | null): void;
  setActivePath(path: FlowCanvasActivePath, evidence?: FlowNodeRuntimeSnapshot | null): void;
  focusNode(nodeId: string): void;
  setWorkspaceEntry(entryId: string | null): Promise<void>;
  finalizePendingSidecarRestore(): void;
  flush(): Promise<void>;
  destroy(): void;
}

export interface FlowWorkbenchSidecar {
  readonly schemaVersion: 1 | 2;
  readonly sourceFingerprint: string;
  readonly viewState: unknown;
  readonly layoutPreset: string;
  readonly layouts: Readonly<Record<string, ResizableLayoutSnapshot>>;
  readonly panelVisibility: Readonly<Record<string, boolean>>;
  readonly drafts: unknown;
}

export const FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION = 2 as const;
const VALID_LAYOUT_PRESETS = new Set(["learn", "build", "debug", "analyze", "minimal"]);

export type FlowProjectionSidecarRestore =
  | {
      readonly ok: true;
      readonly viewState: FlowViewState;
      readonly draftState: FlowCanvasDraftVisualState;
      readonly issues: readonly (FlowViewStateIssue | FlowSidecarRestoreIssue)[];
      readonly retryable: boolean;
    }
  | {
      readonly ok: false;
      readonly viewState: null;
      readonly draftState: null;
      readonly issues: readonly (FlowViewStateIssue | FlowSidecarRestoreIssue)[];
      readonly retryable: false;
    };

/** Restores only projection-dependent sidecar data and identifies progressive-CFG misses. */
export function restoreFlowProjectionSidecarState(
  sidecar: FlowWorkbenchSidecar,
  projection: FlowProjection,
  sourceMatches: boolean,
): FlowProjectionSidecarRestore {
  const draftRestore: FlowDraftSidecarRestore = restoreFlowDraftSidecarState(
    sidecar.drafts,
    projection,
    {
      schemaVersion: sidecar.schemaVersion,
      savedSourceFingerprint: sidecar.sourceFingerprint,
      sourceMatches,
    },
  );
  const viewRestore = deserializeFlowViewState(JSON.stringify(sidecar.viewState), projection);
  const issues = Object.freeze([...viewRestore.issues, ...draftRestore.issues]);
  if (!viewRestore.ok || !draftRestore.ok) {
    return Object.freeze({
      ok: false,
      viewState: null,
      draftState: null,
      issues,
      retryable: false,
    });
  }
  const retryable = issues.some((issue) =>
    sidecar.schemaVersion === FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION
      ? issue.code === "anchor-mismatch"
      : sourceMatches && (issue.code === "unknown-node" || issue.code === "invalid-virtual-edge"),
  );
  return Object.freeze({
    ok: true,
    viewState: viewRestore.value,
    draftState: draftRestore.state,
    issues,
    retryable,
  });
}

export function createFlowWorkbenchController(
  options: FlowWorkbenchControllerOptions,
): FlowWorkbenchController {
  assertOptions(options);
  let projection: FlowProjection | null = null;
  let activeEntryId: string | null = null;
  let currentViewState: FlowViewState | null = null;
  let currentDraftState: FlowCanvasDraftVisualState = emptyDraftState();
  let layoutPreset = "build";
  let destroyed = false;
  let restoring = false;
  let adoptionGeneration = 0;
  let sidecarLoading = false;
  let pendingSidecarRestore: {
    readonly sidecar: FlowWorkbenchSidecar;
    readonly sourceMatches: boolean;
  } | null = null;
  let activeVirtualNodeIds = new Set<string>();
  let analysis: ProgramAnalysisSnapshot | null = null;
  let runtimeEvidence: FlowNodeRuntimeSnapshot | null = null;
  const undoHistory: Array<{
    readonly view: FlowViewState;
    readonly drafts: FlowCanvasDraftVisualState;
    readonly sourceMutation: boolean;
  }> = [];

  const layouts = createWorkbenchLayouts(options.elements, (snapshot) => {
    if (!restoring) persistSnapshot(snapshot.id, snapshot.value);
  });
  const layoutSnapshots = new Map<string, ResizableLayoutSnapshot>(
    layouts.map((layout) => [layout.id, layout.controller.getSnapshot()]),
  );

  const persistence: WorkspaceSidecarPersistence = createWorkspaceSidecarPersistence({
    kind: "flow-view",
    read: (entryId, kind) => options.api.readWorkspaceSidecar({ entryId, kind }),
    save: (request) => options.api.saveWorkspaceSidecar(request),
    onStatus(status) {
      if (status.state === "error") options.onStatus(status.message, "error");
    },
  });

  const canvas: FlowCanvasController = createFlowCanvas(options.elements.flowCanvas, {
    onNodeClick(node) {
      options.onNodeSelect(node);
    },
    onViewStateChange(state, reason) {
      currentViewState = state;
      if (!restoring && reason !== "projection" && reason !== "restore") {
        pendingSidecarRestore = null;
        persist();
      }
    },
    onConnectionIntent(gesture) {
      handleConnectionIntent(gesture);
    },
    onDraftConnectionIntent(intent) {
      const historyDepth = undoHistory.length;
      checkpoint(true);
      try {
        if (!options.onDraftConnectionIntent(intent)) {
          undoHistory.splice(historyDepth);
          return;
        }
        currentDraftState = Object.freeze({
          nodes: Object.freeze(
            currentDraftState.nodes.filter((node) => node.id !== intent.draftNodeId),
          ),
          selectedNodeIds: Object.freeze([]),
          connection: null,
          virtualEdges: Object.freeze(
            (currentDraftState.virtualEdges ?? []).filter(
              (edge) =>
                edge.from.nodeId !== intent.draftNodeId && edge.to.nodeId !== intent.draftNodeId,
            ),
          ),
        });
        canvas.setDraftVisualState(currentDraftState);
        persist();
      } catch (error: unknown) {
        undoHistory.splice(historyDepth);
        const detail = error instanceof Error ? error.message : String(error);
        options.onStatus(`草稿连接被拒绝：${detail}。main.c 未修改。`, "error");
      }
    },
    onVirtualConnectionIntent(intent) {
      handleVirtualConnectionIntent(intent);
    },
    onHistoryCheckpoint: () => checkpoint(false),
    onUndo: undo,
    onDraftStateChange(state, reason) {
      currentDraftState = state;
      if (!restoring && reason !== "restore") {
        pendingSidecarRestore = null;
        persist();
      }
    },
    onDeleteNodes(nodeIds) {
      const current = projection;
      if (current === null) return;
      const nodes = nodeIds.flatMap((nodeId) => {
        const node = current.nodes.find((candidate) => candidate.id === nodeId);
        return node === undefined ? [] : [node];
      });
      if (nodes.length > 0) {
        try {
          options.onDeleteNodes(Object.freeze(nodes));
        } catch (error: unknown) {
          const detail = error instanceof Error ? error.message : String(error);
          options.onStatus(`节点删除被拒绝：${detail}。main.c 未修改。`, "error");
        }
      }
    },
    onCopyNodes(nodeIds) {
      const current = projection;
      if (current === null) return;
      const copied = nodeIds.flatMap((nodeId, index) => {
        const node = current.nodes.find((candidate) => candidate.id === nodeId);
        if (node === undefined || node.sourceText.trim().length === 0) return [];
        return [
          draftNode(
            `copy-${String(Date.now())}-${String(index)}`,
            `${node.label} 副本`,
            node.sourceText,
            {
              x: (currentViewState?.positions[node.id]?.x ?? node.defaultPosition.x) + 28,
              y: (currentViewState?.positions[node.id]?.y ?? node.defaultPosition.y) + 48,
            },
            null,
          ),
        ];
      });
      currentDraftState = Object.freeze({
        nodes: Object.freeze([...currentDraftState.nodes, ...copied]),
        selectedNodeIds: Object.freeze(copied.map((node) => node.id)),
        connection: null,
        virtualEdges: Object.freeze([...(currentDraftState.virtualEdges ?? [])]),
      });
      canvas.setDraftVisualState(currentDraftState);
      persist();
      const count = copied.length;
      options.onStatus(
        count === 0
          ? "没有可复制的源码节点。"
          : `已复制 ${String(count)} 个节点为草稿；连接前不会改写 main.c。`,
        count === 0 ? "warning" : "ready",
      );
    },
    renderNodeDetail(context) {
      renderWorkbenchNodeDetail(
        context,
        options.onReplaceNodeSource,
        options.onStatus,
        projection === null
          ? Object.freeze({ diagnostics: Object.freeze([]), runtime: null })
          : evidenceForFlowNode(context.node, projection, analysis, runtimeEvidence),
      );
    },
  });
  const canvasToolbar = required(options.elements.shell, ".canvas-toolbar__actions");
  const onCanvasToolbarClick = (event: Event): void => {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "button[data-flow-command]",
    );
    const command = target?.dataset.flowCommand;
    if (command === "undo") undo();
    else if (command === "align-left") canvas.alignSelection("left");
    else if (command === "distribute-y") canvas.alignSelection("distribute-y");
  };
  canvasToolbar.addEventListener("click", onCanvasToolbarClick);
  const onRevealFlowDetail = (): void => {
    const node =
      projection?.nodes.find(
        (candidate) =>
          candidate.kind !== "start" &&
          candidate.kind !== "end" &&
          candidate.sourceText.trim().length > 0,
      ) ??
      projection?.nodes.find((candidate) => candidate.kind !== "start" && candidate.kind !== "end");
    if (node !== undefined) canvas.focusNode(node.id);
  };
  options.elements.shell.addEventListener(WORKBENCH_REVEAL_FLOW_DETAIL_EVENT, onRevealFlowDetail);

  function handleVirtualConnectionIntent(intent: FlowCanvasVirtualConnectionIntent): void {
    const current = projection;
    if (current === null) return;
    const historyDepth = undoHistory.length;
    checkpoint(false);
    try {
      currentDraftState = connectVirtualFlowOverlay(current, currentDraftState, intent);
      canvas.setDraftVisualState(currentDraftState);
      persist();
      const edge = currentDraftState.virtualEdges?.find(
        (candidate) =>
          candidate.from.nodeId === intent.from.nodeId &&
          candidate.from.portId === intent.from.portId &&
          candidate.to.nodeId === intent.to.nodeId &&
          candidate.to.portId === intent.to.portId,
      );
      options.onStatus(
        edge?.status === "valid"
          ? "虚拟节点已绑定到一条真实 CFG 边；只影响回放，不改写 main.c。"
          : "已连接虚拟节点一端；请把另一端接到同一条真实 CFG 边。",
        edge?.status === "valid" ? "ready" : "warning",
      );
    } catch (error: unknown) {
      undoHistory.splice(historyDepth);
      const detail = error instanceof Error ? error.message : String(error);
      options.onStatus(`虚拟连线被拒绝：${detail}。main.c 未修改。`, "error");
    }
  }

  function checkpoint(sourceMutation: boolean): void {
    if (restoring || currentViewState === null) return;
    undoHistory.push(
      Object.freeze({
        view: currentViewState,
        drafts: currentDraftState,
        sourceMutation,
      }),
    );
    if (undoHistory.length > 50) undoHistory.splice(0, undoHistory.length - 50);
  }

  function undo(): void {
    const snapshot = undoHistory.pop();
    if (snapshot === undefined) {
      options.onSourceUndo();
      return;
    }
    restoring = true;
    try {
      if (snapshot.sourceMutation) options.onSourceUndo();
      currentViewState = snapshot.view;
      currentDraftState = snapshot.drafts;
      canvas.setViewState(snapshot.view);
      canvas.setDraftVisualState(snapshot.drafts);
    } finally {
      restoring = false;
    }
    persist();
  }

  function handleConnectionIntent(gesture: FlowCanvasConnectionGesture): void {
    const current = projection;
    if (current === null || gesture.edgeKind === null) {
      options.onStatus("连接缺少明确的 C 控制流类型；源码未修改。", "error");
      return;
    }
    const occupiedEdges = current.edges.filter(
      (edge) => edge.from.nodeId === gesture.fromNodeId && edge.from.portId === gesture.fromPortId,
    );
    const intent: ConnectionIntent = Object.freeze({
      sourceFingerprint: gesture.sourceFingerprint,
      fromNodeId: gesture.fromNodeId,
      fromPortId: gesture.fromPortId,
      toNodeId: gesture.toNodeId,
      toPortId: gesture.toPortId,
      kind: gesture.edgeKind,
      replaceEdgeId: occupiedEdges.length === 1 ? occupiedEdges[0]!.id : null,
    });
    const plan = planFlowConnection(current, intent);
    if (plan.status === "rejected") {
      options.onStatus(`连接被拒绝：${plan.message}。main.c 未修改。`, "error");
      return;
    }
    try {
      const committed = options.onConnectionIntent(intent);
      options.onStatus(
        committed
          ? "连线已通过精确 diff、重解析、无损往返和 CFG 后置条件并写入 main.c。"
          : "已取消连线；main.c 未修改。",
        committed ? "ready" : "warning",
      );
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      options.onStatus(`连线被拒绝：${detail}。main.c 未修改。`, "error");
    }
  }

  function persistSnapshot(id: string, snapshot: ResizableLayoutSnapshot): void {
    layoutSnapshots.set(id, snapshot);
    persist();
  }

  function persist(): void {
    const current = projection;
    const viewState = currentViewState;
    if (
      destroyed ||
      current === null ||
      viewState === null ||
      activeEntryId === null ||
      sidecarLoading ||
      pendingSidecarRestore !== null
    ) {
      return;
    }
    const serializedView = JSON.parse(serializeFlowViewState(viewState, current)) as unknown;
    const sidecar: FlowWorkbenchSidecar = Object.freeze({
      schemaVersion: FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION,
      sourceFingerprint: current.sourceFingerprint,
      viewState: serializedView,
      layoutPreset,
      layouts: Object.freeze(Object.fromEntries(layoutSnapshots)),
      panelVisibility: options.elements.getPanelVisibility(),
      drafts: serializeFlowDraftSidecarState(currentDraftState, current),
    });
    persistence.update(JSON.stringify(sidecar), current.sourceFingerprint);
  }

  function adoptDefaultView(current: FlowProjection): void {
    restoring = true;
    try {
      currentViewState = createDefaultFlowViewState(current);
      canvas.setProjection(current);
      canvas.setViewState(currentViewState);
      canvas.setDraftVisualState(currentDraftState);
    } finally {
      restoring = false;
    }
  }

  function applyProjectionSidecarRestore(
    restored: Extract<FlowProjectionSidecarRestore, { readonly ok: true }>,
  ): void {
    currentDraftState = restored.draftState;
    canvas.setDraftVisualState(currentDraftState);
    currentViewState = restored.viewState;
    canvas.setViewState(currentViewState);
  }

  function retryPendingSidecarRestore(finalize: boolean): void {
    const current = projection;
    const pending = pendingSidecarRestore;
    if (current === null || pending === null) return;
    const restored = restoreFlowProjectionSidecarState(
      pending.sidecar,
      current,
      pending.sourceMatches,
    );
    if (!restored.ok) {
      pendingSidecarRestore = null;
      options.onStatus(
        `布局无法恢复：${restored.issues.map((issue) => issue.message).join("；")}。main.c 未修改。`,
        "warning",
      );
      return;
    }
    applyProjectionSidecarRestore(restored);
    if (finalize || !restored.retryable) pendingSidecarRestore = null;
    if (finalize && restored.issues.length > 0) {
      options.onStatus(
        `布局已部分恢复：${restored.issues.map((issue) => issue.message).join("；")}。失配定位已丢弃，main.c 未修改。`,
        "warning",
      );
    }
  }

  function restoreSidecar(serialized: string, matchesSource: boolean): void {
    const current = projection;
    if (current === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      options.onStatus("flow-view.json 不是合法 JSON；仅重置视图，main.c 未修改。", "warning");
      return;
    }
    const sidecar = readFlowWorkbenchSidecar(parsed);
    if (sidecar === null) {
      options.onStatus("flow-view.json 版本或结构无效；仅重置视图，main.c 未修改。", "warning");
      return;
    }
    restoring = true;
    try {
      restoreLayouts(sidecar.layouts, layouts, layoutSnapshots);
      options.elements.applyLayoutPreset(sidecar.layoutPreset);
      options.elements.setPanelVisibility(sidecar.panelVisibility);
      layoutPreset = sidecar.layoutPreset;
      const sourceMatches =
        matchesSource && sidecar.sourceFingerprint === current.sourceFingerprint;
      const restored = restoreFlowProjectionSidecarState(sidecar, current, sourceMatches);
      if (!restored.ok) {
        options.onStatus(
          `布局无法恢复：${restored.issues.map((issue) => issue.message).join("；")}。main.c 未修改。`,
          "warning",
        );
        return;
      }
      applyProjectionSidecarRestore(restored);
      pendingSidecarRestore = restored.retryable ? Object.freeze({ sidecar, sourceMatches }) : null;
      if (restored.retryable) {
        options.onStatus(
          "布局锚点正在等待后台 CFG；分析完成后会自动恢复，期间不会覆盖 flow-view.json。",
          "ready",
        );
      } else if (restored.issues.length > 0) {
        options.onStatus(
          `布局已部分恢复：${restored.issues.map((issue) => issue.message).join("；")}。失配定位已丢弃，main.c 未修改。`,
          "warning",
        );
      } else if (sidecar.schemaVersion === 1) {
        options.onStatus("旧版 flow-view 已载入；下一次保存将迁移为锚点格式 v2。", "ready");
      }
    } finally {
      restoring = false;
    }
  }

  const onWorkbenchAction = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isRecord(detail) || detail.rootId !== "panels" || typeof detail.branchId !== "string") {
      return;
    }
    if (VALID_LAYOUT_PRESETS.has(detail.branchId)) {
      layoutPreset = detail.branchId;
      options.elements.applyLayoutPreset(layoutPreset);
      persist();
    } else if (detail.branchId === "reset-layout") {
      restoring = true;
      try {
        for (const layout of layouts) layout.controller.reset();
        layoutPreset = "build";
        options.elements.applyLayoutPreset(layoutPreset);
      } finally {
        restoring = false;
      }
      for (const layout of layouts) layoutSnapshots.set(layout.id, layout.controller.getSnapshot());
      persist();
    } else if (detail.branchId === "save-layout") {
      for (const layout of layouts) layoutSnapshots.set(layout.id, layout.controller.getSnapshot());
      persist();
      options.onStatus("当前面板布局已写入 flow-view.json。", "ready");
    }
    globalThis.setTimeout(() => persist(), 0);
  };
  options.elements.shell.addEventListener("workbench-action", onWorkbenchAction);
  const onCanvasDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes("application/x-c-block-preset")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onCanvasDrop = (event: DragEvent): void => {
    const presetId = event.dataTransfer?.getData("application/x-c-block-preset") ?? "";
    if (presetId.length === 0) return;
    event.preventDefault();
    const preset = options.resolvePreset(presetId);
    if (preset === null) {
      options.onStatus("拖入的预设已经失效；未创建草稿。", "error");
      return;
    }
    if (preset.id === "builtin.flow.start" || preset.id === "builtin.flow.end") {
      const kind = preset.id.endsWith(".start") ? "start" : "end";
      const matches = projection?.nodes.filter((node) => node.kind === kind) ?? [];
      if (matches.length !== 1) {
        options.onStatus(
          matches.length === 0
            ? `当前源码没有可绑定的 ${preset.label} CFG 边界。`
            : `当前源码有多个函数；请直接选择目标函数的 ${preset.label} 节点。`,
          "warning",
        );
        return;
      }
      canvas.focusNode(matches[0]!.id);
      options.onStatus(`${preset.label} 已绑定真实函数 CFG 边界，不创建伪 C 节点。`, "ready");
      return;
    }
    const rect = canvas.element.getBoundingClientRect();
    const view = canvas.getViewState();
    const position = Object.freeze({
      x: (event.clientX - rect.left - view.viewport.x) / view.viewport.zoom,
      y: (event.clientY - rect.top - view.viewport.y) / view.viewport.zoom,
    });
    const next = draftNode(
      `preset-${String(Date.now())}-${String(currentDraftState.nodes.length)}`,
      preset.label,
      preset.source,
      position,
      preset,
    );
    checkpoint(false);
    currentDraftState = Object.freeze({
      nodes: Object.freeze([...currentDraftState.nodes, next]),
      selectedNodeIds: Object.freeze([next.id]),
      connection: null,
      virtualEdges: Object.freeze([...(currentDraftState.virtualEdges ?? [])]),
    });
    canvas.setDraftVisualState(currentDraftState);
    persist();
    options.onStatus(
      preset.source === null
        ? `已放置虚拟节点“${preset.label}”；它只控制回放，不改变 C 语义。`
        : `已放置未接入草稿“${preset.label}”；连接并验证前 main.c 不会改变。`,
      "ready",
    );
  };
  options.elements.flowCanvas.addEventListener("dragover", onCanvasDragOver);
  options.elements.flowCanvas.addEventListener("drop", onCanvasDrop);
  return Object.freeze({
    get projection(): FlowProjection | null {
      return projection;
    },
    get activeEntryId(): string | null {
      return activeEntryId;
    },
    get hasPendingChanges(): boolean {
      return persistence.hasPendingChanges;
    },
    adoptProjection(nextProjection: FlowProjection): void {
      assertActive(destroyed);
      const sameSource = projection?.sourceFingerprint === nextProjection.sourceFingerprint;
      if (!sameSource) pendingSidecarRestore = null;
      projection = nextProjection;
      currentDraftState = reconcileVirtualFlowOverlay(nextProjection, currentDraftState);
      activeVirtualNodeIds = new Set();
      if (!sameSource && undoHistory.at(-1)?.sourceMutation !== true) undoHistory.length = 0;
      if (analysis?.sourceFingerprint !== nextProjection.sourceFingerprint) analysis = null;
      if (runtimeEvidence?.sourceFingerprint !== nextProjection.sourceFingerprint) {
        runtimeEvidence = null;
      }
      if (sameSource && currentViewState !== null) {
        restoring = true;
        try {
          canvas.setProjection(nextProjection);
          currentViewState = canvas.getViewState();
          canvas.setDraftVisualState(currentDraftState);
          retryPendingSidecarRestore(false);
        } finally {
          restoring = false;
        }
      } else {
        adoptDefaultView(nextProjection);
      }
      persist();
    },
    setAnalysis(nextAnalysis: ProgramAnalysisSnapshot | null): void {
      assertActive(destroyed);
      analysis =
        nextAnalysis !== null && nextAnalysis.sourceFingerprint === projection?.sourceFingerprint
          ? nextAnalysis
          : null;
      canvas.refreshDetail();
    },
    setActivePath(path: FlowCanvasActivePath, nextEvidence?: FlowNodeRuntimeSnapshot | null): void {
      assertActive(destroyed);
      if (nextEvidence !== undefined) {
        runtimeEvidence =
          nextEvidence !== null && nextEvidence.sourceFingerprint === projection?.sourceFingerprint
            ? nextEvidence
            : null;
      }
      const virtualNodes = activeVirtualPlaybackNodes(currentDraftState, path.edgeIds);
      const nextActive = new Set(virtualNodes.map((node) => node.id));
      for (const node of virtualNodes) {
        if (activeVirtualNodeIds.has(node.id)) continue;
        options.onVirtualPlaybackNode?.(node, path.mode);
        if (node.presetId === "builtin.flow.pause") {
          options.onStatus("回放已在虚拟 Pause 节点暂停；真实进程语义未改变。", "warning");
        } else if (node.presetId === "builtin.flow.checkpoint") {
          options.onStatus("Checkpoint 已记录当前回放位置与已收集运行证据。", "ready");
        }
      }
      activeVirtualNodeIds = nextActive;
      canvas.setActivePath(decoratePathWithVirtualOverlay(currentDraftState, path));
      canvas.refreshDetail();
    },
    focusNode(nodeId: string): void {
      assertActive(destroyed);
      canvas.focusNode(nodeId);
    },
    async setWorkspaceEntry(entryId: string | null): Promise<void> {
      assertActive(destroyed);
      const generation = ++adoptionGeneration;
      pendingSidecarRestore = null;
      if (entryId === null) {
        sidecarLoading = false;
        activeEntryId = null;
        activeVirtualNodeIds = new Set();
        undoHistory.length = 0;
        await persistence.deactivate();
        return;
      }
      sidecarLoading = true;
      activeEntryId = entryId;
      const current = projection;
      if (current === null) {
        sidecarLoading = false;
        return;
      }
      try {
        const adoption = await persistence.adopt(entryId, current.sourceFingerprint);
        if (destroyed || generation !== adoptionGeneration || activeEntryId !== entryId) return;
        if (adoption.document !== null) {
          restoreSidecar(adoption.document.serialized, adoption.matchesSource);
        }
        sidecarLoading = false;
        if (adoption.document === null) persist();
      } catch (error: unknown) {
        if (destroyed || generation !== adoptionGeneration) return;
        sidecarLoading = false;
        const detail = error instanceof Error ? error.message : String(error);
        options.onStatus(`布局读取失败：${detail}。main.c 未修改。`, "error");
      }
    },
    finalizePendingSidecarRestore(): void {
      assertActive(destroyed);
      if (pendingSidecarRestore === null) return;
      restoring = true;
      try {
        retryPendingSidecarRestore(true);
      } finally {
        restoring = false;
      }
      persist();
    },
    flush: () => persistence.flush(),
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      adoptionGeneration += 1;
      options.elements.shell.removeEventListener("workbench-action", onWorkbenchAction);
      options.elements.shell.removeEventListener(
        WORKBENCH_REVEAL_FLOW_DETAIL_EVENT,
        onRevealFlowDetail,
      );
      options.elements.flowCanvas.removeEventListener("dragover", onCanvasDragOver);
      options.elements.flowCanvas.removeEventListener("drop", onCanvasDrop);
      canvasToolbar.removeEventListener("click", onCanvasToolbarClick);
      persistence.destroy();
      canvas.destroy();
      for (const layout of [...layouts].reverse()) layout.controller.destroy();
      layoutSnapshots.clear();
      projection = null;
      currentViewState = null;
      currentDraftState = emptyDraftState();
      activeEntryId = null;
      pendingSidecarRestore = null;
      sidecarLoading = false;
      activeVirtualNodeIds = new Set();
      analysis = null;
      runtimeEvidence = null;
      undoHistory.length = 0;
    },
  });
}

function renderWorkbenchNodeDetail(
  context: FlowCanvasDetailContext,
  replaceSource: (node: FlowNode, source: string) => void,
  onStatus: (message: string, state: "ready" | "warning" | "error") => void,
  evidenceSnapshot: FlowNodeEvidence,
): void {
  const { node, body } = context;
  const ownerDocument = body.ownerDocument;
  const explanation = ownerDocument.createElement("section");
  explanation.className = "flow-detail__explanation";
  const heading = ownerDocument.createElement("h3");
  heading.textContent = "通俗解释";
  const copy = ownerDocument.createElement("p");
  copy.textContent = explainNode(node);
  explanation.append(heading, copy);

  const editor = ownerDocument.createElement("section");
  editor.className = "flow-detail__editor";
  const editorHeading = ownerDocument.createElement("h3");
  editorHeading.textContent = "精确源码编辑";
  const textarea = ownerDocument.createElement("textarea");
  textarea.value = node.sourceText;
  textarea.spellcheck = false;
  textarea.disabled = node.locked || node.kind === "start" || node.kind === "end";
  textarea.setAttribute("aria-label", `${node.label} 的 C 源码`);
  const save = ownerDocument.createElement("button");
  save.type = "button";
  save.className = "button button--primary";
  save.textContent = "验证并写入 main.c";
  save.disabled = textarea.disabled;
  save.addEventListener("click", () => {
    try {
      replaceSource(node, textarea.value);
      onStatus("节点源码已通过重解析与无损往返验证。", "ready");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      onStatus(`节点修改被拒绝：${detail}`, "error");
    }
  });
  editor.append(editorHeading, textarea, save);

  const evidence = ownerDocument.createElement("section");
  evidence.className = "flow-detail__evidence";
  const evidenceHeading = ownerDocument.createElement("h3");
  evidenceHeading.textContent = "诊断 / 运行证据 / 生命周期";
  const evidenceCopy = ownerDocument.createElement("p");
  const diagnostics =
    evidenceSnapshot.diagnostics.length === 0
      ? "静态诊断：当前没有与此节点精确绑定的 finding"
      : `静态诊断：${evidenceSnapshot.diagnostics
          .map(
            (finding) =>
              `${finding.ruleId}（${finding.confidence}${finding.subject === null ? "" : ` · ${finding.subject}`}）`,
          )
          .join("；")}`;
  const runtime =
    evidenceSnapshot.runtime === null
      ? "运行证据：尚无同源码轨迹"
      : `运行证据：${evidenceSnapshot.runtime.mode === "real" ? "真实" : "教学模拟"}路径访问 ${String(evidenceSnapshot.runtime.visitCount)} 次${evidenceSnapshot.runtime.current ? " · 当前节点" : ""}`;
  const lock = node.locked
    ? `锁定：${node.lockReasons.map((reason) => reason.message).join("；")}。现有源码仍可编译运行。`
    : "生命周期：当前节点来自 main.c 的精确投影。";
  evidenceCopy.textContent = `${diagnostics}。${runtime}。${lock}`;
  evidence.append(evidenceHeading, evidenceCopy);
  body.append(explanation, editor, evidence);
}

function explainNode(node: FlowNode): string {
  const explanations: Readonly<Record<FlowNode["kind"], string>> = Object.freeze({
    module:
      "函数外的 include、宏、typedef 或全局声明；它属于 Translation Unit，保留精确源码但不参与函数控制改线。",
    start: "函数的控制流入口；它用于定位与回放，不会额外生成 C 语句。",
    end: "函数的控制流出口；return 与自然结束最终汇合到这里。",
    statement: "按顺序执行的一条 C 语句，通常只有一个控制输出。",
    declaration: "创建或声明变量，并确定后续语句可引用的名字与类型。",
    branch: "根据真实条件选择一条分支；分支不是由画布随意指定的。",
    loop: "重复执行循环体，并在条件不成立时离开循环。",
    switch: "按表达式值选择 case/default 路径，可合法连接多个分支。",
    assert: "检查运行时条件；失败会终止当前执行。",
    control: "改变当前函数的正常顺序，例如 return、break、continue 或 goto。",
    raw: "解析器无法安全结构化的原始 C 区域；保留源码但禁止危险改线。",
  });
  return explanations[node.kind];
}

function createWorkbenchLayouts(
  elements: WorkbenchElements,
  onPersist: (snapshot: { readonly id: string; readonly value: ResizableLayoutSnapshot }) => void,
): readonly { readonly id: string; readonly controller: ResizableLayoutController }[] {
  const owner = elements.shell;
  const presetsPane = required(owner, "#presets-pane");
  const outlinePane = required(owner, "#outline-pane");
  const canvasPane = required(owner, "#center-canvas-pane");
  const codePanel = required(owner, "#code-panel");
  const inspector = required(owner, "#inspector-stack");
  const runPanel = required(owner, "#run-panel");
  const scenarioPanel = required(owner, "#scenario-workbench-host");
  const tracePanel = required(owner, "#trace-workbench-host");
  const executionPanel = required(owner, "#run-host");
  return Object.freeze([
    layout("main", elements.buildLayout, "horizontal", [
      pane("left", elements.leftPane, 210, 150, 420),
      pane("center", elements.centerPane, 720, 420, 1400),
      pane("right", elements.rightPane, 330, 240, 720),
    ]),
    layout("left", elements.leftPane, "vertical", [
      pane("presets", presetsPane, 360, 120, 700),
      pane("outline", outlinePane, 220, 100, 620),
    ]),
    layout("center", elements.centerPane, "vertical", [
      pane("canvas", canvasPane, 560, 240, 1200),
      pane("bottom", elements.bottomPane, 190, 120, 520),
    ]),
    layout("right", elements.rightPane, "vertical", [
      pane("code", codePanel, 300, 140, 800),
      pane("inspector", inspector, 360, 140, 800),
    ]),
    layout("runtime", runPanel, "horizontal", [
      pane("scenario", scenarioPanel, 300, 180, 720),
      pane("trace", tracePanel, 320, 180, 760),
      pane("execution", executionPanel, 360, 220, 800),
    ]),
  ]);

  function layout(
    id: string,
    host: HTMLElement,
    axis: "horizontal" | "vertical",
    panes: readonly ReturnType<typeof pane>[],
  ) {
    const controller = createResizableLayout(host, {
      axis,
      panes,
      onPersist(value) {
        onPersist(Object.freeze({ id, value }));
      },
    });
    return Object.freeze({ id, controller });
  }
}

function pane(
  id: string,
  element: HTMLElement,
  initialSize: number,
  minSize: number,
  maxSize: number,
) {
  return Object.freeze({ id, element, initialSize, minSize, maxSize, label: id });
}

function restoreLayouts(
  snapshots: Readonly<Record<string, ResizableLayoutSnapshot>>,
  layouts: readonly { readonly id: string; readonly controller: ResizableLayoutController }[],
  target: Map<string, ResizableLayoutSnapshot>,
): void {
  for (const layout of layouts) {
    const snapshot = snapshots[layout.id];
    if (snapshot === undefined) continue;
    layout.controller.restore(snapshot.sizes);
    target.set(layout.id, layout.controller.getSnapshot());
  }
}

export function readFlowWorkbenchSidecar(value: unknown): FlowWorkbenchSidecar | null {
  if (!isRecord(value)) return null;
  if (
    (value.schemaVersion !== 1 && value.schemaVersion !== FLOW_WORKBENCH_SIDECAR_SCHEMA_VERSION) ||
    typeof value.sourceFingerprint !== "string" ||
    typeof value.layoutPreset !== "string" ||
    !VALID_LAYOUT_PRESETS.has(value.layoutPreset) ||
    !isRecord(value.layouts) ||
    (value.panelVisibility !== undefined && !isBooleanRecord(value.panelVisibility))
  ) {
    return null;
  }
  const layouts: Record<string, ResizableLayoutSnapshot> = {};
  for (const [id, snapshot] of Object.entries(value.layouts)) {
    if (!isResizableSnapshot(snapshot)) return null;
    layouts[id] = snapshot;
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    sourceFingerprint: value.sourceFingerprint,
    viewState: value.viewState,
    layoutPreset: value.layoutPreset,
    layouts: Object.freeze(layouts),
    panelVisibility: Object.freeze(
      value.panelVisibility === undefined ? {} : (value.panelVisibility as Record<string, boolean>),
    ),
    drafts: value.drafts === undefined ? emptyDraftState() : value.drafts,
  });
}

function emptyDraftState(): FlowCanvasDraftVisualState {
  return Object.freeze({
    nodes: Object.freeze([]),
    selectedNodeIds: Object.freeze([]),
    connection: null,
    virtualEdges: Object.freeze([]),
  });
}

function draftNode(
  id: string,
  label: string,
  source: string | null,
  position: { readonly x: number; readonly y: number },
  preset: ResolvedFlowPreset | null,
): FlowCanvasDraftNode {
  const isVirtual = preset?.blockKind === "virtual";
  return Object.freeze({
    id,
    label,
    position: Object.freeze({ ...position }),
    status: "detached" as const,
    presetId: preset?.id ?? null,
    presetVersion: preset?.version ?? null,
    blockKind: preset?.blockKind ?? "statement",
    placedAt: new Date().toISOString(),
    ...(source === null ? {} : { sourceText: source }),
    ports: Object.freeze(
      isVirtual
        ? (preset?.ports ?? []).map((port) =>
            Object.freeze({
              id: `${id}:${port.id}`,
              direction: port.direction,
              channel: port.channel,
              edgeKind:
                port.channel === "control" && port.direction === "output"
                  ? ("next" as const)
                  : null,
              label: port.label,
              editable: port.channel === "control",
            }),
          )
        : [
            Object.freeze({
              id: `${id}:next`,
              direction: "output" as const,
              channel: "control" as const,
              edgeKind: "next" as const,
              label: "接入",
              editable: true,
            }),
          ],
    ),
  });
}

function isResizableSnapshot(value: unknown): value is ResizableLayoutSnapshot {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    (value.axis === "horizontal" || value.axis === "vertical") &&
    isRecord(value.sizes) &&
    Object.values(value.sizes).every((size) => typeof size === "number" && Number.isFinite(size))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "boolean");
}

function required(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`自由工作台缺少 ${selector}`);
  return element;
}

function assertOptions(options: FlowWorkbenchControllerOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.api?.readWorkspaceSidecar !== "function" ||
    typeof options.api.saveWorkspaceSidecar !== "function" ||
    typeof options.onNodeSelect !== "function" ||
    typeof options.onReplaceNodeSource !== "function" ||
    typeof options.onDeleteNodes !== "function" ||
    typeof options.onConnectionIntent !== "function" ||
    typeof options.resolvePreset !== "function" ||
    typeof options.onDraftConnectionIntent !== "function" ||
    typeof options.onSourceUndo !== "function" ||
    typeof options.onStatus !== "function"
  ) {
    throw new TypeError("Flow workbench controller options 无效");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Flow workbench controller 已销毁");
}
