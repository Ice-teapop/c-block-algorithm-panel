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

export interface TracePanelReference {
  readonly inputSize: number;
  readonly referenceOperationCount: number;
  readonly label: string;
}

export interface TracePanel {
  readonly element: HTMLElement;
  setState(state: TracePanelState): void;
  setEvents(events: readonly TraceEvent[]): void;
  setReference(reference: TracePanelReference | null): void;
  clear(): void;
  destroy(): void;
}

export interface TraceStatusPresentation {
  readonly icon: string;
  readonly label: string;
  readonly tone: "neutral" | "working" | "success" | "warning" | "danger";
}

export const TRACE_PANEL_EVENT_LIMIT = 500;
export const TRACE_CHART_POINT_LIMIT = 80;

export type TraceChartXAxisMode = "time" | "sequence";

const TRACE_CHART_WIDTH = 320;
const TRACE_CHART_HEIGHT = 112;
const TRACE_CHART_LEFT = 28;
const TRACE_CHART_RIGHT = 8;
const TRACE_CHART_TOP = 8;
const TRACE_CHART_BOTTOM = 20;

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
  const start = button(ownerDocument, "观察路径", "start");
  const cancel = button(ownerDocument, "取消", "cancel");
  const playback = button(ownerDocument, "暂停回放", "playback");
  controls.append(start, cancel, playback);

  const visual = ownerDocument.createElement("figure");
  visual.className = "trace-panel__visual";
  visual.setAttribute("aria-label", "真实 Trace 时间与累计事件图");
  const chartCaption = ownerDocument.createElement("figcaption");
  chartCaption.className = "trace-panel__chart-caption";
  chartCaption.textContent = "时间 × 累计真实事件";
  const chart = svg(ownerDocument, "svg");
  chart.setAttribute("class", "trace-panel__chart");
  chart.setAttribute("viewBox", `0 0 ${String(TRACE_CHART_WIDTH)} ${String(TRACE_CHART_HEIGHT)}`);
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", "横轴为运行毫秒，纵轴为累计真实 Trace 事件");
  visual.append(chartCaption, chart);

  const referenceSummary = ownerDocument.createElement("output");
  referenceSummary.className = "trace-panel__reference";
  referenceSummary.setAttribute("aria-live", "polite");

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

  root.append(
    header,
    visual,
    referenceSummary,
    controls,
    safety,
    status,
    evidence,
    eventHeader,
    eventList,
  );
  host.replaceChildren(root);

  let currentState = emptyPanelState();
  let currentEvents: readonly TraceEvent[] = Object.freeze([]);
  let chartEvents: readonly TraceEvent[] = Object.freeze([]);
  let currentReference: TracePanelReference | null = null;
  let destroyed = false;

  const renderProgressiveVisibility = (): void => {
    const active = isActiveTraceStatus(currentState.status);
    const hasEvents = currentEvents.length > 0;
    const playbackEnabled = tracePlaybackControlEnabled(
      currentState.status,
      currentState.playbackPaused,
    );
    start.hidden = active;
    cancel.hidden = !active;
    playback.hidden = !playbackEnabled;
    safety.hidden = !active && !currentState.playbackPaused;
    visual.hidden = !hasEvents;
    eventHeader.hidden = !hasEvents;
    eventList.hidden = !hasEvents;
    referenceSummary.hidden = currentReference === null && !hasEvents;
  };

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
    renderProgressiveVisibility();
    renderReference();
    renderChart();
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
    renderProgressiveVisibility();
    renderReference();
    renderChart();
  };

  const renderReference = (): void => {
    const active = isActiveTraceStatus(currentState.status);
    const terminal = isTerminalTracePanelStatus(currentState.status);
    const prefix = active ? "已消耗参考预算" : terminal ? "实测/参考工作量比" : "参考工作量";
    if (currentReference === null) {
      referenceSummary.dataset.available = "false";
      referenceSummary.textContent = `${prefix}：不可用（尚未建立同规模参考）`;
      renderProgressiveVisibility();
      return;
    }
    const observed = observedOperationCount(currentState, currentEvents);
    referenceSummary.dataset.available = "true";
    referenceSummary.dataset.referenceLabel = currentReference.label;
    referenceSummary.dataset.inputSize = String(currentReference.inputSize);
    if (active || terminal) {
      const ratio = observed / currentReference.referenceOperationCount;
      referenceSummary.textContent = `${prefix}：${formatRatio(ratio)}×（${formatNumber(observed)} / ${formatNumber(currentReference.referenceOperationCount)}）· n=${formatNumber(currentReference.inputSize)} · ${currentReference.label}`;
      renderProgressiveVisibility();
      return;
    }
    referenceSummary.textContent = `${prefix}：${formatNumber(currentReference.referenceOperationCount)} 次 · n=${formatNumber(currentReference.inputSize)} · ${currentReference.label}`;
    renderProgressiveVisibility();
  };

  const renderChart = (): void => {
    chart.replaceChildren();
    const events = chartEvents;
    const xMode = traceChartXAxisMode(events);
    chart.dataset.xMode = xMode;
    const evidenceDuration = finiteNonNegative(currentState.evidence?.durationMs) ?? 0;
    const elapsedMax = Math.max(events.at(-1)?.elapsedMs ?? 0, evidenceDuration, 1);
    const observedMax = Math.max(
      events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0),
      observedOperationCount(currentState, currentEvents),
    );
    const referenceMax = currentReference?.referenceOperationCount ?? 0;
    const operationMax = Math.max(observedMax, referenceMax, 1);
    chartCaption.textContent =
      events.length === 0
        ? "执行路径"
        : xMode === "time"
          ? "执行路径 · 真实时间"
          : "执行路径 · 按事件顺序展开（计时分辨率不足）";
    chart.setAttribute(
      "aria-label",
      xMode === "time"
        ? "横轴为真实运行毫秒，纵轴为累计真实 Trace 事件"
        : "本次执行快于计时分辨率；横轴按真实事件顺序展开，纵轴为累计真实 Trace 事件",
    );
    appendChartAxes(ownerDocument, chart, elapsedMax, operationMax, xMode, events.length);
    if (currentReference !== null) {
      appendReferenceLine(ownerDocument, chart, currentReference, operationMax);
    }
    if (events.length === 0) {
      const emptyChart = svg(ownerDocument, "text");
      emptyChart.setAttribute("class", "trace-panel__chart-empty");
      emptyChart.setAttribute("x", String(TRACE_CHART_LEFT));
      emptyChart.setAttribute("y", String(TRACE_CHART_HEIGHT / 2));
      emptyChart.textContent = "等待真实 Trace 事件";
      chart.append(emptyChart);
      chart.dataset.pointCount = "0";
      return;
    }
    const coordinates = events.map((event, index) =>
      chartCoordinate(event, index, events.length, xMode, elapsedMax, operationMax),
    );
    if (coordinates.length > 1) {
      const series = svg(ownerDocument, "polyline");
      series.setAttribute("class", "trace-panel__chart-series");
      series.setAttribute("data-series", "trace");
      series.setAttribute(
        "points",
        coordinates.map(({ x, y }) => `${formatCoordinate(x)},${formatCoordinate(y)}`).join(" "),
      );
      chart.append(series);
    }
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const coordinate = coordinates[index];
      if (event === undefined || coordinate === undefined) continue;
      const marker = svg(ownerDocument, "circle");
      marker.setAttribute(
        "class",
        event.kind === "branch" ? "trace-panel__chart-branch" : "trace-panel__chart-point",
      );
      marker.setAttribute("data-kind", event.kind);
      if (event.kind === "branch") {
        marker.setAttribute("data-branch-taken", String(event.branchTaken));
      }
      marker.setAttribute("data-sequence", String(event.sequence));
      marker.setAttribute("cx", formatCoordinate(coordinate.x));
      marker.setAttribute("cy", formatCoordinate(coordinate.y));
      marker.setAttribute("r", event.kind === "branch" ? "3" : "1.8");
      const markerTitle = svg(ownerDocument, "title");
      markerTitle.textContent =
        event.kind === "branch"
          ? `第 ${String(event.line)} 行分支 ${String(event.branchTaken)} · ${formatNumber(event.elapsedMs)} ms`
          : `第 ${String(event.line)} 行语句 · ${formatNumber(event.elapsedMs)} ms`;
      marker.append(markerTitle);
      chart.append(marker);
    }
    chart.dataset.pointCount = String(events.length);
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
      const nextVisibleEvents = selectTracePanelEvents(nextEvents);
      chartEvents = mergeTraceChartEvents(chartEvents, nextVisibleEvents);
      currentEvents = nextVisibleEvents;
      renderEvents();
    },
    setReference(reference: TracePanelReference | null): void {
      assertAlive(destroyed);
      currentReference = normalizeReference(reference);
      renderReference();
      renderChart();
    },
    clear(): void {
      assertAlive(destroyed);
      currentState = emptyPanelState();
      currentEvents = Object.freeze([]);
      chartEvents = Object.freeze([]);
      currentReference = null;
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
  return Object.freeze(
    events.filter(isFiniteTraceEvent).slice(-TRACE_PANEL_EVENT_LIMIT).map(freezeEvent),
  );
}

