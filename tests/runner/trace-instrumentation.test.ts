import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import {
  isTraceProbeEvent,
  type TraceEvent,
  type TraceObservationProfileId,
} from "../../src/shared/trace.js";
import { FOA_LESSONS } from "../../src/tutorials/foa-catalog.js";
import { instrumentTraceSource } from "../../electron/main/runner/trace-instrumentation.js";
import { resolveTraceObservationProfile } from "../../electron/main/runner/trace-observation-profiles.js";
import { TraceProtocolParser } from "../../electron/main/runner/trace-session.js";
import { FakeClock } from "./fakes.js";

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

  it.runIf(existsSync("/usr/bin/clang"))(
    "emits bounded real probes for the four exact FOA transition profiles",
    () => {
      const cases: readonly {
        readonly order: 63 | 70 | 75 | 80;
        readonly profileId: TraceObservationProfileId;
        readonly stdin: string;
        readonly stdout: string;
      }[] = Object.freeze([
        {
          order: 63,
          profileId: "foa-transition-63-v1",
          stdin: "4\n",
          stdout: "5\n",
        },
        {
          order: 70,
          profileId: "foa-transition-70-v1",
          stdin: "5\n1 3 5 7 9\n7\n",
          stdout: "3\n",
        },
        {
          order: 75,
          profileId: "foa-transition-75-v1",
          stdin: "4\n",
          stdout: "15\n",
        },
        {
          order: 80,
          profileId: "foa-transition-80-v1",
          stdin: "1 1 0\n0 1 1\n0 0 1\n",
          stdout: "1\n",
        },
      ]);

      for (const testCase of cases) {
        const source = lessonSource(testCase.order);
        const profile = resolveTraceObservationProfile(testCase.profileId, source);
        expect(profile, testCase.profileId).not.toBeNull();
        if (profile === null) continue;
        const result = instrumentTraceSource(
          source,
          fingerprintSource(source),
          "main.c",
          NONCE,
          profile,
        );
        expect(result.ok, testCase.profileId).toBe(true);
        if (!result.ok) continue;
        expect(result.value.probeDefinitions.map((probe) => probe.probeId)).toEqual(
          profile.probes.map((probe) => probe.probeId),
        );

        const directory = mkdtempSync(join(tmpdir(), `c-block-${String(testCase.order)}-probe-`));
        try {
          const executable = join(directory, "program");
          const clang = spawnSync(
            "/usr/bin/clang",
            ["-std=c17", "-Wall", "-Wextra", "-Wpedantic", "-x", "c", "-", "-o", executable],
            { input: result.value.source, encoding: "utf8" },
          );
          expect(clang.status, `${testCase.profileId}: ${clang.stderr}`).toBe(0);
          const run = spawnSync(executable, [], { input: testCase.stdin, encoding: "utf8" });
          expect(run.status, `${testCase.profileId}: ${run.stderr}`).toBe(0);
          expect(run.stdout).toBe(testCase.stdout);
          const events = parseProfileEvents(
            run.stderr,
            result.value.instrumentedLines,
            result.value.probeDefinitions,
          );
          assertProfileEvents(testCase.order, events);
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      }
    },
  );

  it("rejects a profile when any part of its authored source shape changes", () => {
    const source = lessonSource(63);
    expect(resolveTraceObservationProfile("foa-transition-63-v1", source)).not.toBeNull();
    expect(
      resolveTraceObservationProfile(
        "foa-transition-63-v1",
        source.replace("struct Counter counter;", "struct Counter counter = {0};"),
      ),
    ).toBeNull();
  });
});

function observedLineEvents(stderr: string, lines: readonly number[]): readonly number[] {
  const allowed = new Set(lines);
  return [...stderr.matchAll(/:L:(\d+)\n/gu)]
    .map((match) => Number(match[1]))
    .filter((line) => allowed.has(line));
}

function lessonSource(order: 63 | 70 | 75 | 80): string {
  const source = FOA_LESSONS[order - 1]?.code.text;
  if (source === undefined) throw new Error(`FOA lesson ${String(order)} missing`);
  return source;
}

