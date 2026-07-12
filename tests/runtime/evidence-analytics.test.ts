import { describe, expect, it } from "vitest";
import {
  analyzeRunHistoryEvidence,
  compareGrowthToReference,
  defaultComplexityReference,
  scenarioReferenceWorkload,
  type ComplexityReference,
  type EvidenceAnalyticsPoint,
} from "../../src/runtime/evidence-analytics.js";
import {
  appendRunHistoryEntry,
  createEmptyRunHistory,
  type RunComparisonKey,
  type RunHistoryDocument,
  type RunHistoryEntryInput,
} from "../../src/runtime/index.js";

describe("run-history evidence analytics", () => {
  it("aggregates only successful runs from the exact source, scenario and toolchain cohort", () => {
    let history = createEmptyRunHistory();
    for (const input of [
      run("good-8-a", 8, 10, 80, 800),
      run("good-8-b", 8, 30, 120, 1_200),
      run("good-8-c", 8, 20, null, null),
      run("good-16-a", 16, 40, 240, 1_600),
      run("other-source", 16, 1, 1, 1, { sourceFingerprint: "source-b" }),
      run("other-scenario", 16, 1, 1, 1, {
        scenario: { id: "scenario.searching.linear", version: "1.0.0" },
      }),
      run("other-toolchain", 16, 1, 1, 1, {
        toolchain: { ...toolchain(), compilerVersion: "22.0.0" },
      }),
      run("failed", 16, 999, 999, 999, {
        measurement: { ok: false, termination: "wall-time-limit" },
      }),
      run("unscaled", null, 5, 5, 500),
    ]) {
      history = appendRunHistoryEntry(history, input);
    }
    const before = JSON.stringify(history);

    const result = analyzeRunHistoryEvidence(history, "source-a", comparisonKey());

    expect(result.cohort).toMatchObject({
      selectedBy: "comparison-key",
      sourceFingerprint: "source-a",
      scenario: { id: "scenario.sorting.integers", version: "1.0.0" },
      toolchain: toolchain(),
    });
    expect(result.runIds).toEqual(["good-8-a", "good-8-b", "good-8-c", "good-16-a", "unscaled"]);
    expect(result.unscaledRunIds).toEqual(["unscaled"]);
    expect(result.points).toEqual([
      {
        inputSize: 8,
        sampleCount: 3,
        runIds: ["good-8-a", "good-8-b", "good-8-c"],
        durationMs: { sampleCount: 3, median: 20, min: 10, max: 30 },
        operationCount: { sampleCount: 2, median: 100, min: 80, max: 120 },
        peakRssBytes: { sampleCount: 2, median: 1_000 },
      },
      {
        inputSize: 16,
        sampleCount: 1,
        runIds: ["good-16-a"],
        durationMs: { sampleCount: 1, median: 40, min: 40, max: 40 },
        operationCount: { sampleCount: 1, median: 240, min: 240, max: 240 },
        peakRssBytes: { sampleCount: 1, median: 1_600 },
      },
    ]);
    expect(result.growth.status).toBe("insufficient");
    expect(result.evidence).toContain("同源码、同情景、同工具链");
    expect(JSON.stringify(history)).toBe(before);
    expectDeepFrozen(result);
  });

  it("selects the latest successful current-source cohort when no comparison key is supplied", () => {
    let history = createEmptyRunHistory();
    history = appendRunHistoryEntry(history, run("sorting", 8, 10, 80, 800));
    history = appendRunHistoryEntry(
      history,
      run("searching-failed", 8, 10, 8, 800, {
        scenario: { id: "scenario.searching.linear", version: "1.0.0" },
        measurement: { ok: false },
      }),
    );
    history = appendRunHistoryEntry(
      history,
      run("searching-success", 16, 20, 16, 900, {
        scenario: { id: "scenario.searching.linear", version: "1.0.0" },
      }),
    );

    const result = analyzeRunHistoryEvidence(history, "source-a");

    expect(result.cohort).toMatchObject({
      selectedBy: "latest-successful-run",
      scenario: { id: "scenario.searching.linear" },
    });
    expect(result.runIds).toEqual(["searching-success"]);
    expect(result.reference).toMatchObject({ curve: "linear", confirmed: true });
  });

  it("normalizes actual and reference growth at the first valid point", () => {
    const points = [point(2, 4), point(4, 12), point(8, 32)];
    const reference: ComplexityReference = {
      curve: "linear",
      label: "n",
      source: "user-confirmed",
      confirmed: true,
      evidence: "用户确认目标为线性增长。",
    };

    const result = compareGrowthToReference(points, reference);

    expect(result).toEqual({
      status: "ready",
      anchorInputSize: 2,
      points: [
        { inputSize: 2, sampleCount: 3, actualGrowth: 1, referenceGrowth: 1, ratio: 1 },
        {
          inputSize: 4,
          sampleCount: 3,
          actualGrowth: 3,
          referenceGrowth: 2,
          ratio: 0.666667,
        },
        { inputSize: 8, sampleCount: 3, actualGrowth: 8, referenceGrowth: 4, ratio: 0.5 },
      ],
      evidence: expect.stringContaining("不是 Big-O 证明"),
    });
    expectDeepFrozen(result);
  });

  it("distinguishes insufficient evidence from an unconfirmed reference", () => {
    const confirmed: ComplexityReference = {
      curve: "quadratic",
      label: "n²",
      source: "user-confirmed",
      confirmed: true,
      evidence: "用户确认目标。",
    };
    const suggested: ComplexityReference = {
      ...confirmed,
      source: "ai-suggested",
      confirmed: false,
      evidence: "AI 建议，尚未由用户确认。",
    };

    expect(compareGrowthToReference([point(2, 4), point(4, 16)], confirmed)).toMatchObject({
      status: "insufficient",
      anchorInputSize: 2,
      points: [{ ratio: 1 }, { ratio: 1 }],
    });
    expect(compareGrowthToReference([point(2, 4), point(4, 16), point(8, 64)], suggested)).toEqual(
      expect.objectContaining({ status: "unconfirmed", anchorInputSize: null, points: [] }),
    );
    expect(compareGrowthToReference([point(2, 4), point(4, 16), point(8, 64)], null)).toEqual(
      expect.objectContaining({ status: "unconfirmed", anchorInputSize: null, points: [] }),
    );
  });

  it("publishes defaults only for known built-in scenario ids", () => {
    expect(defaultComplexityReference("scenario.sorting.integers")).toMatchObject({
      curve: "n-log-n",
      confirmed: true,
    });
    expect(defaultComplexityReference("scenario.graph.bfs-chain")).toMatchObject({
      curve: "v-plus-e",
      confirmed: true,
    });
    expect(defaultComplexityReference("scenario.dynamic-programming.fibonacci")).toMatchObject({
      curve: "linear",
      confirmed: true,
    });
    expect(defaultComplexityReference("scenario.searching.maximum")).toMatchObject({
      curve: "linear",
      label: "n（线性扫描）",
      confirmed: true,
      evidence: expect.stringContaining("最大值"),
    });
    expect(defaultComplexityReference("scenario.searching.minimum")).toMatchObject({
      curve: "linear",
      label: "n（线性扫描）",
      confirmed: true,
      evidence: expect.stringContaining("最小值"),
    });
    expect(scenarioReferenceWorkload("scenario.searching.maximum", 32)).toMatchObject({
      inputSize: 32,
      referenceOperationCount: 32,
      label: "n（线性扫描） 参考工作量",
    });
    expect(defaultComplexityReference("custom.sorting.assignment")).toBeNull();
    expect(defaultComplexityReference("scenario.unknown")).toBeNull();
  });

  it("fails closed for invalid documents, mismatched keys and malformed chart points", () => {
    expect(() =>
      analyzeRunHistoryEvidence(
        { schemaVersion: 99, revision: 0, entries: [] } as unknown as RunHistoryDocument,
        "source-a",
      ),
    ).toThrow(/schemaVersion/u);
    expect(() =>
      analyzeRunHistoryEvidence(createEmptyRunHistory(), "source-a", {
        ...comparisonKey(),
        sourceFingerprint: "source-b",
      }),
    ).toThrow(/sourceFingerprint/u);
    expect(() => compareGrowthToReference([point(4, 4), point(2, 2)], null)).toThrow(/严格递增/u);
    expect(() => defaultComplexityReference("custom id with spaces")).toThrow(/稳定标识符/u);
  });
});

