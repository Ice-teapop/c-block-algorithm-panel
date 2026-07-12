import type { MentorHintTarget } from "../mentor/index.js";
import type { PanelApi } from "../shared/api.js";
import type { AiProviderPublicConfig } from "../shared/ai-provider.js";
import type { MentorRemoteContext } from "./mentor-panel.js";

export type AnalysisMetric = "duration" | "operations";
export type AnalysisEvidenceState = "passed" | "failed" | "pending";

export interface AnalysisTrendPoint {
  readonly inputSize: number;
  readonly sampleCount: number;
  readonly medianDurationMs: number | null;
  readonly minDurationMs: number | null;
  readonly maxDurationMs: number | null;
  readonly medianOperationCount: number | null;
  readonly minOperationCount: number | null;
  readonly maxOperationCount: number | null;
  readonly medianPeakRssBytes: number | null;
  readonly referenceOperationCount: number | null;
}

export interface AnalysisEvidenceCriterion {
  readonly id: string;
  readonly label: string;
  readonly state: AnalysisEvidenceState;
  readonly detail: string;
}

export interface AnalysisHotspot {
  readonly nodeId: string;
  readonly label: string;
  readonly count: number;
  readonly share: number;
  readonly target: MentorHintTarget;
}

export interface AnalysisDashboardState {
  readonly sourceFingerprint: string | null;
  readonly statusMessage: string;
  readonly scenarioLabel: string;
  readonly referenceLabel: string | null;
  readonly trendEvidence: string;
  readonly trendPoints: readonly AnalysisTrendPoint[];
  readonly criteria: readonly AnalysisEvidenceCriterion[];
  readonly branchCovered: number;
  readonly branchTotal: number;
  readonly hotspots: readonly AnalysisHotspot[];
}

type AnalysisRemoteApi = Pick<
  PanelApi,
  "getAiProviderConfig" | "startAiMentor" | "readAiMentor" | "cancelAiMentor"
>;

export interface AnalysisDashboardOptions {
  readonly remoteApi?: AnalysisRemoteApi | undefined;
  readonly onLocate?: ((target: MentorHintTarget) => void) | undefined;
}

export interface AnalysisDashboard {
  readonly element: HTMLElement;
  setState(state: AnalysisDashboardState): void;
  setRemoteContext(context: MentorRemoteContext | null): void;
  destroy(): void;
}

interface AiAssessment {
  readonly status: "complete" | "partial" | "not-ready";
  readonly confidence: "low" | "medium" | "high";
  readonly observation: string;
  readonly evidence: readonly string[];
  readonly gaps: readonly string[];
  readonly nextExperiment: string;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_WIDTH = 760;
const CHART_HEIGHT = 286;
const CHART_MARGIN = Object.freeze({ top: 20, right: 22, bottom: 42, left: 62 });
const AI_POLL_INTERVAL_MS = 180;

export function createAnalysisDashboard(
  host: HTMLElement,
  options: AnalysisDashboardOptions = {},
): AnalysisDashboard {
  const document = host.ownerDocument;
  const root = document.createElement("section");
  root.className = "analysis-dashboard";

  const header = document.createElement("header");
  header.className = "analysis-dashboard__header";
  const headingGroup = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "analysis-dashboard__eyebrow";
  eyebrow.textContent = "EVIDENCE ANALYSIS";
  const heading = document.createElement("h1");
  heading.textContent = "分析";
  const status = document.createElement("output");
  status.className = "analysis-dashboard__status";
  status.setAttribute("aria-live", "polite");
  headingGroup.append(eyebrow, heading, status);
  const identity = document.createElement("div");
  identity.className = "analysis-dashboard__identity";
  header.append(headingGroup, identity);

  const summary = document.createElement("dl");
  summary.className = "analysis-dashboard__summary";
  const summaryFields = new Map<string, HTMLElement>();
  for (const [id, label] of [
    ["completion", "确定性证据"],
    ["sizes", "输入规模"],
    ["coverage", "分支覆盖"],
    ["reference", "参考增长"],
  ] as const) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const value = document.createElement("dd");
    value.dataset.analysisSummary = id;
    row.append(term, value);
    summary.append(row);
    summaryFields.set(id, value);
  }

