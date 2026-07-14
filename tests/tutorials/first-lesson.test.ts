import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CParser } from "../../src/core/index.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import {
  FIRST_ALGORITHM_BUG_FINGERPRINT,
  FIRST_ALGORITHM_BUG_SOURCE,
  FIRST_ALGORITHM_CASES,
  FIRST_ALGORITHM_SKELETON_FINGERPRINT,
  FIRST_ALGORITHM_SKELETON_SOURCE,
  FIRST_ALGORITHM_SOURCE,
  FIRST_ALGORITHM_SOURCE_FINGERPRINT,
  FIRST_ALGORITHM_WALKTHROUGH,
  FIRST_GUIDED_LESSON,
  FIRST_MINIMUM_ALGORITHM_CASES,
  FIRST_MINIMUM_ALGORITHM_FINGERPRINT,
  FIRST_MINIMUM_ALGORITHM_SOURCE,
  buildMaximumWalkthrough,
  createFirstAlgorithmSkeleton,
  firstMinimumAlgorithmCase,
  injectFirstAlgorithmBug,
  replaceSourceExactlyOnce,
  restoreFirstAlgorithmBug,
  restoreFirstAlgorithmUpdate,
} from "../../src/tutorials/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("first guided algorithm fixtures", () => {
  let parser: CParser;

  beforeAll(async () => {
    parser = await createTestParser();
  });

  afterAll(() => {
    parser.dispose();
  });

  it("defines seven immutable missions including evidence-chart practice", () => {
    expect(FIRST_GUIDED_LESSON.missions.map((mission) => mission.id)).toEqual([
      "mission.run",
      "mission.observe",
      "mission.read-trace-chart",
      "mission.complete",
      "mission.read-analysis-chart",
      "mission.debug",
      "mission.migrate",
    ]);
    expect(FIRST_GUIDED_LESSON.missions.map((mission) => mission.stages.length)).toEqual([
      1, 1, 2, 2, 3, 2, 1,
    ]);
    expect(Object.isFrozen(FIRST_GUIDED_LESSON)).toBe(true);
    expect(Object.isFrozen(FIRST_GUIDED_LESSON.missions)).toBe(true);
    expect(Object.isFrozen(FIRST_GUIDED_LESSON.missions[3]?.stages[1]?.requirements)).toBe(true);
    expect(FIRST_GUIDED_LESSON.missions[2]?.stages[0]?.requirements[0]).toMatchObject({
      kind: "visualization-answer",
      visualizationId: "trace-chart",
    });
    expect(FIRST_GUIDED_LESSON.missions[4]?.stages[0]?.requirements[0]).toMatchObject({
      kind: "benchmark-series",
      sizes: [8, 32, 128],
      minRepetitions: 3,
    });
    expect(FIRST_GUIDED_LESSON.initialSource).toBe(FIRST_ALGORITHM_SOURCE);
  });

  it("keeps complete, skeleton, bug and minimum sources syntactically parseable", () => {
    for (const source of [
      FIRST_ALGORITHM_SOURCE,
      FIRST_ALGORITHM_SKELETON_SOURCE,
      FIRST_ALGORITHM_BUG_SOURCE,
      FIRST_MINIMUM_ALGORITHM_SOURCE,
    ]) {
      expect(parser.analyze(source, 1).document.parse.hasError).toBe(false);
    }
    expect(FIRST_ALGORITHM_SKELETON_SOURCE).not.toContain("maximum = value;");
    expect(FIRST_ALGORITHM_SKELETON_SOURCE).toContain("补全任务");
    expect(FIRST_ALGORITHM_BUG_SOURCE).toContain("if (value < maximum)");
    expect(FIRST_MINIMUM_ALGORITHM_SOURCE).toContain("if (value < minimum)");
  });

  it("applies skeleton and bug transforms exactly once and restores byte-exact source", () => {
    const skeleton = createFirstAlgorithmSkeleton(
      FIRST_ALGORITHM_SOURCE,
      FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    );
    expect(skeleton).toMatchObject({
      ok: true,
      source: FIRST_ALGORITHM_SKELETON_SOURCE,
      sourceFingerprint: FIRST_ALGORITHM_SKELETON_FINGERPRINT,
    });
    const completed = restoreFirstAlgorithmUpdate(
      FIRST_ALGORITHM_SKELETON_SOURCE,
      FIRST_ALGORITHM_SKELETON_FINGERPRINT,
    );
    expect(completed).toMatchObject({
      ok: true,
      source: FIRST_ALGORITHM_SOURCE,
      sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });

    const bug = injectFirstAlgorithmBug(FIRST_ALGORITHM_SOURCE, FIRST_ALGORITHM_SOURCE_FINGERPRINT);
    expect(bug).toMatchObject({
      ok: true,
      source: FIRST_ALGORITHM_BUG_SOURCE,
      sourceFingerprint: FIRST_ALGORITHM_BUG_FINGERPRINT,
    });
    const fixed = restoreFirstAlgorithmBug(
      FIRST_ALGORITHM_BUG_SOURCE,
      FIRST_ALGORITHM_BUG_FINGERPRINT,
    );
    expect(fixed).toMatchObject({
      ok: true,
      source: FIRST_ALGORITHM_SOURCE,
      sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });
  });

  it("rejects stale, missing and ambiguous transforms without changing source", () => {
    const stale = injectFirstAlgorithmBug(FIRST_ALGORITHM_SOURCE, "stale:fingerprint");
    expect(stale).toEqual({
      ok: false,
      source: FIRST_ALGORITHM_SOURCE,
      reason: "fingerprint-mismatch",
    });

    const missingSource = "int main(void) { return 0; }";
    expect(
      replaceSourceExactlyOnce(
        missingSource,
        fingerprintSource(missingSource),
        "not present",
        "replacement",
      ),
    ).toEqual({ ok: false, source: missingSource, reason: "pattern-missing" });

    const ambiguousSource = "TOKEN + TOKEN";
    expect(
      replaceSourceExactlyOnce(
        ambiguousSource,
        fingerprintSource(ambiguousSource),
        "TOKEN",
        "value",
      ),
    ).toEqual({ ok: false, source: ambiguousSource, reason: "pattern-ambiguous" });
  });

  it("provides an honest deterministic walkthrough rather than fake runtime samples", () => {
    expect(FIRST_ALGORITHM_WALKTHROUGH).toEqual([
      {
        inputIndex: 0,
        value: 3,
        maximumBefore: null,
        comparison: null,
        branchTaken: null,
        maximumAfter: 3,
      },
      {
        inputIndex: 1,
        value: 8,
        maximumBefore: 3,
        comparison: "8 > 3",
        branchTaken: true,
        maximumAfter: 8,
      },
      {
        inputIndex: 2,
        value: 2,
        maximumBefore: 8,
        comparison: "2 > 8",
        branchTaken: false,
        maximumAfter: 8,
      },
      {
        inputIndex: 3,
        value: 7,
        maximumBefore: 8,
        comparison: "7 > 8",
        branchTaken: false,
        maximumAfter: 8,
      },
      {
        inputIndex: 4,
        value: 4,
        maximumBefore: 8,
        comparison: "4 > 8",
        branchTaken: false,
        maximumAfter: 8,
      },
    ]);
    expect(Object.isFrozen(FIRST_ALGORITHM_WALKTHROUGH)).toBe(true);
    expect(Object.isFrozen(FIRST_ALGORITHM_WALKTHROUGH[0])).toBe(true);
    expect(() => buildMaximumWalkthrough([])).toThrow(/非空/u);
    expect(() => buildMaximumWalkthrough([1, Number.NaN])).toThrow(/安全整数/u);
  });

  it("supplies three minimum boundary cases aligned with the migration program", () => {
    expect(FIRST_MINIMUM_ALGORITHM_CASES).toEqual([
      expect.objectContaining({ id: "normal", stdout: "2\n" }),
      expect.objectContaining({ id: "negative", stdout: "-12\n" }),
      expect.objectContaining({ id: "single", stdout: "42\n" }),
    ]);
    expect(firstMinimumAlgorithmCase("negative").stdin).toBe("4\n-9 -4 -12 -7\n");
    expect(FIRST_MINIMUM_ALGORITHM_FINGERPRINT).toBe(
      fingerprintSource(FIRST_MINIMUM_ALGORITHM_SOURCE),
    );
    expect(FIRST_ALGORITHM_CASES.map((item) => item.id)).toEqual(["normal", "negative", "single"]);
  });
});
