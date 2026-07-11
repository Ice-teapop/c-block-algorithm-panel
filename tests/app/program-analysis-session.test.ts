import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramSnapshot,
  PROGRAM_ANALYSIS_LIMITS,
} from "../../src/app/program-analysis-session.js";
import type { CParser } from "../../src/core/index.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("program analysis session recovery boundary", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => parser.dispose());

  it("analyzes a normal translation unit", () => {
    const snapshot = analyzeProgramSnapshot(parser, "int main(void) { return 0; }", 3, 2);

    expect(snapshot.revision).toBe(3);
    expect(snapshot.functions).toHaveLength(1);
  });

  it("silently disables M5 facts when recovery projection has an ERROR root", () => {
    const source = [
      "#if 0",
      "int broken( {",
      "#endif",
      "int recovered = 1;",
      "int main(void) {",
      "    return recovered;",
      "}",
      "",
    ].join("\n");
    const snapshot = analyzeProgramSnapshot(parser, source, 7, 4);

    expect(snapshot).toEqual({
      revision: 7,
      sourceLength: source.length,
      sourceFingerprint: fingerprintSource(source),
      functions: [],
      defUse: [],
      memoryEvents: [],
      memoryTypestate: [],
      findings: [],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.findings)).toBe(true);
  });

  it("skips synchronous M5 work before parsing when the source exceeds the UI budget", () => {
    const source = " ".repeat(PROGRAM_ANALYSIS_LIMITS.maxSourceLengthUtf16 + 1);
    const parserThatMustNotRun = Object.freeze({
      inspect: () => {
        throw new Error("oversized source reached the synchronous parser");
      },
    }) as unknown as CParser;

    const snapshot = analyzeProgramSnapshot(parserThatMustNotRun, source, 9, 0);

    expect(snapshot.sourceLength).toBe(source.length);
    expect(snapshot.functions).toEqual([]);
    expect(snapshot.findings).toEqual([]);
  });

  it("skips synchronous M5 work when the projected structure is too complex", () => {
    const parserThatMustNotRun = Object.freeze({
      inspect: () => {
        throw new Error("complex projection reached the synchronous parser");
      },
    }) as unknown as CParser;

    const snapshot = analyzeProgramSnapshot(
      parserThatMustNotRun,
      "int main(void) { return 0; }",
      10,
      PROGRAM_ANALYSIS_LIMITS.maxProjectedBlocks + 1,
    );

    expect(snapshot.functions).toEqual([]);
    expect(snapshot.memoryEvents).toEqual([]);
  });
});