  const main = document.createElement("div");
  main.className = "analysis-dashboard__main";
  const trendSection = analysisSection(document, "性能增长", "输入规模 n → 中位实测值");
  trendSection.root.classList.add("analysis-dashboard__trend");
  const metricTabs = document.createElement("div");
  metricTabs.className = "analysis-dashboard__metric-tabs";
  metricTabs.setAttribute("role", "tablist");
  const durationTab = metricButton(document, "耗时", "duration", true);
  const operationsTab = metricButton(document, "操作次数", "operations", false);
  metricTabs.append(durationTab, operationsTab);
  trendSection.header.append(metricTabs);
  const chartFrame = document.createElement("div");
  chartFrame.className = "analysis-dashboard__chart-frame";
  const chart = svg(document, "svg");
  chart.classList.add("analysis-dashboard__chart");
  chart.setAttribute("viewBox", `0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`);
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", "输入规模与运行指标趋势");
  const chartEmpty = document.createElement("p");
  chartEmpty.className = "analysis-dashboard__empty";
  chartFrame.append(chart, chartEmpty);
  const trendEvidence = document.createElement("p");
  trendEvidence.className = "analysis-dashboard__evidence";
  trendSection.body.append(chartFrame, trendEvidence);

  const lower = document.createElement("div");
  lower.className = "analysis-dashboard__lower";
  const completionSection = analysisSection(document, "问题完成度", "确定性结果与 AI 建议分开");
  const completionList = document.createElement("ol");
  completionList.className = "analysis-dashboard__criteria";
  completionSection.body.append(completionList);

  const pathSection = analysisSection(document, "路径与热点", "真实 Trace 证据");
  const coverage = document.createElement("div");
  coverage.className = "analysis-dashboard__coverage";
  const coverageLabel = document.createElement("span");
  const coverageProgress = document.createElement("progress");
  coverageProgress.max = 1;
  coverageProgress.value = 0;
  coverage.append(coverageLabel, coverageProgress);
  const hotspotList = document.createElement("ol");
  hotspotList.className = "analysis-dashboard__hotspots";
  pathSection.body.append(coverage, hotspotList);

  const memorySection = analysisSection(document, "内存趋势", "峰值 RSS，不等同于堆内存");
  const memoryBars = document.createElement("div");
  memoryBars.className = "analysis-dashboard__memory-bars";
  memorySection.body.append(memoryBars);

  const aiSection = analysisSection(document, "AI 语义复核", "用户触发 · 只读建议");
  aiSection.root.classList.add("analysis-dashboard__ai");
  const aiStatus = document.createElement("output");
  aiStatus.className = "analysis-dashboard__ai-status";
  aiStatus.setAttribute("aria-live", "polite");
  const aiAction = document.createElement("button");
  aiAction.type = "button";
  aiAction.className = "analysis-dashboard__ai-action";
  aiAction.textContent = "生成 AI 复核";
  const aiResult = document.createElement("div");
  aiResult.className = "analysis-dashboard__ai-result";
  aiResult.hidden = true;
  aiSection.body.append(aiStatus, aiAction, aiResult);

  main.append(trendSection.root, lower);
  lower.append(completionSection.root, pathSection.root, memorySection.root, aiSection.root);
  root.append(header, summary, main);
  host.replaceChildren(root);

  let state = emptyAnalysisDashboardState();
  let metric: AnalysisMetric = "duration";
  let remoteContext: MentorRemoteContext | null = null;
  let remoteConfig: AiProviderPublicConfig | null = null;
  let activeSessionId: string | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let requestGeneration = 0;
  let nextSequence = 0;
  let answer = "";
  let destroyed = false;

  const render = (): void => {
    status.textContent = state.statusMessage;
    identity.textContent =
      state.sourceFingerprint === null
        ? "未绑定源码"
        : `${state.scenarioLabel} · ${state.sourceFingerprint.slice(0, 12)}`;
    const passed = state.criteria.filter((criterion) => criterion.state === "passed").length;
    const failed = state.criteria.filter((criterion) => criterion.state === "failed").length;
    summaryFields.get("completion")!.textContent =
      `${String(passed)} / ${String(state.criteria.length)}${failed > 0 ? ` · ${String(failed)} 待处理` : ""}`;
    summaryFields.get("sizes")!.textContent =
      state.trendPoints.length === 0 ? "数据不足" : `${String(state.trendPoints.length)} 组`;
    summaryFields.get("coverage")!.textContent =
      state.branchTotal === 0
        ? "无结构分支"
        : `${String(state.branchCovered)} / ${String(state.branchTotal)}`;
    summaryFields.get("reference")!.textContent = state.referenceLabel ?? "未确认";
    renderTrend();
    renderCriteria();
    renderCoverageAndHotspots();
    renderMemory();
  };

