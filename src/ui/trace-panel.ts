import type { RunnerError } from "../shared/api.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";
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
  readonly primaryStartButton?: HTMLButtonElement | undefined;
  readonly showStartButton?: boolean | undefined;
  /** Sequence is the stable default; time is an explicit diagnostic view. */
  readonly chartXAxisMode?: TraceChartXAxisMode | undefined;
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

export interface TraceChartTimeDomain {
  readonly startMs: number;
  readonly endMs: number;
  readonly spanMs: number;
}

const TRACE_CHART_WIDTH = 320;
const TRACE_CHART_HEIGHT = 112;
const TRACE_CHART_LEFT = 28;
const TRACE_CHART_RIGHT = 8;
const TRACE_CHART_TOP = 8;
const TRACE_CHART_BOTTOM = 20;

interface TracePanelCopy {
  readonly rootAria: string;
  readonly title: string;
  readonly statusLabels: Readonly<Record<TracePanelStatus, string>>;
  readonly observe: string;
  readonly observing: string;
  readonly cancel: string;
  readonly pausePlayback: string;
  readonly resumePlayback: string;
  readonly visualAria: string;
  readonly chartInitialCaption: string;
  readonly chartTimeAria: string;
  readonly chartSequenceAria: string;
  readonly safety: string;
  readonly evidenceLabels: readonly [string, string, string, string, string, string];
  readonly events: string;
  readonly eventsAria: string;
  readonly emptyEvents: string;
  readonly sampled: string;
  readonly noSample: string;
  readonly operationSuffix: string;
  readonly referenceActive: string;
  readonly referenceTerminal: string;
  readonly referenceIdle: string;
  readonly referenceUnavailable: string;
  readonly chartEmptyCaption: string;
  readonly chartTimeCaption: string;
  readonly chartSequenceCaption: string;
  readonly chartEmpty: string;
  readonly chartGuideSummary: string;
  readonly chartGuideItems: readonly (readonly [string, string])[];
  readonly line: string;
  readonly branch: string;
  readonly statement: string;
  readonly steps: string;
  readonly items: string;
  readonly recentItems: (visible: number) => string;
  readonly countUnit: string;
  readonly initialStatus: string;
}

const STATUS_ICONS: Readonly<Record<TracePanelStatus, Omit<TraceStatusPresentation, "label">>> =
  Object.freeze({
    idle: Object.freeze({ icon: "○", tone: "neutral" }),
    preparing: Object.freeze({ icon: "◌", tone: "working" }),
    running: Object.freeze({ icon: "▶", tone: "working" }),
    branch: Object.freeze({ icon: "⑂", tone: "working" }),
    completed: Object.freeze({ icon: "✓", tone: "success" }),
    cancelled: Object.freeze({ icon: "■", tone: "neutral" }),
    error: Object.freeze({ icon: "!", tone: "danger" }),
    resource: Object.freeze({ icon: "▣", tone: "danger" }),
    truncated: Object.freeze({ icon: "…", tone: "warning" }),
    unsupported: Object.freeze({ icon: "—", tone: "warning" }),
  });

