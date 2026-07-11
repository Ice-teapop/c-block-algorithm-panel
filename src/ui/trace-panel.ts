import type { RunnerError } from "../shared/api.js";
import type { TraceEvent, TraceRunEvidence, TraceUnsupportedReason } from "../shared/trace.js";

export type TracePanelStatus =
  | "idle"
  | "preparing"
  | "running"
  | "branch"
  | "completed"
  | "cancelled"
  | "error"
  | "resource"
  | "truncated"
  | "unsupported";

export interface TracePanelState {
  readonly status: TracePanelStatus;
  readonly message: string;
  readonly sessionId: string | null;
  readonly sourceFingerprint: string | null;
  readonly playbackPaused: boolean;
  readonly eventCount: number;
  readonly evidence: TraceRunEvidence | null;
  readonly unsupported: TraceUnsupportedReason | null;
  readonly error: RunnerError | null;
}

export interface TracePanelOptions {
  readonly onStart: () => void | Promise<void>;
  readonly onCancel: () => void | Promise<void>;
  readonly onPausePlayback: () => void;
  readonly onResumePlayback: () => void;
}

export interface TracePanel {
  readonly element: HTMLElement;
  setState(state: TracePanelState): void;
  setEvents(events: readonly TraceEvent[]): void;
  clear(): void;
  destroy(): void;
}

export interface TraceStatusPresentation {
  readonly icon: string;
  readonly label: string;
  readonly tone: "neutral" | "working" | "success" | "warning" | "danger";
}

export const TRACE_PANEL_EVENT_LIMIT = 500;

const STATUS_PRESENTATIONS: Readonly<Record<TracePanelStatus, TraceStatusPresentation>> =
  Object.freeze({
    idle: Object.freeze({ icon: "○", label: "待命", tone: "neutral" }),
    preparing: Object.freeze({ icon: "◌", label: "准备", tone: "working" }),
    running: Object.freeze({ icon: "▶", label: "运行", tone: "working" }),
    branch: Object.freeze({ icon: "⑂", label: "分支", tone: "working" }),
    completed: Object.freeze({ icon: "✓", label: "完成", tone: "success" }),
    cancelled: Object.freeze({ icon: "■", label: "已取消", tone: "neutral" }),
    error: Object.freeze({ icon: "!", label: "错误", tone: "danger" }),
    resource: Object.freeze({ icon: "▣", label: "资源限制", tone: "danger" }),
    truncated: Object.freeze({ icon: "…", label: "已截断", tone: "warning" }),
    unsupported: Object.freeze({ icon: "—", label: "不支持", tone: "warning" }),
  });

