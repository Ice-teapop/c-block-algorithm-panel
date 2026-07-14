import { describe, expect, it, vi } from "vitest";
import {
  createScenarioWorkbenchController,
  type ScenarioWorkbenchControllerOptions,
} from "../../src/app/scenario-workbench-controller.js";
import type {
  RealScenarioRunRequest,
  ScenarioBenchmarkRequest,
  TeachingSimulationRequest,
} from "../../src/ui/scenario-panel.js";

describe("scenario workbench controller", () => {
  it("starts without a scenario binding and rejects every run path until explicitly selected", async () => {
    const fixture = setup();

    expect(fixture.controller.hasScenarioBinding()).toBe(false);
    expect(fixture.controller.getSnapshot().scenarioBinding).toBe("none");
    await expect(fixture.controller.runReal()).rejects.toThrow(/尚未显式绑定/u);
    await expect(fixture.controller.simulateForTeaching()).rejects.toThrow(/尚未显式绑定/u);
    await expect(fixture.controller.runBenchmark()).rejects.toThrow(/尚未显式绑定/u);
    expect(fixture.real).not.toHaveBeenCalled();
    expect(fixture.simulation).not.toHaveBeenCalled();
    expect(fixture.benchmark).not.toHaveBeenCalled();

    fixture.controller.selectScenario("scenario.sorting.integers");
    expect(fixture.controller.hasScenarioBinding()).toBe(true);
    fixture.controller.clearScenarioBinding();
    expect(fixture.controller.hasScenarioBinding()).toBe(false);
    await expect(fixture.controller.runReal()).rejects.toThrow(/尚未显式绑定/u);
    expect(fixture.real).not.toHaveBeenCalled();
  });

  it("uses the seven-family local provider and forwards a trace-verifiable real request", async () => {
    const fixture = setup();
    expect(new Set(fixture.controller.provider.list().map((item) => item.family))).toHaveLength(7);
    fixture.controller.selectScenario("scenario.graph.bfs-chain");
    fixture.controller.setInputSize(4);
    fixture.controller.setBranchTargets([
      {
        id: "loop.exit",
        label: "退出循环",
        structuralReachable: true,
        validCase: true,
      },
    ]);
    fixture.controller.selectTargetBranch("loop.exit");

    await fixture.controller.runReal();

    expect(fixture.real).toHaveBeenCalledOnce();
    expect(fixture.real.mock.calls[0]?.[0]).toMatchObject({
      mode: "real",
      scenario: { id: "scenario.graph.bfs-chain" },
      runCase: { size: 4 },
      targetBranch: { id: "loop.exit" },
      traceValidation: "required",
    });
  });

  it("never routes teaching simulation through real or benchmark callbacks", async () => {
    const fixture = setup();
    fixture.controller.selectScenario("scenario.sorting.integers");
    await fixture.controller.simulateForTeaching();

    expect(fixture.simulation).toHaveBeenCalledOnce();
    expect(fixture.simulation.mock.calls[0]?.[0]).toMatchObject({
      mode: "teaching-simulation",
      historyPolicy: "never-record",
      performanceEvidence: "not-applicable",
    });
    expect(fixture.real).not.toHaveBeenCalled();
    expect(fixture.benchmark).not.toHaveBeenCalled();
  });

  it("rejects targets that are unreachable or have no valid case", () => {
    const fixture = setup();
    fixture.controller.setBranchTargets([
      {
        id: "unreachable",
        label: "不可达",
        structuralReachable: false,
        validCase: true,
      },
      {
        id: "unbound",
        label: "无案例",
        structuralReachable: true,
        validCase: false,
      },
    ]);

    expect(() => fixture.controller.selectTargetBranch("unreachable")).toThrow(/结构上不可达/u);
    expect(() => fixture.controller.selectTargetBranch("unbound")).toThrow(/有效案例/u);
  });

  it("validates benchmark scale count, ranges and repetitions before dispatch", async () => {
    const fixture = setup();
    fixture.controller.selectScenario("scenario.dynamic-programming.fibonacci");

    expect(() => fixture.controller.configureBenchmark([8, 24], 3)).toThrow(/至少需要 3 个/u);
    expect(() => fixture.controller.configureBenchmark([8, 24, 40], 2)).toThrow(/3–9/u);
    expect(() => fixture.controller.configureBenchmark([8, 24, 47], 3)).toThrow(/1–46/u);
    expect(fixture.benchmark).not.toHaveBeenCalled();

    fixture.controller.configureBenchmark([8, 24, 40], 9);
    await fixture.controller.runBenchmark();
    expect(fixture.benchmark).toHaveBeenCalledOnce();
    expect(fixture.benchmark.mock.calls[0]?.[0]).toMatchObject({
      mode: "benchmark",
      sizes: [8, 24, 40],
      repetitions: 9,
      historyPolicy: "record-real-runs-only",
    });
  });

  it("cleans up its host and rejects use after destroy", () => {
    const fixture = setup();
    expect(fixture.host.children).toHaveLength(1);
    fixture.controller.destroy();
    expect(fixture.host.children).toHaveLength(0);
    expect(() => fixture.controller.getSnapshot()).toThrow(/已销毁/u);
  });
});

function setup(): {
  readonly controller: ReturnType<typeof createScenarioWorkbenchController>;
  readonly host: FakeElement;
  readonly real: ReturnType<typeof vi.fn<(request: RealScenarioRunRequest) => void>>;
  readonly simulation: ReturnType<typeof vi.fn<(request: TeachingSimulationRequest) => void>>;
  readonly benchmark: ReturnType<typeof vi.fn<(request: ScenarioBenchmarkRequest) => void>>;
} {
  const document = new FakeDocument();
  const host = document.createElement("div");
  const real = vi.fn<(request: RealScenarioRunRequest) => void>();
  const simulation = vi.fn<(request: TeachingSimulationRequest) => void>();
  const benchmark = vi.fn<(request: ScenarioBenchmarkRequest) => void>();
  const options: ScenarioWorkbenchControllerOptions = {
    host: host as unknown as HTMLElement,
    onRealRunRequested: real,
    onTeachingSimulationRequested: simulation,
    onBenchmarkRequested: benchmark,
  };
  return {
    controller: createScenarioWorkbenchController(options),
    host,
    real,
    simulation,
    benchmark,
  };
}

class FakeDocument {
  createElement(_tagName: string): FakeElement {
    return new FakeElement(this);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly #listeners = new Map<string, Set<() => void>>();
  className = "";
  textContent = "";
  type = "";
  value = "";
  title = "";
  min = "";
  max = "";
  step = "";
  disabled = false;
  checked = false;

  constructor(readonly ownerDocument: FakeDocument) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(_name: string, _value: string): void {}

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }
}
