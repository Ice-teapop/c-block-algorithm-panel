import { describe, expect, it } from "vitest";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type { TraceEvent, TraceProbePayload, TraceRunEvidence } from "../../src/shared/trace.js";
import {
  createFoaTransitionTraceBinding63,
  createFoaTransitionTraceBinding70,
  createFoaTransitionTraceBinding75,
  createFoaTransitionTraceBinding80,
  type FoaTransitionTraceBinding80,
} from "../../src/tutorials/foa-transition-trace-bindings.js";
import {
  createFoaTransitionInputDigest,
  verifyFoaTransitionTrace,
  type FoaTransitionTraceBinding,
} from "../../src/tutorials/foa-transition-trace-verifier.js";

describe("FOA transition real Trace verifier", () => {
  it("upgrades lesson 63 only after the field and object-link probes agree", () => {
    const binding = createFoaTransitionTraceBinding63(8);
    const events = sequence([
      probe(binding.source, 'if (scanf("%d", &counter.value) != 1) {', "foa63.counter.value", {
        kind: "scalar",
        value: 8,
      }),
      probe(binding.source, "struct Counter *link = &counter;", "foa63.link.target", {
        kind: "object",
        objectId: "foa63.link",
        targetObjectId: "foa63.counter",
        fieldId: null,
        value: true,
      }),
      probe(binding.source, "link->value++;", "foa63.counter.value", {
        kind: "scalar",
        value: 9,
      }),
    ]);

    const result = verify(binding, events);

    expect(result.ok).toBe(true);
    if (!result.ok || !("frames" in result.model)) return;
    expect(result.model.evidence.canClaimRealTrace).toBe(true);
    expect(result.model.frames.every((frame) => typeof frame.provenance === "object")).toBe(true);
  });

  it("upgrades lesson 70 after every lower-bound state transition agrees", () => {
    const binding = createFoaTransitionTraceBinding70([1, 3, 5, 7, 9], 7);
    const events = sequence([
      scalarAt(binding.source, "size_t low = 0;", "foa70.low", 0),
      scalarAt(binding.source, "size_t high = (size_t)count;", "foa70.high", 5),
      scalarAt(binding.source, "size_t mid = low + (high - low) / 2;", "foa70.mid", 2),
      arrayAt(binding.source, "if (values[mid] < target) {", "foa70.values.at-mid", [2], 5),
      scalarAt(binding.source, "if (values[mid] < target) {", "foa70.compare", true),
      scalarAt(binding.source, "low = mid + 1; /* trace-anchor: low */", "foa70.low", 3),
      scalarAt(binding.source, "size_t mid = low + (high - low) / 2;", "foa70.mid", 4),
      arrayAt(binding.source, "if (values[mid] < target) {", "foa70.values.at-mid", [4], 9),
      scalarAt(binding.source, "if (values[mid] < target) {", "foa70.compare", false),
      scalarAt(binding.source, "high = mid; /* trace-anchor: high */", "foa70.high", 4),
      scalarAt(binding.source, "size_t mid = low + (high - low) / 2;", "foa70.mid", 3),
      arrayAt(binding.source, "if (values[mid] < target) {", "foa70.values.at-mid", [3], 7),
      scalarAt(binding.source, "if (values[mid] < target) {", "foa70.compare", false),
      scalarAt(binding.source, "high = mid; /* trace-anchor: high */", "foa70.high", 3),
    ]);

    expect(verify(binding, events)).toMatchObject({ ok: true, probeEventCount: 14 });
  });

  it("upgrades lesson 75 only for a strict recursive LIFO trace", () => {
    const binding = createFoaTransitionTraceBinding75(4);
    const enterLine = sourceLine(binding.source, "static int moves(int disks) {");
    const baseReturnLine = sourceLineInFunction(
      binding.source,
      "static int moves(int disks) {",
      "return 0;",
    );
    const resultReturnLine = sourceLineInFunction(
      binding.source,
      "static int moves(int disks) {",
      "return result;",
    );
    const probes: TraceEvent[] = [];
    const ids = [10, 11, 12, 13, 14];
    for (let depth = 0; depth <= 4; depth += 1) {
      probes.push(
        rawProbe(enterLine, "foa75.moves", {
          kind: "call",
          phase: "enter",
          frameId: ids[depth]!,
          parentFrameId: depth === 0 ? null : ids[depth - 1]!,
          depth,
          argument: 4 - depth,
          returnValue: null,
        }),
      );
    }
    for (let offset = 0; offset <= 4; offset += 1) {
      const depth = 4 - offset;
      probes.push(
        rawProbe(offset === 0 ? baseReturnLine : resultReturnLine, "foa75.moves", {
          kind: "call",
          phase: "exit",
          frameId: ids[depth]!,
          parentFrameId: depth === 0 ? null : ids[depth - 1]!,
          depth,
          argument: offset,
          returnValue: 2 ** offset - 1,
        }),
      );
    }

    const result = verify(binding, sequence(probes));
    expect(result).toMatchObject({ ok: true, probeEventCount: 10 });
    if (result.ok && "events" in result.model) {
      expect(result.model.verification).toBe("real-trace");
    }
  });

  it("upgrades lesson 80 only after all cell, dependency and write probes agree", () => {
    const binding = createFoaTransitionTraceBinding80();
    const events = sequence(gridProbes(binding));

    expect(verify(binding, events)).toMatchObject({ ok: true });
  });

  it.each([
    ["missing probe", "probe-missing"],
    ["wrong value", "probe-mismatch"],
    ["stale input", "input-stale"],
    ["wrong stdout", "stdout-mismatch"],
  ] as const)("fails closed for %s", (variant, expectedCode) => {
    const binding = createFoaTransitionTraceBinding63(4);
    let events = sequence([
      scalarAt(binding.source, 'if (scanf("%d", &counter.value) != 1) {', "foa63.counter.value", 4),
      probe(binding.source, "struct Counter *link = &counter;", "foa63.link.target", {
        kind: "object",
        objectId: "foa63.link",
        targetObjectId: "foa63.counter",
        fieldId: null,
        value: true,
      }),
      scalarAt(binding.source, "link->value++;", "foa63.counter.value", 5),
    ]);
    if (variant === "missing probe") events = sequence(events.slice(0, -1));
    if (variant === "wrong value") {
      events = sequence([
        ...events.slice(0, -1),
        scalarAt(binding.source, "link->value++;", "foa63.counter.value", 99),
      ]);
    }
    const result = verifyFoaTransitionTrace({
      ...baseInput(binding, events),
      ...(variant === "stale input" ? { inputDigest: "stale" } : {}),
      ...(variant === "wrong stdout" ? { evidence: evidence("99\n") } : {}),
    });
    expect(result).toMatchObject({ ok: false, code: expectedCode });
  });

  it("rejects a correct value reported from the wrong authorized source site", () => {
    const binding = createFoaTransitionTraceBinding63(4);
    const events = sequence([
      scalarAt(binding.source, "link->value++;", "foa63.counter.value", 4),
      probe(binding.source, "struct Counter *link = &counter;", "foa63.link.target", {
        kind: "object",
        objectId: "foa63.link",
        targetObjectId: "foa63.counter",
        fieldId: null,
        value: true,
      }),
      scalarAt(binding.source, "link->value++;", "foa63.counter.value", 5),
    ]);

    expect(verify(binding, events)).toMatchObject({ ok: false, code: "probe-mismatch" });
  });

  it("rejects swapped recursion phases and grid writes from the wrong site", () => {
    const recursion = createFoaTransitionTraceBinding75(0);
    const header = sourceLine(recursion.source, "static int moves(int disks) {");
    const baseReturn = sourceLineInFunction(
      recursion.source,
      "static int moves(int disks) {",
      "return 0;",
    );
    const wrongCallSites = sequence([
      rawProbe(baseReturn, "foa75.moves", {
        kind: "call",
        phase: "enter",
        frameId: 1,
        parentFrameId: null,
        depth: 0,
        argument: 0,
        returnValue: null,
      }),
      rawProbe(header, "foa75.moves", {
        kind: "call",
        phase: "exit",
        frameId: 1,
        parentFrameId: null,
        depth: 0,
        argument: 0,
        returnValue: 0,
      }),
    ]);
    expect(verify(recursion, wrongCallSites)).toMatchObject({
      ok: false,
      code: "probe-mismatch",
    });

    const grid = createFoaTransitionTraceBinding80();
    const actual = gridProbes(grid);
    const first = actual[0]!;
    const wrongWriteSite = sequence([
      { ...first, line: sourceLine(grid.source, "paths[0][0] = 1;") },
      ...actual.slice(1),
    ]);
    expect(verify(grid, wrongWriteSite)).toMatchObject({
      ok: false,
      code: "probe-mismatch",
    });
  });

  it("rejects cancelled, truncated, reordered and extra evidence", () => {
    const binding = createFoaTransitionTraceBinding63(4);
    const valid = sequence([
      scalarAt(binding.source, 'if (scanf("%d", &counter.value) != 1) {', "foa63.counter.value", 4),
      probe(binding.source, "struct Counter *link = &counter;", "foa63.link.target", {
        kind: "object",
        objectId: "foa63.link",
        targetObjectId: "foa63.counter",
        fieldId: null,
        value: true,
      }),
      scalarAt(binding.source, "link->value++;", "foa63.counter.value", 5),
    ]);
    expect(
      verifyFoaTransitionTrace({ ...baseInput(binding, valid), status: "cancelled" }),
    ).toMatchObject({ ok: false, code: "not-completed" });
    expect(
      verifyFoaTransitionTrace({ ...baseInput(binding, valid), status: "truncated" }),
    ).toMatchObject({ ok: false, code: "not-completed" });
    expect(
      verify(binding, [valid[0]!, { ...valid[1]!, sequence: 3 }, { ...valid[2]!, sequence: 2 }]),
    ).toMatchObject({ ok: false, code: "event-sequence" });
    expect(verify(binding, sequence([...valid, valid[2]!]))).toMatchObject({
      ok: false,
      code: "probe-missing",
    });
  });

  it("rejects an old input even when visited values, branches, and stdout match", () => {
    const binding = createFoaTransitionTraceBinding70([1, 3, 5, 7, 9], 7);
    const oldBinding = createFoaTransitionTraceBinding70([0, 4, 5, 7, 9], 7);
    const events = sequence([
      scalarAt(binding.source, "size_t low = 0;", "foa70.low", 0),
      scalarAt(binding.source, "size_t high = (size_t)count;", "foa70.high", 5),
      scalarAt(binding.source, "size_t mid = low + (high - low) / 2;", "foa70.mid", 2),
      arrayAt(binding.source, "if (values[mid] < target) {", "foa70.values.at-mid", [2], 5),
      scalarAt(binding.source, "if (values[mid] < target) {", "foa70.compare", true),
      scalarAt(binding.source, "low = mid + 1; /* trace-anchor: low */", "foa70.low", 3),
      scalarAt(binding.source, "size_t mid = low + (high - low) / 2;", "foa70.mid", 4),
      arrayAt(binding.source, "if (values[mid] < target) {", "foa70.values.at-mid", [4], 9),
      scalarAt(binding.source, "if (values[mid] < target) {", "foa70.compare", false),
      scalarAt(binding.source, "high = mid; /* trace-anchor: high */", "foa70.high", 4),
      scalarAt(binding.source, "size_t mid = low + (high - low) / 2;", "foa70.mid", 3),
      arrayAt(binding.source, "if (values[mid] < target) {", "foa70.values.at-mid", [3], 7),
      scalarAt(binding.source, "if (values[mid] < target) {", "foa70.compare", false),
      scalarAt(binding.source, "high = mid; /* trace-anchor: high */", "foa70.high", 3),
    ]);

    expect(
      verifyFoaTransitionTrace({
        ...baseInput(binding, events),
        inputFingerprint: fingerprintSource(oldBinding.stdin),
      }),
    ).toMatchObject({ ok: false, code: "input-stale" });
  });

  it("rejects a mismatched or missing main-owned observation identity", () => {
    const binding = createFoaTransitionTraceBinding63(4);
    const events = sequence([
      scalarAt(binding.source, 'if (scanf("%d", &counter.value) != 1) {', "foa63.counter.value", 4),
      probe(binding.source, "struct Counter *link = &counter;", "foa63.link.target", {
        kind: "object",
        objectId: "foa63.link",
        targetObjectId: "foa63.counter",
        fieldId: null,
        value: true,
      }),
      scalarAt(binding.source, "link->value++;", "foa63.counter.value", 5),
    ]);

    expect(
      verifyFoaTransitionTrace({
        ...baseInput(binding, events),
        observationProfileId: "foa-transition-70-v1",
      }),
    ).toMatchObject({ ok: false, code: "observation-identity" });
    expect(
      verifyFoaTransitionTrace({
        ...baseInput(binding, events),
        observationAuthorizationDigest: null,
      }),
    ).toMatchObject({ ok: false, code: "observation-identity" });
  });
});

