import type {
  Capabilities,
  ClangDiagnostic,
  CompileResult,
  RunResult,
  TerminationReason,
} from "../shared/api.js";
import { fingerprintSource } from "../shared/source-snapshot.js";

const RUNNER_SOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.c$/u;
const MAX_RUNNER_SOURCE_NAME_LENGTH = 128;
const SOURCE_EXTENSION_LENGTH = 2;
const outputDecoder = new TextDecoder("utf-8", { fatal: false });

let nextRunPanelId = 1;

export interface RunPanelOptions {
  readonly getSource: () => string;
  readonly getDisplayName: () => string;
  readonly getManualScenario?: (() => ManualRunScenario | null) | undefined;
  readonly onDiagnostics?: (source: string, diagnostics: readonly ClangDiagnostic[]) => void;
  readonly onRunComplete?: ((completion: RunPanelCompletion) => void) | undefined;
}

export interface ManualRunScenario {
  readonly id: string;
  readonly version: string;
  readonly mode: "real" | "simulation";
  readonly stdin: string;
  readonly arguments: readonly string[];
  readonly inputSize: number | null;
}

export interface RunPanelCompletion {
  readonly source: string;
  readonly sourceFingerprint: string;
  readonly compileResult: CompileResult;
  readonly runResult: RunResult | null;
  readonly capabilities: Capabilities;
  readonly scenario: ManualRunScenario | null;
}

export interface RunPanel {
  refreshCapabilities(): Promise<void>;
  invalidateSource(): void;
  destroy(): void;
}

export interface RunEvidencePresentation {
  readonly runDuration: string;
  readonly peakRss: string;
  readonly peakProcessCount: string;
  readonly outputBytes: string;
  readonly executedNodeCount: string;
  readonly operationCount: string;
}

const RUN_SCENARIO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const RUN_SCENARIO_VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;

export function normalizeManualRunScenario(
  value: ManualRunScenario | null,
): ManualRunScenario | null {
  if (value === null) return null;
  if (typeof value !== "object") throw new TypeError("运行情景必须是对象或 null");
  if (!RUN_SCENARIO_ID_PATTERN.test(value.id)) {
    throw new TypeError("运行情景 id 必须是稳定标识符");
  }
  if (!RUN_SCENARIO_VERSION_PATTERN.test(value.version)) {
    throw new TypeError("运行情景 version 必须是语义化版本");
  }
  if (value.mode !== "real" && value.mode !== "simulation") {
    throw new TypeError("运行情景 mode 必须是 real 或 simulation");
  }
  if (typeof value.stdin !== "string" || value.stdin.includes("\0")) {
    throw new TypeError("运行情景 stdin 必须是无 NUL 的字符串");
  }
  if (
    !Array.isArray(value.arguments) ||
    value.arguments.some((argument) => typeof argument !== "string" || argument.includes("\0"))
  ) {
    throw new TypeError("运行情景 arguments 必须是无 NUL 的字符串数组");
  }
  if (
    value.inputSize !== null &&
    (!Number.isSafeInteger(value.inputSize) || value.inputSize <= 0)
  ) {
    throw new TypeError("运行情景 inputSize 必须是正安全整数或 null");
  }
  return Object.freeze({
    id: value.id,
    version: value.version,
    mode: value.mode,
    stdin: value.stdin,
    arguments: Object.freeze([...value.arguments]),
    inputSize: value.inputSize,
  });
}

export function toRunnerSourceName(displayName: string): string {
  const leafName = displayName.trim().split(/[\\/]/u).at(-1) ?? "";
  const stemWithoutExtension = leafName.replace(/\.c$/iu, "");
  const asciiStem = stemWithoutExtension
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/gu, "")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^[^A-Za-z0-9]+/u, "")
    .replace(/[._-]+$/u, "");
  const fallbackStem = asciiStem.length > 0 ? asciiStem : "main";
  const maxStemLength = MAX_RUNNER_SOURCE_NAME_LENGTH - SOURCE_EXTENSION_LENGTH;
  const sourceName = `${fallbackStem.slice(0, maxStemLength)}.c`;

  if (!RUNNER_SOURCE_NAME_PATTERN.test(sourceName)) {
    return "main.c";
  }
  return sourceName;
}