  const renderTrend = (): void => {
    durationTab.setAttribute("aria-selected", String(metric === "duration"));
    operationsTab.setAttribute("aria-selected", String(metric === "operations"));
    chart.replaceChildren();
    const values = state.trendPoints.flatMap((point) => {
      const value = metric === "duration" ? point.medianDurationMs : point.medianOperationCount;
      if (value === null || !Number.isFinite(value) || value < 0) return [];
      const minimum =
        metric === "duration" ? (point.minDurationMs ?? value) : (point.minOperationCount ?? value);
      const maximum =
        metric === "duration" ? (point.maxDurationMs ?? value) : (point.maxOperationCount ?? value);
      return [{ point, value, minimum, maximum }];
    });
    chartEmpty.hidden = values.length > 0;
    chartEmpty.textContent =
      metric === "duration"
        ? "至少运行一个带输入规模的真实案例后显示耗时趋势。"
        : "至少运行三个输入规模的 Benchmark 后判断操作增长。";
    trendEvidence.textContent = `${state.trendEvidence}${metric === "operations" ? " 实测拟合不等于 Big-O 证明。" : " 墙钟耗时会受到系统负载影响。"}`;
    if (values.length === 0) return;

    const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
    const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
    const minX = Math.min(...values.map(({ point }) => point.inputSize));
    const maxX = Math.max(...values.map(({ point }) => point.inputSize));
    const referenceValues =
      metric === "operations"
        ? values.flatMap(({ point }) =>
            point.referenceOperationCount === null ? [] : [point.referenceOperationCount],
          )
        : [];
    const maxY = Math.max(1, ...values.map(({ maximum }) => maximum), ...referenceValues);
    const x = (value: number): number =>
      CHART_MARGIN.left +
      (maxX === minX ? plotWidth / 2 : ((value - minX) / (maxX - minX)) * plotWidth);
    const y = (value: number): number =>
      CHART_MARGIN.top + plotHeight - (value / maxY) * plotHeight;

    appendAxes(document, chart, maxY, metric, plotWidth, plotHeight);
    for (const { point, value, minimum, maximum } of values) {
      const range = svg(document, "line");
      range.classList.add("analysis-dashboard__range");
      setSvgAttributes(range, {
        x1: x(point.inputSize),
        x2: x(point.inputSize),
        y1: y(minimum),
        y2: y(maximum),
      });
      chart.append(range);
      const label = svg(document, "text");
      label.classList.add("analysis-dashboard__axis-label");
      label.textContent = String(point.inputSize);
      setSvgAttributes(label, { x: x(point.inputSize), y: CHART_HEIGHT - 17 });
      chart.append(label);
      const dot = svg(document, "circle");
      dot.classList.add("analysis-dashboard__point");
      setSvgAttributes(dot, { cx: x(point.inputSize), cy: y(value), r: 4 });
      const title = svg(document, "title");
      title.textContent = `n=${String(point.inputSize)} · 中位数 ${formatMetric(value, metric)} · ${String(point.sampleCount)} 个样本`;
      dot.append(title);
      chart.append(dot);
    }
    const measured = svg(document, "polyline");
    measured.classList.add("analysis-dashboard__line");
    measured.setAttribute(
      "points",
      values
        .map(({ point, value }) => `${String(x(point.inputSize))},${String(y(value))}`)
        .join(" "),
    );
    chart.append(measured);

    if (metric === "operations" && referenceValues.length >= 2) {
      const reference = svg(document, "polyline");
      reference.classList.add("analysis-dashboard__reference-line");
      reference.setAttribute(
        "points",
        values
          .flatMap(({ point }) =>
            point.referenceOperationCount === null
              ? []
              : [`${String(x(point.inputSize))},${String(y(point.referenceOperationCount))}`],
          )
          .join(" "),
      );
      chart.append(reference);
    }
  };

