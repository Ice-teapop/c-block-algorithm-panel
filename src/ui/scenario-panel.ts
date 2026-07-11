import type {
  AlgorithmScenarioDefinition,
  ScenarioProvider,
  ScenarioRunCase,
} from "../mentor/index.js";

export interface ScenarioBranchTarget {
  readonly id: string;
  readonly label: string;
  readonly structuralReachable: boolean;
  readonly validCase: boolean;
  readonly explanation?: string | undefined;
}

export interface ScenarioBranchSelection {
  readonly id: string;
  readonly label: string;
}

export interface RealScenarioRunRequest {
  readonly mode: "real";
  readonly scenario: AlgorithmScenarioDefinition;
  readonly runCase: ScenarioRunCase;
  readonly targetBranch: ScenarioBranchSelection | null;
  /** A target branch is only successful after the runtime trace confirms it was visited. */
  readonly traceValidation: "required";
  readonly historyPolicy: "record-after-trace-validation";
}

export interface TeachingSimulationRequest {
  readonly mode: "teaching-simulation";
  readonly scenario: AlgorithmScenarioDefinition;
  readonly runCase: ScenarioRunCase;
  readonly targetBranch: ScenarioBranchSelection | null;
  readonly historyPolicy: "never-record";
  readonly performanceEvidence: "not-applicable";
}

export interface ScenarioBenchmarkRequest {
  readonly mode: "benchmark";
  readonly scenario: AlgorithmScenarioDefinition;
  readonly cases: readonly ScenarioRunCase[];
  readonly sizes: readonly number[];
  readonly repetitions: number;
  readonly historyPolicy: "record-real-runs-only";
}

export interface ScenarioPanelOptions {
  readonly provider: ScenarioProvider;
  readonly onRealRun: (request: RealScenarioRunRequest) => void | Promise<void>;
  readonly onTeachingSimulation: (request: TeachingSimulationRequest) => void | Promise<void>;
  readonly onBenchmark: (request: ScenarioBenchmarkRequest) => void | Promise<void>;
}

export interface ScenarioPanelSnapshot {
  readonly scenarioId: string;
  readonly size: number;
  readonly runCase: ScenarioRunCase;
  readonly targetBranch: ScenarioBranchSelection | null;
  readonly benchmarkSizes: readonly number[];
  readonly benchmarkRepetitions: number;
}

export interface ScenarioPanel {
  readonly element: HTMLElement;
  selectScenario(scenarioId: string): void;
  setSize(size: number): void;
  setBranchTargets(targets: readonly ScenarioBranchTarget[]): void;
  selectTargetBranch(targetId: string | null): void;
  setBenchmarkSizes(sizes: readonly number[]): void;
  setBenchmarkRepetitions(repetitions: number): void;
  refreshScenarios(preferredScenarioId?: string | undefined): void;
  requestRealRun(): Promise<void>;
  requestTeachingSimulation(): Promise<void>;
  requestBenchmark(): Promise<void>;
  getSnapshot(): ScenarioPanelSnapshot;
  destroy(): void;
}

const MINIMUM_BENCHMARK_SIZES = 3;
const MINIMUM_REPETITIONS = 3;
const MAXIMUM_REPETITIONS = 9;

