import type {
  AlgorithmScenarioDefinition,
  ScenarioProvider,
  ScenarioRunCase,
} from "../mentor/index.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";

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

export type ScenarioBinding = "none" | "explicit";

export interface RealScenarioRunRequest {
  readonly mode: "real";
  readonly scenario: AlgorithmScenarioDefinition;
  readonly runCase: ScenarioRunCase;
  readonly targetBranch: ScenarioBranchSelection | null;
  /** Path evidence is created only by the separate Observe action, never by this run. */
  readonly pathEvidence: "separate-observation";
  readonly historyPolicy: "record-after-successful-run";
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
  /** Workbench toolbar can own the one visible real-run control. */
  readonly primaryRunControl?: "embedded" | "external";
  readonly onScenarioChange?: ((binding: ScenarioBinding) => void) | undefined;
  readonly onRealRun: (request: RealScenarioRunRequest) => void | Promise<void>;
  readonly onTeachingSimulation: (request: TeachingSimulationRequest) => void | Promise<void>;
  readonly onBenchmark: (request: ScenarioBenchmarkRequest) => void | Promise<void>;
}

export interface ScenarioPanelSnapshot {
  readonly scenarioBinding: ScenarioBinding;
  readonly scenarioId: string;
  readonly size: number;
  readonly runCase: ScenarioRunCase;
  readonly targetBranch: ScenarioBranchSelection | null;
  readonly benchmarkSizes: readonly number[];
  readonly benchmarkRepetitions: number;
}