export function formatCompileDurationEvidence(value: number | undefined): string {
  return isNonNegativeFinite(value) ? `${formatMetricNumber(value)} ms` : "不可用";
}

export function formatRunEvidence(result: RunResult): RunEvidencePresentation {
  const sampled = isNonNegativeSafeInteger(result.peakProcessCount) && result.peakProcessCount > 0;
  const capturedOutput = isNonNegativeSafeInteger(result.outputBytes)
    ? result.outputBytes
    : result.stdout.byteLength + result.stderr.byteLength;
  return Object.freeze({
    runDuration: isNonNegativeFinite(result.durationMs)
      ? `${formatMetricNumber(result.durationMs)} ms`
      : "不可用",
    peakRss:
      sampled && isNonNegativeSafeInteger(result.peakRssBytes)
        ? `${formatByteCount(result.peakRssBytes)}（采样峰值）`
        : "未取得有效样本",
    peakProcessCount: sampled ? `${String(result.peakProcessCount)}（采样峰值）` : "未取得有效样本",
    outputBytes: `${formatByteCount(capturedOutput)}（stdout + stderr 已捕获）`,
    executedNodeCount: formatInstrumentedCount(result.executedNodeCount),
    operationCount: formatInstrumentedCount(result.operationCount),
  });
}