export function createScenarioPanel(
  host: HTMLElement,
  options: ScenarioPanelOptions,
): ScenarioPanel {
  assertOptions(options);
  let scenarios = options.provider.list();
  if (scenarios.length === 0) throw new Error("ScenarioProvider 没有可用案例");

  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "scenario-panel";
  root.dataset.state = "ready";

  const header = ownerDocument.createElement("header");
  header.className = "scenario-panel__header";
  const heading = ownerDocument.createElement("h2");
  heading.className = "scenario-panel__title";
  heading.textContent = "案例与分支执行";
  const boundary = ownerDocument.createElement("span");
  boundary.className = "scenario-panel__boundary";
  boundary.textContent = "本地输入 · 真实/模拟隔离";
  header.append(heading, boundary);

  const scenarioField = field(ownerDocument, "案例");
  const scenarioSelect = ownerDocument.createElement("select");
  scenarioSelect.className = "scenario-panel__scenario";
  scenarioSelect.setAttribute("aria-label", "算法案例");
  const renderScenarioChoices = (): void => {
    scenarioSelect.replaceChildren();
    for (const item of scenarios) {
      const option = ownerDocument.createElement("option");
      option.value = item.id;
      option.textContent = `${familyLabel(item.family)} · ${item.label}`;
      scenarioSelect.append(option);
    }
  };
  renderScenarioChoices();
  scenarioField.control.append(scenarioSelect);

  const sizeField = field(ownerDocument, "输入规模");
  const sizeInput = ownerDocument.createElement("input");
  sizeInput.className = "scenario-panel__size";
  sizeInput.type = "number";
  sizeInput.step = "1";
  sizeInput.setAttribute("aria-label", "案例输入规模");
  const sizeHelp = ownerDocument.createElement("span");
  sizeHelp.className = "scenario-panel__size-help";
  sizeField.control.append(sizeInput, sizeHelp);

  const branchField = field(ownerDocument, "目标分支（可选）");
  const branchSelect = ownerDocument.createElement("select");
  branchSelect.className = "scenario-panel__branch";
  branchSelect.setAttribute("aria-label", "目标分支");
  const branchHelp = ownerDocument.createElement("output");
  branchHelp.className = "scenario-panel__branch-help";
  branchHelp.setAttribute("aria-live", "polite");
  branchField.control.append(branchSelect, branchHelp);

  const preview = ownerDocument.createElement("section");
  preview.className = "scenario-panel__preview";
  const description = ownerDocument.createElement("p");
  description.className = "scenario-panel__description";
  const stdin = previewValue(ownerDocument, "stdin", "scenario-panel__stdin");
  const argumentsPreview = previewValue(ownerDocument, "args", "scenario-panel__args");
  const expected = previewValue(ownerDocument, "expected stdout", "scenario-panel__expected");
  preview.append(description, stdin.group, argumentsPreview.group, expected.group);

  const actionRow = ownerDocument.createElement("div");
  actionRow.className = "scenario-panel__actions";
  const realButton = actionButton(ownerDocument, "真实运行", "scenario-panel__run-real");
  const simulationButton = actionButton(
    ownerDocument,
    "教学模拟",
    "scenario-panel__run-simulation",
  );
  simulationButton.dataset.mode = "teaching-simulation";
  simulationButton.title = "模拟只用于教学，不产生真实性能或输出结论";
  actionRow.append(realButton, simulationButton);

  const benchmark = ownerDocument.createElement("section");
  benchmark.className = "scenario-panel__benchmark";
  const benchmarkHeading = ownerDocument.createElement("h3");
  benchmarkHeading.textContent = "Benchmark";
  const benchmarkSizes = ownerDocument.createElement("div");
  benchmarkSizes.className = "scenario-panel__benchmark-sizes";
  const repetitionLabel = ownerDocument.createElement("label");
  repetitionLabel.textContent = "重复次数";
  const repetitionInput = ownerDocument.createElement("input");
  repetitionInput.className = "scenario-panel__repetitions";
  repetitionInput.type = "number";
  repetitionInput.min = String(MINIMUM_REPETITIONS);
  repetitionInput.max = String(MAXIMUM_REPETITIONS);
  repetitionInput.step = "1";
  repetitionInput.value = "3";
  repetitionLabel.append(repetitionInput);
  const benchmarkButton = actionButton(
    ownerDocument,
    "运行 Benchmark",
    "scenario-panel__run-benchmark",
  );
  const benchmarkHelp = ownerDocument.createElement("output");
  benchmarkHelp.className = "scenario-panel__benchmark-help";
  benchmarkHelp.setAttribute("aria-live", "polite");
  benchmark.append(
    benchmarkHeading,
    benchmarkSizes,
    repetitionLabel,
    benchmarkButton,
    benchmarkHelp,
  );

  const status = ownerDocument.createElement("output");
  status.className = "scenario-panel__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "等待运行";

  root.append(
    header,
    scenarioField.root,
    sizeField.root,
    branchField.root,
    preview,
    actionRow,
    benchmark,
    status,
  );
  host.replaceChildren(root);

  let destroyed = false;
  let scenario = scenarios[0] as AlgorithmScenarioDefinition;
  let size = scenario.sizeGenerator.defaultSizes[0] ?? scenario.sizeGenerator.minimum;
  let runCase = options.provider.generate(scenario.id, size);
  let branchTargets: readonly ScenarioBranchTarget[] = Object.freeze([]);
  let selectedBranchId: string | null = null;
  let selectedBenchmarkSizes = normalizeBenchmarkSizes(
    scenario.sizeGenerator.defaultSizes,
    scenario,
  );
  let benchmarkRepetitions = MINIMUM_REPETITIONS;
  let pending = false;

  const updatePreview = (): void => {
    scenarioSelect.value = scenario.id;
    sizeInput.min = String(scenario.sizeGenerator.minimum);
    sizeInput.max = String(scenario.sizeGenerator.maximum);
    sizeInput.value = String(size);
    sizeHelp.textContent = `${String(scenario.sizeGenerator.minimum)}–${String(scenario.sizeGenerator.maximum)} · ${scenario.sizeGenerator.inputModel}`;
    description.textContent = scenario.description;
    stdin.value.textContent = runCase.stdin.length === 0 ? "（空）" : runCase.stdin;
    argumentsPreview.value.textContent =
      runCase.arguments.length === 0 ? "（无）" : runCase.arguments.join(" ");
    expected.value.textContent = runCase.expected.stdout;
    renderBenchmarkChoices();
  };

  const renderBranchTargets = (): void => {
    branchSelect.replaceChildren();
    const automatic = ownerDocument.createElement("option");
    automatic.value = "";
    automatic.textContent = "由真实输入决定";
    branchSelect.append(automatic);
    for (const target of branchTargets) {
      const option = ownerDocument.createElement("option");
      option.value = target.id;
      option.disabled = !isEligibleTarget(target);
      const reason = branchDisabledReason(target);
      option.textContent = reason === null ? target.label : `${target.label}（${reason}）`;
      branchSelect.append(option);
    }
    if (!isSelectableBranch(selectedBranchId, branchTargets)) selectedBranchId = null;
    branchSelect.value = selectedBranchId ?? "";
    const disabledCount = branchTargets.filter((target) => !isEligibleTarget(target)).length;
    branchHelp.textContent =
      branchTargets.length === 0
        ? "未提供分支目标；真实条件决定执行路径"
        : `${String(branchTargets.length - disabledCount)} 个可验证目标，${String(disabledCount)} 个已禁用`;
  };

  const renderBenchmarkChoices = (): void => {
    benchmarkSizes.replaceChildren();
    const candidates = benchmarkCandidates(scenario, selectedBenchmarkSizes);
    for (const candidate of candidates) {
      const label = ownerDocument.createElement("label");
      const input = ownerDocument.createElement("input");
      input.type = "checkbox";
      input.value = String(candidate);
      input.checked = selectedBenchmarkSizes.includes(candidate);
      input.addEventListener("change", () => {
        const next = input.checked
          ? [...selectedBenchmarkSizes, candidate]
          : selectedBenchmarkSizes.filter((value) => value !== candidate);
        selectedBenchmarkSizes = Object.freeze(
          [...new Set(next)].sort((left, right) => left - right),
        );
        updateBenchmarkStatus();
      });
      const text = ownerDocument.createElement("span");
      text.textContent = String(candidate);
      label.append(input, text);
      benchmarkSizes.append(label);
    }
    updateBenchmarkStatus();
  };

  const updateBenchmarkStatus = (): void => {
    const enoughSizes = selectedBenchmarkSizes.length >= MINIMUM_BENCHMARK_SIZES;
    benchmarkButton.disabled = pending || !enoughSizes;
    benchmarkHelp.textContent = enoughSizes
      ? `${String(selectedBenchmarkSizes.length)} 个规模 · 每个重复 ${String(benchmarkRepetitions)} 次 · 只记录真实运行`
      : `至少选择 ${String(MINIMUM_BENCHMARK_SIZES)} 个不同规模`;
  };

  const setPending = (value: boolean, message: string): void => {
    pending = value;
    root.dataset.state = value ? "working" : "ready";
    realButton.disabled = value;
    simulationButton.disabled = value;
    updateBenchmarkStatus();
    status.textContent = message;
  };

  const targetSelection = (): ScenarioBranchSelection | null => {
    if (selectedBranchId === null) return null;
    const target = branchTargets.find((candidate) => candidate.id === selectedBranchId);
    if (target === undefined || !isEligibleTarget(target)) {
      throw new Error("目标分支当前不可达或没有有效案例输入");
    }
    return Object.freeze({ id: target.id, label: target.label });
  };

  const invoke = async (label: string, action: () => void | Promise<void>): Promise<void> => {
    assertAlive(destroyed);
    if (pending) throw new Error("已有案例任务正在执行");
    setPending(true, `${label}已提交`);
    try {
      await action();
      setPending(false, `${label}请求已完成`);
    } catch (error) {
      setPending(false, `${label}失败：${toErrorMessage(error)}`);
      root.dataset.state = "error";
      throw error;
    }
  };

  const api: ScenarioPanel = {
    element: root,
    selectScenario(scenarioId: string): void {
      assertAlive(destroyed);
      const next = options.provider.get(scenarioId);
      if (next === null) throw new RangeError(`未知算法案例：${scenarioId}`);
      scenario = next;
      size = next.sizeGenerator.defaultSizes[0] ?? next.sizeGenerator.minimum;
      runCase = options.provider.generate(next.id, size);
      selectedBranchId = null;
      // validCase belongs to a concrete scenario input; never reuse it after switching cases.
      branchTargets = Object.freeze([]);
      selectedBenchmarkSizes = normalizeBenchmarkSizes(next.sizeGenerator.defaultSizes, next);
      updatePreview();
      renderBranchTargets();
    },
    setSize(nextSize: number): void {
      assertAlive(destroyed);
      assertSize(nextSize, scenario);
      size = nextSize;
      runCase = options.provider.generate(scenario.id, size);
      updatePreview();
    },
    setBranchTargets(targets: readonly ScenarioBranchTarget[]): void {
      assertAlive(destroyed);
      branchTargets = normalizeBranchTargets(targets);
      renderBranchTargets();
    },
    selectTargetBranch(targetId: string | null): void {
      assertAlive(destroyed);
      if (targetId === null || targetId === "") {
        selectedBranchId = null;
        renderBranchTargets();
        return;
      }
      const target = branchTargets.find((candidate) => candidate.id === targetId);
      if (target === undefined) throw new RangeError(`未知目标分支：${targetId}`);
      const reason = branchDisabledReason(target);
      if (reason !== null) throw new Error(`目标分支不可选：${reason}`);
      selectedBranchId = target.id;
      renderBranchTargets();
    },
    setBenchmarkSizes(sizes: readonly number[]): void {
      assertAlive(destroyed);
      selectedBenchmarkSizes = normalizeBenchmarkSizes(sizes, scenario);
      renderBenchmarkChoices();
    },
    setBenchmarkRepetitions(repetitions: number): void {
      assertAlive(destroyed);
      assertBenchmarkRepetitions(repetitions);
      benchmarkRepetitions = repetitions;
      repetitionInput.value = String(repetitions);
      updateBenchmarkStatus();
    },
    refreshScenarios(preferredScenarioId?: string): void {
      assertAlive(destroyed);
      const nextScenarios = options.provider.list();
      if (nextScenarios.length === 0) throw new Error("ScenarioProvider 没有可用案例");
      scenarios = nextScenarios;
      const requestedId = preferredScenarioId ?? scenario.id;
      const next = options.provider.get(requestedId) ?? nextScenarios[0]!;
      scenario = next;
      size = next.sizeGenerator.defaultSizes[0] ?? next.sizeGenerator.minimum;
      runCase = options.provider.generate(next.id, size);
      selectedBranchId = null;
      branchTargets = Object.freeze([]);
      selectedBenchmarkSizes = normalizeBenchmarkSizes(next.sizeGenerator.defaultSizes, next);
      renderScenarioChoices();
      updatePreview();
      renderBranchTargets();
    },
    async requestRealRun(): Promise<void> {
      await invoke("真实运行", () =>
        options.onRealRun(
          Object.freeze({
            mode: "real",
            scenario,
            runCase,
            targetBranch: targetSelection(),
            traceValidation: "required",
            historyPolicy: "record-after-trace-validation",
          }),
        ),
      );
    },
    async requestTeachingSimulation(): Promise<void> {
      await invoke("教学模拟", () =>
        options.onTeachingSimulation(
          Object.freeze({
            mode: "teaching-simulation",
            scenario,
            runCase,
            targetBranch: targetSelection(),
            historyPolicy: "never-record",
            performanceEvidence: "not-applicable",
          }),
        ),
      );
    },
    async requestBenchmark(): Promise<void> {
      await invoke("Benchmark", () => {
        assertBenchmarkSizes(selectedBenchmarkSizes, scenario);
        assertBenchmarkRepetitions(benchmarkRepetitions);
        const sizes = Object.freeze([...selectedBenchmarkSizes]);
        return options.onBenchmark(
          Object.freeze({
            mode: "benchmark",
            scenario,
            cases: Object.freeze(
              sizes.map((benchmarkSize) => options.provider.generate(scenario.id, benchmarkSize)),
            ),
            sizes,
            repetitions: benchmarkRepetitions,
            historyPolicy: "record-real-runs-only",
          }),
        );
      });
    },
    getSnapshot(): ScenarioPanelSnapshot {
      assertAlive(destroyed);
      return Object.freeze({
        scenarioId: scenario.id,
        size,
        runCase,
        targetBranch: targetSelection(),
        benchmarkSizes: Object.freeze([...selectedBenchmarkSizes]),
        benchmarkRepetitions,
      });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.replaceChildren();
    },
  };

  scenarioSelect.addEventListener("change", () => api.selectScenario(scenarioSelect.value));
  sizeInput.addEventListener("change", () => {
    const parsed = Number(sizeInput.value);
    try {
      api.setSize(parsed);
      status.textContent = "输入规模已更新";
      root.dataset.state = "ready";
    } catch (error) {
      sizeInput.value = String(size);
      status.textContent = `输入规模无效：${toErrorMessage(error)}`;
      root.dataset.state = "error";
    }
  });
  branchSelect.addEventListener("change", () => api.selectTargetBranch(branchSelect.value || null));
  repetitionInput.addEventListener("change", () => {
    try {
      api.setBenchmarkRepetitions(Number(repetitionInput.value));
      root.dataset.state = "ready";
    } catch (error) {
      repetitionInput.value = String(benchmarkRepetitions);
      status.textContent = `重复次数无效：${toErrorMessage(error)}`;
      root.dataset.state = "error";
    }
  });
  realButton.addEventListener("click", () => {
    void api.requestRealRun().catch(() => undefined);
  });
  simulationButton.addEventListener("click", () => {
    void api.requestTeachingSimulation().catch(() => undefined);
  });
  benchmarkButton.addEventListener("click", () => {
    void api.requestBenchmark().catch(() => undefined);
  });

  updatePreview();
  renderBranchTargets();
  return Object.freeze(api);
}