export interface ScenarioPanel {
  readonly element: HTMLElement;
  hasScenarioBinding(): boolean;
  clearScenarioBinding(): void;
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

interface ScenarioPanelCopy {
  readonly heading: string;
  readonly boundary: string;
  readonly scenario: string;
  readonly scenarioAria: string;
  readonly chooseScenario: string;
  readonly size: string;
  readonly sizeAria: string;
  readonly branch: string;
  readonly branchAria: string;
  readonly preview: string;
  readonly run: string;
  readonly simulation: string;
  readonly simulationTitle: string;
  readonly moreWays: string;
  readonly benchmark: string;
  readonly repetitions: string;
  readonly runBenchmark: string;
  readonly waiting: string;
  readonly empty: string;
  readonly none: string;
  readonly automaticBranch: string;
  readonly noBranchTargets: string;
  readonly chooseBeforeBenchmark: string;
  readonly chooseBeforeRun: string;
  readonly sizeUpdated: string;
  readonly realRun: string;
  readonly teachingSimulation: string;
}

const SCENARIO_PANEL_COPY: Readonly<Record<InterfaceLocale, ScenarioPanelCopy>> = Object.freeze({
  "zh-CN": Object.freeze({
    heading: "案例与分支执行",
    boundary: "本地执行",
    scenario: "案例",
    scenarioAria: "算法案例",
    chooseScenario: "选择案例…",
    size: "输入规模",
    sizeAria: "案例输入规模",
    branch: "目标分支（可选）",
    branchAria: "目标分支",
    preview: "输入与预期输出",
    run: "运行",
    simulation: "教学模拟",
    simulationTitle: "模拟只用于教学，不产生真实性能或输出结论",
    moreWays: "更多运行方式",
    benchmark: "Benchmark（高级）",
    repetitions: "重复次数",
    runBenchmark: "运行 Benchmark",
    waiting: "等待运行",
    empty: "（空）",
    none: "（无）",
    automaticBranch: "由真实输入决定",
    noBranchTargets: "未提供分支目标；真实条件决定执行路径",
    chooseBeforeBenchmark: "选择案例后可运行 Benchmark",
    chooseBeforeRun: "请先选择案例",
    sizeUpdated: "输入规模已更新",
    realRun: "真实运行",
    teachingSimulation: "教学模拟",
  }),
  en: Object.freeze({
    heading: "Cases and branch execution",
    boundary: "Local execution",
    scenario: "Case",
    scenarioAria: "Algorithm case",
    chooseScenario: "Choose a case…",
    size: "Input size",
    sizeAria: "Case input size",
    branch: "Target branch (optional)",
    branchAria: "Target branch",
    preview: "Input and expected output",
    run: "Run",
    simulation: "Teaching simulation",
    simulationTitle: "Simulation is for teaching only and produces no real performance evidence",
    moreWays: "More run modes",
    benchmark: "Benchmark (advanced)",
    repetitions: "Repetitions",
    runBenchmark: "Run benchmark",
    waiting: "Waiting to run",
    empty: "(empty)",
    none: "(none)",
    automaticBranch: "Decide from real input",
    noBranchTargets: "No branch target provided; real conditions determine the path",
    chooseBeforeBenchmark: "Choose a case to run a benchmark",
    chooseBeforeRun: "Choose a case first",
    sizeUpdated: "Input size updated",
    realRun: "Real run",
    teachingSimulation: "Teaching simulation",
  }),
});

export function createScenarioPanel(
  host: HTMLElement,
  options: ScenarioPanelOptions,
): ScenarioPanel {
  assertOptions(options);
  let scenarios = options.provider.list();
  if (scenarios.length === 0) throw new Error("ScenarioProvider 没有可用案例");

  const ownerDocument = host.ownerDocument;
  const localeHost =
    typeof host.closest === "function" ? host.closest<HTMLElement>("#workbench-shell") : null;
  let locale: InterfaceLocale = localeHost?.dataset.locale === "en" ? "en" : "zh-CN";
  const copy = (): ScenarioPanelCopy => SCENARIO_PANEL_COPY[locale];
  const root = ownerDocument.createElement("section");
  root.className = "scenario-panel";
  root.dataset.state = "ready";
  root.dataset.scenarioBinding = "none";

  const header = ownerDocument.createElement("header");
  header.className = "scenario-panel__header";
  const heading = ownerDocument.createElement("h2");
  heading.className = "scenario-panel__title";
  heading.textContent = copy().heading;
  const boundary = ownerDocument.createElement("span");
  boundary.className = "scenario-panel__boundary";
  boundary.textContent = copy().boundary;
  header.append(heading, boundary);

  const scenarioField = field(ownerDocument, copy().scenario);
  const scenarioSelect = ownerDocument.createElement("select");
  scenarioSelect.className = "scenario-panel__scenario";
  scenarioSelect.setAttribute("aria-label", copy().scenarioAria);
  const renderScenarioChoices = (): void => {
    scenarioSelect.replaceChildren();
    const unbound = ownerDocument.createElement("option");
    unbound.value = "";
    unbound.textContent = copy().chooseScenario;
    scenarioSelect.append(unbound);
    for (const item of scenarios) {
      const option = ownerDocument.createElement("option");
      option.value = item.id;
      const presentation = scenarioPresentation(item, locale);
      option.textContent = `${familyLabel(item.family, locale)} · ${presentation.label}`;
      scenarioSelect.append(option);
    }
  };
  renderScenarioChoices();
  scenarioField.control.append(scenarioSelect);

  const sizeField = field(ownerDocument, copy().size);
  const sizeInput = ownerDocument.createElement("input");
  sizeInput.className = "scenario-panel__size";
  sizeInput.type = "number";
  sizeInput.step = "1";
  sizeInput.setAttribute("aria-label", copy().sizeAria);
  const sizeHelp = ownerDocument.createElement("span");
  sizeHelp.className = "scenario-panel__size-help";
  sizeField.control.append(sizeInput, sizeHelp);

  const branchField = field(ownerDocument, copy().branch);
  const branchSelect = ownerDocument.createElement("select");
  branchSelect.className = "scenario-panel__branch";
  branchSelect.setAttribute("aria-label", copy().branchAria);
  const branchHelp = ownerDocument.createElement("output");
  branchHelp.className = "scenario-panel__branch-help";
  branchHelp.setAttribute("aria-live", "polite");
  branchField.control.append(branchSelect, branchHelp);

  const preview = ownerDocument.createElement("details");
  preview.className = "scenario-panel__preview";
  const previewSummary = ownerDocument.createElement("summary");
  previewSummary.textContent = copy().preview;
  const description = ownerDocument.createElement("p");
  description.className = "scenario-panel__description";
  const stdin = previewValue(ownerDocument, "stdin", "scenario-panel__stdin");
  const argumentsPreview = previewValue(ownerDocument, "args", "scenario-panel__args");
  const expected = previewValue(ownerDocument, "expected stdout", "scenario-panel__expected");
  preview.append(previewSummary, description, stdin.group, argumentsPreview.group, expected.group);

  const actionRow = ownerDocument.createElement("div");
  actionRow.className = "scenario-panel__actions";
  const realButton = actionButton(ownerDocument, copy().run, "scenario-panel__run-real");
  realButton.disabled = true;
  const simulationButton = actionButton(
    ownerDocument,
    copy().simulation,
    "scenario-panel__run-simulation",
  );
  simulationButton.dataset.mode = "teaching-simulation";
  simulationButton.title = copy().simulationTitle;
  simulationButton.disabled = true;
  const embedsPrimaryRun = options.primaryRunControl !== "external";
  if (embedsPrimaryRun) actionRow.append(realButton);

  const advanced = ownerDocument.createElement("details");
  advanced.className = "scenario-panel__advanced";
  const advancedSummary = ownerDocument.createElement("summary");
  advancedSummary.textContent = copy().moreWays;

  const benchmark = ownerDocument.createElement("details");
  benchmark.className = "scenario-panel__benchmark";
  const benchmarkSummary = ownerDocument.createElement("summary");
  benchmarkSummary.textContent = copy().benchmark;
  const benchmarkSizes = ownerDocument.createElement("div");
  benchmarkSizes.className = "scenario-panel__benchmark-sizes";
  const repetitionLabel = ownerDocument.createElement("label");
  const repetitionLabelText = ownerDocument.createElement("span");
  repetitionLabelText.textContent = copy().repetitions;
  const repetitionInput = ownerDocument.createElement("input");
  repetitionInput.className = "scenario-panel__repetitions";
  repetitionInput.type = "number";
  repetitionInput.min = String(MINIMUM_REPETITIONS);
  repetitionInput.max = String(MAXIMUM_REPETITIONS);
  repetitionInput.step = "1";
  repetitionInput.value = "3";
  repetitionLabel.append(repetitionLabelText, repetitionInput);
  const benchmarkButton = actionButton(
    ownerDocument,
    copy().runBenchmark,
    "scenario-panel__run-benchmark",
  );
  const benchmarkHelp = ownerDocument.createElement("output");
  benchmarkHelp.className = "scenario-panel__benchmark-help";
  benchmarkHelp.setAttribute("aria-live", "polite");
  benchmark.append(
    benchmarkSummary,
    benchmarkSizes,
    repetitionLabel,
    benchmarkButton,
    benchmarkHelp,
  );
  advanced.append(advancedSummary, simulationButton, benchmark);

  const status = ownerDocument.createElement("output");
  status.className = "scenario-panel__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = copy().waiting;
  status.hidden = true;

  root.append(header, scenarioField.root, sizeField.root, branchField.root, preview);
  if (embedsPrimaryRun) root.append(actionRow);
  root.append(advanced, status);
  host.replaceChildren(root);

  let destroyed = false;
  let scenarioBinding: ScenarioBinding = "none";
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
  let statusText: (copy: ScenarioPanelCopy) => string = (current) => current.waiting;

  const setStatus = (render: (copy: ScenarioPanelCopy) => string): void => {
    statusText = render;
    status.textContent = render(copy());
    status.hidden = false;
  };

  const updatePreview = (): void => {
    const presentation = scenarioPresentation(scenario, locale);
    scenarioSelect.value = scenarioBinding === "explicit" ? scenario.id : "";
    sizeInput.min = String(scenario.sizeGenerator.minimum);
    sizeInput.max = String(scenario.sizeGenerator.maximum);
    sizeInput.value = String(size);
    sizeHelp.textContent = `${String(scenario.sizeGenerator.minimum)}–${String(scenario.sizeGenerator.maximum)} · ${presentation.inputModel}`;
    description.textContent = presentation.description;
    stdin.value.textContent = runCase.stdin.length === 0 ? copy().empty : runCase.stdin;
    argumentsPreview.value.textContent =
      runCase.arguments.length === 0 ? copy().none : runCase.arguments.join(" ");
    expected.value.textContent = runCase.expected.stdout;
    renderBenchmarkChoices();
  };

  const renderBranchTargets = (): void => {
    branchField.root.hidden = branchTargets.length === 0;
    branchSelect.replaceChildren();
    const automatic = ownerDocument.createElement("option");
    automatic.value = "";
    automatic.textContent = copy().automaticBranch;
    branchSelect.append(automatic);
    for (const target of branchTargets) {
      const option = ownerDocument.createElement("option");
      option.value = target.id;
      option.disabled = !isEligibleTarget(target);
      const reason = localizedBranchDisabledReason(target, locale);
      option.textContent = reason === null ? target.label : `${target.label}（${reason}）`;
      branchSelect.append(option);
    }
    if (!isSelectableBranch(selectedBranchId, branchTargets)) selectedBranchId = null;
    branchSelect.value = selectedBranchId ?? "";
    const disabledCount = branchTargets.filter((target) => !isEligibleTarget(target)).length;
    branchHelp.textContent =
      branchTargets.length === 0
        ? copy().noBranchTargets
        : locale === "en"
          ? `${String(branchTargets.length - disabledCount)} verifiable, ${String(disabledCount)} disabled`
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
    const bound = scenarioBinding === "explicit";
    benchmarkButton.disabled = pending || !bound || !enoughSizes;
    benchmarkHelp.textContent = !bound
      ? copy().chooseBeforeBenchmark
      : enoughSizes
        ? locale === "en"
          ? `${String(selectedBenchmarkSizes.length)} sizes · ${String(benchmarkRepetitions)} repetitions each · real runs only`
          : `${String(selectedBenchmarkSizes.length)} 个规模 · 每个重复 ${String(benchmarkRepetitions)} 次 · 只记录真实运行`
        : locale === "en"
          ? `Choose at least ${String(MINIMUM_BENCHMARK_SIZES)} distinct sizes`
          : `至少选择 ${String(MINIMUM_BENCHMARK_SIZES)} 个不同规模`;
  };

  const updateActionAvailability = (): void => {
    const disabled = pending || scenarioBinding !== "explicit";
    realButton.disabled = disabled;
    simulationButton.disabled = disabled;
    updateBenchmarkStatus();
  };

  const setPending = (
    value: boolean,
    render: (copy: ScenarioPanelCopy, locale: InterfaceLocale) => string,
  ): void => {
    pending = value;
    root.dataset.state = value ? "working" : "ready";
    updateActionAvailability();
    setStatus((current) => render(current, locale));
  };

  const targetSelection = (): ScenarioBranchSelection | null => {
    if (selectedBranchId === null) return null;
    const target = branchTargets.find((candidate) => candidate.id === selectedBranchId);
    if (target === undefined || !isEligibleTarget(target)) {
      throw new Error(
        locale === "en"
          ? "The target branch is unreachable or has no valid case input"
          : "目标分支当前不可达或没有有效案例输入",
      );
    }
    return Object.freeze({ id: target.id, label: target.label });
  };

  const requireScenarioBinding = (): void => {
    assertAlive(destroyed);
    if (scenarioBinding === "explicit") return;
    setStatus((current) => current.chooseBeforeRun);
    root.dataset.state = "error";
    throw new Error(
      locale === "en"
        ? "No case is explicitly bound; choose a case first"
        : "案例尚未显式绑定；请先选择案例",
    );
  };

  const invoke = async (
    operation: "real" | "simulation" | "benchmark",
    action: () => void | Promise<void>,
  ): Promise<void> => {
    assertAlive(destroyed);
    if (pending) {
      throw new Error(locale === "en" ? "A case task is already running" : "已有案例任务正在执行");
    }
    setPending(true, (current, currentLocale) =>
      currentLocale === "en"
        ? `${scenarioOperationLabel(current, operation)} submitted`
        : `${scenarioOperationLabel(current, operation)}已提交`,
    );
    try {
      await action();
      setPending(false, (current, currentLocale) =>
        currentLocale === "en"
          ? `${scenarioOperationLabel(current, operation)} request completed`
          : `${scenarioOperationLabel(current, operation)}请求已完成`,
      );
    } catch (error) {
      const detail = toErrorMessage(error);
      setPending(false, (current, currentLocale) =>
        currentLocale === "en"
          ? `${scenarioOperationLabel(current, operation)} failed: ${detail}`
          : `${scenarioOperationLabel(current, operation)}失败：${detail}`,
      );
      root.dataset.state = "error";
      throw error;
    }
  };

  const renderLocale = (): void => {
    heading.textContent = copy().heading;
    boundary.textContent = copy().boundary;
    scenarioField.label.textContent = copy().scenario;
    scenarioSelect.setAttribute("aria-label", copy().scenarioAria);
    sizeField.label.textContent = copy().size;
    sizeInput.setAttribute("aria-label", copy().sizeAria);
    branchField.label.textContent = copy().branch;
    branchSelect.setAttribute("aria-label", copy().branchAria);
    previewSummary.textContent = copy().preview;
    realButton.textContent = copy().run;
    simulationButton.textContent = copy().simulation;
    simulationButton.title = copy().simulationTitle;
    advancedSummary.textContent = copy().moreWays;
    benchmarkSummary.textContent = copy().benchmark;
    repetitionLabelText.textContent = copy().repetitions;
    benchmarkButton.textContent = copy().runBenchmark;
    status.textContent = statusText(copy());
    renderScenarioChoices();
    updatePreview();
    renderBranchTargets();
    updateActionAvailability();
  };

  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    locale =
      typeof detail === "object" && detail !== null && "locale" in detail && detail.locale === "en"
        ? "en"
        : localeHost?.dataset.locale === "en"
          ? "en"
          : "zh-CN";
    renderLocale();
  };