function comparisonKey(): RunComparisonKey {
  return {
    sourceFingerprint: "source-a",
    scenario: { id: "scenario.sorting.integers", version: "1.0.0" },
    toolchain: toolchain(),
    inputSize: 8,
    caseFingerprint: "case:8",
  };
}

function toolchain() {
  return {
    compiler: "Apple clang",
    compilerVersion: "21.0.0",
    target: "arm64-apple-macos",
    runnerVersion: "1.0.0",
  } as const;
}

function run(
  id: string,
  inputSize: number | null,
  durationMs: number,
  operationCount: number | null,
  peakRssBytes: number | null,
  overrides: Omit<Partial<RunHistoryEntryInput>, "measurement"> & {
    readonly measurement?: Partial<RunHistoryEntryInput["measurement"]>;
  } = {},
): RunHistoryEntryInput {
  const measurement: RunHistoryEntryInput["measurement"] = {
    compileDurationMs: 5,
    durationMs,
    peakRssBytes,
    peakProcessCount: 1,
    outputBytes: 4,
    executedNodeCount: operationCount,
    operationCount,
    termination: "process-exit",
    ok: true,
    ...overrides.measurement,
  };
  return {
    id,
    recordedAt: `2026-07-12T00:00:${String(id.length).padStart(2, "0")}.000Z`,
    mode: "real",
    sourceFingerprint: "source-a",
    scenario: { id: "scenario.sorting.integers", version: "1.0.0" },
    caseFingerprint: inputSize === null ? "case:manual" : `case:${String(inputSize)}`,
    toolchain: toolchain(),
    inputSize,
    ...overrides,
    measurement,
  };
}

function point(inputSize: number, medianOperationCount: number): EvidenceAnalyticsPoint {
  return Object.freeze({
    inputSize,
    sampleCount: 3,
    runIds: Object.freeze([
      `run-${String(inputSize)}-1`,
      `run-${String(inputSize)}-2`,
      `run-${String(inputSize)}-3`,
    ]),
    durationMs: Object.freeze({
      sampleCount: 3,
      median: inputSize,
      min: inputSize,
      max: inputSize,
    }),
    operationCount: Object.freeze({
      sampleCount: 3,
      median: medianOperationCount,
      min: medianOperationCount,
      max: medianOperationCount,
    }),
    peakRssBytes: Object.freeze({ sampleCount: 3, median: 1_024 }),
  });
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