  const renderCriteria = (): void => {
    completionList.replaceChildren();
    for (const criterion of state.criteria) {
      const item = document.createElement("li");
      item.dataset.state = criterion.state;
      const marker = document.createElement("span");
      marker.className = "analysis-dashboard__criterion-marker";
      marker.textContent =
        criterion.state === "passed" ? "通过" : criterion.state === "failed" ? "处理" : "待证";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = criterion.label;
      const detail = document.createElement("span");
      detail.textContent = criterion.detail;
      copy.append(title, detail);
      item.append(marker, copy);
      completionList.append(item);
    }
  };

  const renderCoverageAndHotspots = (): void => {
    coverageLabel.textContent =
      state.branchTotal === 0
        ? "当前函数没有结构分支"
        : `真实经过 ${String(state.branchCovered)} / ${String(state.branchTotal)} 条分支出口`;
    coverageProgress.max = Math.max(1, state.branchTotal);
    coverageProgress.value = Math.min(state.branchCovered, state.branchTotal);
    hotspotList.replaceChildren();
    if (state.hotspots.length === 0) {
      const empty = document.createElement("li");
      empty.className = "analysis-dashboard__empty";
      empty.textContent = "完成一次真实 Trace 后显示热点节点。";
      hotspotList.append(empty);
      return;
    }
    for (const hotspot of state.hotspots.slice(0, 6)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "analysis-dashboard__hotspot";
      button.addEventListener("click", () => options.onLocate?.(hotspot.target));
      const label = document.createElement("span");
      label.textContent = hotspot.label;
      const value = document.createElement("span");
      value.textContent = `${String(hotspot.count)} 次 · ${(hotspot.share * 100).toFixed(1)}%`;
      const bar = document.createElement("span");
      bar.className = "analysis-dashboard__hotspot-bar";
      bar.style.setProperty(
        "--hotspot-share",
        `${String(Math.max(0, Math.min(1, hotspot.share)) * 100)}%`,
      );
      button.append(label, value, bar);
      item.append(button);
      hotspotList.append(item);
    }
  };