export function selectTraceChartEvents(events: readonly TraceEvent[]): readonly TraceEvent[] {
  const valid = events.filter(isFiniteTraceEvent);
  if (valid.length <= TRACE_CHART_POINT_LIMIT) {
    return Object.freeze(valid.map(freezeEvent));
  }

  const required = new Set<number>([0, valid.length - 1]);
  for (let index = 0; index < valid.length; index += 1) {
    if (valid[index]?.kind === "branch") required.add(index);
  }
  const requiredIndices = [...required].sort((left, right) => left - right);
  let selectedIndices: readonly number[];
  if (requiredIndices.length >= TRACE_CHART_POINT_LIMIT) {
    selectedIndices = evenlySelect(requiredIndices, TRACE_CHART_POINT_LIMIT);
  } else {
    const available = Array.from({ length: valid.length }, (_, index) => index).filter(
      (index) => !required.has(index),
    );
    selectedIndices = [
      ...requiredIndices,
      ...evenlySelect(available, TRACE_CHART_POINT_LIMIT - requiredIndices.length),
    ].sort((left, right) => left - right);
  }
  return Object.freeze(
    selectedIndices.flatMap((index) => {
      const event = valid[index];
      return event === undefined ? [] : [freezeEvent(event)];
    }),
  );
}