export function branchDisabledReason(target: ScenarioBranchTarget): string | null {
  if (!target.structuralReachable) return target.explanation ?? "结构上不可达";
  if (!target.validCase) return target.explanation ?? "没有绑定有效案例输入";
  return null;
}

function isEligibleTarget(target: ScenarioBranchTarget): boolean {
  return target.structuralReachable && target.validCase;
}

function isSelectableBranch(
  targetId: string | null,
  targets: readonly ScenarioBranchTarget[],
): boolean {
  if (targetId === null) return true;
  const target = targets.find((candidate) => candidate.id === targetId);
  return target !== undefined && isEligibleTarget(target);
}

function normalizeBranchTargets(
  targets: readonly ScenarioBranchTarget[],
): readonly ScenarioBranchTarget[] {
  if (!Array.isArray(targets)) throw new TypeError("branch targets 必须是数组");
  const seen = new Set<string>();
  return Object.freeze(
    targets.map((target) => {
      if (typeof target.id !== "string" || target.id.trim().length === 0) {
        throw new TypeError("目标分支 id 必须是非空文本");
      }
      if (seen.has(target.id)) throw new Error(`目标分支 id 重复：${target.id}`);
      seen.add(target.id);
      if (typeof target.label !== "string" || target.label.trim().length === 0) {
        throw new TypeError("目标分支 label 必须是非空文本");
      }
      return Object.freeze({ ...target });
    }),
  );
}