function verify(binding: FoaTransitionTraceBinding, events: readonly TraceEvent[]) {
  return verifyFoaTransitionTrace(baseInput(binding, events));
}

function baseInput(binding: FoaTransitionTraceBinding, events: readonly TraceEvent[]) {
  return {
    binding,
    source: binding.source,
    sessionId: "trace-session",
    sourceFingerprint: fingerprintSource(binding.source),
    inputDigest: createFoaTransitionInputDigest(binding.stdin),
    inputFingerprint: fingerprintSource(binding.stdin),
    observationProfileId: binding.profileId,
    observationAuthorizationDigest: "a".repeat(64),
    status: "completed" as const,
    events,
    evidence: evidence(binding.expectedStdout),
  };
}

function evidence(stdout: string): TraceRunEvidence {
  return Object.freeze({
    ok: true,
    exitCode: 0,
    signal: null,
    termination: "process-exit",
    durationMs: 2,
    peakRssBytes: 1024,
    peakProcessCount: 1,
    outputBytes: stdout.length,
    executedNodeCount: 4,
    operationCount: 8,
    stdout: new TextEncoder().encode(stdout),
  });
}

function scalarAt(source: string, exact: string, id: string, value: number | boolean): TraceEvent {
  return probe(source, exact, id, { kind: "scalar", value });
}

