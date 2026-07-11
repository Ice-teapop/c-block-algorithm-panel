import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import { instrumentTraceSource } from "../../electron/main/runner/trace-instrumentation.js";

const NONCE = "0123456789abcdef";

describe("conservative shadow Trace instrumentation", () => {
  it("instruments complete statements and actual branch truth without mutating input", () => {
    const source = [
      "#include <stdio.h>",
      "int main(void) {",
      "  int x = 1;",
      "  if (x) {",
      '    printf("a;b");',
      "  }",
      "  else {",
      "    x = 0;",
      "  }",
      "  return x;",
      "}",
    ].join("\n");
    const original = source;

    const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason.message);
    expect(source).toBe(original);
    expect(result.value.source).toContain('#line 1 "main.c"');
    expect(result.value.source).toContain("cb_trace_0123456789abcdef(2);");
    expect(result.value.source).toContain("if (cb_trace_0123456789abcdef_branch(4, !!(x))) {");
    expect(result.value.source).toContain('printf("a;b");');
    expect(result.value.instrumentedLines).toEqual([2, 3, 4, 5, 7, 8, 10]);
  });

  it("rejects stale fingerprints and unsupported control layout instead of guessing", () => {
    const source = "int main(void) {\n  int x = 1;\n  if (x)\n    x++;\n  return x;\n}";
    const stale = instrumentTraceSource(source, "stale", "main.c", NONCE);
    expect(stale).toMatchObject({
      ok: false,
      reason: { code: "source-fingerprint-mismatch", line: null },
    });

    const unsupported = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
    expect(unsupported).toMatchObject({
      ok: false,
      reason: { code: "unsupported-control-layout", line: 3 },
    });
  });

  it("rejects recovery-prone multiline lexemes", () => {
    const source = "int main(void) {\n  /* split\n     comment */\n  return 0;\n}";
    expect(instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE)).toMatchObject(
      {
        ok: false,
        reason: { code: "multiline-lexeme", line: 2 },
      },
    );
  });

  it("rewrites a for condition as a real branch observation, including the final false", () => {
    const source = [
      "int main(void) {",
      "  int total = 0;",
      "  for (int i = 0; i < 2; i++) {",
      "    total += i;",
      "  }",
      "  return total == 1 ? 0 : 1;",
      "}",
    ].join("\n");
    const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
    if (!result.ok) throw new Error(result.reason.message);

    expect(result.value.source).toContain(
      "for (int i = 0;cb_trace_0123456789abcdef_branch(3, !!( i < 2)); i++) {",
    );
    expect(result.value.source).not.toContain("cb_trace_0123456789abcdef(3);");
    expect(result.value.instrumentedLines).toContain(3);
  });

  it("records switch evaluation and the case/default labels that control actually enters", () => {
    const source = [
      "int main(void) {",
      "  int x = 1;",
      "  switch (x) {",
      "  case 1:",
      "    x += 1;",
      "  case 2:",
      "    x += 2;",
      "    break;",
      "  default:",
      "    x = 0;",
      "  }",
      "  return x == 4 ? 0 : 1;",
      "}",
    ].join("\n");

    const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
    if (!result.ok) throw new Error(result.reason.message);

    expect(result.value.source).toContain("switch ((cb_trace_0123456789abcdef(3), (x))) {");
    expect(result.value.source).toContain("  case 1:\n    cb_trace_0123456789abcdef(4);");
    expect(result.value.source).toContain("  case 2:\n    cb_trace_0123456789abcdef(6);");
    expect(result.value.source).toContain("  default:\n    cb_trace_0123456789abcdef(9);");
    expect(result.value.instrumentedLines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  });

  it.each([
    {
      name: "implicit miss without default",
      source: [
        "int main(void) {",
        "  switch (1) {",
        "  case 1:",
        "    break;",
        "  }",
        "  return 0;",
        "}",
      ].join("\n"),
      line: 2,
      message: /无 default/u,
    },
    {
      name: "inline case body",
      source: [
        "int main(void) {",
        "  switch (1) {",
        "  case 1: return 0;",
        "  default:",
        "    return 1;",
        "  }",
        "}",
      ].join("\n"),
      line: 3,
      message: /独占一行/u,
    },
    {
      name: "Duff-style nested case",
      source: [
        "int main(void) {",
        "  switch (1) {",
        "  case 1:",
        "    while (0) {",
        "    case 2:",
        "      break;",
        "    }",
        "  default:",
        "    break;",
        "  }",
        "  return 0;",
        "}",
      ].join("\n"),
      line: 5,
      message: /Duff-style/u,
    },
  ])("rejects unsafe switch layout: $name", ({ source, line, message }) => {
    const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
    expect(result).toMatchObject({
      ok: false,
      reason: { code: "unsupported-switch", line, message },
    });
  });

  it.runIf(existsSync("/usr/bin/clang"))(
    "emits a C17 translation unit accepted by the local clang syntax gate",
    () => {
      const source = [
        "int main(void) {",
        "  int x = 1;",
        "  while (x < 3) {",
        "    x += 1;",
        "  }",
        "  return x;",
        "}",
      ].join("\n");
      const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
      if (!result.ok) throw new Error(result.reason.message);

      const clang = spawnSync(
        "/usr/bin/clang",
        ["-std=c17", "-Wall", "-Wextra", "-Wpedantic", "-x", "c", "-fsyntax-only", "-"],
        { input: result.value.source, encoding: "utf8" },
      );
      expect(clang.status, clang.stderr).toBe(0);
    },
  );

  it.runIf(existsSync("/usr/bin/clang"))(
    "observes exact case/default entry and preserves fallthrough in a real C17 process",
    () => {
      const source = [
        "#include <stdlib.h>",
        "int main(int argc, char **argv) {",
        "  int x = argc > 1 ? atoi(argv[1]) : 0;",
        "  int total = 0;",
        "  int evaluations = 0;",
        "  switch ((evaluations++, x)) {",
        "  case 1:",
        "    total += 1;",
        "  case 2:",
        "    total += 2;",
        "    break;",
        "  default:",
        "    total = 9;",
        "  }",
        "  return evaluations == 1 && ((x == 1 && total == 3) || (x == 2 && total == 2) || (x == 7 && total == 9)) ? 0 : 1;",
        "}",
      ].join("\n");
      const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
      if (!result.ok) throw new Error(result.reason.message);

      const directory = mkdtempSync(join(tmpdir(), "c-block-switch-trace-"));
      try {
        const executable = join(directory, "program");
        const clang = spawnSync(
          "/usr/bin/clang",
          ["-std=c17", "-Wall", "-Wextra", "-Wpedantic", "-x", "c", "-", "-o", executable],
          { input: result.value.source, encoding: "utf8" },
        );
        expect(clang.status, clang.stderr).toBe(0);

        const caseOne = spawnSync(executable, ["1"], { encoding: "utf8" });
        const caseTwo = spawnSync(executable, ["2"], { encoding: "utf8" });
        const defaultCase = spawnSync(executable, ["7"], { encoding: "utf8" });
        expect(caseOne.status, caseOne.stderr).toBe(0);
        expect(caseTwo.status, caseTwo.stderr).toBe(0);
        expect(defaultCase.status, defaultCase.stderr).toBe(0);
        expect(observedLineEvents(caseOne.stderr, [6, 7, 9, 12])).toEqual([6, 7, 9]);
        expect(observedLineEvents(caseTwo.stderr, [6, 7, 9, 12])).toEqual([6, 9]);
        expect(observedLineEvents(defaultCase.stderr, [6, 7, 9, 12])).toEqual([6, 12]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.runIf(existsSync("/usr/bin/clang"))(
    "observes every real for check as true, true, then false at runtime",
    () => {
      const source = [
        "int main(void) {",
        "  int total = 0;",
        "  for (int i = 0; i < 2; i++) {",
        "    total += i;",
        "  }",
        "  return total == 1 ? 0 : 1;",
        "}",
      ].join("\n");
      const result = instrumentTraceSource(source, fingerprintSource(source), "main.c", NONCE);
      if (!result.ok) throw new Error(result.reason.message);

      const directory = mkdtempSync(join(tmpdir(), "c-block-for-trace-"));
      try {
        const executable = join(directory, "program");
        const clang = spawnSync(
          "/usr/bin/clang",
          ["-std=c17", "-Wall", "-Wextra", "-Wpedantic", "-x", "c", "-", "-o", executable],
          { input: result.value.source, encoding: "utf8" },
        );
        expect(clang.status, clang.stderr).toBe(0);
        const run = spawnSync(executable, [], { encoding: "utf8" });
        expect(run.status, run.stderr).toBe(0);
        const branchTruth = [...run.stderr.matchAll(/:B:3:([01])/gu)].map((match) => match[1]);
        expect(branchTruth).toEqual(["1", "1", "0"]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});

function observedLineEvents(stderr: string, lines: readonly number[]): readonly number[] {
  const allowed = new Set(lines);
  return [...stderr.matchAll(/:L:(\d+)\n/gu)]
    .map((match) => Number(match[1]))
    .filter((line) => allowed.has(line));
}