export function createTracePanel(host: HTMLElement, options: TracePanelOptions): TracePanel {
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "trace-panel";
  root.dataset.traceMode = "real";
  root.dataset.status = "idle";
  root.setAttribute("aria-label", "真实运行流程");

  const header = ownerDocument.createElement("header");
  header.className = "trace-panel__header";
  const title = ownerDocument.createElement("h2");
  title.className = "trace-panel__title";
  title.textContent = "运行流程";
  const badge = ownerDocument.createElement("output");
  badge.className = "trace-panel__badge";
  badge.setAttribute("aria-live", "polite");
  header.append(title, badge);

  const controls = ownerDocument.createElement("div");
  controls.className = "trace-panel__controls";
  const start = button(ownerDocument, "开始 Trace", "start");
  const cancel = button(ownerDocument, "取消", "cancel");
  const playback = button(ownerDocument, "暂停回放", "playback");
  controls.append(start, cancel, playback);

  const safety = ownerDocument.createElement("p");
  safety.className = "trace-panel__safety";
  safety.textContent = "暂停只影响画布视觉回放；C 进程仍在后台继续运行。";

  const status = ownerDocument.createElement("output");
  status.className = "trace-panel__status";
  status.setAttribute("aria-live", "polite");

  const evidence = ownerDocument.createElement("dl");
  evidence.className = "trace-panel__evidence";
  evidence.hidden = true;
  const duration = appendEvidence(ownerDocument, evidence, "墙钟耗时", "duration");
  const memory = appendEvidence(ownerDocument, evidence, "采样峰值内存", "peak-rss");
  const processes = appendEvidence(ownerDocument, evidence, "采样峰值进程", "peak-processes");
  const output = appendEvidence(ownerDocument, evidence, "用户输出量", "output-bytes");
  const executed = appendEvidence(ownerDocument, evidence, "执行节点", "executed-nodes");
  const operations = appendEvidence(ownerDocument, evidence, "插桩操作计数", "operation-count");

  const eventHeader = ownerDocument.createElement("div");
  eventHeader.className = "trace-panel__event-header";
  const eventTitle = ownerDocument.createElement("h3");
  eventTitle.textContent = "真实事件";
  const eventCount = ownerDocument.createElement("span");
  eventCount.className = "trace-panel__event-count";
  eventHeader.append(eventTitle, eventCount);
  const eventList = ownerDocument.createElement("ol");
  eventList.className = "trace-panel__events";
  eventList.dataset.traceMode = "real";
  eventList.setAttribute("aria-label", "最近真实运行事件");
  const empty = ownerDocument.createElement("li");
  empty.className = "trace-panel__empty";
  empty.textContent = "尚无事件。启动后仅显示后端确认的真实轨迹。";
  eventList.append(empty);

  root.append(header, controls, safety, status, evidence, eventHeader, eventList);
  host.replaceChildren(root);

  let currentState = emptyPanelState();
  let currentEvents: readonly TraceEvent[] = Object.freeze([]);
  let destroyed = false;

  const renderState = (): void => {
    const presentation = traceStatusPresentation(currentState.status);
    root.dataset.status = currentState.status;
    root.dataset.playbackPaused = String(currentState.playbackPaused);
    badge.dataset.tone = presentation.tone;
    badge.textContent = `${presentation.icon} ${presentation.label}`;
    status.textContent = currentState.message;
    const active =
      currentState.status === "preparing" ||
      currentState.status === "running" ||
      currentState.status === "branch";
    start.disabled = active;
    cancel.disabled = !active;
    playback.disabled = !tracePlaybackControlEnabled(
      currentState.status,
      currentState.playbackPaused,
    );
    playback.textContent = currentState.playbackPaused ? "继续回放" : "暂停回放";
    playback.setAttribute("aria-pressed", String(currentState.playbackPaused));
    const runEvidence = currentState.evidence;
    evidence.hidden = runEvidence === null;
    if (runEvidence !== null) {
      duration.textContent = `${formatNumber(runEvidence.durationMs)} ms`;
      memory.textContent =
        runEvidence.peakProcessCount > 0
          ? `${formatBytes(runEvidence.peakRssBytes)}（采样）`
          : "未取得有效样本";
      processes.textContent =
        runEvidence.peakProcessCount > 0
          ? `${String(runEvidence.peakProcessCount)}（采样）`
          : "未取得有效样本";
      output.textContent = formatBytes(runEvidence.outputBytes);
      executed.textContent = String(runEvidence.executedNodeCount);
      operations.textContent = `${String(runEvidence.operationCount)}（真实 Trace 事件）`;
    }
    eventCount.textContent = eventCountLabel(currentState.eventCount, currentEvents.length);
  };

  const renderEvents = (): void => {
    eventList.replaceChildren();
    const visible = selectTracePanelEvents(currentEvents);
    if (visible.length === 0) {
      const nextEmpty = empty.cloneNode(true);
      eventList.append(nextEmpty);
    } else {
      for (const event of visible) eventList.append(renderEvent(ownerDocument, event));
    }
    eventCount.textContent = eventCountLabel(currentState.eventCount, visible.length);
  };

  const invoke = (operation: () => void | Promise<void>): void => {
    try {
      void Promise.resolve(operation()).catch(() => undefined);
    } catch {
      // Controller publishes the actionable error state.
    }
  };
  const onStart = (): void => invoke(options.onStart);
  const onCancel = (): void => invoke(options.onCancel);
  const onPlayback = (): void => {
    if (currentState.playbackPaused) options.onResumePlayback();
    else options.onPausePlayback();
  };
  start.addEventListener("click", onStart);
  cancel.addEventListener("click", onCancel);
  playback.addEventListener("click", onPlayback);

  renderState();

  return Object.freeze({
    element: root,
    setState(nextState: TracePanelState): void {
      assertAlive(destroyed);
      currentState = freezePanelState(nextState);
      renderState();
    },
    setEvents(nextEvents: readonly TraceEvent[]): void {
      assertAlive(destroyed);
      currentEvents = Object.freeze(selectTracePanelEvents(nextEvents).map(freezeEvent));
      renderEvents();
    },
    clear(): void {
      assertAlive(destroyed);
      currentState = emptyPanelState();
      currentEvents = Object.freeze([]);
      renderState();
      renderEvents();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      start.removeEventListener("click", onStart);
      cancel.removeEventListener("click", onCancel);
      playback.removeEventListener("click", onPlayback);
      root.remove();
    },
  });
}