export function createRunPanel(host: HTMLElement, options: RunPanelOptions): RunPanel {
  const panelId = nextRunPanelId;
  nextRunPanelId += 1;

  const root = createElement("div", "run-panel");
  root.dataset.state = "loading";

  const safetyNotice = createElement(
    "p",
    "run-panel__safety-notice",
    "仅运行你编写或逐行审阅过的代码。可信模式没有 Seatbelt 文件或网络隔离。",
  );
  safetyNotice.hidden = true;
  const runButton = createElement("button", "run-panel__run-button", "直接执行当前代码");
  runButton.type = "button";
  runButton.disabled = true;
  const diagnoseButton = createElement("button", "run-panel__diagnose-button", "静态诊断");
  diagnoseButton.type = "button";
  diagnoseButton.disabled = true;
  const memoryButton = createElement("button", "run-panel__diagnose-button", "完整内存诊断");
  memoryButton.type = "button";
  memoryButton.disabled = true;
  const operationStatus = createElement(
    "output",
    "run-panel__operation-status",
    "正在检查本地运行能力…",
  );
  operationStatus.setAttribute("aria-live", "polite");
  const action = createElement("div", "run-panel__action");
  const toolDisclosure = createElement("details", "run-panel__tools");
  const toolSummary = createElement("summary", "run-panel__tools-summary", "手动运行与诊断");
  const actionButtons = createElement("div", "run-panel__action-buttons");
  actionButtons.append(runButton, diagnoseButton, memoryButton);
  toolDisclosure.append(toolSummary, actionButtons);
  action.append(toolDisclosure, operationStatus);

  const capabilityDetails = createElement("details", "run-panel__capability-details");
  const capabilitySummary = createElement("summary", "run-panel__capability-summary", "运行环境");
  const capabilityList = createElement("dl", "run-panel__capabilities");
  const modeValue = appendDescriptionRow(capabilityList, "安全模式", "mode");
  const seatbeltValue = appendDescriptionRow(capabilityList, "Seatbelt", "seatbelt");
  const trustValue = appendDescriptionRow(capabilityList, "可信确认", "trust-confirmation");
  modeValue.textContent = "正在检查";
  seatbeltValue.textContent = "正在检查";
  trustValue.textContent = "正在检查";
  capabilityDetails.append(capabilitySummary, capabilityList);

  const result = createElement("section", "run-panel__result");
  result.hidden = true;
  const resultHeading = createElement("h3", "run-panel__result-title", "结果");
  const resultStatus = createElement("output", "run-panel__result-status", "尚未运行");

  const diagnosticsHeading = createElement("h4", "run-panel__section-title", "编译诊断");
  const diagnostics = createOutputBlock("diagnostics", diagnosticsHeading, panelId);
  const stdoutHeading = createElement("h4", "run-panel__section-title", "标准输出 stdout");
  const stdout = createOutputBlock("stdout", stdoutHeading, panelId);
  const stderrHeading = createElement("h4", "run-panel__section-title", "标准错误 stderr");
  const stderr = createOutputBlock("stderr", stderrHeading, panelId);
  const sanitizerHeading = createElement("h4", "run-panel__section-title", "ASan / UBSan");
  const sanitizer = createOutputBlock("sanitizer", sanitizerHeading, panelId);
  const leaksHeading = createElement("h4", "run-panel__section-title", "独立 leaks");
  const leaks = createOutputBlock("leaks", leaksHeading, panelId);

  const processList = createElement("dl", "run-panel__process-result");
  processList.hidden = true;
  const evidenceNotice = createElement(
    "p",
    "run-panel__evidence-notice",
    "分项数据来自本次本机受限进程；不代表 Big-O，也不合成为评分。",
  );
  evidenceNotice.hidden = true;
  const compileDurationValue = appendDescriptionRow(
    processList,
    "编译进程耗时",
    "compile-duration",
  );
  const exitValue = appendDescriptionRow(processList, "退出码", "exit-code");
  const signalValue = appendDescriptionRow(processList, "信号", "signal");
  const terminationValue = appendDescriptionRow(processList, "终止原因", "termination");
  const durationValue = appendDescriptionRow(processList, "运行墙钟耗时", "duration");
  const peakRssValue = appendDescriptionRow(processList, "进程组峰值内存", "peak-rss");
  const peakProcessValue = appendDescriptionRow(
    processList,
    "进程组峰值数量",
    "peak-process-count",
  );
  const outputBytesValue = appendDescriptionRow(processList, "捕获输出量", "output-bytes");
  const executedNodesValue = appendDescriptionRow(processList, "执行节点数", "executed-node-count");
  const operationCountValue = appendDescriptionRow(processList, "操作计数", "operation-count");
  resetProcessDetails();
  setOutput(diagnosticsHeading, diagnostics, "");
  setOutput(stdoutHeading, stdout, "");
  setOutput(stderrHeading, stderr, "");
  setOutput(sanitizerHeading, sanitizer, "");
  setOutput(leaksHeading, leaks, "");

  result.append(
    resultHeading,
    resultStatus,
    diagnosticsHeading,
    diagnostics,
    stdoutHeading,
    stdout,
    stderrHeading,
    stderr,
    sanitizerHeading,
    sanitizer,
    leaksHeading,
    leaks,
    evidenceNotice,
    processList,
  );
  root.append(safetyNotice, action, capabilityDetails, result);
  host.append(root);

  let destroyed = false;
  let busy = false;
  let capabilities: Capabilities | undefined;
  let capabilityRequestId = 0;
  let runRequestId = 0;

  function updateRunButton(): void {
    const disabled = destroyed || busy || capabilities?.runnerEnabled !== true;
    runButton.disabled = disabled;
    diagnoseButton.disabled = disabled;
    memoryButton.disabled = disabled;
  }

  function renderAvailability(): void {
    if (busy || destroyed) {
      return;
    }
    delete root.dataset.failureReason;
    if (capabilities?.runnerEnabled === true) {
      root.dataset.state = "ready";
      operationStatus.textContent = "本地运行器可用。";
      return;
    }
    root.dataset.state = "disabled";
    operationStatus.textContent = "运行器当前不可用；其他学习功能不受影响。";
  }

  function renderCapabilities(snapshot: Capabilities): void {
    safetyNotice.hidden = !snapshot.requiresNativeTrustConfirmation;
    modeValue.textContent = runnerModeLabel(snapshot);
    seatbeltValue.textContent = seatbeltStatusLabel(snapshot);
    trustValue.textContent = snapshot.requiresNativeTrustConfirmation
      ? "需要；完整内存诊断整套流程仅确认一次"
      : "当前模式不需要原生可信确认";
  }

  async function refreshCapabilities(): Promise<void> {
    if (destroyed) {
      return;
    }
    const requestId = capabilityRequestId + 1;
    capabilityRequestId = requestId;
    if (!busy) {
      root.dataset.state = "loading";
      operationStatus.textContent = "正在检查本地运行能力…";
    }
    capabilities = undefined;
    updateRunButton();

    try {
      const snapshot = await window.panelApi.capabilities();
      if (destroyed || requestId !== capabilityRequestId) {
        return;
      }
      capabilities = snapshot;
      renderCapabilities(snapshot);
      updateRunButton();
      renderAvailability();
    } catch {
      if (destroyed || requestId !== capabilityRequestId) {
        return;
      }
      capabilities = undefined;
      modeValue.textContent = "无法获取";
      seatbeltValue.textContent = "无法确认";
      trustValue.textContent = "无法确认";
      updateRunButton();
      if (!busy) {
        root.dataset.state = "error";
        operationStatus.textContent = "无法连接本地运行器；编译与运行已停用。";
      }
    }
  }

  async function compileAndRun(): Promise<void> {
    if (destroyed || busy || capabilities?.runnerEnabled !== true) {
      return;
    }

    const runCapabilities = snapshotCapabilities(capabilities);
    busy = true;
    const requestId = runRequestId + 1;
    runRequestId = requestId;
    root.dataset.state = "running";
    delete root.dataset.failureReason;
    operationStatus.textContent = "正在编译…";
    resultStatus.textContent = "正在编译…";
    result.hidden = false;
    setOutput(diagnosticsHeading, diagnostics, "");
    setOutput(stdoutHeading, stdout, "");
    setOutput(stderrHeading, stderr, "");
    setOutput(sanitizerHeading, sanitizer, "");
    setOutput(leaksHeading, leaks, "");
    setProcessEvidenceVisible(false);
    resetProcessDetails();
    updateRunButton();

    let source: string;
    let displayName: string;
    let scenario: ManualRunScenario | null;
    try {
      source = options.getSource();
      displayName = options.getDisplayName();
      if (typeof source !== "string" || typeof displayName !== "string") {
        throw new TypeError("source callbacks must return strings");
      }
      scenario = normalizeManualRunScenario(options.getManualScenario?.() ?? null);
    } catch {
      finishFailure(
        requestId,
        "本次运行失败：无法取得当前源码或有效运行情景，未启动编译。",
        "source-unavailable",
      );
      finishRun(requestId);
      return;
    }

    let completedCompile: CompileResult | null = null;
    let completionDelivered = false;
    const deliverCompletion = (runResult: RunResult | null): void => {
      if (completionDelivered) return;
      const compileResult = completedCompile;
      if (compileResult === null) return;
      completionDelivered = true;
      try {
        options.onRunComplete?.(
          Object.freeze({
            source,
            sourceFingerprint: fingerprintSource(source),
            compileResult,
            runResult,
            capabilities: runCapabilities,
            scenario,
          }),
        );
      } catch {
        // Evidence consumers are isolated from the compile/run interaction.
      }
    };

    try {
      const compileResult = await window.panelApi.compile({
        source,
        sourceName: toRunnerSourceName(displayName),
      });
      completedCompile = compileResult;
      if (!isCurrentRun(requestId)) {
        return;
      }
      if (!isCurrentSource(source)) {
        finishStale(requestId);
        return;
      }
      setOutput(diagnosticsHeading, diagnostics, compileResult.diagnostics);
      compileDurationValue.textContent = formatCompileDurationEvidence(
        compileResult.compileDurationMs,
      );
      setProcessEvidenceVisible(true);
      if (!compileResult.ok) {
        deliverCompletion(null);
        finishFailure(
          requestId,
          `本次运行失败：编译未通过（${compileResult.error.code}：${compileResult.error.message}）`,
          "compile-failed",
        );
        return;
      }

      operationStatus.textContent = "编译完成，正在运行…";
      resultStatus.textContent = "编译完成，正在运行…";
      const runResult = await window.panelApi.run({
        artifactId: compileResult.artifactId,
        ...(scenario === null
          ? {}
          : {
              args: scenario.arguments,
              stdin: scenario.stdin,
            }),
      });
      if (!isCurrentRun(requestId)) {
        return;
      }
      if (!isCurrentSource(source)) {
        finishStale(requestId);
        return;
      }

      setOutput(stdoutHeading, stdout, decodeOutput(runResult.stdout));
      setOutput(stderrHeading, stderr, decodeOutput(runResult.stderr));
      exitValue.textContent = runResult.exitCode === null ? "—" : String(runResult.exitCode);
      signalValue.textContent = runResult.signal ?? "—";
      terminationValue.textContent = terminationLabel(runResult.termination);
      const evidence = formatRunEvidence(runResult);
      durationValue.textContent = evidence.runDuration;
      peakRssValue.textContent = evidence.peakRss;
      peakProcessValue.textContent = evidence.peakProcessCount;
      outputBytesValue.textContent = evidence.outputBytes;
      executedNodesValue.textContent = evidence.executedNodeCount;
      operationCountValue.textContent = evidence.operationCount;
      setProcessEvidenceVisible(true);
      deliverCompletion(runResult);

      if (runResult.ok) {
        root.dataset.state = "success";
        operationStatus.textContent = "本次运行成功。";
        resultStatus.textContent = "本次运行成功";
      } else {
        const reason = runResult.error
          ? `${runResult.error.code}：${runResult.error.message}`
          : "程序返回了非成功状态";
        finishFailure(requestId, `本次运行失败：${reason}`, "run-failed");
      }
    } catch {
      if (isCurrentSource(source)) {
        deliverCompletion(null);
        finishFailure(requestId, "本次运行失败：无法完成本地运行器 IPC 调用。", "ipc-failed");
      } else {
        finishStale(requestId);
      }
    } finally {
      finishRun(requestId);
    }
  }

  async function diagnoseSource(includeMemory: boolean): Promise<void> {
    if (destroyed || busy || capabilities?.runnerEnabled !== true) return;
    busy = true;
    const requestId = runRequestId + 1;
    runRequestId = requestId;
    root.dataset.state = "running";
    delete root.dataset.failureReason;
    operationStatus.textContent = includeMemory
      ? "正在运行静态与双闸内存诊断…"
      : "正在运行 clang 静态诊断…";
    resultStatus.textContent = operationStatus.textContent;
    result.hidden = false;
    setProcessEvidenceVisible(false);
    setOutput(diagnosticsHeading, diagnostics, "");
    setOutput(stdoutHeading, stdout, "");
    setOutput(stderrHeading, stderr, "");
    setOutput(sanitizerHeading, sanitizer, "");
    setOutput(leaksHeading, leaks, "");
    updateRunButton();

    let source: string;
    let displayName: string;
    try {
      source = options.getSource();
      displayName = options.getDisplayName();
      if (typeof source !== "string" || typeof displayName !== "string") {
        throw new TypeError("source callbacks must return strings");
      }
    } catch {
      finishFailure(requestId, "诊断失败：无法取得当前源码。", "source-unavailable");
      finishRun(requestId);
      return;
    }

    try {
      const diagnoseResult = await window.panelApi.diagnose({
        source,
        sourceName: toRunnerSourceName(displayName),
        ...(includeMemory ? { runtime: {} } : {}),
      });
      if (!isCurrentRun(requestId)) return;
      if (!isCurrentSource(source)) {
        finishStale(requestId);
        return;
      }
      setOutput(diagnosticsHeading, diagnostics, diagnoseResult.rawDiagnostics);
      if (!diagnoseResult.ok) {
        options.onDiagnostics?.(source, Object.freeze([]));
        finishFailure(
          requestId,
          `诊断失败：${diagnoseResult.error.code}：${diagnoseResult.error.message}`,
          "diagnose-failed",
        );
        return;
      }
      options.onDiagnostics?.(source, diagnoseResult.diagnostics);
      const memory = diagnoseResult.memory;
      if (memory?.status === "completed") {
        setOutput(sanitizerHeading, sanitizer, memory.sanitizer.summary);
        setOutput(leaksHeading, leaks, memory.leaks.summary);
      }
      const findingCount = diagnoseResult.diagnostics.filter(
        (entry) => entry.severity !== "note",
      ).length;
      const memoryFinding =
        memory?.status === "completed" &&
        (memory.sanitizer.verdict !== "clean" || memory.leaks.verdict !== "clean");
      const staticErrors = diagnoseResult.hasErrors;
      if (staticErrors || memoryFinding) {
        root.dataset.state = "finding";
        operationStatus.textContent = staticErrors
          ? includeMemory
            ? `静态诊断完成：发现 ${String(findingCount)} 条问题；内存运行已跳过。`
            : `静态诊断完成：发现 ${String(findingCount)} 条问题。`
          : "完整诊断完成：内存风险面板发现需要检查的结果。";
      } else {
        root.dataset.state = "success";
        operationStatus.textContent = includeMemory
          ? `完整诊断完成：${String(findingCount)} 条 clang 提示，双闸未报告内存问题。`
          : `静态诊断完成：${String(findingCount)} 条提示。`;
      }
      resultStatus.textContent = operationStatus.textContent;
    } catch {
      if (isCurrentSource(source)) {
        finishFailure(requestId, "诊断失败：无法完成本地运行器 IPC 调用。", "ipc-failed");
      } else {
        finishStale(requestId);
      }
    } finally {
      finishRun(requestId);
    }
  }

  function isCurrentRun(requestId: number): boolean {
    return !destroyed && requestId === runRequestId;
  }

  function isCurrentSource(expectedSource: string): boolean {
    if (destroyed) return false;
    try {
      return options.getSource() === expectedSource;
    } catch {
      return false;
    }
  }

  function finishStale(requestId: number): void {
    if (!isCurrentRun(requestId)) return;
    root.dataset.state = capabilities?.runnerEnabled === true ? "ready" : "disabled";
    delete root.dataset.failureReason;
    operationStatus.textContent = "源码已改变；旧运行或诊断结果已丢弃。";
    resultStatus.textContent = operationStatus.textContent;
    result.hidden = true;
  }

  function finishFailure(requestId: number, message: string, reason: string): void {
    if (!isCurrentRun(requestId)) {
      return;
    }
    root.dataset.state = "failure";
    root.dataset.failureReason = reason;
    result.hidden = false;
    operationStatus.textContent = message;
    resultStatus.textContent = message;
  }

  function finishRun(requestId: number): void {
    if (!isCurrentRun(requestId)) {
      return;
    }
    busy = false;
    updateRunButton();
  }

  function resetProcessDetails(): void {
    compileDurationValue.textContent = "—";
    exitValue.textContent = "—";
    signalValue.textContent = "—";
    terminationValue.textContent = "—";
    durationValue.textContent = "—";
    peakRssValue.textContent = "—";
    peakProcessValue.textContent = "—";
    outputBytesValue.textContent = "—";
    executedNodesValue.textContent = "—";
    operationCountValue.textContent = "—";
  }

  function setProcessEvidenceVisible(visible: boolean): void {
    processList.hidden = !visible;
    evidenceNotice.hidden = !visible;
  }

  const onRunClick = (): void => {
    void compileAndRun();
  };
  const onDiagnoseClick = (): void => void diagnoseSource(false);
  const onMemoryClick = (): void => void diagnoseSource(true);
  runButton.addEventListener("click", onRunClick);
  diagnoseButton.addEventListener("click", onDiagnoseClick);
  memoryButton.addEventListener("click", onMemoryClick);
  void refreshCapabilities();

  return Object.freeze({
    refreshCapabilities,
    invalidateSource(): void {
      if (destroyed) return;
      result.hidden = true;
      setOutput(diagnosticsHeading, diagnostics, "");
      setOutput(stdoutHeading, stdout, "");
      setOutput(stderrHeading, stderr, "");
      setOutput(sanitizerHeading, sanitizer, "");
      setOutput(leaksHeading, leaks, "");
      setProcessEvidenceVisible(false);
      resetProcessDetails();
      if (busy) {
        operationStatus.textContent = "源码已改变；当前任务结束后将丢弃旧结果。";
      } else {
        root.dataset.state = capabilities?.runnerEnabled === true ? "ready" : "disabled";
        delete root.dataset.failureReason;
        operationStatus.textContent = "源码已改变；旧运行或诊断结果已清除。";
      }
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      capabilityRequestId += 1;
      runRequestId += 1;
      busy = false;
      runButton.removeEventListener("click", onRunClick);
      diagnoseButton.removeEventListener("click", onDiagnoseClick);
      memoryButton.removeEventListener("click", onMemoryClick);
      root.remove();
    },
  });
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function appendDescriptionRow(list: HTMLDListElement, label: string, field: string): HTMLElement {
  const row = createElement("div", "run-panel__detail-row");
  const term = createElement("dt", "run-panel__detail-label", label);
  const value = createElement("dd", "run-panel__detail-value");
  value.dataset.runField = field;
  row.append(term, value);
  list.append(row);
  return value;
}

function createOutputBlock(
  field: string,
  heading: HTMLHeadingElement,
  panelId: number,
): HTMLPreElement {
  const block = createElement("pre", "run-panel__output");
  block.dataset.runField = field;
  const headingId = `run-panel-${field}-heading-${panelId}`;
  heading.id = headingId;
  block.setAttribute("aria-labelledby", headingId);
  return block;
}

function setOutput(heading: HTMLHeadingElement, block: HTMLPreElement, text: string): void {
  block.textContent = text;
  const empty = text.length === 0;
  heading.hidden = empty;
  block.hidden = empty;
}

function runnerModeLabel(capabilities: Capabilities): string {
  switch (capabilities.mode) {
    case "seatbelt-best-effort":
      return "Seatbelt best-effort";
    case "trusted-only":
      return "可信代码模式（无 Seatbelt 文件与网络隔离）";
    case "disabled":
      return "运行器已禁用";
  }
}

function seatbeltStatusLabel(capabilities: Capabilities): string {
  const detail = capabilities.seatbeltProbe.detail.trim();
  const suffix = detail.length > 0 ? `：${detail}` : "";
  switch (capabilities.seatbeltProbe.status) {
    case "probe-succeeded":
      return `可用${suffix}`;
    case "unavailable":
      return `不可用${suffix}`;
    case "not-checked":
      return `尚未检查${suffix}`;
  }
}

function decodeOutput(bytes: Uint8Array): string {
  return outputDecoder.decode(bytes);
}

function terminationLabel(reason: TerminationReason): string {
  const labels: Readonly<Record<TerminationReason, string>> = {
    "not-started": "未启动",
    "process-exit": "进程退出",
    "spawn-error": "启动失败",
    "input-error": "标准输入失败",
    "wall-time-limit": "超过墙钟时间限制",
    "output-limit": "超过输出限制",
    "rss-limit": "超过内存限制",
    "process-count-limit": "超过进程数限制",
    "rss-monitor-error": "内存看门狗失败",
  };
  return `${labels[reason]}（${reason}）`;
}

function formatInstrumentedCount(value: number | null | undefined): string {
  if (value === null) return "未启用轨迹插桩";
  return isNonNegativeSafeInteger(value) ? String(value) : "不可用";
}

function formatByteCount(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_024 * 1_024) return `${formatMetricNumber(bytes / 1_024)} KiB`;
  return `${formatMetricNumber(bytes / (1_024 * 1_024))} MiB`;
}

function formatMetricNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isNonNegativeFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function isNonNegativeSafeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function snapshotCapabilities(value: Capabilities): Capabilities {
  return Object.freeze({
    mode: value.mode,
    runnerEnabled: value.runnerEnabled,
    toolchainId: value.toolchainId,
    seatbeltProbe: Object.freeze({
      status: value.seatbeltProbe.status,
      detail: value.seatbeltProbe.detail,
    }),
    requiresNativeTrustConfirmation: value.requiresNativeTrustConfirmation,
  });
}
