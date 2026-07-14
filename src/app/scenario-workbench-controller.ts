import { createBuiltinScenarioProvider, type ScenarioProvider } from "../mentor/index.js";
import {
  createScenarioPanel,
  type RealScenarioRunRequest,
  type ScenarioBenchmarkRequest,
  type ScenarioBranchTarget,
  type ScenarioPanel,
  type ScenarioPanelSnapshot,
  type TeachingSimulationRequest,
} from "../ui/scenario-panel.js";

export interface ScenarioWorkbenchControllerOptions {
  readonly host: HTMLElement;
  readonly provider?: ScenarioProvider | undefined;
  readonly onScenarioChange?: (() => void) | undefined;
  /** The caller must run a real trace and reject an unmet target branch. */
  readonly onRealRunRequested: (request: RealScenarioRunRequest) => void | Promise<void>;
  /** Simulation is deliberately routed separately and must never enter run history. */
  readonly onTeachingSimulationRequested: (
    request: TeachingSimulationRequest,
  ) => void | Promise<void>;
  /** Each generated case must be executed for real before its metrics may be recorded. */
  readonly onBenchmarkRequested: (request: ScenarioBenchmarkRequest) => void | Promise<void>;
}

export interface ScenarioWorkbenchController {
  readonly panel: ScenarioPanel;
  readonly provider: ScenarioProvider;
  hasScenarioBinding(): boolean;
  clearScenarioBinding(): void;
  selectScenario(scenarioId: string): void;
  setInputSize(size: number): void;
  setBranchTargets(targets: readonly ScenarioBranchTarget[]): void;
  selectTargetBranch(targetId: string | null): void;
  configureBenchmark(sizes: readonly number[], repetitions: number): void;
  refreshScenarios(preferredScenarioId?: string | undefined): void;
  runReal(): Promise<void>;
  simulateForTeaching(): Promise<void>;
  runBenchmark(): Promise<void>;
  getSnapshot(): ScenarioPanelSnapshot;
  destroy(): void;
}

export function createScenarioWorkbenchController(
  options: ScenarioWorkbenchControllerOptions,
): ScenarioWorkbenchController {
  assertOptions(options);
  const provider = options.provider ?? createBuiltinScenarioProvider();
  let destroyed = false;

  const panel = createScenarioPanel(options.host, {
    provider,
    ...(options.onScenarioChange === undefined
      ? {}
      : { onScenarioChange: options.onScenarioChange }),
    onRealRun: (request) => options.onRealRunRequested(request),
    onTeachingSimulation: (request) => options.onTeachingSimulationRequested(request),
    onBenchmark: (request) => options.onBenchmarkRequested(request),
  });

  const assertAlive = (): void => {
    if (destroyed) throw new Error("ScenarioWorkbenchController 已销毁");
  };

  return Object.freeze({
    panel,
    provider,
    hasScenarioBinding(): boolean {
      assertAlive();
      return panel.hasScenarioBinding();
    },
    clearScenarioBinding(): void {
      assertAlive();
      panel.clearScenarioBinding();
    },
    selectScenario(scenarioId: string): void {
      assertAlive();
      panel.selectScenario(scenarioId);
    },
    setInputSize(size: number): void {
      assertAlive();
      panel.setSize(size);
    },
    setBranchTargets(targets: readonly ScenarioBranchTarget[]): void {
      assertAlive();
      panel.setBranchTargets(targets);
    },
    selectTargetBranch(targetId: string | null): void {
      assertAlive();
      panel.selectTargetBranch(targetId);
    },
    configureBenchmark(sizes: readonly number[], repetitions: number): void {
      assertAlive();
      if (new Set(sizes).size < 3) {
        throw new RangeError("Benchmark 至少需要 3 个不同规模");
      }
      if (!Number.isSafeInteger(repetitions) || repetitions < 3 || repetitions > 9) {
        throw new RangeError("Benchmark 重复次数必须是 3–9 的整数");
      }
      // Validate both fields before mutating either one.
      const snapshot = panel.getSnapshot();
      try {
        panel.setBenchmarkSizes(sizes);
        panel.setBenchmarkRepetitions(repetitions);
      } catch (error) {
        panel.setBenchmarkSizes(snapshot.benchmarkSizes);
        panel.setBenchmarkRepetitions(snapshot.benchmarkRepetitions);
        throw error;
      }
    },
    refreshScenarios(preferredScenarioId?: string): void {
      assertAlive();
      panel.refreshScenarios(preferredScenarioId);
    },
    async runReal(): Promise<void> {
      assertAlive();
      await panel.requestRealRun();
    },
    async simulateForTeaching(): Promise<void> {
      assertAlive();
      await panel.requestTeachingSimulation();
    },
    async runBenchmark(): Promise<void> {
      assertAlive();
      await panel.requestBenchmark();
    },
    getSnapshot(): ScenarioPanelSnapshot {
      assertAlive();
      return panel.getSnapshot();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      panel.destroy();
    },
  });
}

function assertOptions(options: ScenarioWorkbenchControllerOptions): void {
  if (options.host === null || typeof options.host !== "object") {
    throw new TypeError("ScenarioWorkbenchController 需要 host");
  }
  if (
    typeof options.onRealRunRequested !== "function" ||
    typeof options.onTeachingSimulationRequested !== "function" ||
    typeof options.onBenchmarkRequested !== "function"
  ) {
    throw new TypeError("ScenarioWorkbenchController 需要三种隔离的动作回调");
  }
}
