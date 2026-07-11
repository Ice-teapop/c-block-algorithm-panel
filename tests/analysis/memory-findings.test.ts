import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramCst,
  type AnalysisFinding,
  type AnalysisFindingRuleId,
  type ProgramAnalysisSnapshot,
} from "../../src/analysis/index.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

const MEMORY_RULE_IDS = new Set<AnalysisFindingRuleId>([
  "memory-leak",
  "possible-memory-leak",
  "double-free",
  "possible-double-free",
  "use-after-free",
  "possible-use-after-free",
  "malloc-sizeof-pointer",
  "unchecked-allocation",
]);

describe("M5a unique-handle memory findings", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("reports a live allocation at every normal exit as a certain leak", () => {
    const analysis = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); return 0; }",
    );
    const findings = memoryFindings(analysis);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "memory-leak",
      reason: "live-at-all-normal-exits",
      confidence: "certain",
      subject: "p",
    });
    expect(selectedText(analysis, findings[0]!)).toBe("malloc(4)");
    expect(findings[0]?.evidence.map((evidence) => evidence.role)).toEqual(["allocation", "exit"]);
  });

  it("reports a live allocation at only some normal exits as a likely leak", () => {
    const analysis = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) free(p); return 0; }",
    );
    const findings = findingsFor(analysis, "possible-memory-leak");

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      reason: "live-at-some-normal-exit",
      confidence: "likely",
      subject: "p",
    });
    expect(selectedText(analysis, findings[0]!)).toBe("malloc(4)");
    expect(findings[0]?.evidence.map((evidence) => evidence.role)).toEqual([
      "allocation",
      "free",
      "exit",
    ]);
    expect(findingsFor(analysis, "memory-leak")).toEqual([]);
  });

  it("distinguishes must-free from may-free before a later free", () => {
    const certain = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); free(p); free(p); return 0; }",
    );
    const possible = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) free(p); free(p); return 0; }",
    );
    const certainFinding = onlyFinding(certain, "double-free");
    const possibleFinding = onlyFinding(possible, "possible-double-free");

    expect(certainFinding).toMatchObject({
      reason: "must-freed-before-free",
      confidence: "certain",
      subject: "p",
    });
    expect(certainFinding.primaryRange.from).toBe(certain.source.lastIndexOf("free(p)"));
    expect(certainFinding.evidence.map((evidence) => evidence.role)).toEqual(["free", "free"]);

    expect(possibleFinding).toMatchObject({
      reason: "may-freed-before-free",
      confidence: "likely",
      subject: "p",
    });
    expect(possibleFinding.primaryRange.from).toBe(possible.source.lastIndexOf("free(p)"));
    expect(possibleFinding.evidence.map((evidence) => evidence.role)).toEqual(["free", "free"]);
    expect(findingsFor(certain, "possible-double-free")).toEqual([]);
    expect(findingsFor(possible, "double-free")).toEqual([]);
  });

  it("distinguishes must-free from may-free before dereference and gives UAF priority", () => {
    const certain = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); free(p); return *p; }",
    );
    const possible = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) free(p); return *p; }",
    );
    const certainFinding = onlyFinding(certain, "use-after-free");
    const possibleFinding = onlyFinding(possible, "possible-use-after-free");

    expect(certainFinding).toMatchObject({
      reason: "must-freed-before-dereference",
      confidence: "certain",
      subject: "p",
    });
    expect(selectedText(certain, certainFinding)).toBe("*p");
    expect(certainFinding.evidence.map((evidence) => evidence.role)).toEqual(["free", "use"]);

    expect(possibleFinding).toMatchObject({
      reason: "may-freed-before-dereference",
      confidence: "likely",
      subject: "p",
    });
    expect(selectedText(possible, possibleFinding)).toBe("*p");
    expect(possibleFinding.evidence.map((evidence) => evidence.role)).toEqual(["free", "use"]);
    expect(findingsFor(certain, "unchecked-allocation")).toEqual([]);
    expect(findingsFor(possible, "unchecked-allocation")).toEqual([]);
  });

  it("points sizeof-pointer hints at malloc and calloc size arguments", () => {
    const analysis = inspect(
      parser,
      [
        "#include <stdlib.h>",
        "int f(void) { int *p = malloc(sizeof p); free(p); return 0; }",
        "int g(void) { int *q = calloc(1, sizeof q); free(q); return 0; }",
        "int h(void) { int *r = malloc(sizeof *r); free(r); return 0; }",
      ].join("\n"),
    );
    const findings = findingsFor(analysis, "malloc-sizeof-pointer");

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => selectedText(analysis, finding))).toEqual([
      "sizeof p",
      "sizeof q",
    ]);
    expect(
      findings.map(({ reason, confidence, subject }) => ({ reason, confidence, subject })),
    ).toEqual([
      {
        reason: "pointer-size-used-for-pointee-allocation",
        confidence: "hint",
        subject: "p",
      },
      {
        reason: "pointer-size-used-for-pointee-allocation",
        confidence: "hint",
        subject: "q",
      },
    ]);
    expect(
      findings.map((finding) =>
        finding.evidence.map((evidence) => evidenceText(analysis, evidence)),
      ),
    ).toEqual([["malloc(sizeof p)"], ["calloc(1, sizeof q)"]]);
  });

  it("accepts only same-handle sizeof(value) and maps a for initializer to its loop owner", () => {
    const analysis = inspect(
      parser,
      [
        "#include <stdlib.h>",
        "int paren(void) { int *p = malloc(sizeof(p)); free(p); return 0; }",
        "int pointee(void) { int *p = malloc(sizeof(*p)); free(p); return 0; }",
        "int type_name(void) { int *p = malloc(sizeof(int *)); free(p); return 0; }",
        "int other_handle(void) { int *q = 0; int *p = malloc(sizeof(q)); free(p); return q != 0; }",
        "int loop(int c) { for (int *p = malloc(sizeof(p)); c; c = 0) { free(p); } return 0; }",
      ].join("\n"),
    );
    const findings = findingsFor(analysis, "malloc-sizeof-pointer");
    const loopCfg = analysis.snapshot.functions.find((cfg) => cfg.name === "loop");
    const loopFinding = findings.find((finding) => finding.functionId === loopCfg?.id);
    const owner = loopCfg?.nodes.find((node) => node.id === loopFinding?.ownerNodeId);

    expect(findings.map((finding) => selectedText(analysis, finding))).toEqual([
      "sizeof(p)",
      "sizeof(p)",
    ]);
    expect(findings.map((finding) => finding.confidence)).toEqual(["hint", "hint"]);
    expect(loopFinding).toBeDefined();
    expect(owner).toMatchObject({ ownership: "primary", nodeType: "for_statement" });
    expect(
      owner === undefined ? null : analysis.source.slice(owner.range.from, owner.range.to),
    ).toBe("for (int *p = malloc(sizeof(p)); c; c = 0) { free(p); }");
  });

  it("reports an unchecked nullable acquisition but respects if and assert guards", () => {
    const unchecked = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(sizeof *p); *p = 1; free(p); return 0; }",
    );
    const guarded = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); if (!p) return 1; *p = 1; free(p); return 0; }",
    );
    const asserted = inspect(
      parser,
      "#include <stdlib.h>\n#include <assert.h>\nint f(void) { int *p = malloc(4); assert(p); *p = 1; free(p); return 0; }",
    );
    const finding = onlyFinding(unchecked, "unchecked-allocation");

    expect(finding).toMatchObject({
      reason: "maybe-null-before-dereference",
      confidence: "hint",
      subject: "p",
    });
    expect(selectedText(unchecked, finding)).toBe("*p");
    expect(finding.evidence.map((evidence) => evidence.role)).toEqual(["allocation", "use"]);
    expect(findingsFor(guarded, "unchecked-allocation")).toEqual([]);
    expect(findingsFor(asserted, "unchecked-allocation")).toEqual([]);
  });

  it("retains nullable allocation lineage across an empty guard join without treating pure U as nullable", () => {
    const joined = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); if (p) { } *p = 1; free(p); return 0; }",
    );
    const pureUnalloc = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = 0; if (p) p = malloc(4); *p = 1; return 0; }",
    );
    const joinedAllocation = onlyMemoryEvent(joined, "allocation");
    const joinedDereference = onlyMemoryEvent(joined, "dereference");
    const joinedBefore = beforeStatesForEvent(joined, joinedDereference.id);
    const pureAllocation = onlyMemoryEvent(pureUnalloc, "allocation");
    const pureDereference = onlyMemoryEvent(pureUnalloc, "dereference");
    const pureBefore = beforeStatesForEvent(pureUnalloc, pureDereference.id);

    expect(onlyFinding(joined, "unchecked-allocation")).toMatchObject({
      reason: "maybe-null-before-dereference",
      confidence: "hint",
    });
    expect(joinedBefore.map((state) => state.state)).toEqual(["unalloc", "alloc"]);
    expect(joinedBefore.find((state) => state.state === "unalloc")?.eventIds).toContain(
      joinedAllocation.id,
    );

    expect(pureBefore.map((state) => state.state)).toEqual(["unalloc"]);
    expect(pureBefore.flatMap((state) => state.eventIds)).not.toContain(pureAllocation.id);
    expect(findingsFor(pureUnalloc, "unchecked-allocation")).toEqual([]);
  });

  it("does not invent unchecked-allocation evidence from pure unalloc state", () => {
    const analysis = inspect(parser, "int f(void) { int x = 0; int *p = &x; *p = 1; return *p; }");

    expect(memoryFindings(analysis)).toEqual([]);
    expect(analysis.snapshot.memoryEvents[0]).toMatchObject({
      status: "complete",
      handleVariableIds: [],
    });
  });

  it("excludes assert-fail and terminate edges from normal leak exits", () => {
    const assertNull = inspect(
      parser,
      "#include <stdlib.h>\n#include <assert.h>\nint f(void) { int *p = malloc(4); assert(!p); return 0; }",
    );
    const assertLive = inspect(
      parser,
      "#include <stdlib.h>\n#include <assert.h>\nint f(void) { int *p = malloc(4); assert(p); return 0; }",
    );
    const guardedLive = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); if (!p) return 1; return 0; }",
    );
    const terminateOnly = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); exit(1); }",
    );
    const terminateLiveBranch = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) exit(1); free(p); return 0; }",
    );

    expect(memoryFindings(assertNull)).toEqual([]);
    expect(onlyFinding(assertLive, "memory-leak")).toMatchObject({
      reason: "live-at-all-normal-exits",
      confidence: "certain",
    });
    expect(onlyFinding(guardedLive, "memory-leak")).toMatchObject({
      reason: "live-at-all-normal-exits",
      confidence: "certain",
    });
    expect(memoryFindings(terminateOnly)).toEqual([]);
    expect(memoryFindings(terminateLiveBranch)).toEqual([]);
  });

  it("silences every memory rule after explicit, pathwise, or synthetic escape", () => {
    const explicit = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(sizeof p); sink(p); return 0; }",
    );
    const pathwise = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(sizeof p); if (c) sink(p); return 0; }",
    );
    const overwrittenWithNull = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(sizeof p); p = 0; return 0; }",
    );
    const overwrittenWithAllocation = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(sizeof p); p = malloc(8); free(p); return 0; }",
    );

    for (const analysis of [explicit, pathwise, overwrittenWithNull, overwrittenWithAllocation]) {
      expect(memoryFindings(analysis)).toEqual([]);
    }
  });

  it("ignores unreachable and disabled memory syntax without hiding other findings", () => {
    const unreachable = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { return 0; int *p = malloc(sizeof p); *p = 1; free(p); }",
    );
    const disabled = inspect(
      parser,
      "#define TAKE(p) (*(p))\nint f(void) { int *p = malloc(sizeof p); return TAKE(p); }",
    );

    expect(memoryFindings(unreachable)).toEqual([]);
    expect(findingsFor(unreachable, "unreachable-code")).not.toEqual([]);
    expect(memoryFindings(disabled)).toEqual([]);
    expect(disabled.snapshot.memoryEvents[0]).toMatchObject({ status: "disabled", facts: [] });
    expect(disabled.snapshot.memoryTypestate[0]).toMatchObject({ status: "disabled", facts: [] });
  });

  it("does not infer repeated execution without a feasible second-iteration witness", () => {
    const brokenLoop = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); while (c) { free(p); break; } return 0; }",
    );
    const literalSingleIteration = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); do { free(p); } while (0); return 0; }",
    );
    const backwardGoto = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); again: free(p); if (c) goto again; return 0; }",
    );

    expect(findingsFor(brokenLoop, "double-free")).toEqual([]);
    expect(findingsFor(brokenLoop, "possible-double-free")).toEqual([]);
    expect(findingsFor(literalSingleIteration, "double-free")).toEqual([]);
    expect(findingsFor(literalSingleIteration, "possible-double-free")).toEqual([]);
    expect(findingsFor(backwardGoto, "double-free")).toEqual([]);
    expect(findingsFor(backwardGoto, "possible-double-free")).toEqual([]);
  });

  it("does not upgrade ordinary predicate correlations to certain findings", () => {
    const doubleFree = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) free(p); else return 0; if (!c) free(p); return 0; }",
    );
    const useAfterFree = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) free(p); else return 0; if (!c) return *p; return 0; }",
    );
    const freedGuard = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int *p = malloc(4); if (!p) return 0; free(p); if (!p) free(p); return 0; }",
    );
    const noNormalExit = inspect(
      parser,
      "#include <stdlib.h>\nint f(int c) { int *p = malloc(4); if (c) exit(0); if (!c) exit(0); return 0; }",
    );
    const falseOrdinaryExit = inspect(
      parser,
      "#include <stdlib.h>\nint f(void) { int c = 1; int *p = malloc(4); if (c) exit(0); }",
    );

    expect(findingsFor(doubleFree, "double-free")).toEqual([]);
    expect(findingsFor(useAfterFree, "use-after-free")).toEqual([]);
    expect(findingsFor(freedGuard, "double-free")).toEqual([]);
    expect(findingsFor(noNormalExit, "memory-leak")).toEqual([]);
    expect(findingsFor(falseOrdinaryExit, "memory-leak")).toEqual([]);
    expect(onlyFinding(doubleFree, "possible-double-free").confidence).toBe("likely");
    expect(onlyFinding(useAfterFree, "possible-use-after-free").confidence).toBe("likely");
    expect(onlyFinding(freedGuard, "possible-double-free").confidence).toBe("likely");
    expect(onlyFinding(noNormalExit, "possible-memory-leak").confidence).toBe("likely");
    expect(onlyFinding(falseOrdinaryExit, "possible-memory-leak").confidence).toBe("likely");
  });

  it("keeps repeated temporal evidence linear in the finding count", () => {
    const freeCount = 300;
    const analysis = inspect(
      parser,
      `#include <stdlib.h>\nint f(void) { int *p = malloc(4); ${"free(p); ".repeat(freeCount)}return 0; }`,
    );
    const findings = findingsFor(analysis, "double-free");

    expect(findings).toHaveLength(freeCount - 1);
    expect(findings.every((finding) => finding.evidence.length === 2)).toBe(true);
    expect(findings.reduce((sum, finding) => sum + finding.evidence.length, 0)).toBe(
      (freeCount - 1) * 2,
    );
  });

  it("is source ordered, deterministic, referentially valid, and deeply frozen", () => {
    const source = [
      "#include <stdlib.h>",
      "int f(void) { int *p = malloc(sizeof p); *p = 1; return 0; }",
      "int g(int c) { int *q = malloc(4); if (c) free(q); return *q; }",
    ].join("\n");
    const first = inspect(parser, source).snapshot;
    const second = inspect(parser, source).snapshot;
    const findings = first.findings.filter((finding) => MEMORY_RULE_IDS.has(finding.ruleId));

    expect(findings).toEqual(
      [...findings].sort(
        (left, right) =>
          left.primaryRange.from - right.primaryRange.from ||
          left.primaryRange.to - right.primaryRange.to ||
          left.ruleId.localeCompare(right.ruleId) ||
          (left.subject ?? "").localeCompare(right.subject ?? ""),
      ),
    );
    expect(new Set(findings.map((finding) => finding.id)).size).toBe(findings.length);
    expect(first.findings).toEqual(second.findings);
    expect(deeplyFrozen(first.findings)).toBe(true);

    for (const finding of findings) {
      const functionIndex = first.functions.findIndex((cfg) => cfg.id === finding.functionId);
      const cfg = first.functions[functionIndex];
      const defUse = first.defUse[functionIndex];
      expect(cfg?.nodes.some((node) => node.id === finding.ownerNodeId)).toBe(true);
      expect(
        finding.subjectVariableId === null ||
          defUse?.variables.some((variable) => variable.id === finding.subjectVariableId),
      ).toBe(true);
      expect(
        finding.evidence.every(
          ({ range }) =>
            range.from >= 0 && range.from <= range.to && range.to <= first.sourceLength,
        ),
      ).toBe(true);
    }
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

function memoryFindings(analysis: InspectedProgram): readonly AnalysisFinding[] {
  return analysis.snapshot.findings.filter((finding) => MEMORY_RULE_IDS.has(finding.ruleId));
}

function findingsFor(
  analysis: InspectedProgram,
  ruleId: AnalysisFindingRuleId,
): readonly AnalysisFinding[] {
  return analysis.snapshot.findings.filter((finding) => finding.ruleId === ruleId);
}

function onlyFinding(analysis: InspectedProgram, ruleId: AnalysisFindingRuleId): AnalysisFinding {
  const findings = findingsFor(analysis, ruleId);
  if (findings.length !== 1 || findings[0] === undefined) {
    throw new Error(`finding 数量异常：${ruleId}=${String(findings.length)}`);
  }
  return findings[0];
}

function selectedText(analysis: InspectedProgram, finding: AnalysisFinding): string {
  return analysis.source.slice(finding.primaryRange.from, finding.primaryRange.to);
}

function evidenceText(
  analysis: InspectedProgram,
  evidence: AnalysisFinding["evidence"][number],
): string {
  return analysis.source.slice(evidence.range.from, evidence.range.to);
}

function onlyMemoryEvent(
  analysis: InspectedProgram,
  kind: "allocation" | "dereference",
): ProgramAnalysisSnapshot["memoryEvents"][number]["facts"][number]["events"][number] {
  const events = analysis.snapshot.memoryEvents.flatMap((memory) =>
    memory.facts.flatMap((fact) => fact.events.filter((event) => event.kind === kind)),
  );
  if (events.length !== 1 || events[0] === undefined) {
    throw new Error(`memory event 数量异常：${kind}=${String(events.length)}`);
  }
  return events[0];
}

function beforeStatesForEvent(
  analysis: InspectedProgram,
  eventId: string,
): ProgramAnalysisSnapshot["memoryTypestate"][number]["facts"][number]["events"][number]["beforeStates"] {
  const facts = analysis.snapshot.memoryTypestate.flatMap((typestate) =>
    typestate.facts.flatMap((fact) => fact.events.filter((event) => event.eventId === eventId)),
  );
  if (facts.length !== 1 || facts[0] === undefined) {
    throw new Error(`memory typestate event 数量异常：${eventId}=${String(facts.length)}`);
  }
  return facts[0].beforeStates;
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => deeplyFrozen(child, seen));
}
