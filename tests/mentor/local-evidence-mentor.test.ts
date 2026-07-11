import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProgramAnalysisSnapshot } from "../../src/analysis/index.js";
import { textRange } from "../../src/core/index.js";
import {
  LocalEvidenceMentor,
  type MentorHintContext,
  type RealExecutionPathSummary,
} from "../../src/mentor/index.js";
import {
  appendRunHistoryEntry,
  createEmptyRunHistory,
  type RunComparisonKey,
  type RunHistoryDocument,
  type RunHistoryEntryInput,
} from "../../src/runtime/index.js";

const mentorSource = readFileSync(
  new URL("../../src/mentor/local-evidence-mentor.ts", import.meta.url),
  "utf8",
);
const scenarioSource = readFileSync(
  new URL("../../src/mentor/scenarios.ts", import.meta.url),
  "utf8",
);

describe("LocalEvidenceMentor", () => {
  it("turns findings and nested loops into specific, source-linked, read-only feedback", () => {
    const provider = new LocalEvidenceMentor();
    const context: MentorHintContext = { analysis: analysisFixture() };
    const first = provider.getHints(context);
    const second = provider.getHints(context);

    expect(provider).toMatchObject({
      id: "builtin.local-evidence-mentor",
      version: "1.0.0",
      networkAccess: "none",
      sourceMutation: "none",
    });
    expect(first).toEqual(second);
    expect(first.map((hint) => hint.title)).toContain("读取前缺少可靠初始化");
    expect(first.map((hint) => hint.title)).toContain("嵌套循环值得单独测量");

    const finding = first.find((hint) => hint.id.startsWith("mentor.finding."));
    expect(finding).toMatchObject({
      level: "verification",
      confidence: "certain",
      sourceMutation: "none",
      target: { nodeId: "node.read", range: { from: 70, to: 75 } },
    });
    expect(finding?.evidence.length).toBeGreaterThan(1);
    expect(finding?.nextStep).toContain("每条可达分支");
    expectDeepFrozen(first);
  });

  it("uses only aligned real paths and identifies repeated actual visits without claiming generality", () => {
    const provider = new LocalEvidenceMentor();
    const analysis = analysisFixture();
    const realPath = pathFixture();
    const hints = provider.getHints({ analysis, realPath });
    const pathHint = hints.find((hint) => hint.id.startsWith("mentor.path."));

    expect(pathHint).toMatchObject({
      confidence: "hint",
      target: { nodeId: "node.inner", range: { from: 30, to: 60 } },
    });
    expect(pathHint?.summary).toContain("只代表本次输入");

    const stale = provider.getHints({
      analysis,
      realPath: { ...realPath, sourceFingerprint: "stale" },
    });
    expect(stale.some((hint) => hint.id.startsWith("mentor.path."))).toBe(false);

    const simulated = provider.getHints({
      analysis,
      realPath: { ...realPath, mode: "simulation" } as unknown as RealExecutionPathSummary,
    });
    expect(simulated.some((hint) => hint.id.startsWith("mentor.path."))).toBe(false);
  });

  it("summarizes only strictly comparable real history and keeps metrics separate", () => {
    const provider = new LocalEvidenceMentor();
    const key = comparisonKey();
    const history = historyFixture();
    const hints = provider.getHints({
      analysis: analysisFixture(),
      runHistory: history,
      comparisonKey: key,
    });

    const medianHint = hints.find((hint) => hint.id.startsWith("mentor.history.median."));
    const growthHint = hints.find((hint) => hint.id.startsWith("mentor.history.growth."));
    expect(medianHint?.summary).toContain("同源码、同情景、同工具链、同规模和同案例");
    expect(medianHint?.nextStep).toContain("不要把它们压成一个综合分");
    expect(growthHint?.summary).toContain("不是 Big-O 证明");
    expect(medianHint?.target).toBeNull();

    const mismatch = provider.getHints({
      analysis: analysisFixture(),
      runHistory: history,
      comparisonKey: { ...key, sourceFingerprint: "different-source" },
    });
    expect(mismatch.some((hint) => hint.id.startsWith("mentor.history."))).toBe(false);
  });

  it("has no network, panel API, or source-write dependency", () => {
    for (const source of [mentorSource, scenarioSource]) {
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|panelApi/u);
      expect(source).not.toMatch(/core\/(?:editing|emitter|patch)|applyPatch|writeFile/u);
    }
  });
});