function arrayAt(
  source: string,
  exact: string,
  id: string,
  indices: readonly number[],
  value: number | boolean,
): TraceEvent {
  return probe(source, exact, id, { kind: "array", indices: Object.freeze([...indices]), value });
}

function probe(source: string, exact: string, id: string, payload: TraceProbePayload): TraceEvent {
  return rawProbe(sourceLine(source, exact), id, payload);
}

function rawProbe(line: number, id: string, payload: TraceProbePayload): TraceEvent {
  return Object.freeze({
    sequence: -1,
    kind: "probe",
    line,
    branchTaken: null,
    probeId: id,
    probe: payload,
    elapsedMs: 0,
  });
}

function sequence(events: readonly TraceEvent[]): readonly TraceEvent[] {
  return Object.freeze(
    events.map((event, index) => Object.freeze({ ...event, sequence: index + 1 })),
  );
}

function sourceLine(source: string, exact: string): number {
  const matches = source
    .split(/\r?\n/u)
    .flatMap((line, index) => (line.includes(exact) ? [index + 1] : []));
  if (matches.length !== 1) throw new RangeError(`Expected one source line for ${exact}`);
  return matches[0]!;
}

function sourceLineInFunction(source: string, header: string, exact: string): number {
  const sourceLines = source.split(/\r?\n/u);
  const start = sourceLines.findIndex((line) => line.includes(header));
  const endOffset = sourceLines.slice(start + 1).findIndex((line) => line === "}");
  if (start < 0 || endOffset < 0) throw new RangeError(`Missing function ${header}`);
  const end = start + 1 + endOffset;
  const matches: number[] = [];
  for (let index = start + 1; index < end; index += 1) {
    if (sourceLines[index]?.includes(exact) === true) matches.push(index + 1);
  }
  if (matches.length !== 1) throw new RangeError(`Expected one function line for ${exact}`);
  return matches[0]!;
}

