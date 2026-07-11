import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramCst,
  type AnalysisFinding,
  type AnalysisFindingRuleId,
  type ProgramAnalysisSnapshot,
} from "../../src/analysis/index.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("M5a loop and runtime array-bound findings", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("publishes one strict certain off-by-one finding for canonical for and while loops", () => {
    const analysis = inspect(
      parser,
      [
        "int f(void) { int a[3]; int sum = 0; for (int i = 0; i <= 3; i++) { sum += a[i]; } return sum; }",
        "int g(void) { int b[4]; int sum = 0; int j = 0; while (j <= 4) { sum += b[j]; j++; } return sum; }",
      ].join("\n"),
    );
    const findings = forRule(analysis.snapshot, "loop-off-by-one");

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => selectedText(analysis, finding))).toEqual(["<=", "<="]);
    expect(findings.map((finding) => finding.subject)).toEqual(["a", "b"]);
    expect(findings.every((finding) => finding.confidence === "certain")).toBe(true);
    expect(findings.map((finding) => finding.evidence.map((entry) => entry.role))).toEqual([
      ["bound", "definition", "condition", "index", "use", "definition"],
      ["bound", "definition", "condition", "index", "use", "definition"],
    ]);
  });

  it.each([
    "int f(void) { int a[3]; int s = 0; for (int i = 0; i < 3; i++) s += a[i]; return s; }",
    "int f(void) { int a[4]; int s = 0; for (int i = 0; i <= 3; i++) s += a[i]; return s; }",
    "int f(void) { int a[3]; int s = 0; for (int i = 1; i <= 3; i++) s += a[i]; return s; }",
    "int f(void) { int a[3]; int s = 0; for (int i = 0; i <= 3; i += 2) s += a[i]; return s; }",
    "int f(void) { int a[3]; int s = 0; int i = 0; while (i <= 3) { i++; s += a[i]; } return s; }",
    "int f(int c) { int a[3]; int s = 0; for (int i = 0; i <= 3; i++) if (c) s += a[i]; return s; }",
    "int sink(int); int f(void) { int a[3]; int s = 0; for (int i = 0; i <= 3; i++) s += sink(a[i]); return s; }",
    "int f(void) { int a[3]; int s = 0; int i = 0; do { s += a[i]; i++; } while (i <= 3); return s; }",
  ])("keeps non-canonical inclusive loops outside the certain rule: %s", (source) => {
    expect(forRule(inspect(parser, source).snapshot, "loop-off-by-one")).toEqual([]);
  });

  it("publishes a hint when the loop controller and direct array index differ", () => {
    const analysis = inspect(
      parser,
      "int f(int n, int j) { int a[8]; int s = 0; for (int i = 0; i < n; i++) s += a[j]; return s; }",
    );
    const finding = onlyFinding(analysis.snapshot, "loop-index-mismatch");

    expect(finding.confidence).toBe("hint");
    expect(selectedText(analysis, finding)).toBe("j");
    expect(finding.evidence.map((entry) => entry.role)).toEqual(["condition", "index"]);
    expect(forRule(analysis.snapshot, "runtime-bound-check")).toEqual([]);
  });

  it.each([
    "int f(int n) { int a[8]; int s = 0; for (int i = 0; i < n; i++) s += a[i]; return s; }",
    "int f(int n) { int a[8]; int s = 0; for (int i = 0, j = 0; i < n && j < 8; i++, j++) s += a[j]; return s; }",
    "int f(int n) { int a[8]; int s = 0; for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) s += a[i]; return s; }",
    "int f(int n, int j, int c) { int a[8]; int s = 0; for (int i = 0; i < n; i++) if (c) s += a[j]; return s; }",
  ])("stays silent for matched, constrained, nested or conditional indices: %s", (source) => {
    expect(forRule(inspect(parser, source).snapshot, "loop-index-mismatch")).toEqual([]);
  });

  it("suggests checks for parameter, scanf and runtime loop-bound provenance", () => {
    const analysis = inspect(
      parser,
      [
        "int direct(int i) { int a[4]; return a[i]; }",
        'int scanf_index(void) { int a[4]; int i; scanf("%d", &i); return a[i]; }',
        "int loop_bound(int n) { int a[4]; int s = 0; for (int i = 0; i < n; i++) s += a[i]; return s; }",
      ].join("\n"),
    );
    const findings = forRule(analysis.snapshot, "runtime-bound-check");

    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => selectedText(analysis, finding))).toEqual(["i", "i", "i"]);
    expect(findings.every((finding) => finding.confidence === "hint")).toBe(true);
    expect(findings.map((finding) => finding.evidence.map((entry) => entry.role))).toEqual([
      ["bound", "definition", "index"],
      ["bound", "definition", "index"],
      ["bound", "definition", "condition", "index"],
    ]);
  });

  it.each([
    "int f(void) { int a[4]; int s = 0; for (int i = 0; i < 4; i++) s += a[i]; return s; }",
    "int f(void) { int a[4]; int s = 0; for (int i = 0; i <= 3; i++) s += a[i]; return s; }",
    "int f(int i) { int a[4]; int s = 0; for (; i >= 0 && i < 4; i++) s += a[i]; return s; }",
    "int f(int i, int c) { int a[4]; if (c) return a[i]; return 0; }",
    "int f(int i) { int a[4]; return a[i + 1]; }",
    "int f(int i) { int a[4]; return &a[i] == 0; }",
  ])(
    "does not overstate a runtime hint when bounds are proven or syntax is out of scope: %s",
    (source) => {
      expect(forRule(inspect(parser, source).snapshot, "runtime-bound-check")).toEqual([]);
    },
  );

  it("is deterministic, precedence-stable and deeply frozen", () => {
    const source =
      "int f(int n, int j) { int a[3]; int s = 0; for (int i = 0; i <= 3; i++) s += a[i]; for (int k = 0; k < n; k++) s += a[j]; return s; }";
    const first = inspect(parser, source).snapshot;
    const second = inspect(parser, source).snapshot;

    expect(first.findings).toEqual(second.findings);
    expect(forRule(first, "loop-off-by-one")).toHaveLength(1);
    expect(forRule(first, "loop-index-mismatch")).toHaveLength(1);
    expect(forRule(first, "runtime-bound-check")).toEqual([]);
    expect(deeplyFrozen(first.findings)).toBe(true);
  });
});

interface InspectedProgram {
  readonly source: string;
  readonly snapshot: ProgramAnalysisSnapshot;
}

function inspect(parser: CParser, source: string): InspectedProgram {
  return parser.inspect(source, 1, ({ rootNode, document }) =>
    Object.freeze({
      source,
      snapshot: analyzeProgramCst({ source, revision: 1, rootNode, document }),
    }),
  ).result;
}

function forRule(
  snapshot: ProgramAnalysisSnapshot,
  ruleId: AnalysisFindingRuleId,
): readonly AnalysisFinding[] {
  return snapshot.findings.filter((finding) => finding.ruleId === ruleId);
}

function onlyFinding(
  snapshot: ProgramAnalysisSnapshot,
  ruleId: AnalysisFindingRuleId,
): AnalysisFinding {
  const findings = forRule(snapshot, ruleId);
  if (findings.length !== 1 || findings[0] === undefined) {
    throw new Error(`${ruleId} finding 数量异常：${String(findings.length)}`);
  }
  return findings[0];
}

function selectedText(analysis: InspectedProgram, finding: AnalysisFinding): string {
  return analysis.source.slice(finding.primaryRange.from, finding.primaryRange.to);
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => deeplyFrozen(child, seen));
}