  const renderMemory = (): void => {
    memoryBars.replaceChildren();
    const points = state.trendPoints.filter(
      (point): point is AnalysisTrendPoint & { readonly medianPeakRssBytes: number } =>
        point.medianPeakRssBytes !== null && point.medianPeakRssBytes >= 0,
    );
    if (points.length === 0) {
      const empty = document.createElement("p");
      empty.className = "analysis-dashboard__empty";
      empty.textContent = "尚未取得跨规模 RSS 样本。";
      memoryBars.append(empty);
      return;
    }
    const max = Math.max(1, ...points.map((point) => point.medianPeakRssBytes));
    for (const point of points) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = `n=${String(point.inputSize)}`;
      const bar = document.createElement("span");
      bar.className = "analysis-dashboard__memory-bar";
      bar.style.setProperty("--memory-share", `${String((point.medianPeakRssBytes / max) * 100)}%`);
      const value = document.createElement("span");
      value.textContent = formatBytes(point.medianPeakRssBytes);
      row.append(label, bar, value);
      memoryBars.append(row);
    }
  };

  const stopPoll = (): void => {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  };

  const cancelAi = (): void => {
    requestGeneration += 1;
    stopPoll();
    const sessionId = activeSessionId;
    activeSessionId = null;
    nextSequence = 0;
    answer = "";
    aiAction.disabled = false;
    if (sessionId !== null && options.remoteApi !== undefined) {
      void options.remoteApi.cancelAiMentor({ sessionId });
    }
  };

  const pollAi = async (generation: number, fingerprint: string): Promise<void> => {
    if (
      destroyed ||
      generation !== requestGeneration ||
      activeSessionId === null ||
      options.remoteApi === undefined
    ) {
      return;
    }
    const sessionId = activeSessionId;
    try {
      const result = await options.remoteApi.readAiMentor({
        sessionId,
        afterSequence: nextSequence,
      });
      if (
        destroyed ||
        generation !== requestGeneration ||
        activeSessionId !== sessionId ||
        remoteContext?.sourceFingerprint !== fingerprint
      ) {
        return;
      }
      if (result.status === "failed") {
        aiStatus.textContent = result.error.message;
        aiStatus.dataset.state = "error";
        cancelAi();
        return;
      }
      if (result.sourceFingerprint !== fingerprint) {
        aiStatus.textContent = "源码已变化，旧 AI 评估已丢弃。";
        aiStatus.dataset.state = "error";
        cancelAi();
        return;
      }
      nextSequence = result.nextSequence;
      for (const event of result.events) if (event.kind === "answer") answer += event.text;
      if (result.status === "running") {
        pollTimer = setTimeout(() => void pollAi(generation, fingerprint), AI_POLL_INTERVAL_MS);
        return;
      }
      activeSessionId = null;
      aiAction.disabled = false;
      if (result.status === "cancelled") {
        aiStatus.textContent = "AI 评估已取消。";
        return;
      }
      const assessment = parseAiAssessment(answer);
      if (assessment === null) {
        aiStatus.textContent = "AI 返回格式无效，已拒绝作为完成度证据。";
        aiStatus.dataset.state = "error";
        return;
      }
      aiStatus.textContent = `AI 语义状态：${assessmentStatusLabel(assessment.status)} · ${assessment.confidence} 置信度`;
      aiStatus.dataset.state = "ready";
      renderAiAssessment(document, aiResult, assessment);
    } catch {
      if (!destroyed && generation === requestGeneration) {
        aiStatus.textContent = "无法读取 AI 评估。";
        aiStatus.dataset.state = "error";
        cancelAi();
      }
    }
  };

  const requestAiAssessment = async (): Promise<void> => {
    if (
      options.remoteApi === undefined ||
      remoteContext === null ||
      state.sourceFingerprint === null
    ) {
      aiStatus.textContent = "需要当前函数和运行证据后才能请求 AI 复核。";
      aiStatus.dataset.state = "error";
      return;
    }
    cancelAi();
    aiResult.hidden = true;
    aiStatus.textContent = "正在确认 AI 连接…";
    aiStatus.dataset.state = "working";
    aiAction.disabled = true;
    const generation = requestGeneration;
    const fingerprint = remoteContext.sourceFingerprint;
    try {
      const configResult = await options.remoteApi.getAiProviderConfig();
      if (destroyed || generation !== requestGeneration) return;
      remoteConfig = configResult.status === "ready" ? configResult.config : null;
      if (!aiConfigReady(remoteConfig)) {
        aiAction.disabled = false;
        aiStatus.textContent = "请先在 设置 → AI 助手 中连接模型。";
        aiStatus.dataset.state = "error";
        return;
      }
      const startResult = await options.remoteApi.startAiMentor({
        sourceFingerprint: fingerprint,
        sourceRevision: remoteContext.sourceRevision,
        providerRevision: remoteConfig.revision,
        contextMode: "current-function",
        prompt: buildAssessmentPrompt(state),
        context: {
          currentFunction: remoteContext.currentFunction,
          diagnosticSummary: remoteContext.diagnosticSummary,
          controlFlowSummary: remoteContext.controlFlowSummary,
          runEvidence: remoteContext.runEvidence,
        },
      });
      if (startResult.status === "failed") {
        if (!destroyed && generation === requestGeneration) {
          aiAction.disabled = false;
          aiStatus.textContent = startResult.error.message;
          aiStatus.dataset.state = "error";
        }
        return;
      }
      if (
        destroyed ||
        generation !== requestGeneration ||
        remoteContext?.sourceFingerprint !== fingerprint
      ) {
        await options.remoteApi.cancelAiMentor({ sessionId: startResult.sessionId });
        return;
      }
      activeSessionId = startResult.sessionId;
      nextSequence = 0;
      answer = "";
      aiStatus.textContent = "AI 正在复核运行证据；不会修改源码。";
      void pollAi(generation, fingerprint);
    } catch {
      if (!destroyed && generation === requestGeneration) {
        aiAction.disabled = false;
        aiStatus.textContent = "无法启动 AI 评估。";
        aiStatus.dataset.state = "error";
      }
    }
  };

  durationTab.addEventListener("click", () => {
    metric = "duration";
    renderTrend();
  });
  operationsTab.addEventListener("click", () => {
    metric = "operations";
    renderTrend();
  });
  aiAction.addEventListener("click", () => void requestAiAssessment());
  aiStatus.textContent =
    options.remoteApi === undefined
      ? "当前构建未提供远程 AI。"
      : "连接 AI 后可生成语义完成度、边界缺口和下一步实验建议。";
  render();

  return Object.freeze({
    element: root,
    setState(next: AnalysisDashboardState): void {
      assertAlive(destroyed);
      if (next.sourceFingerprint !== state.sourceFingerprint) {
        cancelAi();
        aiResult.hidden = true;
        aiStatus.textContent = "源码已变化；等待新的 AI 复核。";
      }
      state = freezeState(next);
      render();
    },
    setRemoteContext(context: MentorRemoteContext | null): void {
      assertAlive(destroyed);
      if (context?.sourceFingerprint !== remoteContext?.sourceFingerprint) {
        cancelAi();
        aiResult.hidden = true;
      }
      remoteContext = context === null ? null : Object.freeze({ ...context });
    },
    destroy(): void {
      if (destroyed) return;
      cancelAi();
      destroyed = true;
      durationTab.replaceWith(durationTab.cloneNode(true));
      operationsTab.replaceWith(operationsTab.cloneNode(true));
      aiAction.replaceWith(aiAction.cloneNode(true));
      host.replaceChildren();
    },
  });
}

