import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createWorkbenchPrimaryActionState,
  selectWorkbenchPrimaryAction,
} from "../../src/app/workbench-primary-action.js";
import { sourceMayNeedRuntimeInput } from "../../src/ui/manual-run-input.js";

interface AutomatedGate {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly operator: "exact" | "max";
  readonly threshold: number;
  readonly evidence: readonly string[];
}

interface BenchmarkDefinition {
  readonly schemaVersion: number;
  readonly benchmarkId: string;
  readonly automatedGates: readonly AutomatedGate[];
  readonly manualTasks: readonly unknown[];
}

const benchmark = parseBenchmark(
  readFileSync(new URL("../../benchmarks/ux-interaction-v1.json", import.meta.url), "utf8"),
);
const shellSource = readFileSync(
  new URL("../../src/ui/workbench-shell.ts", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../../src/app/runtime-workspace-controller.ts", import.meta.url),
  "utf8",
);
const manualInputSource = readFileSync(
  new URL("../../src/ui/manual-run-input.ts", import.meta.url),
  "utf8",
);
const lessonRailSource = readFileSync(
  new URL("../../src/ui/guided-lesson-rail.ts", import.meta.url),
  "utf8",
);

describe("UX interaction benchmark v1", () => {
  it("has stable IDs, explicit units and no product score", () => {
    expect(benchmark.schemaVersion).toBe(1);
    expect(benchmark.benchmarkId).toBe("ux-interaction-v1");
    expect(benchmark.automatedGates).toHaveLength(7);
    expect(new Set(benchmark.automatedGates.map(({ id }) => id)).size).toBe(7);
    expect(benchmark.manualTasks).toHaveLength(3);

    const raw = JSON.stringify(benchmark);
    expect(raw).not.toMatch(/(?:product|maturity|overall)[-_ ]?score/iu);
    for (const gate of benchmark.automatedGates) {
      expect(gate.unit.length).toBeGreaterThan(0);
      expect(Number.isFinite(gate.threshold)).toBe(true);
      expect(gate.threshold).toBeGreaterThanOrEqual(0);
      expect(gate.evidence.length).toBeGreaterThan(0);
      expect(
        gate.evidence.every((entry) => entry.startsWith("src/") || entry.startsWith("tests/")),
      ).toBe(true);
    }
  });

  it("meets the one-activation ordinary first-run budget", () => {
    expect(selectWorkbenchPrimaryAction(createWorkbenchPrimaryActionState("1:a"))).toBe("run");
    expect(shellSource.match(/data-primary-action="run"/gu)).toHaveLength(1);
    expectGate("ordinary-first-run-activations", 1);
  });

  it("meets the two-activation stdin first-run budget", () => {
    expect(sourceMayNeedRuntimeInput('int main(void) { int n; scanf("%d", &n); }')).toBe(true);
    expect(runtimeSource).toContain("manualInput.requestInput()");
    expect(manualInputSource).toContain('editor.addEventListener("submit", onSubmit)');
    expectGate("input-first-run-activations", 2);
  });

  it("meets the one-activation next-problem budget with F8", () => {
    expect(runtimeSource).toContain('event.key !== "F8"');
    expect(runtimeSource).toContain('event.shiftKey ? "previous" : "next"');
    expect(runtimeSource).toContain("revealPrimaryProblem");
    expect(runtimeSource).not.toContain('button.setAttribute("aria-keyshortcuts", "F8 Shift+F8")');
    expectGate("next-problem-activations", 1);
  });

  it("keeps exactly one persistent workbench primary control", () => {
    const primaryControls = shellSource.match(/data-primary-action="[^"]+"/gu) ?? [];
    expectGate("persistent-primary-controls", primaryControls.length);
  });

  it("keeps at most one visible lesson action and four persistent regions", () => {
    expect(lessonRailSource).toContain("primaryAction.append(prepareSkeleton, injectBug, next)");
    expect(lessonRailSource).toContain(
      "const showInjectBug = !showPrepareSkeleton && snapshot.showInjectBug === true",
    );
    expect(lessonRailSource).toContain("next.hidden = showPrepareSkeleton || showInjectBug");
    expectGate("lesson-visible-primary-controls", 1);

    const rootAppend = /root\.append\(([^)]+)\);/u.exec(lessonRailSource)?.[1];
    expect(rootAppend).toBe("header, missionState, primaryAction, support");
    expectGate("lesson-persistent-regions", rootAppend?.split(",").length ?? Infinity);
  });

  it("keeps advanced runtime output collapsed by default", () => {
    const advanced = /<details class="runtime-advanced"([^>]*)>/u.exec(shellSource);
    expect(advanced).not.toBeNull();
    expect(advanced?.[1]).not.toMatch(/\bopen\b/u);
    expectGate("advanced-runtime-open-by-default", 0);
  });
});

function expectGate(id: string, actual: number): void {
  const gate = benchmark.automatedGates.find((candidate) => candidate.id === id);
  if (gate === undefined) throw new Error(`UX benchmark 缺少门禁：${id}`);
  if (gate.operator === "exact") expect(actual, gate.label).toBe(gate.threshold);
  else expect(actual, gate.label).toBeLessThanOrEqual(gate.threshold);
}

function parseBenchmark(raw: string): BenchmarkDefinition {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) throw new TypeError("UX benchmark 必须是对象");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.automatedGates) || !Array.isArray(record.manualTasks)) {
    throw new TypeError("UX benchmark 缺少门禁或手工任务");
  }
  return value as BenchmarkDefinition;
}