function mergeTraceChartEvents(
  current: readonly TraceEvent[],
  incoming: readonly TraceEvent[],
): readonly TraceEvent[] {
  if (incoming.length === 0) return Object.freeze([]);
  const currentLast = current.at(-1)?.sequence ?? 0;
  const incomingLast = incoming.at(-1)?.sequence ?? 0;
  const base = incomingLast < currentLast ? [] : current;
  const bySequence = new Map<number, TraceEvent>();
  for (const event of [...base, ...incoming]) bySequence.set(event.sequence, event);
  return selectTraceChartEvents(
    [...bySequence.values()].sort((left, right) => left.sequence - right.sequence),
  );
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

function appendChartAxes(
  ownerDocument: Document,
  chart: SVGSVGElement,
  elapsedMax: number,
  operationMax: number,
  xMode: TraceChartXAxisMode,
  eventCount: number,
): void {
  const xAxis = svg(ownerDocument, "line");
  xAxis.setAttribute("class", "trace-panel__chart-axis");
  xAxis.setAttribute("x1", String(TRACE_CHART_LEFT));
  xAxis.setAttribute("x2", String(TRACE_CHART_WIDTH - TRACE_CHART_RIGHT));
  xAxis.setAttribute("y1", String(TRACE_CHART_HEIGHT - TRACE_CHART_BOTTOM));
  xAxis.setAttribute("y2", String(TRACE_CHART_HEIGHT - TRACE_CHART_BOTTOM));
  const yAxis = svg(ownerDocument, "line");
  yAxis.setAttribute("class", "trace-panel__chart-axis");
  yAxis.setAttribute("x1", String(TRACE_CHART_LEFT));
  yAxis.setAttribute("x2", String(TRACE_CHART_LEFT));
  yAxis.setAttribute("y1", String(TRACE_CHART_TOP));
  yAxis.setAttribute("y2", String(TRACE_CHART_HEIGHT - TRACE_CHART_BOTTOM));

  const elapsedLabel = svg(ownerDocument, "text");
  elapsedLabel.setAttribute("class", "trace-panel__chart-label");
  elapsedLabel.setAttribute("x", String(TRACE_CHART_WIDTH - TRACE_CHART_RIGHT));
  elapsedLabel.setAttribute("y", String(TRACE_CHART_HEIGHT - 3));
  elapsedLabel.setAttribute("text-anchor", "end");
  elapsedLabel.textContent =
    xMode === "time" ? `${formatNumber(elapsedMax)} ms` : `${String(eventCount)} 步`;
  const operationLabel = svg(ownerDocument, "text");
  operationLabel.setAttribute("class", "trace-panel__chart-label");
  operationLabel.setAttribute("x", String(TRACE_CHART_LEFT - 4));
  operationLabel.setAttribute("y", String(TRACE_CHART_TOP + 3));
  operationLabel.setAttribute("text-anchor", "end");
  operationLabel.textContent = formatNumber(operationMax);
  chart.append(xAxis, yAxis, elapsedLabel, operationLabel);
}

function appendReferenceLine(
  ownerDocument: Document,
  chart: SVGSVGElement,
  reference: TracePanelReference,
  operationMax: number,
): void {
  const coordinate = operationY(reference.referenceOperationCount, operationMax);
  const line = svg(ownerDocument, "line");
  line.setAttribute("class", "trace-panel__chart-reference");
  line.setAttribute("data-series", "reference");
  line.setAttribute("x1", String(TRACE_CHART_LEFT));
  line.setAttribute("x2", String(TRACE_CHART_WIDTH - TRACE_CHART_RIGHT));
  line.setAttribute("y1", formatCoordinate(coordinate));
  line.setAttribute("y2", formatCoordinate(coordinate));
  const title = svg(ownerDocument, "title");
  title.textContent = `${reference.label}：${formatNumber(reference.referenceOperationCount)} 次，n=${formatNumber(reference.inputSize)}`;
  line.append(title);
  chart.append(line);
}

function chartCoordinate(
  event: TraceEvent,
  index: number,
  eventCount: number,
  xMode: TraceChartXAxisMode,
  elapsedMax: number,
  operationMax: number,
): Readonly<{ x: number; y: number }> {
  const plotWidth = TRACE_CHART_WIDTH - TRACE_CHART_LEFT - TRACE_CHART_RIGHT;
  const horizontalRatio =
    xMode === "time"
      ? clamp(event.elapsedMs / elapsedMax, 0, 1)
      : eventCount <= 1
        ? 0.5
        : clamp(index / (eventCount - 1), 0, 1);
  return Object.freeze({
    x: TRACE_CHART_LEFT + horizontalRatio * plotWidth,
    y: operationY(event.sequence, operationMax),
  });
}

export function traceChartXAxisMode(events: readonly TraceEvent[]): TraceChartXAxisMode {
  if (events.length <= 1) return "sequence";
  const distinctTimes = new Set(events.map((event) => event.elapsedMs)).size;
  const minimumUsefulSamples = Math.min(events.length, 3);
  return distinctTimes >= minimumUsefulSamples ? "time" : "sequence";
}

function operationY(operationCount: number, operationMax: number): number {
  const plotHeight = TRACE_CHART_HEIGHT - TRACE_CHART_TOP - TRACE_CHART_BOTTOM;
  const operationRatio = clamp(operationCount / operationMax, 0, 1);
  return TRACE_CHART_HEIGHT - TRACE_CHART_BOTTOM - operationRatio * plotHeight;
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

function normalizeReference(reference: TracePanelReference | null): TracePanelReference | null {
  if (reference === null) return null;
  if (
    !Number.isFinite(reference.inputSize) ||
    reference.inputSize < 0 ||
    !Number.isFinite(reference.referenceOperationCount) ||
    reference.referenceOperationCount <= 0
  ) {
    return null;
  }
  const label = reference.label.trim();
  if (label.length === 0) return null;
  return Object.freeze({
    inputSize: reference.inputSize,
    referenceOperationCount: reference.referenceOperationCount,
    label,
  });
}

function observedOperationCount(state: TracePanelState, events: readonly TraceEvent[]): number {
  if (
    isTerminalTracePanelStatus(state.status) &&
    state.evidence !== null &&
    Number.isSafeInteger(state.evidence.operationCount) &&
    state.evidence.operationCount >= 0
  ) {
    return state.evidence.operationCount;
  }
  if (Number.isSafeInteger(state.eventCount) && state.eventCount >= 0) return state.eventCount;
  const lastSequence = events.filter(isFiniteTraceEvent).at(-1)?.sequence;
  return lastSequence ?? 0;
}

function isActiveTraceStatus(status: TracePanelStatus): boolean {
  return status === "preparing" || status === "running" || status === "branch";
}

function isTerminalTracePanelStatus(status: TracePanelStatus): boolean {
  return (
    status === "completed" ||
    status === "cancelled" ||
    status === "error" ||
    status === "resource" ||
    status === "truncated" ||
    status === "unsupported"
  );
}

function isFiniteTraceEvent(event: TraceEvent): boolean {
  return (
    Number.isSafeInteger(event.sequence) &&
    event.sequence > 0 &&
    Number.isSafeInteger(event.line) &&
    event.line > 0 &&
    Number.isFinite(event.elapsedMs) &&
    event.elapsedMs >= 0 &&
    (event.kind === "line" || (event.kind === "branch" && typeof event.branchTaken === "boolean"))
  );
}

function evenlySelect(values: readonly number[], count: number): readonly number[] {
  if (count <= 0 || values.length === 0) return Object.freeze([]);
  if (count >= values.length) return Object.freeze([...values]);
  if (count === 1) return Object.freeze([values.at(-1) ?? values[0] ?? 0]);
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const sourceIndex = Math.round((index * (values.length - 1)) / (count - 1));
      return values[sourceIndex] ?? values.at(-1) ?? 0;
    }),
  );
}

function svg<K extends keyof SVGElementTagNameMap>(
  ownerDocument: Document,
  tagName: K,
): SVGElementTagNameMap[K] {
  return ownerDocument.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function finiteNonNegative(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
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

function formatRatio(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("TracePanel 已销毁");
}