export function parseAiAssessment(value: string): AiAssessment | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 24_000) return null;
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const keys = Object.keys(parsed).sort();
  if (keys.join("|") !== "confidence|evidence|gaps|nextExperiment|observation|status") return null;
  if (
    !["complete", "partial", "not-ready"].includes(String(parsed.status)) ||
    !["low", "medium", "high"].includes(String(parsed.confidence)) ||
    !validAssessmentText(parsed.observation, 1_200) ||
    !validAssessmentText(parsed.nextExperiment, 1_200) ||
    !validAssessmentList(parsed.evidence) ||
    !validAssessmentList(parsed.gaps)
  ) {
    return null;
  }
  return Object.freeze({
    status: parsed.status as AiAssessment["status"],
    confidence: parsed.confidence as AiAssessment["confidence"],
    observation: parsed.observation,
    evidence: Object.freeze([...parsed.evidence]),
    gaps: Object.freeze([...parsed.gaps]),
    nextExperiment: parsed.nextExperiment,
  });
}

function analysisSection(document: Document, titleText: string, noteText: string) {
  const root = document.createElement("section");
  root.className = "analysis-dashboard__section";
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = titleText;
  const note = document.createElement("span");
  note.textContent = noteText;
  header.append(title, note);
  const body = document.createElement("div");
  body.className = "analysis-dashboard__section-body";
  root.append(header, body);
  return { root, header, body };
}

function metricButton(
  document: Document,
  label: string,
  metric: AnalysisMetric,
  selected: boolean,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.analysisMetric = metric;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(selected));
  return button;
}

function appendAxes(
  document: Document,
  chart: SVGSVGElement,
  maxY: number,
  metric: AnalysisMetric,
  plotWidth: number,
  plotHeight: number,
): void {
  const xAxis = svg(document, "line");
  xAxis.classList.add("analysis-dashboard__axis");
  setSvgAttributes(xAxis, {
    x1: CHART_MARGIN.left,
    x2: CHART_MARGIN.left + plotWidth,
    y1: CHART_MARGIN.top + plotHeight,
    y2: CHART_MARGIN.top + plotHeight,
  });
  const yAxis = svg(document, "line");
  yAxis.classList.add("analysis-dashboard__axis");
  setSvgAttributes(yAxis, {
    x1: CHART_MARGIN.left,
    x2: CHART_MARGIN.left,
    y1: CHART_MARGIN.top,
    y2: CHART_MARGIN.top + plotHeight,
  });
  chart.append(xAxis, yAxis);
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = CHART_MARGIN.top + plotHeight - ratio * plotHeight;
    const grid = svg(document, "line");
    grid.classList.add("analysis-dashboard__grid-line");
    setSvgAttributes(grid, {
      x1: CHART_MARGIN.left,
      x2: CHART_MARGIN.left + plotWidth,
      y1: y,
      y2: y,
    });
    const label = svg(document, "text");
    label.classList.add("analysis-dashboard__y-label");
    label.textContent = formatMetric(maxY * ratio, metric);
    setSvgAttributes(label, { x: CHART_MARGIN.left - 8, y: y + 3 });
    chart.append(grid, label);
  }
  const xTitle = svg(document, "text");
  xTitle.classList.add("analysis-dashboard__axis-title");
  xTitle.textContent = "输入规模 n";
  setSvgAttributes(xTitle, { x: CHART_MARGIN.left + plotWidth / 2, y: CHART_HEIGHT - 2 });
  chart.append(xTitle);
}