const TRACE_PANEL_COPY: Readonly<Record<InterfaceLocale, TracePanelCopy>> = Object.freeze({
  "zh-CN": Object.freeze({
    rootAria: "真实运行流程",
    title: "运行流程",
    statusLabels: Object.freeze({
      idle: "待命",
      preparing: "准备",
      running: "运行",
      branch: "分支",
      completed: "完成",
      cancelled: "已取消",
      error: "错误",
      resource: "资源限制",
      truncated: "已截断",
      unsupported: "不支持",
    }),
    observe: "观察路径",
    observing: "观察中…",
    cancel: "取消",
    pausePlayback: "暂停回放",
    resumePlayback: "继续回放",
    visualAria: "真实 Trace 执行阶段与事件序列轨",
    chartInitialCaption: "执行阶段 · 事件顺序",
    chartTimeAria: "横轴为 Trace 事件时间跨度，纵轴为累计真实 Trace 事件；墙钟耗时单独显示",
    chartSequenceAria: "本次执行快于计时分辨率；横轴按真实事件顺序展开，纵轴为累计真实 Trace 事件",
    safety: "暂停只影响画布视觉回放；C 进程仍在后台继续运行。",
    evidenceLabels: Object.freeze([
      "墙钟耗时",
      "采样峰值内存",
      "采样峰值进程",
      "用户输出量",
      "执行节点",
      "插桩操作计数",
    ] as const),
    events: "真实事件",
    eventsAria: "最近真实运行事件",
    emptyEvents: "尚无事件。启动后仅显示后端确认的真实轨迹。",
    sampled: "采样",
    noSample: "未取得有效样本",
    operationSuffix: "真实 Trace 事件",
    referenceActive: "已消耗参考预算",
    referenceTerminal: "实测/参考工作量比",
    referenceIdle: "参考工作量",
    referenceUnavailable: "不可用（尚未建立同规模参考）",
    chartEmptyCaption: "执行阶段",
    chartTimeCaption: "执行阶段 · 事件时间跨度",
    chartSequenceCaption: "执行阶段 · 事件顺序",
    chartEmpty: "等待真实 Trace 事件",
    chartGuideSummary: "怎么看",
    chartGuideItems: Object.freeze([
      Object.freeze(["横轴", "事件顺序；时间模式只表示首末 Trace 事件的跨度。"] as const),
      Object.freeze(["纵轴", "累计后端确认的真实 Trace 事件。"] as const),
      Object.freeze(["点", "小点是语句；较大的点是 true / false 分支结果。"] as const),
      Object.freeze(["虚线", "同一输入规模下的参考工作量。"] as const),
      Object.freeze(["证据边界", "实测/参考不是速度评分，也不能单独证明 Big-O。"] as const),
    ]),
    line: "行",
    branch: "分支",
    statement: "语句",
    steps: "步",
    items: "条",
    recentItems: (visible: number) => `仅显示最近 ${String(visible)} 条`,
    countUnit: "次",
    initialStatus: "尚未启动真实运行轨迹。",
  }),
  en: Object.freeze({
    rootAria: "Real execution flow",
    title: "Execution Flow",
    statusLabels: Object.freeze({
      idle: "Idle",
      preparing: "Preparing",
      running: "Running",
      branch: "Branch",
      completed: "Completed",
      cancelled: "Cancelled",
      error: "Error",
      resource: "Resource limit",
      truncated: "Truncated",
      unsupported: "Unsupported",
    }),
    observe: "Observe Path",
    observing: "Observing…",
    cancel: "Cancel",
    pausePlayback: "Pause Playback",
    resumePlayback: "Resume Playback",
    visualAria: "Real Trace execution stages and event sequence track",
    chartInitialCaption: "Execution stages · event order",
    chartTimeAria:
      "Horizontal axis: Trace event time span; vertical axis: cumulative real Trace events; wall time is shown separately",
    chartSequenceAria:
      "This run is faster than the timer resolution; the horizontal axis follows real event order and the vertical axis shows cumulative real Trace events",
    safety: "Pausing affects only canvas playback; the C process continues in the background.",
    evidenceLabels: Object.freeze([
      "Wall time",
      "Sampled peak memory",
      "Sampled peak processes",
      "User output",
      "Executed nodes",
      "Instrumented operations",
    ] as const),
    events: "Real Events",
    eventsAria: "Recent real execution events",
    emptyEvents: "No events yet. Only backend-confirmed real traces appear after starting.",
    sampled: "sampled",
    noSample: "No valid sample",
    operationSuffix: "real Trace events",
    referenceActive: "Reference budget used",
    referenceTerminal: "Measured/reference work ratio",
    referenceIdle: "Reference work",
    referenceUnavailable: "unavailable (no same-size reference)",
    chartEmptyCaption: "Execution stages",
    chartTimeCaption: "Execution stages · event time span",
    chartSequenceCaption: "Execution stages · event order",
    chartEmpty: "Waiting for real Trace events",
    chartGuideSummary: "How to read",
    chartGuideItems: Object.freeze([
      Object.freeze([
        "Horizontal",
        "Event order; time mode covers only the span between the first and last Trace events.",
      ] as const),
      Object.freeze(["Vertical", "Cumulative backend-confirmed real Trace events."] as const),
      Object.freeze([
        "Markers",
        "Small points are statements; larger points are true / false branch outcomes.",
      ] as const),
      Object.freeze(["Dashed line", "Reference work for the same input size."] as const),
      Object.freeze([
        "Evidence limit",
        "Measured/reference is not a speed score and cannot prove Big-O by itself.",
      ] as const),
    ]),
    line: "line",
    branch: "branch",
    statement: "statement",
    steps: "steps",
    items: "events",
    recentItems: (visible: number) => `showing the latest ${String(visible)} events`,
    countUnit: "events",
    initialStatus: "No real execution trace has started.",
  }),
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
  const showStartButton = options.showStartButton !== false;
  const ownsStartButton = options.primaryStartButton === undefined;
  const start = options.primaryStartButton ?? button(ownerDocument, "观察路径", "start");
  const initialPrimaryState = ownsStartButton
    ? null
    : Object.freeze({
        textContent: start.textContent,
        disabled: start.disabled,
        hidden: start.hidden,
      });
  start.dataset.traceAction = "start";
  const cancel = button(ownerDocument, "取消", "cancel");
  const playback = button(ownerDocument, "暂停回放", "playback");
  controls.append(...(ownsStartButton && showStartButton ? [start] : []), cancel, playback);

  const visual = ownerDocument.createElement("figure");
  visual.className = "trace-panel__visual";
  visual.tabIndex = -1;
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

  const chartGuide = ownerDocument.createElement("details");
  chartGuide.className = "trace-panel__chart-guide";
  chartGuide.dataset.chartGuide = "trace";
  const chartGuideSummary = ownerDocument.createElement("summary");
  const chartGuideList = ownerDocument.createElement("dl");
  chartGuide.append(chartGuideSummary, chartGuideList);

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
  const evidenceRows = Object.freeze([duration, memory, processes, output, executed, operations]);

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
    chartGuide,
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
  const localeHost =
    typeof root.closest === "function"
      ? root.closest<HTMLElement>("[data-locale], #workbench-shell")
      : null;
  const getLocale = (): InterfaceLocale => (localeHost?.dataset.locale === "en" ? "en" : "zh-CN");
  const getCopy = (): TracePanelCopy => TRACE_PANEL_COPY[getLocale()];

  const applyStaticCopy = (): void => {
    const copy = getCopy();
    root.setAttribute("aria-label", copy.rootAria);
    title.textContent = copy.title;
    if (ownsStartButton) start.textContent = copy.observe;
    cancel.textContent = copy.cancel;
    visual.setAttribute("aria-label", copy.visualAria);
    chartGuideSummary.textContent = copy.chartGuideSummary;
    renderReadingGuide(ownerDocument, chartGuideList, copy.chartGuideItems);
    safety.textContent = copy.safety;
    for (let index = 0; index < evidenceRows.length; index += 1) {
      const row = evidenceRows[index];
      const label = copy.evidenceLabels[index];
      if (row !== undefined && label !== undefined) row.term.textContent = label;
    }
    eventTitle.textContent = copy.events;
    eventList.setAttribute("aria-label", copy.eventsAria);
    empty.textContent = copy.emptyEvents;
  };

  const renderProgressiveVisibility = (): void => {
    const active = isActiveTraceStatus(currentState.status);
    const hasEvents = currentEvents.length > 0;
    const playbackEnabled = tracePlaybackControlEnabled(
      currentState.status,
      currentState.playbackPaused,
    );
    start.hidden = !showStartButton || (ownsStartButton && active);
    cancel.hidden = !active;
    playback.hidden = !playbackEnabled;
    const startVisibleInControls = ownsStartButton && showStartButton && !start.hidden;
    controls.hidden = !startVisibleInControls && cancel.hidden && playback.hidden;
    safety.hidden = !active && !currentState.playbackPaused;
    visual.hidden = !hasEvents;
    chartGuide.hidden = !hasEvents;
    eventHeader.hidden = !hasEvents;
    eventList.hidden = !hasEvents;
    referenceSummary.hidden = currentReference === null && !hasEvents;
  };

  const renderState = (): void => {
    const locale = getLocale();
    const copy = TRACE_PANEL_COPY[locale];
    applyStaticCopy();
    const presentation = traceStatusPresentation(currentState.status, locale);
    root.dataset.status = currentState.status;
    root.dataset.playbackPaused = String(currentState.playbackPaused);
    badge.dataset.tone = presentation.tone;
    badge.textContent = `${presentation.icon} ${presentation.label}`;
    status.textContent = tracePanelStateMessage(currentState, locale);
    const active =
      currentState.status === "preparing" ||
      currentState.status === "running" ||
      currentState.status === "branch";
    start.disabled = active;
    if (!ownsStartButton) {
      start.textContent = active ? copy.observing : copy.observe;
      start.dataset.traceActive = String(active);
      start.setAttribute("aria-busy", String(active));
    }
    cancel.disabled = !active;
    playback.disabled = !tracePlaybackControlEnabled(
      currentState.status,
      currentState.playbackPaused,
    );
    playback.textContent = currentState.playbackPaused ? copy.resumePlayback : copy.pausePlayback;
    playback.setAttribute("aria-pressed", String(currentState.playbackPaused));
    const runEvidence = currentState.evidence;
    evidence.hidden = runEvidence === null;
    if (runEvidence !== null) {
      duration.value.textContent = `${formatNumber(runEvidence.durationMs)} ms`;
      memory.value.textContent =
        runEvidence.peakProcessCount > 0
          ? getLocale() === "en"
            ? `${formatBytes(runEvidence.peakRssBytes)} (${copy.sampled})`
            : `${formatBytes(runEvidence.peakRssBytes)}（${copy.sampled}）`
          : copy.noSample;
      processes.value.textContent =
        runEvidence.peakProcessCount > 0
          ? getLocale() === "en"
            ? `${String(runEvidence.peakProcessCount)} (${copy.sampled})`
            : `${String(runEvidence.peakProcessCount)}（${copy.sampled}）`
          : copy.noSample;
      output.value.textContent = formatBytes(runEvidence.outputBytes);
      executed.value.textContent = String(runEvidence.executedNodeCount);
      operations.value.textContent =
        getLocale() === "en"
          ? `${String(runEvidence.operationCount)} (${copy.operationSuffix})`
          : `${String(runEvidence.operationCount)}（${copy.operationSuffix}）`;
    }
    eventCount.textContent = eventCountLabel(currentState.eventCount, currentEvents.length, copy);
    renderProgressiveVisibility();
    renderReference();
    renderChart();
  };

  const renderEvents = (): void => {
    const copy = getCopy();
    eventList.replaceChildren();
    const visible = selectTracePanelEvents(currentEvents);
    if (visible.length === 0) {
      const nextEmpty = empty.cloneNode(true);
      eventList.append(nextEmpty);
    } else {
      for (const event of visible) eventList.append(renderEvent(ownerDocument, event, copy));
    }
    eventCount.textContent = eventCountLabel(currentState.eventCount, visible.length, copy);
    renderProgressiveVisibility();
    renderReference();
    renderChart();
  };

  const renderReference = (): void => {
    const copy = getCopy();
    const english = getLocale() === "en";
    const active = isActiveTraceStatus(currentState.status);
    const terminal = isTerminalTracePanelStatus(currentState.status);
    const prefix = active
      ? copy.referenceActive
      : terminal
        ? copy.referenceTerminal
        : copy.referenceIdle;
    if (currentReference === null) {
      referenceSummary.dataset.available = "false";
      referenceSummary.textContent = english
        ? `${prefix}: ${copy.referenceUnavailable}`
        : `${prefix}：${copy.referenceUnavailable}`;
      renderProgressiveVisibility();
      return;
    }
    const observed = observedOperationCount(currentState, currentEvents);
    referenceSummary.dataset.available = "true";
    referenceSummary.dataset.referenceLabel = currentReference.label;
    referenceSummary.dataset.inputSize = String(currentReference.inputSize);
    if (active || terminal) {
      const ratio = observed / currentReference.referenceOperationCount;
      referenceSummary.textContent = english
        ? `${prefix}: ${formatRatio(ratio)}× (${formatNumber(observed)} / ${formatNumber(currentReference.referenceOperationCount)}) · n=${formatNumber(currentReference.inputSize)} · ${currentReference.label}`
        : `${prefix}：${formatRatio(ratio)}×（${formatNumber(observed)} / ${formatNumber(currentReference.referenceOperationCount)}）· n=${formatNumber(currentReference.inputSize)} · ${currentReference.label}`;
      renderProgressiveVisibility();
      return;
    }
    referenceSummary.textContent = english
      ? `${prefix}: ${formatNumber(currentReference.referenceOperationCount)} ${copy.countUnit} · n=${formatNumber(currentReference.inputSize)} · ${currentReference.label}`
      : `${prefix}：${formatNumber(currentReference.referenceOperationCount)} ${copy.countUnit} · n=${formatNumber(currentReference.inputSize)} · ${currentReference.label}`;
    renderProgressiveVisibility();
  };

  const renderChart = (): void => {
    const copy = getCopy();
    chart.replaceChildren();
    const events = chartEvents;
    const xMode = traceChartXAxisMode(events, options.chartXAxisMode ?? "sequence");
    const timeDomain = traceChartTimeDomain(events);
    chart.dataset.xMode = xMode;
    chart.dataset.eventSpanMs = formatNumber(timeDomain.spanMs);
    const observedMax = Math.max(
      events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0),
      observedOperationCount(currentState, currentEvents),
    );
    const referenceMax = currentReference?.referenceOperationCount ?? 0;
    const operationMax = Math.max(observedMax, referenceMax, 1);
    chartCaption.textContent =
      events.length === 0
        ? copy.chartEmptyCaption
        : xMode === "time"
          ? copy.chartTimeCaption
          : copy.chartSequenceCaption;
    chart.setAttribute(
      "aria-label",
      xMode === "time" ? copy.chartTimeAria : copy.chartSequenceAria,
    );
    appendChartAxes(
      ownerDocument,
      chart,
      timeDomain.spanMs,
      operationMax,
      xMode,
      events.length,
      copy,
    );
    if (currentReference !== null) {
      appendReferenceLine(ownerDocument, chart, currentReference, operationMax, copy);
    }
    if (events.length === 0) {
      const emptyChart = svg(ownerDocument, "text");
      emptyChart.setAttribute("class", "trace-panel__chart-empty");
      emptyChart.setAttribute("x", String(TRACE_CHART_LEFT));
      emptyChart.setAttribute("y", String(TRACE_CHART_HEIGHT / 2));
      emptyChart.textContent = copy.chartEmpty;
      chart.append(emptyChart);
      chart.dataset.pointCount = "0";
      return;
    }
    const coordinates = events.map((event, index) =>
      chartCoordinate(event, index, events.length, xMode, timeDomain, operationMax),
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
          ? `${copy.line} ${String(event.line)} · ${copy.branch} ${String(event.branchTaken)} · ${formatNumber(event.elapsedMs)} ms`
          : `${copy.line} ${String(event.line)} · ${copy.statement} · ${formatNumber(event.elapsedMs)} ms`;
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
  const onLocaleChange = (): void => {
    renderState();
    renderEvents();
  };
  if (showStartButton) start.addEventListener("click", onStart);
  cancel.addEventListener("click", onCancel);
  playback.addEventListener("click", onPlayback);
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);

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
      if (showStartButton) start.removeEventListener("click", onStart);
      cancel.removeEventListener("click", onCancel);
      playback.removeEventListener("click", onPlayback);
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      if (initialPrimaryState !== null) {
        start.textContent = initialPrimaryState.textContent;
        start.disabled = initialPrimaryState.disabled;
        start.hidden = initialPrimaryState.hidden;
        start.dataset.traceActive = "false";
        start.setAttribute("aria-busy", "false");
      }
      root.remove();
    },
  });
}