export function traceStatusPresentation(status: TracePanelStatus): TraceStatusPresentation {
  return STATUS_PRESENTATIONS[status];
}

export function tracePlaybackControlEnabled(
  status: TracePanelStatus,
  playbackPaused: boolean,
): boolean {
  return playbackPaused || status === "preparing" || status === "running" || status === "branch";
}

export function selectTracePanelEvents(events: readonly TraceEvent[]): readonly TraceEvent[] {
  return Object.freeze(events.slice(-TRACE_PANEL_EVENT_LIMIT).map(freezeEvent));
}

export function formatTraceEvent(event: TraceEvent): string {
  const prefix = `#${String(event.sequence)} · 行 ${String(event.line)}`;
  const kind =
    event.kind === "branch" ? `分支 ${event.branchTaken === true ? "true" : "false"}` : "语句";
  return `${prefix} · ${kind} · ${formatNumber(event.elapsedMs)} ms`;
}

function renderEvent(ownerDocument: Document, event: TraceEvent): HTMLLIElement {
  const item = ownerDocument.createElement("li");
  item.className = "trace-panel__event";
  item.dataset.sequence = String(event.sequence);
  item.dataset.kind = event.kind;
  item.dataset.traceMode = "real";
  if (event.kind === "branch") item.dataset.branchTaken = String(event.branchTaken);
  item.textContent = formatTraceEvent(event);
  return item;
}

function button(ownerDocument: Document, label: string, action: string): HTMLButtonElement {
  const element = ownerDocument.createElement("button");
  element.className = "trace-panel__button";
  element.type = "button";
  element.textContent = label;
  element.dataset.traceAction = action;
  return element;
}

function appendEvidence(
  ownerDocument: Document,
  list: HTMLDListElement,
  label: string,
  field: string,
): HTMLElement {
  const row = ownerDocument.createElement("div");
  row.className = "trace-panel__evidence-row";
  const term = ownerDocument.createElement("dt");
  term.textContent = label;
  const value = ownerDocument.createElement("dd");
  value.dataset.traceField = field;
  row.append(term, value);
  list.append(row);
  return value;
}

function emptyPanelState(): TracePanelState {
  return freezePanelState({
    status: "idle",
    message: "尚未启动真实运行轨迹。",
    sessionId: null,
    sourceFingerprint: null,
    playbackPaused: false,
    eventCount: 0,
    evidence: null,
    unsupported: null,
    error: null,
  });
}

function freezePanelState(state: TracePanelState): TracePanelState {
  return Object.freeze({
    ...state,
    evidence: state.evidence === null ? null : Object.freeze({ ...state.evidence }),
    unsupported: state.unsupported === null ? null : Object.freeze({ ...state.unsupported }),
    error: state.error === null ? null : Object.freeze({ ...state.error }),
  });
}

function freezeEvent(event: TraceEvent): TraceEvent {
  return Object.freeze({ ...event });
}

function eventCountLabel(total: number, visible: number): string {
  if (total <= visible) return `${String(total)} 条`;
  return `${String(total)} 条 · 仅显示最近 ${String(visible)} 条`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_024 * 1_024) return `${formatNumber(bytes / 1_024)} KiB`;
  return `${formatNumber(bytes / (1_024 * 1_024))} MiB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("TracePanel 已销毁");
}