function normalizeBenchmarkSizes(
  sizes: readonly number[],
  scenario: AlgorithmScenarioDefinition,
): readonly number[] {
  if (!Array.isArray(sizes)) throw new TypeError("benchmark sizes 必须是数组");
  const unique = [...new Set(sizes)];
  for (const size of unique) assertSize(size, scenario);
  return Object.freeze(unique.sort((left, right) => left - right));
}

function assertBenchmarkSizes(
  sizes: readonly number[],
  scenario: AlgorithmScenarioDefinition,
): void {
  for (const size of sizes) assertSize(size, scenario);
  if (new Set(sizes).size < MINIMUM_BENCHMARK_SIZES) {
    throw new RangeError(`Benchmark 至少需要 ${String(MINIMUM_BENCHMARK_SIZES)} 个不同规模`);
  }
}

function assertBenchmarkRepetitions(repetitions: number): void {
  if (
    !Number.isSafeInteger(repetitions) ||
    repetitions < MINIMUM_REPETITIONS ||
    repetitions > MAXIMUM_REPETITIONS
  ) {
    throw new RangeError(
      `Benchmark 重复次数必须是 ${String(MINIMUM_REPETITIONS)}–${String(MAXIMUM_REPETITIONS)} 的整数`,
    );
  }
}