export function traceStatusPresentation(
  status: TracePanelStatus,
  locale: InterfaceLocale = "zh-CN",
): TraceStatusPresentation {
  const presentation = STATUS_ICONS[status];
  return Object.freeze({
    ...presentation,
    label: TRACE_PANEL_COPY[locale].statusLabels[status],
  });
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

export function formatTraceEvent(event: TraceEvent, locale: InterfaceLocale = "zh-CN"): string {
  const copy = TRACE_PANEL_COPY[locale];
  const prefix = `#${String(event.sequence)} · ${copy.line} ${String(event.line)}`;
  const kind =
    event.kind === "branch"
      ? `${copy.branch} ${event.branchTaken === true ? "true" : "false"}`
      : copy.statement;
  return `${prefix} · ${kind} · ${formatNumber(event.elapsedMs)} ms`;
}

/**
 * Controller messages predate the locale layer and are intentionally kept out of the persisted
 * trace contract. Translate the bounded renderer-owned states here; never expose a localized
 * backend error verbatim when it could contain another interface language.
 */
export function tracePanelStateMessage(state: TracePanelState, locale: InterfaceLocale): string {
  const copy = TRACE_PANEL_COPY[locale];
  if (locale !== "en") {
    return isInitialTraceMessage(state.message) ? copy.initialStatus : state.message;
  }
  if (isInitialTraceMessage(state.message)) return copy.initialStatus;
  if (!containsHan(state.message)) return state.message;

  const branch = /第\s*(\d+)\s*行.*?(true|false)/u.exec(state.message);
  if (state.status === "branch" && branch !== null) {
    return `Real branch: line ${branch[1]!} evaluated to ${branch[2]!}.`;
  }
  if (state.status === "completed") {
    return state.evidence === null
      ? "Real Trace completed."
      : `Real Trace completed in ${formatNumber(state.evidence.durationMs)} ms with a peak RSS of ${formatBytes(state.evidence.peakRssBytes)}.`;
  }
  if (state.status === "cancelled") return "Trace cancelled.";
  if (state.status === "truncated") return "Trace reached its safety limit and was truncated.";
  if (state.status === "unsupported") {
    const line = state.unsupported?.line;
    return line === null || line === undefined
      ? "This source layout cannot be traced reliably."
      : `This source layout cannot be traced reliably near line ${String(line)}.`;
  }
  if (state.status === "resource") return "Trace stopped because it reached a resource limit.";
  if (state.status === "error") return "Trace could not be completed.";
  if (state.playbackPaused) return "The C process is still running; visual playback is paused.";
  if (state.status === "preparing") {
    return state.sessionId === null
      ? "Preparing the temporary shadow Trace…"
      : "Trace session established; waiting for real events…";
  }
  if (state.status === "running") return "Receiving the real execution trace…";
  return copy.initialStatus;
}

function renderEvent(
  ownerDocument: Document,
  event: TraceEvent,
  copy: TracePanelCopy,
): HTMLLIElement {
  const item = ownerDocument.createElement("li");
  item.className = "trace-panel__event";
  item.dataset.sequence = String(event.sequence);
  item.dataset.kind = event.kind;
  item.dataset.traceMode = "real";
  if (event.kind === "branch") item.dataset.branchTaken = String(event.branchTaken);
  const locale = copy === TRACE_PANEL_COPY.en ? "en" : "zh-CN";
  item.textContent = formatTraceEvent(event, locale);
  return item;
}

function appendChartAxes(
  ownerDocument: Document,
  chart: SVGSVGElement,
  eventSpanMs: number,
  operationMax: number,
  xMode: TraceChartXAxisMode,
  eventCount: number,
  copy: TracePanelCopy,
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
    xMode === "time" ? `${formatNumber(eventSpanMs)} ms` : `${String(eventCount)} ${copy.steps}`;
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
  copy: TracePanelCopy,
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
  title.textContent =
    copy === TRACE_PANEL_COPY.en
      ? `${reference.label}: ${formatNumber(reference.referenceOperationCount)} ${copy.countUnit}, n=${formatNumber(reference.inputSize)}`
      : `${reference.label}：${formatNumber(reference.referenceOperationCount)} ${copy.countUnit}，n=${formatNumber(reference.inputSize)}`;
  line.append(title);
  chart.append(line);
}

function chartCoordinate(
  event: TraceEvent,
  index: number,
  eventCount: number,
  xMode: TraceChartXAxisMode,
  timeDomain: TraceChartTimeDomain,
  operationMax: number,
): Readonly<{ x: number; y: number }> {
  const plotWidth = TRACE_CHART_WIDTH - TRACE_CHART_LEFT - TRACE_CHART_RIGHT;
  const horizontalRatio =
    xMode === "time"
      ? clamp((event.elapsedMs - timeDomain.startMs) / Math.max(timeDomain.spanMs, 1), 0, 1)
      : eventCount <= 1
        ? 0.5
        : clamp(index / (eventCount - 1), 0, 1);
  return Object.freeze({
    x: TRACE_CHART_LEFT + horizontalRatio * plotWidth,
    y: operationY(event.sequence, operationMax),
  });
}

export function traceChartXAxisMode(
  events: readonly TraceEvent[],
  preferred: TraceChartXAxisMode = "sequence",
): TraceChartXAxisMode {
  if (preferred !== "time" || events.length <= 1) return "sequence";
  return traceChartTimeDomain(events).spanMs > 0 ? "time" : "sequence";
}

/** The time view deliberately excludes process wall time so short event bursts never collapse. */
export function traceChartTimeDomain(events: readonly TraceEvent[]): TraceChartTimeDomain {
  const elapsed = events.filter(isFiniteTraceEvent).map((event) => event.elapsedMs);
  if (elapsed.length === 0) {
    return Object.freeze({ startMs: 0, endMs: 0, spanMs: 0 });
  }
  const startMs = Math.min(...elapsed);
  const endMs = Math.max(...elapsed);
  return Object.freeze({ startMs, endMs, spanMs: endMs - startMs });
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
): Readonly<{ term: HTMLElement; value: HTMLElement }> {
  const row = ownerDocument.createElement("div");
  row.className = "trace-panel__evidence-row";
  const term = ownerDocument.createElement("dt");
  term.textContent = label;
  const value = ownerDocument.createElement("dd");
  value.dataset.traceField = field;
  row.append(term, value);
  list.append(row);
  return Object.freeze({ term, value });
}

function renderReadingGuide(
  ownerDocument: Document,
  list: HTMLDListElement,
  items: readonly (readonly [string, string])[],
): void {
  list.replaceChildren();
  for (const [label, description] of items) {
    const row = ownerDocument.createElement("div");
    const term = ownerDocument.createElement("dt");
    term.textContent = label;
    const detail = ownerDocument.createElement("dd");
    detail.textContent = description;
    row.append(term, detail);
    list.append(row);
  }
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

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function eventCountLabel(total: number, visible: number, copy: TracePanelCopy): string {
  if (total <= visible) return `${String(total)} ${copy.items}`;
  return `${String(total)} ${copy.items} · ${copy.recentItems(visible)}`;
}

function isInitialTraceMessage(message: string): boolean {
  return Object.values(TRACE_PANEL_COPY).some((copy) => copy.initialStatus === message);
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_024 * 1_024) return `${formatNumber(bytes / 1_024)} KiB`;
  return `${formatNumber(bytes / (1_024 * 1_024))} MiB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function containsHan(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
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
