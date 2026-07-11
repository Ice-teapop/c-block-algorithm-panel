import { describe, expect, it } from "vitest";
import {
  RUN_HISTORY_MAX_ENTRIES,
  RunHistoryError,
  appendRunHistoryEntry,
  createEmptyRunHistory,
  median,
  parseRunHistoryDocument,
  selectComparableRuns,
  summarizeComparableRuns,
  type RunComparisonKey,
  type RunHistoryEntryInput,
} from "../../src/runtime/index.js";

describe("versioned real run history", () => {
  it("starts frozen and rejects simulation without changing the document", () => {
    const empty = createEmptyRunHistory();
    expect(empty).toMatchObject({ schemaVersion: 1, revision: 0, entries: [] });
    expect(() => appendRunHistoryEntry(empty, run("simulation", 1, 10))).toThrowError(
      expect.objectContaining<Partial<RunHistoryError>>({
        code: "SIMULATION_NOT_PERSISTABLE",
      }),
    );
    expect(empty).toMatchObject({ revision: 0, entries: [] });
    expectDeepFrozen(empty);
  });

  it("appends immutable real evidence, rejects duplicate ids, and retains only the newest 100", () => {
    let document = createEmptyRunHistory();
    for (let index = 0; index < RUN_HISTORY_MAX_ENTRIES + 5; index += 1) {
      document = appendRunHistoryEntry(
        document,
        run("real", index + 1, index + 1, {
          id: `run-${String(index).padStart(3, "0")}`,
          recordedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        }),
      );
    }

    expect(document.revision).toBe(105);
    expect(document.entries).toHaveLength(100);
    expect(document.entries[0]?.id).toBe("run-005");
    expect(document.entries.at(-1)?.id).toBe("run-104");
    expect(() => appendRunHistoryEntry(document, { ...document.entries[0]! })).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_RUN_ID" }),
    );
    expectDeepFrozen(document);
  });

  it("parses only bounded schema-v1 real documents", () => {
    const valid = appendRunHistoryEntry(createEmptyRunHistory(), run("real", 4, 20));
    expect(parseRunHistoryDocument(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    expect(() => parseRunHistoryDocument({ ...valid, schemaVersion: 99 })).toThrowError(
      expect.objectContaining({ code: "INVALID_DOCUMENT" }),
    );
    expect(() =>
      parseRunHistoryDocument({
        schemaVersion: 1,
        revision: 0,
        entries: Array.from({ length: 101 }, () => valid.entries[0]),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_DOCUMENT" }));
  });
});

describe("strict comparability and metric evidence", () => {
  it("compares only exact source, scenario version, and toolchain identities", () => {
    let document = createEmptyRunHistory();
    document = appendRunHistoryEntry(document, run("real", 8, 80, { id: "match" }));
    document = appendRunHistoryEntry(
      document,
      run("real", 8, 81, { id: "source-mismatch", sourceFingerprint: "source-b" }),
    );
    document = appendRunHistoryEntry(
      document,
      run("real", 8, 82, {
        id: "scenario-mismatch",
        scenario: { id: "scenario.sorting", version: "2.0.0" },
      }),
    );
    document = appendRunHistoryEntry(
      document,
      run("real", 8, 83, {
        id: "toolchain-mismatch",
        toolchain: { ...comparisonKey().toolchain, compilerVersion: "22.0.0" },
      }),
    );

    expect(selectComparableRuns(document, comparisonKey(8)).map((entry) => entry.id)).toEqual([
      "match",
    ]);
  });

  it("reports independent medians and an operation-count trend without a composite score", () => {
    let document = createEmptyRunHistory();
    for (const [index, size, duration, operations] of [
      [1, 1, 9, 2],
      [2, 1, 3, 4],
      [3, 1, 6, 3],
      [4, 2, 10, 8],
      [5, 4, 18, 32],
    ] as const) {
      document = appendRunHistoryEntry(
        document,
        run("real", size, operations, {
          id: `run-summary-${String(index)}`,
          measurement: { durationMs: duration, peakRssBytes: 100 + index },
        }),
      );
    }

    const summary = summarizeComparableRuns(document, comparisonKey(1));
    expect(summary.compileDurationMs).toEqual({ sampleCount: 3, median: 5 });
    expect(summary.durationMs).toEqual({ sampleCount: 3, median: 6 });
    expect(summary.peakRssBytes).toEqual({ sampleCount: 3, median: 102 });
    expect(summary.operationCount).toEqual({ sampleCount: 3, median: 3 });
    expect(summary.growth).toMatchObject({
      basis: "instrumented-operation-count",
      trend: "increasing",
      confidence: "low",
    });
    expect(summary.growth.points.map((point) => point.inputSize)).toEqual([1, 2, 4]);
    expect(summary.growth.evidence).toContain("不是 Big-O 证明");
    expect("score" in summary).toBe(false);
    expect(JSON.stringify(summary)).not.toMatch(/composite|综合分/u);
    expectDeepFrozen(summary);
  });

  it("uses a deterministic median and marks fewer than three sizes insufficient", () => {
    expect(median([])).toBeNull();
    expect(median([9, 1, 5])).toBe(5);
    expect(median([10, 2])).toBe(6);

    const document = appendRunHistoryEntry(createEmptyRunHistory(), run("real", 10, 40));
    expect(summarizeComparableRuns(document, comparisonKey(10)).growth).toMatchObject({
      trend: "insufficient",
      confidence: "insufficient",
      estimatedLogLogSlope: null,
    });
  });

  it("keeps failed or resource-limited runs in history but out of performance medians", () => {
    let document = createEmptyRunHistory();
    document = appendRunHistoryEntry(document, run("real", 4, 16, { id: "successful" }));
    document = appendRunHistoryEntry(
      document,
      run("real", 4, 999, {
        id: "failed",
        measurement: { ok: false, termination: "wall-time-limit", durationMs: 999 },
      }),
    );

    expect(selectComparableRuns(document, comparisonKey(4))).toHaveLength(2);
    const summary = summarizeComparableRuns(document, comparisonKey(4));
    expect(summary.runIds).toEqual(["successful"]);
    expect(summary.durationMs).toEqual({ sampleCount: 1, median: 10 });
    expect(summary.operationCount).toEqual({ sampleCount: 1, median: 16 });
  });
});

function comparisonKey(inputSize = 1): RunComparisonKey {
  return {
    sourceFingerprint: "source-a",
    scenario: { id: "scenario.sorting", version: "1.0.0" },
    toolchain: {
      compiler: "Apple clang",
      compilerVersion: "21.0.0",
      target: "arm64-apple-macos",
      runnerVersion: "1.0.0",
    },
    inputSize,
    caseFingerprint: `case:${String(inputSize)}`,
  };
}

function run(
  mode: RunHistoryEntryInput["mode"],
  inputSize: number,
  operationCount: number,
  overrides: Omit<Partial<RunHistoryEntryInput>, "measurement"> & {
    readonly measurement?: Partial<RunHistoryEntryInput["measurement"]>;
  } = {},
): RunHistoryEntryInput {
  const baseMeasurement: RunHistoryEntryInput["measurement"] = {
    compileDurationMs: 5,
    durationMs: 10,
    peakRssBytes: 100,
    peakProcessCount: 1,
    outputBytes: 4,
    executedNodeCount: operationCount,
    operationCount,
    termination: "process-exit",
    ok: true,
  };
  const key = comparisonKey();
  return {
    id: overrides.id ?? `run-${mode}-${String(inputSize)}`,
    recordedAt: overrides.recordedAt ?? "2026-07-12T00:00:00.000Z",
    mode,
    sourceFingerprint: overrides.sourceFingerprint ?? key.sourceFingerprint,
    scenario: overrides.scenario ?? key.scenario,
    caseFingerprint: overrides.caseFingerprint ?? `case:${String(inputSize)}`,
    toolchain: overrides.toolchain ?? key.toolchain,
    inputSize,
    measurement: { ...baseMeasurement, ...overrides.measurement },
  };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
