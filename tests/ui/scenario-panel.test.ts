import { describe, expect, it, vi } from "vitest";
import { createBuiltinScenarioProvider } from "../../src/mentor/index.js";
import {
  branchDisabledReason,
  createScenarioPanel,
  type RealScenarioRunRequest,
  type ScenarioBenchmarkRequest,
  type TeachingSimulationRequest,
} from "../../src/ui/scenario-panel.js";

describe("scenario panel", () => {
  it("lists all seven local families and previews deterministic case inputs", () => {
    const provider = createBuiltinScenarioProvider();
    const fixture = fakeHost();
    const panel = createScenarioPanel(fixture.host, callbacks());

    expect(new Set(provider.list().map((scenario) => scenario.family))).toEqual(
      new Set([
        "sorting",
        "searching",
        "recursion",
        "linked-list",
        "tree",
        "graph",
        "dynamic-programming",
      ]),
    );
    expect(fixture.findByClass("scenario-panel__scenario")?.children).toHaveLength(7);

    panel.selectScenario("scenario.searching.linear");
    panel.setSize(4);
    expect(panel.getSnapshot()).toMatchObject({
      scenarioId: "scenario.searching.linear",
      size: 4,
      runCase: {
        stdin: "4 4\n1 2 3 4\n",
        arguments: [],
        expected: { stdout: "3\n" },
      },
    });
    expect(fixture.findByClass("scenario-panel__stdin")?.textContent).toBe("4 4\n1 2 3 4\n");
    expect(fixture.findByClass("scenario-panel__args")?.textContent).toBe("（无）");
    expect(fixture.findByClass("scenario-panel__expected")?.textContent).toBe("3\n");
  });

  it("rejects non-integer and out-of-range input sizes", () => {
    const panel = createScenarioPanel(fakeHost().host, callbacks());
    panel.selectScenario("scenario.recursion.factorial");

    expect(() => panel.setSize(0)).toThrow(/1–12/u);
    expect(() => panel.setSize(13)).toThrow(/1–12/u);
    expect(() => panel.setSize(1.5)).toThrow(/整数/u);
    panel.setSize(12);
    expect(panel.getSnapshot().size).toBe(12);
  });

  it("keeps real execution and teaching simulation requests semantically isolated", async () => {
    const real: RealScenarioRunRequest[] = [];
    const simulated: TeachingSimulationRequest[] = [];
    const panel = createScenarioPanel(fakeHost().host, {
      provider: createBuiltinScenarioProvider(),
      onRealRun: (request) => {
        real.push(request);
      },
      onTeachingSimulation: (request) => {
        simulated.push(request);
      },
      onBenchmark: vi.fn(),
    });
    panel.setBranchTargets([
      {
        id: "if.true",
        label: "条件成立",
        structuralReachable: true,
        validCase: true,
      },
    ]);
    panel.selectTargetBranch("if.true");

    await panel.requestRealRun();
    await panel.requestTeachingSimulation();

    expect(real).toHaveLength(1);
    expect(real[0]).toMatchObject({
      mode: "real",
      targetBranch: { id: "if.true" },
      traceValidation: "required",
      historyPolicy: "record-after-trace-validation",
    });
    expect(simulated).toHaveLength(1);
    expect(simulated[0]).toMatchObject({
      mode: "teaching-simulation",
      targetBranch: { id: "if.true" },
      historyPolicy: "never-record",
      performanceEvidence: "not-applicable",
    });
    expect(simulated[0]).not.toHaveProperty("traceValidation");
  });

  it("disables unreachable or unbound branch targets with a reason", () => {
    const fixture = fakeHost();
    const panel = createScenarioPanel(fixture.host, callbacks());
    const unreachable = {
      id: "dead",
      label: "不可达分支",
      structuralReachable: false,
      validCase: true,
    } as const;
    const noCase = {
      id: "no-case",
      label: "缺少输入",
      structuralReachable: true,
      validCase: false,
    } as const;
    panel.setBranchTargets([
      unreachable,
      noCase,
      {
        id: "ready",
        label: "可验证分支",
        structuralReachable: true,
        validCase: true,
      },
    ]);

    expect(branchDisabledReason(unreachable)).toBe("结构上不可达");
    expect(branchDisabledReason(noCase)).toBe("没有绑定有效案例输入");
    expect(() => panel.selectTargetBranch("dead")).toThrow(/结构上不可达/u);
    expect(() => panel.selectTargetBranch("no-case")).toThrow(/没有绑定有效案例输入/u);
    panel.selectTargetBranch("ready");
    expect(panel.getSnapshot().targetBranch).toEqual({ id: "ready", label: "可验证分支" });

    const options = fixture.findByClass("scenario-panel__branch")?.children ?? [];
    expect(options.find((option) => option.value === "dead")?.disabled).toBe(true);
    expect(options.find((option) => option.value === "no-case")?.disabled).toBe(true);
    expect(options.find((option) => option.value === "ready")?.disabled).toBe(false);
  });

  it("requires three valid scales and 3–9 repetitions for a real benchmark", async () => {
    const benchmark = vi.fn<(request: ScenarioBenchmarkRequest) => void>();
    const panel = createScenarioPanel(fakeHost().host, {
      provider: createBuiltinScenarioProvider(),
      onRealRun: vi.fn(),
      onTeachingSimulation: vi.fn(),
      onBenchmark: benchmark,
    });
    panel.selectScenario("scenario.sorting.integers");

    panel.setBenchmarkSizes([8, 32]);
    await expect(panel.requestBenchmark()).rejects.toThrow(/至少需要 3 个/u);
    expect(benchmark).not.toHaveBeenCalled();
    expect(() => panel.setBenchmarkSizes([0, 8, 32])).toThrow(/1–256/u);
    expect(() => panel.setBenchmarkRepetitions(2)).toThrow(/3–9/u);
    expect(() => panel.setBenchmarkRepetitions(10)).toThrow(/3–9/u);

    panel.setBenchmarkSizes([8, 32, 128, 128]);
    panel.setBenchmarkRepetitions(7);
    await panel.requestBenchmark();
    expect(benchmark).toHaveBeenCalledOnce();
    expect(benchmark.mock.calls[0]?.[0]).toMatchObject({
      mode: "benchmark",
      sizes: [8, 32, 128],
      repetitions: 7,
      historyPolicy: "record-real-runs-only",
    });
    expect(benchmark.mock.calls[0]?.[0].cases).toHaveLength(3);
  });
});

function callbacks(): Parameters<typeof createScenarioPanel>[1] {
  return {
    provider: createBuiltinScenarioProvider(),
    onRealRun: vi.fn(),
    onTeachingSimulation: vi.fn(),
    onBenchmark: vi.fn(),
  };
}

function fakeHost(): {
  readonly host: HTMLElement;
  findByClass(className: string): FakeElement | undefined;
} {
  const document = new FakeDocument();
  const root = document.createElement("div");
  return {
    host: root as unknown as HTMLElement,
    findByClass: (className) => walk(root).find((element) => element.className === className),
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

function walk(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => walk(child))];
}