function analysisFixture(): ProgramAnalysisSnapshot {
  const functionRange = textRange(0, 100);
  return Object.freeze({
    revision: 1,
    sourceLength: 100,
    sourceFingerprint: "source-a",
    functions: Object.freeze([
      Object.freeze({
        id: "function.main",
        name: "main",
        range: functionRange,
        entryId: "node.entry",
        exitId: "node.exit",
        nodes: Object.freeze([
          cfgNode("node.entry", "entry", 0, 0),
          cfgNode("node.outer", "control", 10, 90),
          cfgNode("node.inner", "control", 30, 60),
          cfgNode("node.read", "syntax", 70, 75),
          cfgNode("node.exit", "exit", 100, 100),
        ]),
        edges: Object.freeze([]),
        partial: false,
        partialReasons: Object.freeze([]),
      }),
    ]),
    defUse: Object.freeze([
      Object.freeze({
        functionId: "function.main",
        functionRange,
        status: "complete",
        disabledReasons: Object.freeze([]),
        variables: Object.freeze([]),
        facts: Object.freeze([]),
        reachingDefinitions: Object.freeze([]),
        loopRegions: Object.freeze([
          Object.freeze({
            id: "loop.outer",
            kind: "for",
            range: textRange(10, 90),
            conditionNodeId: "node.outer",
            entryNodeId: "node.outer",
            initializerNodeId: null,
            updateNodeId: null,
            parentLoopId: null,
            nodeIds: Object.freeze(["node.outer", "node.inner"]),
            availability: "analyzable",
          }),
          Object.freeze({
            id: "loop.inner",
            kind: "for",
            range: textRange(30, 60),
            conditionNodeId: "node.inner",
            entryNodeId: "node.inner",
            initializerNodeId: null,
            updateNodeId: null,
            parentLoopId: "loop.outer",
            nodeIds: Object.freeze(["node.inner"]),
            availability: "analyzable",
          }),
        ]),
        loopPredicates: Object.freeze([]),
        loopConditions: Object.freeze([]),
        arrayShapes: Object.freeze([]),
        arrayAccesses: Object.freeze([]),
      }),
    ]),
    memoryEvents: Object.freeze([
      Object.freeze({
        functionId: "function.main",
        functionRange,
        status: "complete",
        disabledReasons: Object.freeze([]),
        handleVariableIds: Object.freeze([]),
        facts: Object.freeze([]),
      }),
    ]),
    memoryTypestate: Object.freeze([
      Object.freeze({
        functionId: "function.main",
        functionRange,
        status: "complete",
        disabledReasons: Object.freeze([]),
        handleVariableIds: Object.freeze([]),
        facts: Object.freeze([]),
        edgeFacts: Object.freeze([]),
      }),
    ]),
    findings: Object.freeze([
      Object.freeze({
        id: "finding.uninitialized",
        functionId: "function.main",
        ruleId: "uninitialized-read",
        reason: "no-reaching-definition",
        confidence: "certain",
        primaryRange: textRange(70, 75),
        ownerNodeId: "node.read",
        subject: "value",
        subjectVariableId: "variable.value",
        evidence: Object.freeze([Object.freeze({ role: "use", range: textRange(71, 74) })]),
      }),
    ]),
  });
}

function cfgNode(
  id: string,
  kind: "entry" | "exit" | "syntax" | "control",
  from: number,
  to: number,
) {
  return Object.freeze({
    id,
    kind,
    role: kind === "entry" || kind === "exit" ? ("boundary" as const) : ("control" as const),
    ownership: kind === "entry" || kind === "exit" ? ("boundary" as const) : ("primary" as const),
    nodeType: kind === "entry" || kind === "exit" ? null : "for_statement",
    range: textRange(from, to),
    ownerBlockRange: textRange(from, to),
    reachable: true,
  });
}

function pathFixture(): RealExecutionPathSummary {
  return Object.freeze({
    mode: "real",
    sourceFingerprint: "source-a",
    scenario: Object.freeze({ id: "scenario.sorting", version: "1.0.0" }),
    nodeVisits: Object.freeze([
      Object.freeze({
        nodeId: "node.inner",
        range: textRange(30, 60),
        count: 8,
      }),
    ]),
    durationMs: 12,
    operationCount: 64,
  });
}

function comparisonKey(): RunComparisonKey {
  return {
    sourceFingerprint: "source-a",
    scenario: { id: "scenario.sorting", version: "1.0.0" },
    toolchain: {
      compiler: "Apple clang",
      compilerVersion: "21.0.0",
      target: "arm64-apple-macos",
      runnerVersion: "1.0.0",
    },
    inputSize: 2,
    caseFingerprint: "case:2",
  };
}

function historyFixture(): RunHistoryDocument {
  let document = createEmptyRunHistory();
  for (const size of [2, 4, 8]) {
    for (const repetition of [1, 2]) {
      document = appendRunHistoryEntry(document, runEntry(size, repetition));
    }
  }
  return document;
}

function runEntry(size: number, repetition: number): RunHistoryEntryInput {
  const key = comparisonKey();
  return {
    id: `mentor-run-${String(size)}-${String(repetition)}`,
    recordedAt: `2026-07-12T00:00:${String(size * 2 + repetition).padStart(2, "0")}.000Z`,
    mode: "real",
    sourceFingerprint: key.sourceFingerprint,
    scenario: key.scenario,
    caseFingerprint: `case:${String(size)}`,
    toolchain: key.toolchain,
    inputSize: size,
    measurement: {
      compileDurationMs: 5,
      durationMs: size,
      peakRssBytes: 100 + size,
      peakProcessCount: 1,
      outputBytes: 4,
      executedNodeCount: size,
      operationCount: size * size,
      termination: "process-exit",
      ok: true,
    },
  };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