function gridProbes(binding: FoaTransitionTraceBinding80): readonly TraceEvent[] {
  const events: TraceEvent[] = [];
  const open = binding.modelInput.openGrid;
  const paths = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      events.push(
        arrayAt(binding.source, "paths[r][c] = 0;", "foa80.paths.write", [row, column], 0),
        arrayAt(
          binding.source,
          'if (scanf("%d", &open[r][c]) != 1) {',
          "foa80.open.cell",
          [row, column],
          open[row]![column] === 1,
        ),
      );
    }
  }
  paths[0]![0] = 1;
  events.push(arrayAt(binding.source, "paths[0][0] = 1;", "foa80.paths.write", [0, 0], 1));
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const isOpen = open[row]![column] === 1;
      events.push(
        arrayAt(binding.source, "if (open[r][c] == 0) {", "foa80.open.cell", [row, column], isOpen),
      );
      if (!isOpen) continue;
      if (row > 0) {
        const value = paths[row - 1]![column]!;
        events.push(
          arrayAt(
            binding.source,
            "paths[r][c] += paths[r - 1][c];",
            "foa80.paths.read-above",
            [row - 1, column],
            value,
          ),
        );
        paths[row]![column]! += value;
        events.push(
          arrayAt(
            binding.source,
            "paths[r][c] += paths[r - 1][c];",
            "foa80.paths.write",
            [row, column],
            paths[row]![column]!,
          ),
        );
      }
      if (column > 0) {
        const value = paths[row]![column - 1]!;
        events.push(
          arrayAt(
            binding.source,
            "paths[r][c] += paths[r][c - 1];",
            "foa80.paths.read-left",
            [row, column - 1],
            value,
          ),
        );
        paths[row]![column]! += value;
        events.push(
          arrayAt(
            binding.source,
            "paths[r][c] += paths[r][c - 1];",
            "foa80.paths.write",
            [row, column],
            paths[row]![column]!,
          ),
        );
      }
    }
  }
  return events;
}