function assertSize(size: number, scenario: AlgorithmScenarioDefinition): void {
  if (
    !Number.isSafeInteger(size) ||
    size < scenario.sizeGenerator.minimum ||
    size > scenario.sizeGenerator.maximum
  ) {
    throw new RangeError(
      `${scenario.label} 的输入规模必须是 ${String(scenario.sizeGenerator.minimum)}–${String(scenario.sizeGenerator.maximum)} 的整数`,
    );
  }
}

function benchmarkCandidates(
  scenario: AlgorithmScenarioDefinition,
  selected: readonly number[],
): readonly number[] {
  return Object.freeze(
    [...new Set([...scenario.sizeGenerator.defaultSizes, ...selected])].sort(
      (left, right) => left - right,
    ),
  );
}

function field(
  ownerDocument: Document,
  labelText: string,
): {
  readonly root: HTMLElement;
  readonly control: HTMLElement;
} {
  const root = ownerDocument.createElement("label");
  root.className = "scenario-panel__field";
  const label = ownerDocument.createElement("span");
  label.className = "scenario-panel__label";
  label.textContent = labelText;
  const control = ownerDocument.createElement("span");
  control.className = "scenario-panel__control";
  root.append(label, control);
  return { root, control };
}

function previewValue(
  ownerDocument: Document,
  labelText: string,
  className: string,
): { readonly group: HTMLElement; readonly value: HTMLElement } {
  const group = ownerDocument.createElement("div");
  group.className = "scenario-panel__preview-group";
  const label = ownerDocument.createElement("span");
  label.className = "scenario-panel__preview-label";
  label.textContent = labelText;
  const value = ownerDocument.createElement("pre");
  value.className = className;
  group.append(label, value);
  return { group, value };
}

function actionButton(
  ownerDocument: Document,
  label: string,
  className: string,
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function familyLabel(family: AlgorithmScenarioDefinition["family"]): string {
  const labels = {
    sorting: "排序",
    searching: "搜索",
    recursion: "递归",
    "linked-list": "链表",
    tree: "树",
    graph: "图",
    "dynamic-programming": "动态规划",
  } as const;
  return labels[family];
}

function assertOptions(options: ScenarioPanelOptions): void {
  if (
    typeof options.provider?.list !== "function" ||
    typeof options.provider.generate !== "function"
  ) {
    throw new TypeError("ScenarioPanel 需要有效的 ScenarioProvider");
  }
  if (
    typeof options.onRealRun !== "function" ||
    typeof options.onTeachingSimulation !== "function" ||
    typeof options.onBenchmark !== "function"
  ) {
    throw new TypeError("ScenarioPanel 需要真实、模拟和 Benchmark 回调");
  }
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("ScenarioPanel 已销毁");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