function parseProfileEvents(
  stderr: string,
  instrumentedLines: readonly number[],
  probeDefinitions: NonNullable<ReturnType<typeof resolveTraceObservationProfile>>["probes"],
): readonly TraceEvent[] {
  const events: TraceEvent[] = [];
  let protocolError: string | null = null;
  const parser = new TraceProtocolParser({
    protocolNonce: NONCE,
    startedAtMs: 0,
    clock: new FakeClock(1),
    allowedLines: new Set(instrumentedLines),
    allowedProbes: probeDefinitions,
    onEvent: (event) => {
      events.push(event);
      return true;
    },
    onProtocolError: (message) => {
      protocolError = message;
    },
  });
  parser.push(Buffer.from(stderr));
  parser.finish();
  expect(protocolError).toBeNull();
  return Object.freeze(events);
}

function assertProfileEvents(order: 63 | 70 | 75 | 80, events: readonly TraceEvent[]): void {
  const probes = events.filter(isTraceProbeEvent);
  expect(probes.length, `lesson ${String(order)} probe count`).toBeGreaterThan(0);
  if (order === 63) {
    expect(
      probes
        .filter((event) => event.probeId === "foa63.counter.value")
        .map((event) => (event.probe.kind === "scalar" ? event.probe.value : null)),
    ).toEqual([4, 5]);
    expect(probes).toContainEqual(
      expect.objectContaining({
        probeId: "foa63.link.target",
        probe: expect.objectContaining({
          kind: "object",
          objectId: "foa63.link",
          targetObjectId: "foa63.counter",
          value: true,
        }),
      }),
    );
  } else if (order === 70) {
    expect(probes.some((event) => event.probeId === "foa70.values.at-mid")).toBe(true);
    expect(probes.some((event) => event.probeId === "foa70.compare")).toBe(true);
    expect(probes.at(-1)).toMatchObject({ probeId: "foa70.high" });
  } else if (order === 75) {
    const calls = probes.filter((event) => event.probeId === "foa75.moves");
    const enters = calls.filter(
      (event) => event.probe.kind === "call" && event.probe.phase === "enter",
    );
    const exits = calls.filter(
      (event) => event.probe.kind === "call" && event.probe.phase === "exit",
    );
    expect(enters).toHaveLength(5);
    expect(enters.map((event) => event.line)).toEqual([9, 9, 9, 9, 9]);
    expect(exits).toHaveLength(5);
    expect(exits.map((event) => event.line)).toEqual([11, 14, 14, 14, 14]);
    expect(calls.at(-1)).toMatchObject({
      probe: { kind: "call", phase: "exit", depth: 0, argument: 4, returnValue: 15 },
    });
  } else {
    const openGrid = [true, true, false, false, true, true, false, false, true] as const;
    const setup = probes.slice(0, 18);
    const expectedSetup = openGrid.flatMap((open, flatIndex) => {
      const indices = [Math.floor(flatIndex / 3), flatIndex % 3];
      return [
        expect.objectContaining({
          probeId: "foa80.paths.write",
          probe: expect.objectContaining({ kind: "array", indices, value: 0 }),
        }),
        expect.objectContaining({
          probeId: "foa80.open.cell",
          probe: expect.objectContaining({ kind: "array", indices, value: open }),
        }),
      ];
    });

    // Profile 80 deliberately observes initialization as well as the DP loop. This exact
    // row-major prefix prevents setup events from being mistaken for algorithm iterations.
    expect(probes).toHaveLength(42);
    expect(setup).toEqual(expectedSetup);
    expect(probes[18]).toMatchObject({
      probeId: "foa80.paths.write",
      probe: { kind: "array", indices: [0, 0], value: 1 },
    });
    expect(
      probes
        .filter((event) => event.probeId === "foa80.open.cell")
        .slice(9)
        .map((event) => (event.probe.kind === "array" ? event.probe.value : null)),
    ).toEqual(openGrid);
    expect(probes.filter((event) => event.probeId === "foa80.paths.read-above")).toHaveLength(3);
    expect(probes.filter((event) => event.probeId === "foa80.paths.read-left")).toHaveLength(4);
    expect(probes.filter((event) => event.probeId === "foa80.paths.write")).toHaveLength(17);
    expect(probes.at(-1)).toMatchObject({
      probeId: "foa80.paths.write",
      probe: { kind: "array", indices: [2, 2], value: 1 },
    });
  }
}