function svg<K extends keyof SVGElementTagNameMap>(
  document: Document,
  tag: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, tag);
}

function setSvgAttributes(element: SVGElement, values: Readonly<Record<string, number>>): void {
  for (const [name, value] of Object.entries(values)) element.setAttribute(name, String(value));
}

function renderAiAssessment(document: Document, host: HTMLElement, assessment: AiAssessment): void {
  host.replaceChildren();
  host.hidden = false;
  for (const [label, value] of [
    ["观察", assessment.observation],
    ["数据证据", assessment.evidence.join("；") || "AI 未指出额外证据"],
    ["缺口", assessment.gaps.join("；") || "AI 未指出额外缺口"],
    ["下一步实验", assessment.nextExperiment],
    ["不确定性", `${assessment.confidence} 置信度；AI 结论不覆盖确定性测试`],
  ] as const) {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    title.textContent = label;
    const copy = document.createElement("p");
    copy.textContent = value;
    section.append(title, copy);
    host.append(section);
  }
}

function buildAssessmentPrompt(state: AnalysisDashboardState): string {
  const criteria = state.criteria
    .map((criterion) => `${criterion.label}: ${criterion.state}; ${criterion.detail}`)
    .join("\n");
  return [
    "你是算法课程的只读审查员。只依据提供的当前函数、静态诊断、CFG摘要和真实运行证据评估语义完成情况。",
    "不得宣称数学正确性，不得虚构指标，不得建议自动修改源码。",
    `问题/情景：${state.scenarioLabel}`,
    `确定性证据：\n${criteria}`,
    `增长证据：${state.trendEvidence}`,
    "只返回一个 JSON 对象，不要 Markdown。严格字段：",
    '{"status":"complete|partial|not-ready","confidence":"low|medium|high","observation":"...","evidence":["..."],"gaps":["..."],"nextExperiment":"..."}',
  ].join("\n");
}

function aiConfigReady(config: AiProviderPublicConfig | null): config is AiProviderPublicConfig {
  return (
    config !== null &&
    config.state === "connected" &&
    config.providerId !== null &&
    config.model !== null &&
    config.credentialUsable
  );
}

function assessmentStatusLabel(status: AiAssessment["status"]): string {
  if (status === "complete") return "语义上基本完整";
  if (status === "partial") return "仍有语义缺口";
  return "证据不足";
}

function validAssessmentText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !value.includes("\0")
  );
}

function validAssessmentList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every((item) => validAssessmentText(item, 600))
  );
}

function freezeState(state: AnalysisDashboardState): AnalysisDashboardState {
  return Object.freeze({
    ...state,
    trendPoints: Object.freeze(state.trendPoints.map((point) => Object.freeze({ ...point }))),
    criteria: Object.freeze(state.criteria.map((criterion) => Object.freeze({ ...criterion }))),
    hotspots: Object.freeze(state.hotspots.map((hotspot) => Object.freeze({ ...hotspot }))),
  });
}

function emptyAnalysisDashboardState(): AnalysisDashboardState {
  return Object.freeze({
    sourceFingerprint: null,
    statusMessage: "打开项目并运行案例后生成分析。",
    scenarioLabel: "尚未选择情景",
    referenceLabel: null,
    trendEvidence: "没有跨规模运行证据。",
    trendPoints: Object.freeze([]),
    criteria: Object.freeze([]),
    branchCovered: 0,
    branchTotal: 0,
    hotspots: Object.freeze([]),
  });
}

function formatMetric(value: number, metric: AnalysisMetric): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return metric === "duration" ? `${String(rounded)} ms` : String(rounded);
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${String(value)} B`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("分析视图已销毁");
}