  const api: ScenarioPanel = {
    element: root,
    hasScenarioBinding(): boolean {
      assertAlive(destroyed);
      return scenarioBinding === "explicit";
    },
    clearScenarioBinding(): void {
      assertAlive(destroyed);
      scenarioBinding = "none";
      root.dataset.scenarioBinding = scenarioBinding;
      selectedBranchId = null;
      branchTargets = Object.freeze([]);
      updatePreview();
      renderBranchTargets();
      updateActionAvailability();
      setStatus((current) => current.chooseBeforeRun);
      root.dataset.state = "ready";
      options.onScenarioChange?.(scenarioBinding);
    },
    selectScenario(scenarioId: string): void {
      assertAlive(destroyed);
      if (scenarioBinding === "explicit" && scenario.id === scenarioId) return;
      const next = options.provider.get(scenarioId);
      if (next === null) throw new RangeError(`未知算法案例：${scenarioId}`);
      scenarioBinding = "explicit";
      root.dataset.scenarioBinding = scenarioBinding;
      scenario = next;
      size = next.sizeGenerator.defaultSizes[0] ?? next.sizeGenerator.minimum;
      runCase = options.provider.generate(next.id, size);
      selectedBranchId = null;
      // validCase belongs to a concrete scenario input; never reuse it after switching cases.
      branchTargets = Object.freeze([]);
      selectedBenchmarkSizes = normalizeBenchmarkSizes(
        next.sizeGenerator.defaultSizes,
        next,
        locale,
      );
      updatePreview();
      renderBranchTargets();
      updateActionAvailability();
      options.onScenarioChange?.(scenarioBinding);
    },
    setSize(nextSize: number): void {
      assertAlive(destroyed);
      assertSize(nextSize, scenario, locale);
      if (size === nextSize) return;
      size = nextSize;
      runCase = options.provider.generate(scenario.id, size);
      selectedBranchId = null;
      branchTargets = Object.freeze([]);
      updatePreview();
      renderBranchTargets();
      if (scenarioBinding === "explicit") options.onScenarioChange?.(scenarioBinding);
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
      const reason = localizedBranchDisabledReason(target, locale);
      if (reason !== null) {
        throw new Error(
          locale === "en" ? `Target branch is unavailable: ${reason}` : `目标分支不可选：${reason}`,
        );
      }
      selectedBranchId = target.id;
      renderBranchTargets();
    },
    setBenchmarkSizes(sizes: readonly number[]): void {
      assertAlive(destroyed);
      selectedBenchmarkSizes = normalizeBenchmarkSizes(sizes, scenario, locale);
      renderBenchmarkChoices();
    },
    setBenchmarkRepetitions(repetitions: number): void {
      assertAlive(destroyed);
      assertBenchmarkRepetitions(repetitions, locale);
      benchmarkRepetitions = repetitions;
      repetitionInput.value = String(repetitions);
      updateBenchmarkStatus();
    },
    refreshScenarios(preferredScenarioId?: string): void {
      assertAlive(destroyed);
      const nextScenarios = options.provider.list();
      if (nextScenarios.length === 0) throw new Error("ScenarioProvider 没有可用案例");
      const wasBound = scenarioBinding === "explicit";
      scenarios = nextScenarios;
      const requestedId = preferredScenarioId ?? scenario.id;
      const requested = options.provider.get(requestedId);
      const next = requested ?? nextScenarios[0]!;
      scenarioBinding = wasBound && requested !== null ? "explicit" : "none";
      root.dataset.scenarioBinding = scenarioBinding;
      scenario = next;
      size = next.sizeGenerator.defaultSizes[0] ?? next.sizeGenerator.minimum;
      runCase = options.provider.generate(next.id, size);
      selectedBranchId = null;
      branchTargets = Object.freeze([]);
      selectedBenchmarkSizes = normalizeBenchmarkSizes(
        next.sizeGenerator.defaultSizes,
        next,
        locale,
      );
      renderScenarioChoices();
      updatePreview();
      renderBranchTargets();
      updateActionAvailability();
    },
    async requestRealRun(): Promise<void> {
      requireScenarioBinding();
      await invoke("real", () =>
        options.onRealRun(
          Object.freeze({
            mode: "real",
            scenario,
            runCase,
            targetBranch: targetSelection(),
            pathEvidence: "separate-observation",
            historyPolicy: "record-after-successful-run",
          }),
        ),
      );
    },
    async requestTeachingSimulation(): Promise<void> {
      requireScenarioBinding();
      await invoke("simulation", () =>
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
      requireScenarioBinding();
      await invoke("benchmark", () => {
        assertBenchmarkSizes(selectedBenchmarkSizes, scenario, locale);
        assertBenchmarkRepetitions(benchmarkRepetitions, locale);
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
        scenarioBinding,
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
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      host.replaceChildren();
    },
  };

  scenarioSelect.addEventListener("change", () => {
    if (scenarioSelect.value === "") api.clearScenarioBinding();
    else api.selectScenario(scenarioSelect.value);
  });
  sizeInput.addEventListener("change", () => {
    const parsed = Number(sizeInput.value);
    try {
      api.setSize(parsed);
      setStatus((current) => current.sizeUpdated);
      root.dataset.state = "ready";
    } catch (error) {
      sizeInput.value = String(size);
      const detail = toErrorMessage(error);
      setStatus(() =>
        locale === "en" ? `Invalid input size: ${detail}` : `输入规模无效：${detail}`,
      );
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
      const detail = toErrorMessage(error);
      setStatus(() =>
        locale === "en" ? `Invalid repetition count: ${detail}` : `重复次数无效：${detail}`,
      );
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
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);

  renderLocale();
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
  locale: InterfaceLocale = "zh-CN",
): readonly number[] {
  if (!Array.isArray(sizes)) throw new TypeError("benchmark sizes 必须是数组");
  const unique = [...new Set(sizes)];
  for (const size of unique) assertSize(size, scenario, locale);
  return Object.freeze(unique.sort((left, right) => left - right));
}

function assertBenchmarkSizes(
  sizes: readonly number[],
  scenario: AlgorithmScenarioDefinition,
  locale: InterfaceLocale = "zh-CN",
): void {
  for (const size of sizes) assertSize(size, scenario, locale);
  if (new Set(sizes).size < MINIMUM_BENCHMARK_SIZES) {
    throw new RangeError(
      locale === "en"
        ? `Benchmark requires at least ${String(MINIMUM_BENCHMARK_SIZES)} distinct sizes`
        : `Benchmark 至少需要 ${String(MINIMUM_BENCHMARK_SIZES)} 个不同规模`,
    );
  }
}

function assertBenchmarkRepetitions(repetitions: number, locale: InterfaceLocale = "zh-CN"): void {
  if (
    !Number.isSafeInteger(repetitions) ||
    repetitions < MINIMUM_REPETITIONS ||
    repetitions > MAXIMUM_REPETITIONS
  ) {
    throw new RangeError(
      locale === "en"
        ? `Benchmark repetitions must be an integer from ${String(MINIMUM_REPETITIONS)} to ${String(MAXIMUM_REPETITIONS)}`
        : `Benchmark 重复次数必须是 ${String(MINIMUM_REPETITIONS)}–${String(MAXIMUM_REPETITIONS)} 的整数`,
    );
  }
}

function assertSize(
  size: number,
  scenario: AlgorithmScenarioDefinition,
  locale: InterfaceLocale = "zh-CN",
): void {
  if (
    !Number.isSafeInteger(size) ||
    size < scenario.sizeGenerator.minimum ||
    size > scenario.sizeGenerator.maximum
  ) {
    throw new RangeError(
      locale === "en"
        ? `${scenarioPresentation(scenario, locale).label} input size must be an integer from ${String(scenario.sizeGenerator.minimum)} to ${String(scenario.sizeGenerator.maximum)}`
        : `${scenario.label} 的输入规模必须是 ${String(scenario.sizeGenerator.minimum)}–${String(scenario.sizeGenerator.maximum)} 的整数`,
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
  readonly label: HTMLElement;
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
  return { root, label, control };
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

function familyLabel(
  family: AlgorithmScenarioDefinition["family"],
  locale: InterfaceLocale,
): string {
  const labels: Readonly<
    Record<InterfaceLocale, Readonly<Record<AlgorithmScenarioDefinition["family"], string>>>
  > = {
    "zh-CN": {
      sorting: "排序",
      searching: "搜索",
      recursion: "递归",
      "linked-list": "链表",
      tree: "树",
      graph: "图",
      "dynamic-programming": "动态规划",
    },
    en: {
      sorting: "Sorting",
      searching: "Searching",
      recursion: "Recursion",
      "linked-list": "Linked list",
      tree: "Tree",
      graph: "Graph",
      "dynamic-programming": "Dynamic programming",
    },
  };
  return labels[locale][family];
}

interface ScenarioPresentation {
  readonly label: string;
  readonly description: string;
  readonly inputModel: string;
}

const ENGLISH_SCENARIO_PRESENTATIONS: Readonly<Record<string, ScenarioPresentation>> =
  Object.freeze({
    "scenario.sorting.integers": Object.freeze({
      label: "Integer sorting",
      description:
        "Read integers and print them in ascending order; no algorithm-specific growth curve is implied.",
      inputModel: "The first value is n, followed by n integers in descending order.",
    }),
    ...sortingScenarioPresentations("insertion", "Insertion sort"),
    ...sortingScenarioPresentations("quick", "Quicksort"),
    ...sortingScenarioPresentations("merge", "Merge sort"),
    "scenario.searching.linear": Object.freeze({
      label: "Linear search",
      description: "Search an ascending integer sequence for its last element.",
      inputModel: "The first line contains n and the target; the second contains n integers.",
    }),
    "scenario.searching.maximum": Object.freeze({
      label: "Linear maximum scan",
      description: "Scan integers including negative values and print the maximum.",
      inputModel: "The first value is count, followed by count integers.",
    }),
    "scenario.searching.minimum": Object.freeze({
      label: "Linear minimum scan",
      description: "Scan positive and negative integers and print the minimum.",
      inputModel: "The first value is count, followed by count integers.",
    }),
    "scenario.recursion.factorial": Object.freeze({
      label: "Recursive factorial",
      description: "Calculate the factorial of a small non-negative integer.",
      inputModel: "stdin contains only n; the range avoids overflow in the example.",
    }),
    "scenario.linked-list.reverse": Object.freeze({
      label: "Reverse linked-list traversal",
      description: "Build a linked list in input order and print its reverse traversal.",
      inputModel: "The first value is the node count, followed by the node values.",
    }),
    "scenario.tree.inorder": Object.freeze({
      label: "Binary-search-tree inorder traversal",
      description: "Insert distinct keys in the given order and print an inorder traversal.",
      inputModel: "The first value is the key count, followed by distinct integer keys.",
    }),
    "scenario.graph.bfs-chain": Object.freeze({
      label: "Chain graph BFS",
      description: "Breadth-first traverse an undirected chain starting from vertex 0.",
      inputModel: "The first line gives vertex and edge counts; each later line is an edge.",
    }),
    "scenario.dynamic-programming.fibonacci": Object.freeze({
      label: "Dynamic-programming Fibonacci",
      description: "Calculate Fibonacci numbers bottom-up.",
      inputModel: "stdin contains only n; the upper bound fits the signed 32-bit example.",
    }),
  });

function sortingScenarioPresentations(
  id: "insertion" | "quick" | "merge",
  label: string,
): Readonly<Record<string, ScenarioPresentation>> {
  const shapes = Object.freeze({
    "": "deterministically shuffled",
    ".sorted": "already sorted",
    ".reverse": "reverse-order",
    ".duplicates": "duplicate-value",
  });
  return Object.freeze(
    Object.fromEntries(
      Object.entries(shapes).map(([suffix, shape]) => [
        `scenario.sorting.${id}${suffix}`,
        Object.freeze({
          label: `${label} · ${shape}`,
          description: `Verify ${label} with a ${shape} input in a separate benchmark cohort.`,
          inputModel: `The first value is n, followed by n ${shape} integers; output is ascending.`,
        }),
      ]),
    ),
  );
}

function scenarioPresentation(
  scenario: AlgorithmScenarioDefinition,
  locale: InterfaceLocale,
): ScenarioPresentation {
  if (locale === "en") {
    const translated = ENGLISH_SCENARIO_PRESENTATIONS[scenario.id];
    if (translated !== undefined) return translated;
  }
  return {
    label: scenario.label,
    description: scenario.description,
    inputModel: scenario.sizeGenerator.inputModel,
  };
}

function localizedBranchDisabledReason(
  target: ScenarioBranchTarget,
  locale: InterfaceLocale,
): string | null {
  if (!target.structuralReachable) {
    return target.explanation ?? (locale === "en" ? "Structurally unreachable" : "结构上不可达");
  }
  if (!target.validCase) {
    return (
      target.explanation ??
      (locale === "en" ? "No valid case input is bound" : "没有绑定有效案例输入")
    );
  }
  return null;
}

function scenarioOperationLabel(
  copy: ScenarioPanelCopy,
  operation: "real" | "simulation" | "benchmark",
): string {
  if (operation === "real") return copy.realRun;
  if (operation === "simulation") return copy.teachingSimulation;
  return "Benchmark";
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
